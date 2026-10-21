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
  // A failed listen cannot recover inside this process. Let the Termux
  // supervisor stop retrying and surface the port conflict to the launcher.
  if (err?.code === 'EADDRINUSE') process.exit(43);
});

process.on('unhandledRejection', (reason: any) => {
  console.warn(chalk.yellow(`[PebbleAFK Unhandled Rejection] ${reason}`));
});

const PORT = parseInt(process.env.PORT || '8080', 10);
const AUTH_TOKEN = (process.env.DAEMON_AUTH_TOKEN || '').trim();

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
  let isAlive = true;
  const pingInterval = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (!isAlive) {
      console.warn(chalk.yellow(`[Connection] WebSocket heartbeat missed for ${ip}; terminating stale socket`));
      ws.terminate();
      return;
    }
    isAlive = false;
    try {
      ws.ping();
    } catch (_) {
      ws.terminate();
    }
  }, 20000);

  ws.on('pong', () => {
    isAlive = true;
  });

  ws.on('message', (data: Buffer | string) => {
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

      // 1-Click Remote Update & Restart from Dashboard
      if (parsed.type === 'UPDATE_DAEMON' || parsed.type === 'RESTART_DAEMON') {
        const isUpdate = parsed.type === 'UPDATE_DAEMON';
        console.log(chalk.cyan(`\n════════════════════════════════════════════════════`));
        console.log(chalk.cyan(`[Daemon] Remote ${isUpdate ? 'update & restart' : 'restart'} requested by dashboard.`));
        try {
          ws.send(JSON.stringify({
            type: 'DAEMON_STATUS_UPDATE',
            payload: { message: isUpdate ? '🔄 Pulling latest code from GitHub & restarting...' : '🔁 Rebooting daemon core...' }
          }));
        } catch (_) {}

        if (isUpdate) {
          try {
            const cp = require('child_process');
            const path = require('path');
            const fs = require('fs');
            let repoDir = path.resolve(__dirname, '..', '..');
            if (!fs.existsSync(path.join(repoDir, '.git')) && process.env.HOME) {
              const homeRepo = path.join(process.env.HOME, 'PebbleAFK');
              if (fs.existsSync(path.join(homeRepo, '.git'))) {
                repoDir = homeRepo;
              }
            }

            console.log(chalk.cyan(`[Update] 📥 Syncing repository from GitHub origin main...`));
            const gitOut = cp.execSync('git reset --hard HEAD && git pull --force origin main', { cwd: repoDir, encoding: 'utf8' });
            console.log(chalk.green(`[Update] ✓ Git Sync:\n${gitOut.trim()}`));

            console.log(chalk.cyan(`[Update] ⚙️ Rebuilding daemon TypeScript core...`));
            const buildOut = cp.execSync('npm run build', { cwd: path.join(repoDir, 'daemon'), encoding: 'utf8' });
            console.log(chalk.green(`[Update] ✓ Build complete:\n${buildOut.trim()}`));
            console.log(chalk.green(`[Update] ✨ Core engine successfully updated! Rebooting supervisor...`));
          } catch (gitErr: any) {
            console.error(chalk.yellow(`[Update] git notice: ${gitErr?.message || gitErr}`));
          }
        }
        console.log(chalk.cyan(`════════════════════════════════════════════════════\n`));
        setTimeout(() => {
          process.exit(42);
        }, 1200);
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

server.on('error', (err: any) => {
  if (err?.code === 'EADDRINUSE') {
    console.error(chalk.red(`[PebbleAFK Fatal] Port ${PORT} is already in use by another process.`));
    process.exit(43);
  } else {
    console.error(chalk.red(`[PebbleAFK Fatal Server Error] ${err?.message || err}`));
    process.exit(1);
  }
});

// Cloudflare Tunnel runs locally on this phone, then exposes the secure public URL.
// Bind the daemon only to loopback; no Wi-Fi/mobile interface address is involved.
server.listen(PORT, '127.0.0.1', () => {
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
