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
let daemonOwner = (process.env.PEBBLEAFK_OWNER || '').trim().toLowerCase();
let daemonSecret = AUTH_TOKEN;
const DAEMON_STARTED_AT = Date.now() - Math.round(process.uptime() * 1000);
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
type DeviceSession = { sessionId: string; label: string; userAgent: string; ip: string; connectedAt: number; lastSeenAt: number; connected: boolean };
const sessionStorePath = path.join(repoDir, '.pebbleafk-websocket-sessions.json');
const deviceSessions = new Map<string, DeviceSession>();
const sessionSockets = new Map<string, Set<WebSocket>>();
const socketSessions = new Map<WebSocket, string>();
let shutdownRequested = false;

try {
  const saved = JSON.parse(require('fs').readFileSync(sessionStorePath, 'utf8'));
  if (Array.isArray(saved)) {
    for (const entry of saved) {
      const isLegacyAnonymousMonitor = entry?.label === 'Browser session';
      const isRecent = Number(entry?.lastSeenAt) > Date.now() - 30 * 24 * 60 * 60 * 1000;
      if (!isLegacyAnonymousMonitor && isRecent && entry && typeof entry.sessionId === 'string' && /^[\w-]{8,100}$/.test(entry.sessionId)) {
        deviceSessions.set(entry.sessionId, { ...entry, connected: false });
      }
    }
  }
} catch (_) {}

function persistDeviceSessions() {
  const fs = require('fs');
  const temporaryPath = `${sessionStorePath}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify([...deviceSessions.values()]), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporaryPath, sessionStorePath);
  } catch (error: any) {
    try { if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath); } catch (_) {}
    console.warn(`[Connection] Could not save browser session registry: ${error?.message || error}`);
  }
}

setInterval(persistDeviceSessions, 60000).unref();

function publishDeviceSessions() {
  const now = Date.now();
  const sessions = [...deviceSessions.values()]
    .map((session) => ({
      ...session,
      connected: Boolean(sessionSockets.get(session.sessionId)?.size) && now - session.lastSeenAt < 35000,
    }))
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  const json = JSON.stringify({ type: 'DEVICE_SESSIONS', payload: { sessions } });
  for (const client of authenticatedClients) {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(json); } catch (_) {}
    }
  }
}

function registerDeviceSession(ws: WebSocket, sessionId: string, label: string, userAgent: string, ip: string) {
  const now = Date.now();
  const previous = deviceSessions.get(sessionId);
  deviceSessions.set(sessionId, {
    sessionId,
    label: label.slice(0, 80) || 'Browser session',
    userAgent: userAgent.slice(0, 240),
    ip,
    connectedAt: previous?.connectedAt || now,
    lastSeenAt: now,
    connected: true,
  });
  const sockets = sessionSockets.get(sessionId) || new Set<WebSocket>();
  sockets.add(ws);
  sessionSockets.set(sessionId, sockets);
  socketSessions.set(ws, sessionId);
  persistDeviceSessions();
  publishDeviceSessions();
}

const terminalLogs: string[] = [];
const MAX_LOGS = 500;
let isAppendingLog = false;
const LOG_HISTORY_URL = process.env.PEBBLEAFK_LOGS_URL || 'https://pebbleafk.vercel.app/api/termux-logs';
const DAEMON_STATUS_URL = process.env.PEBBLEAFK_STATUS_URL || 'https://pebbleafk.vercel.app/api/termux-status';
const pendingHistoryLogs: Array<{ line: string; timestamp: number }> = [];
let historyFlushInProgress = false;
let statusHeartbeatInProgress = false;

async function syncDaemonStatus(isOnline = true) {
  if (statusHeartbeatInProgress || !daemonOwner || !daemonSecret) return;
  statusHeartbeatInProgress = true;
  try {
    await fetch(DAEMON_STATUS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${daemonSecret}` },
      body: JSON.stringify({
        username: daemonOwner,
        daemonStartedAt: DAEMON_STARTED_AT,
        lastSeenAt: Date.now(),
        instanceId: process.env.PEBBLEAFK_INSTANCE_ID || String(DAEMON_STARTED_AT),
        isOnline,
        stableBots: botManager.getStableFreshSmpUsernames(),
      }),
      signal: AbortSignal.timeout(isOnline ? 10000 : 1800),
    });
  } catch (_) {
    // A temporary Supabase/Vercel outage must never interrupt the local daemon.
  } finally {
    statusHeartbeatInProgress = false;
  }
}

setInterval(() => { void syncDaemonStatus(true); }, 20000).unref();
setTimeout(() => { void syncDaemonStatus(true); }, 3000).unref();

