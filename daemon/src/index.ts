import { WebSocketServer, WebSocket } from 'ws';
import * as http from 'http';
import * as dotenv from 'dotenv';
import chalk from 'chalk';
import { BotManager } from './bot/botManager';
import { ClientMessage, DaemonMessage } from './types';
import { startTermuxNotificationTicker, updateTermuxNotification } from './termuxNotification';

dotenv.config();

// Global unhandled errors guard
process.on('uncaughtException', (err: any) => {
  console.error(chalk.yellow(`[PebbleAFK Exception Guard] ${err?.message || err}`));
  if (err?.stack) {
    console.error(chalk.gray(err.stack));
  }
  // Server listen errors are handled with retries by server.on('error')
  if (err?.code === 'EADDRINUSE') return;
});

process.on('unhandledRejection', (reason: any) => {
  console.warn(chalk.yellow(`[PebbleAFK Unhandled Rejection] ${reason}`));
});

const PORT = parseInt(process.env.PORT || '8080', 10);
const AUTH_TOKEN = (process.env.DAEMON_AUTH_TOKEN || '').trim();
const path = require('path');
const childProcess = require('child_process');
const crypto = require('crypto');
const repoDir = path.resolve(__dirname, '..', '..');
let updateInProgress = false;
let runningRevision = '';
try {
  runningRevision = childProcess.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoDir, encoding: 'utf8' }).trim();
} catch (_) {}

const server = http.createServer((req, res) => {
  if (req.url === '/logs') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    return res.end(JSON.stringify({ logs: terminalLogs }));
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    service: 'PebbleAFK Daemon (Bedrock Edition)',
    status: 'running',
    protocol: 'bedrock-protocol',
    instanceId: process.env.PEBBLEAFK_INSTANCE_ID || '',
    uptime: Math.round(process.uptime()),
    timestamp: Date.now(),
  }));
});

const wss = new WebSocketServer({ server });
const authenticatedClients = new Set<WebSocket>();
let shutdownRequested = false;

const terminalLogs: string[] = [];
const MAX_LOGS = 500;
let isAppendingLog = false;

function appendTerminalLog(rawText: string) {
  if (isAppendingLog) return;
  isAppendingLog = true;
  try {
    const line = `[${new Date().toLocaleTimeString()}] ${rawText}`;
    terminalLogs.push(line);
    if (terminalLogs.length > MAX_LOGS) {
      terminalLogs.shift();
    }
    // Stream live line to connected web clients in real-time
    if (authenticatedClients.size > 0) {
      const lineMsg = JSON.stringify({
        type: 'TERMINAL_LOG_LINE',
        payload: { line },
      });
      for (const client of authenticatedClients) {
        if (client.readyState === WebSocket.OPEN) {
          try {
            client.send(lineMsg);
          } catch (_) {}
        }
      }
    }
  } finally {
    isAppendingLog = false;
  }
}

// Intercept console output to capture live Termux logs
const origLog = console.log;
const origWarn = console.warn;
const origErr = console.error;

console.log = (...args: any[]) => {
  origLog(...args);
  const text = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  appendTerminalLog(text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, ''));
};

console.warn = (...args: any[]) => {
  origWarn(...args);
  const text = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  appendTerminalLog(`⚠️ ${text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')}`);
};

console.error = (...args: any[]) => {
  origErr(...args);
  const text = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  appendTerminalLog(`❌ ${text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')}`);
};

function broadcast(message: DaemonMessage) {
  const json = JSON.stringify(message);
  for (const client of authenticatedClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  }
  if (message.type === 'BOT_STATE') {
    updateTermuxNotification(botManager);
  }
}

const botManager = new BotManager(broadcast);
startTermuxNotificationTicker(botManager);

