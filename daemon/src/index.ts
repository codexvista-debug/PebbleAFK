import { WebSocketServer, WebSocket } from 'ws';
import * as http from 'http';
import * as dotenv from 'dotenv';
import chalk from 'chalk';
import { BotManager } from './bot/botManager';
import { ClientMessage, DaemonMessage } from './types';

dotenv.config();

// Global unhandled errors guard
process.on('uncaughtException', (err: any) => {
  console.error(chalk.yellow(`[PebbleAFK Exception Guard] ${err?.message || err}`));
  if (err?.stack) {
    console.error(chalk.gray(err.stack));
  }
});

process.on('unhandledRejection', (reason: any) => {
  console.warn(chalk.yellow(`[PebbleAFK Unhandled Rejection] ${reason}`));
});

const PORT = parseInt(process.env.PORT || '8080', 10);
const AUTH_TOKEN = (process.env.DAEMON_AUTH_TOKEN || '').trim();

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    service: 'PebbleAFK Daemon (Bedrock Edition)',
    status: 'running',
    protocol: 'bedrock-protocol',
    uptime: Math.round(process.uptime()),
    timestamp: Date.now(),
  }));
});

const wss = new WebSocketServer({ server });
const authenticatedClients = new Set<WebSocket>();

function broadcast(message: DaemonMessage) {
  const json = JSON.stringify(message);
  for (const client of authenticatedClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  }
}

const botManager = new BotManager(broadcast);

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

  // Ping/Pong keepalive
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  }, 15000);

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

      // 1-Click Remote Update & Restart from Dashboard
      if (parsed.type === 'UPDATE_DAEMON' || parsed.type === 'RESTART_DAEMON') {
        const isUpdate = parsed.type === 'UPDATE_DAEMON';
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
            cp.execSync('git reset --hard HEAD && git pull --force origin main', { cwd: repoDir, stdio: 'inherit' });
          } catch (gitErr: any) {
            console.error(chalk.yellow(`[Update] git pull notice: ${gitErr?.message || gitErr}`));
          }
        }
        setTimeout(() => {
          process.exit(42);
        }, 600);
        return;
      }

      // Forward message to BotManager
      botManager.handleClientMessage(parsed);
    } catch (err: any) {
      console.error(chalk.red(`[Error] Failed to process message: ${err.message}`));
    }
  });

  ws.on('close', () => {
    clearInterval(pingInterval);
    authenticatedClients.delete(ws);
    console.log(chalk.gray(`[Connection] WebSocket disconnected (${ip})`));
  });

  ws.on('error', (err) => {
    console.error(chalk.red(`[Socket Error] ${err.message}`));
  });
});

server.on('error', (err: any) => {
  if (err?.code === 'EADDRINUSE') {
    console.error(chalk.red(`[PebbleAFK Fatal] Port ${PORT} is already in use by another process.`));
  } else {
    console.error(chalk.red(`[PebbleAFK Fatal Server Error] ${err?.message || err}`));
  }
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(chalk.cyan(`
  ╔═══════════════════════════════════════════════════╗
  ║                PebbleAFK Daemon                   ║
  ║         Pure Bedrock Protocol AFK Stack           ║
  ╚═══════════════════════════════════════════════════╝
  `));
  console.log(chalk.green(`[Server] Listening on http://0.0.0.0:${PORT}`));
  console.log(chalk.yellow(`[Security] Auth token is ${AUTH_TOKEN ? 'ENABLED' : 'DISABLED (Open)'}`));
  console.log(chalk.blue(`[Tunnel] Ready for Cloudflare Tunnel:\n         cloudflared tunnel --url http://localhost:${PORT}\n`));
});