async function flushTerminalLogHistory() {
  if (historyFlushInProgress || !daemonOwner || !daemonSecret || pendingHistoryLogs.length === 0) return;
  historyFlushInProgress = true;
  const batch = pendingHistoryLogs.slice(0, 100);
  try {
    const response = await fetch(LOG_HISTORY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${daemonSecret}` },
      body: JSON.stringify({ username: daemonOwner, logs: batch }),
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) pendingHistoryLogs.splice(0, batch.length);
  } catch (_) {
    // Keep the batch queued; transient Internet/Vercel outages must not stop the daemon.
  } finally {
    historyFlushInProgress = false;
  }
}

setInterval(() => { void flushTerminalLogHistory(); }, 3000).unref();

function appendTerminalLog(rawText: string) {
  if (isAppendingLog) return;
  isAppendingLog = true;
  try {
    const line = `[${new Date().toLocaleTimeString()}] ${rawText}`;
    terminalLogs.push(line);
    if (daemonOwner && daemonSecret) {
      pendingHistoryLogs.push({ line, timestamp: Date.now() });
      if (pendingHistoryLogs.length > 5000) pendingHistoryLogs.splice(0, pendingHistoryLogs.length - 5000);
    }
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

appendTerminalLog('=== NEW TERMUX SESSION STARTED ===');

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
      payload: { success: true, message: 'Connected to PebbleAFK Daemon.', daemonStartedAt: DAEMON_STARTED_AT },
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
    const sessionId = socketSessions.get(ws);
    const session = sessionId ? deviceSessions.get(sessionId) : undefined;
    if (session) {
      session.lastSeenAt = Date.now();
      session.connected = true;
      publishDeviceSessions();
    }
  });

  ws.on('message', (data: Buffer | string) => {
    missedHeartbeats = 0;
    try {
      const parsed: ClientMessage = JSON.parse(data.toString());

      // Authentication
      if (parsed.type === 'AUTH') {
        const clientToken = (parsed.payload.token || '').trim();
        const requestedOwner = String(parsed.payload.username || '').trim().toLowerCase();

        if (AUTH_TOKEN && clientToken !== AUTH_TOKEN) {
          console.warn(chalk.red(`[Security] Blocked unauthorized connection attempt`));
          ws.send(JSON.stringify({
            type: 'AUTH_RESULT',
            payload: { success: false, message: 'Invalid daemon authentication token' },
          }));
          ws.close();
          return;
        }

        if (daemonOwner && requestedOwner && requestedOwner !== daemonOwner) {
          ws.send(JSON.stringify({
            type: 'AUTH_RESULT',
            payload: { success: false, message: 'This daemon belongs to a different PebbleAFK account.' },
          }));
          ws.close();
          return;
        }

        if (!daemonOwner && /^[a-z0-9]{1,16}$/.test(requestedOwner)) daemonOwner = requestedOwner;
        if (!daemonSecret && /^pb_[a-f0-9]{10}$/i.test(clientToken)) daemonSecret = clientToken;
        void syncDaemonStatus(true);

        authenticatedClients.add(ws);
        const sessionId = typeof parsed.payload.sessionId === 'string' && /^[\w-]{8,100}$/.test(parsed.payload.sessionId)
          ? parsed.payload.sessionId
          : undefined;
        // Admin and server-to-server sockets do not have a browser session ID;
        // never invent one here or they pollute the user's known-device list.
        if (sessionId) {
          registerDeviceSession(
            ws,
            sessionId,
            typeof parsed.payload.deviceLabel === 'string' ? parsed.payload.deviceLabel : 'Browser',
            String(req.headers['user-agent'] || ''),
            String(ip || 'unknown'),
          );
        }
        ws.send(JSON.stringify({
          type: 'AUTH_RESULT',
          payload: { success: true, message: 'Authenticated successfully', daemonStartedAt: DAEMON_STARTED_AT },
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
        const sessionId = socketSessions.get(ws);
        const session = sessionId ? deviceSessions.get(sessionId) : undefined;
        if (session) {
          session.lastSeenAt = Date.now();
          publishDeviceSessions();
        }
        ws.send(JSON.stringify({ type: 'PONG', payload: { timestamp: Date.now() } }));
        return;
      }

      if (parsed.type === 'DISCONNECT_DEVICE_SESSION') {
        const sessionId = parsed.payload?.sessionId;
        if (!sessionId || !deviceSessions.has(sessionId)) return;
        for (const target of sessionSockets.get(sessionId) || []) {
          if (target.readyState === WebSocket.OPEN) {
            try {
              target.send(JSON.stringify({
                type: 'DEVICE_SESSION_REMOVED',
                payload: { sessionId, message: 'This browser session was disconnected from the dashboard.' },
              }));
              target.close(4003, 'Disconnected from dashboard');
            } catch (_) {}
          }
          authenticatedClients.delete(target);
          socketSessions.delete(target);
        }
        sessionSockets.delete(sessionId);
        deviceSessions.delete(sessionId);
        persistDeviceSessions();
        publishDeviceSessions();
        console.log(chalk.yellow(`[Connection] Browser session ${sessionId} disconnected from dashboard`));
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
        console.log(chalk.cyan('[Daemon] Core restart requested by dashboard. Accounts require a manual reconnect after startup.'));
        sendDaemonStatus(ws, '🔁 Restarting daemon core; reconnect accounts manually from the dashboard after it returns.');
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
    const sessionId = socketSessions.get(ws);
    socketSessions.delete(ws);
    if (sessionId) {
      const sockets = sessionSockets.get(sessionId);
      sockets?.delete(ws);
      if (!sockets?.size) {
        sessionSockets.delete(sessionId);
        const session = deviceSessions.get(sessionId);
        if (session) {
          session.connected = false;
          session.lastSeenAt = Date.now();
        }
        persistDeviceSessions();
      }
      publishDeviceSessions();
    }
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

      // Device-local tracked edits used to stop remote updates entirely. Preserve
      // them in Git's recoverable stash, then apply the upstream files cleanly;
      // never discard edits or reapply potentially conflicting overrides on top
      // of the new version. Ignored runtime data (.env, tokens, node_modules)
      // is not included by this tracked-only stash.
      const dirtyFiles = await runCommand('git', ['status', '--porcelain', '--untracked-files=no'], repoDir);
      if (dirtyFiles) {
        const previousStash = await runCommand('git', ['rev-parse', '-q', '--verify', 'refs/stash'], repoDir).catch(() => '');
        const stashMessage = `PebbleAFK pre-update tracked edits ${new Date().toISOString()}`;
        status('🛟 Saving tracked device-local edits to a recoverable Git stash before updating...');
        await runCommand('git', ['stash', 'push', '--message', stashMessage], repoDir);
        const currentStash = (await runCommand('git', ['rev-parse', '-q', '--verify', 'refs/stash'], repoDir)).trim();
        const remainingEdits = await runCommand('git', ['status', '--porcelain', '--untracked-files=no'], repoDir);
        if (!currentStash || currentStash === previousStash || remainingEdits) {
          throw new Error('Could not safely preserve all tracked device edits in a Git stash; upstream files were not changed.');
        }
        status(`✓ Device-local tracked edits preserved in stash ${currentStash.slice(0, 7)} (review with git stash list); applying the upstream version now.`);
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
    status(`✨ Engine update complete (${targetHead.slice(0, 7)}). Restarting the core; reconnect accounts manually from the dashboard after it returns.`);
    console.log(chalk.cyan('════════════════════════════════════════════════════\n'));
    setTimeout(() => process.exit(42), 1200);
  } catch (error: any) {
    const message = error?.message || String(error);
    console.error(chalk.red(`[Update] ✗ Update failed safely: ${message}`));
    sendDaemonStatus(ws, `⚠️ Update failed; the running daemon was left online. ${message}`);
    console.log(chalk.cyan('════════════════════════════════════════════════════\n'));
  }
}

async function gracefulShutdown(signal: string) {
  if (shutdownRequested) return;
  shutdownRequested = true;
  console.log(chalk.yellow(`[Daemon] Received ${signal}. Closing server sockets cleanly...`));
  await syncDaemonStatus(false);
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

function startServerListening() {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(chalk.cyan(`
  ╔═══════════════════════════════════════════════════╗
  ║                PebbleAFK Daemon                   ║
  ║         Pure Bedrock Protocol AFK Stack           ║
  ╚═══════════════════════════════════════════════════╝
    `));
    console.log(chalk.green(`[Server] Listening on phone-local http://127.0.0.1:${PORT} (Cloudflare Tunnel origin)`));
    console.log(chalk.yellow(`[Security] Auth token is ${AUTH_TOKEN ? 'ENABLED' : 'DISABLED (Open)'}`));
    console.log(chalk.gray(`[Build] Revision ${runningRevision || 'unknown'}; package ${require(path.join(repoDir, 'daemon', 'package.json')).version}`));
    console.log(chalk.blue(`[Tunnel] Ready for Cloudflare Tunnel:\n         cloudflared tunnel --url http://127.0.0.1:${PORT}\n`));
  });
}

server.on('error', (err: any) => {
  if (err?.code === 'EADDRINUSE') {
    console.error(chalk.red(`[PebbleAFK Fatal] Port ${PORT} is already in use. Refusing to wait or disrupt its owner; the launcher will identify PebbleAFK leftovers and retry.`));
    process.exit(43);
  } else {
    console.error(chalk.red(`[PebbleAFK Fatal Server Error] ${err?.message || err}`));
    process.exit(1);
  }
});

startServerListening();