wss.on('connection', (ws: WebSocket, req) => {
  const ip = req.socket.remoteAddress;
  console.log(chalk.gray(`[Connection] New WebSocket client connected from ${ip}`));

  // If no auth token is configured, auto-authorize connection
  if (!AUTH_TOKEN) {
    authenticatedClients.add(ws);
    ws.send(JSON.stringify({
      type: 'AUTH_RESULT',
      payload: { success: true, message: 'Connected to PebbleAFK Daemon.' },
    }));
  }

  // Ping/Pong keepalive. Retire half-open tunnel sockets so clients can reconnect cleanly.
  let missedHeartbeats = 0;
  const pingInterval = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (missedHeartbeats >= 3) {
      console.warn(chalk.yellow(`[Connection] WebSocket heartbeat missed for ${ip}; terminating stale socket`));
      ws.terminate();
      return;
    }
    missedHeartbeats++;
    try {
      ws.ping();
    } catch (_) {
      ws.terminate();
    }
  }, 20000);

  ws.on('pong', () => {
    missedHeartbeats = 0;
  });

  ws.on('message', (data: Buffer | string) => {
    missedHeartbeats = 0;
    try {
      const parsed: ClientMessage = JSON.parse(data.toString());

      // Authentication
      if (parsed.type === 'AUTH') {
        const clientToken = (parsed.payload.token || '').trim();

        if (AUTH_TOKEN && clientToken !== AUTH_TOKEN) {
          console.warn(chalk.red(`[Security] Blocked unauthorized connection attempt`));
          ws.send(JSON.stringify({
            type: 'AUTH_RESULT',
            payload: { success: false, message: 'Invalid daemon authentication token' },
          }));
          ws.close();
          return;
        }

        authenticatedClients.add(ws);
        ws.send(JSON.stringify({
          type: 'AUTH_RESULT',
          payload: { success: true, message: 'Authenticated successfully' },
        }));
        console.log(chalk.green(`[Auth] Client authenticated successfully`));

        botManager.handleClientMessage({ type: 'REQUEST_SYNC' });
        return;
      }

      // Check authentication
      if (!authenticatedClients.has(ws)) {
        ws.send(JSON.stringify({
          type: 'AUTH_RESULT',
          payload: { success: false, message: 'Unauthorized. Send AUTH first.' },
        }));
        return;
      }

      // Keepalive PING / PONG
      if (parsed.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG', payload: { timestamp: Date.now() } }));
        return;
      }

      // A dashboard shutdown is intentionally different from a daemon restart:
      // exit code 44 tells the Termux supervisor to stop the launcher, which
      // then cleans up the tunnel, heartbeat, wake lock, and registration.
      if (parsed.type === 'SHUTDOWN_DAEMON') {
        if (shutdownRequested) return;
        shutdownRequested = true;
        console.warn('[Daemon] Full shutdown requested by the authenticated dashboard. Stopping all managed services...');
        botManager.clearDesiredBots();
        try {
          ws.send(JSON.stringify({
            type: 'SHUTDOWN_RESULT',
            payload: { success: true, message: 'Full daemon shutdown started.' },
          }));
        } catch (_) {}
        setTimeout(() => process.exit(44), 300);
        return;
      }

      // Stream live Termux terminal logs to dashboard (compact batch)
      if (parsed.type === 'GET_TERMINAL_LOGS') {
        const fs = require('fs');
        const path = require('path');
        let fileLines: string[] = [];
        try {
          const logPath = path.resolve(process.cwd(), 'daemon.log');
          if (fs.existsSync(logPath)) {
            fileLines = fs.readFileSync(logPath, 'utf8')
              .split('\n')
              .slice(-150)
              .map((l: string) => l.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trim())
              .filter(Boolean);
          }
        } catch (_) {}

        // Combine file logs with current memory logs, preserving chronological order
        const allLogs = fileLines.length > 0 ? fileLines : terminalLogs.slice(-150);
        ws.send(JSON.stringify({
          type: 'TERMINAL_LOGS',
          payload: { logs: allLogs.slice(-150), timestamp: Date.now() },
        }));
        return;
      }

      // Update the running daemon in place. All commands are asynchronous so
      // WebSocket heartbeats and other bots keep running during fetch/build.
      if (parsed.type === 'UPDATE_DAEMON') {
        if (updateInProgress) {
          ws.send(JSON.stringify({ type: 'DAEMON_STATUS_UPDATE', payload: { message: 'An engine update is already running.' } }));
          return;
        }
        updateInProgress = true;
        void updateDaemonFromDashboard(ws).finally(() => { updateInProgress = false; });
        return;
      }

      if (parsed.type === 'RESTART_DAEMON') {
        console.log(chalk.cyan('[Daemon] Core restart requested by dashboard. Active accounts will be restored.'));
        sendDaemonStatus(ws, '🔁 Restarting daemon core; active accounts will reconnect automatically...');
        setTimeout(() => process.exit(42), 1200);
        return;
      }

      // Forward message to BotManager
      botManager.handleClientMessage(parsed);
    } catch (err: any) {
      console.error(chalk.red(`[Error] Failed to process message: ${err.message}`));
    }
  });

  ws.on('close', (code: number, reason: Buffer) => {
    clearInterval(pingInterval);
    authenticatedClients.delete(ws);
    const reasonStr = reason && reason.length ? reason.toString('utf8') : '';
    console.log(chalk.gray(`[Connection] WebSocket disconnected (${ip}) [code=${code}${reasonStr ? `, reason=${reasonStr}` : ''}]`));
  });

  ws.on('error', (err) => {
    console.error(chalk.red(`[Socket Error] ${err.message}`));
  });
});

function sendDaemonStatus(ws: WebSocket, message: string) {
  try {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'DAEMON_STATUS_UPDATE', payload: { message } }));
    }
  } catch (_) {}
}

function runCommand(command: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    childProcess.execFile(command, args, { cwd, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }, (error: any, stdout: string, stderr: string) => {
      if (error) {
        const output = [stdout, stderr].filter(Boolean).join('\n').trim();
        reject(new Error(output || error.message || String(error)));
        return;
      }
      resolve([stdout, stderr].filter(Boolean).join('\n').trim());
    });
  });
}

async function updateDaemonFromDashboard(ws: WebSocket) {
  const fs = require('fs');
  const daemonDir = path.join(repoDir, 'daemon');
  const status = (message: string) => {
    console.log(chalk.cyan(`[Update] ${message}`));
    sendDaemonStatus(ws, message);
  };

  console.log(chalk.cyan('\n════════════════════════════════════════════════════'));
  console.log(chalk.cyan('[Daemon] Remote update requested by dashboard.'));
  try {
    if (!fs.existsSync(path.join(repoDir, '.git'))) throw new Error(`Git repository not found at ${repoDir}`);
    status('📥 Checking GitHub for the latest engine changes...');
    const dirtyFiles = await runCommand('git', ['status', '--porcelain', '--untracked-files=no'], repoDir);
    if (dirtyFiles) throw new Error('Update paused because tracked local files have edits. They were left untouched. Commit or revert those edits on the device, then retry.');

    await runCommand('git', ['fetch', '--prune', 'origin', 'main'], repoDir);
    const localHead = (await runCommand('git', ['rev-parse', 'HEAD'], repoDir)).trim();
    const remoteHead = (await runCommand('git', ['rev-parse', 'FETCH_HEAD'], repoDir)).trim();
    if (!remoteHead) throw new Error('GitHub did not provide a main-branch revision.');

    if (localHead !== remoteHead) {
      try {
        await runCommand('git', ['merge-base', '--is-ancestor', localHead, remoteHead], repoDir);
      } catch (_) {
        throw new Error('Local main has commits that are not on GitHub main; refusing to overwrite or merge device changes automatically.');
      }
      status(`⬇️ Fast-forwarding engine from ${localHead.slice(0, 7)} to ${remoteHead.slice(0, 7)}...`);
      await runCommand('git', ['merge', '--ff-only', remoteHead], repoDir);
    }

    const targetHead = (await runCommand('git', ['rev-parse', 'HEAD'], repoDir)).trim();
    const dependencyMarker = path.join(daemonDir, '.pebbleafk-deps.sha256');
    const dependencyHash = crypto.createHash('sha256')
      .update(fs.readFileSync(path.join(daemonDir, 'package.json')))
      .update(fs.readFileSync(path.join(daemonDir, 'package-lock.json')))
      .digest('hex');
    let installedDependencyHash = '';
    try { installedDependencyHash = fs.readFileSync(dependencyMarker, 'utf8').trim(); } catch (_) {}
    const dependenciesNeedSync = installedDependencyHash !== dependencyHash || !fs.existsSync(path.join(daemonDir, 'node_modules'));

    if (targetHead === runningRevision && !dependenciesNeedSync) {
      status(`✓ Already up to date at ${targetHead.slice(0, 7)}. Existing account sessions remain connected.`);
      console.log(chalk.cyan('════════════════════════════════════════════════════\n'));
      return;
    }

    if (dependenciesNeedSync) {
      status('📦 Synchronizing daemon dependencies with the current lockfile...');
      // `npm install` reconciles a changed lockfile without deleting the whole
      // module tree while this already-running daemon is serving its accounts.
      const installOut = await runCommand('npm', ['install', '--ignore-scripts'], daemonDir);
      if (installOut) console.log(chalk.gray(installOut));
      const installedHash = crypto.createHash('sha256')
        .update(fs.readFileSync(path.join(daemonDir, 'package.json')))
        .update(fs.readFileSync(path.join(daemonDir, 'package-lock.json')))
        .digest('hex');
      fs.writeFileSync(dependencyMarker, `${installedHash}\n`, { encoding: 'utf8', mode: 0o600 });
    }

    const isTermux = /termux/i.test(process.env.PREFIX || '') || Boolean(process.env.TERMUX_VERSION);
    if (isTermux) {
      status('🔧 Preparing the Termux RakNet transport...');
      const patchOut = await runCommand('node', ['./scripts/patch-mobile-raknet.cjs'], daemonDir);
      if (patchOut) console.log(chalk.gray(patchOut));
      try {
        const raknetOut = await runCommand('bash', ['./scripts/prepare-mobile-raknet.sh'], daemonDir);
        if (raknetOut) console.log(raknetOut);
      } catch (error: any) {
        console.warn(chalk.yellow(`[Update] Native RakNet preparation note; existing backend/fallback remains available: ${error?.message || error}`));
      }
    }

    status('⚙️ Building updated daemon core...');
    const buildOut = await runCommand('npm', ['run', 'build'], daemonDir);
    if (buildOut) console.log(chalk.gray(buildOut));
    status(`✨ Engine update complete (${targetHead.slice(0, 7)}). Restarting the core; active accounts will reconnect automatically.`);
    console.log(chalk.cyan('════════════════════════════════════════════════════\n'));
    setTimeout(() => process.exit(42), 1200);
  } catch (error: any) {
    const message = error?.message || String(error);
    console.error(chalk.red(`[Update] ✗ Update failed safely: ${message}`));
    sendDaemonStatus(ws, `⚠️ Update failed; the running daemon was left online. ${message}`);
    console.log(chalk.cyan('════════════════════════════════════════════════════\n'));
  }
}

function gracefulShutdown(signal: string) {
  if (shutdownRequested) return;
  shutdownRequested = true;
  console.log(chalk.yellow(`[Daemon] Received ${signal}. Closing server sockets cleanly...`));
  try {
    for (const client of authenticatedClients) {
      try { client.close(1001, 'Daemon stopping'); } catch (_) {}
    }
    authenticatedClients.clear();
  } catch (_) {}

  try {
    server.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 1000);
  } catch (_) {
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

let listenRetries = 0;
const MAX_LISTEN_RETRIES = 12;

function startServerListening() {
  server.listen(PORT, '127.0.0.1', () => {
    listenRetries = 0;
    console.log(chalk.cyan(`
  ╔═══════════════════════════════════════════════════╗
  ║                PebbleAFK Daemon                   ║
  ║         Pure Bedrock Protocol AFK Stack           ║
  ╚═══════════════════════════════════════════════════╝
    `));
    console.log(chalk.green(`[Server] Listening on phone-local http://127.0.0.1:${PORT} (Cloudflare Tunnel origin)`));
    console.log(chalk.yellow(`[Security] Auth token is ${AUTH_TOKEN ? 'ENABLED' : 'DISABLED (Open)'}`));
    console.log(chalk.blue(`[Tunnel] Ready for Cloudflare Tunnel:\n         cloudflared tunnel --url http://127.0.0.1:${PORT}\n`));
  });
}

server.on('error', (err: any) => {
  if (err?.code === 'EADDRINUSE') {
    listenRetries++;
    if (listenRetries <= MAX_LISTEN_RETRIES) {
      console.warn(chalk.yellow(`[Server] Port ${PORT} busy (attempt ${listenRetries}/${MAX_LISTEN_RETRIES}). Re-attempting in 1.5s...`));
      setTimeout(() => {
        try { server.close(); } catch (_) {}
        startServerListening();
      }, 1500);
      return;
    }
    console.error(chalk.red(`[PebbleAFK Fatal] Port ${PORT} remained busy after ${MAX_LISTEN_RETRIES} attempts.`));
    process.exit(43);
  } else {
    console.error(chalk.red(`[PebbleAFK Fatal Server Error] ${err?.message || err}`));
    process.exit(1);
  }
});

startServerListening();
