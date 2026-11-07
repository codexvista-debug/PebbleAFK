import { execFile } from 'child_process';
import type { BotManager } from './bot/botManager';

let notificationTicker: NodeJS.Timeout | null = null;
let lastTitle = '';
let lastContent = '';
let notificationInFlight = false;
let termuxNotificationAvailable: boolean | null = null;

function formatUptime(totalSec: number): string {
  if (totalSec <= 0) return '0m';
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return '<1m';
}

export function updateTermuxNotification(botManager: BotManager) {
  try {
    const bots = botManager.getAllBots();
    const onlineBots = bots.filter((b) => b.state === 'SPAWNED' || b.state === 'LOGGED_IN');
    const connectingBots = bots.filter((b) => b.state === 'CONNECTING' || b.state === 'RECONNECTING');
    const errorBots = bots.filter((b) => b.state === 'ERROR' || (b.state === 'DISCONNECTED' && b.getLastDisconnectReason()));
    const stalledOnlineBots = onlineBots.filter((b) => b.isStreamStale(45_000));
    const healthyOnlineBots = onlineBots.filter((b) => !b.isStreamStale(45_000));

    const freshSmpBots = bots.flatMap((bot) => {
      const diagnostics = bot.getFreshSmpDiagnostics();
      return diagnostics ? [{ bot, diagnostics }] : [];
    });
    const freshSmpOnline = freshSmpBots.filter(
      ({ bot }) => (bot.state === 'SPAWNED' || bot.state === 'LOGGED_IN') && !bot.isStreamStale(45_000)
    );
    const freshSmpStalled = freshSmpBots.filter(
      ({ bot }) => (bot.state === 'SPAWNED' || bot.state === 'LOGGED_IN') && bot.isStreamStale(45_000)
    );
    const stableFreshSmp = freshSmpOnline.filter(({ diagnostics }) =>
      diagnostics.phase === 'lifesteal' &&
      typeof diagnostics.lifestealSessionStartedAt === 'number' &&
      Date.now() - diagnostics.lifestealSessionStartedAt >= 60_000
    );

    let title = 'PebbleAFK • Standby';
    let content = '💤 0 bots online | Standby for server connection';

    if (freshSmpBots.length > 0 && (freshSmpOnline.length > 0 || freshSmpStalled.length > 0)) {
      const inLobby = freshSmpOnline.filter(({ diagnostics }) => diagnostics.phase === 'lobby').length;
      const unstable = freshSmpOnline.length - stableFreshSmp.length - inLobby;
      const reconnectingCount = freshSmpBots.filter(({ bot }) => bot.state === 'CONNECTING' || bot.state === 'RECONNECTING').length;
      const highestUptime = stableFreshSmp.reduce((longest, { diagnostics }) => {
        const startedAt = diagnostics.lifestealSessionStartedAt || Date.now();
        return Math.max(longest, Math.floor((Date.now() - startedAt - 60_000) / 1000));
      }, 0);

      const statusParts = [`${stableFreshSmp.length} stable`];
      if (inLobby > 0) statusParts.push(`${inLobby} in lobby`);
      if (unstable > 0) statusParts.push(`${unstable} unstable`);
      if (freshSmpStalled.length > 0) statusParts.push(`${freshSmpStalled.length} stalled`);
      if (reconnectingCount > 0) statusParts.push(`${reconnectingCount} retrying`);

      const allStalledOrUnstable = stableFreshSmp.length === 0 && freshSmpStalled.length > 0;
      const badge = allStalledOrUnstable ? '⚠️' : (stableFreshSmp.length > 0 ? '🟢' : '🟡');
      title = allStalledOrUnstable ? 'PebbleAFK • FreshSMP (Stream Stalled)' : 'PebbleAFK • FreshSMP';
      content = `${badge} ${statusParts.join(' · ')}${stableFreshSmp.length > 0 ? ` | Uptime: ${formatUptime(highestUptime)}` : ''}`;
    } else if (healthyOnlineBots.length > 0 || stalledOnlineBots.length > 0) {
      // Find server with connected bots & find highest uptime
      const sampleBot = healthyOnlineBots[0] || stalledOnlineBots[0];
      let bestHost = sampleBot.config.host || 'Bedrock Server';
      let highestUptime = 0;

      for (const b of healthyOnlineBots) {
        const up = b.getUptime();
        if (up >= highestUptime) {
          highestUptime = up;
          bestHost = b.config.host || bestHost;
        }
      }

      // Prettify server name
      let serverLabel = bestHost.trim();
      const lowerHost = serverLabel.toLowerCase();
      if (lowerHost.includes('freshsmp')) serverLabel = 'FreshSMP';
      else if (lowerHost.includes('donutsmp')) serverLabel = 'DonutSMP';
      else if (lowerHost.includes('cubecraft')) serverLabel = 'CubeCraft';
      else serverLabel = serverLabel.replace(/^play\./i, '');

      if (healthyOnlineBots.length === 0 && stalledOnlineBots.length > 0) {
        title = `PebbleAFK • ${serverLabel} (Stream Stalled)`;
        content = `⚠️ ${stalledOnlineBots.length} bot${stalledOnlineBots.length === 1 ? '' : 's'} not receiving packets | Resetting...`;
      } else {
        const count = healthyOnlineBots.length;
        const uptimeStr = formatUptime(highestUptime);
        const extraParts: string[] = [];
        if (stalledOnlineBots.length > 0) extraParts.push(`${stalledOnlineBots.length} stalled`);
        if (connectingBots.length > 0) extraParts.push(`${connectingBots.length} retrying`);
        const suffix = extraParts.length > 0 ? ` (${extraParts.join(', ')})` : '';

        title = `PebbleAFK • ${serverLabel}`;
        content = `🟢 ${count} bot${count === 1 ? '' : 's'} online${suffix} | Uptime: ${uptimeStr}`;
      }
    } else if (connectingBots.length > 0) {
      const sampleHost = (connectingBots[0].config.host || 'Bedrock Server').toLowerCase();
      const serverLabel = sampleHost.includes('freshsmp')
        ? 'FreshSMP'
        : sampleHost.includes('donutsmp')
          ? 'DonutSMP'
          : (connectingBots[0].config.host || 'Server').replace(/^play\./i, '');
      title = `PebbleAFK • ${serverLabel} (Connecting)`;
      content = `🟡 0 online · ${connectingBots.length} bot${connectingBots.length === 1 ? '' : 's'} connecting/retrying...`;
    } else if (errorBots.length > 0) {
      title = 'PebbleAFK • Disconnected';
      content = `🔴 0 bots online · ${errorBots.length} bot${errorBots.length === 1 ? '' : 's'} disconnected/error`;
    }

    // Only invoke if changed or if no notification is currently in flight
    if (termuxNotificationAvailable === false || notificationInFlight) {
      return;
    }
    if (title === lastTitle && content === lastContent) {
      return;
    }
    lastTitle = title;
    lastContent = content;
    notificationInFlight = true;

    execFile(
      'termux-notification',
      [
        '--id',
        'pebbleafk_status',
        '--title',
        title,
        '--content',
        content,
        '--ongoing',
        '--priority',
        'low',
        '--alert-once',
      ],
      { timeout: 3000, killSignal: 'SIGKILL' },
      (err: any) => {
        notificationInFlight = false;
        if (err && err.code === 'ENOENT') {
          termuxNotificationAvailable = false;
        }
      }
    );
  } catch (_) {
    // Non-Android platforms silently ignored
  }
}

export function startTermuxNotificationTicker(botManager: BotManager) {
  if (notificationTicker) clearInterval(notificationTicker);
  // Initial fire
  updateTermuxNotification(botManager);
  // Tick every 5 seconds for real-time uptime and immediate stall/disconnect detection
  notificationTicker = setInterval(() => {
    updateTermuxNotification(botManager);
  }, 5000);
}

export function clearTermuxNotification() {
  if (notificationTicker) {
    clearInterval(notificationTicker);
    notificationTicker = null;
  }
  if (termuxNotificationAvailable === false) return;
  try {
    execFile(
      'termux-notification-remove',
      ['pebbleafk_status'],
      { timeout: 2000, killSignal: 'SIGKILL' },
      () => {}
    );
  } catch (_) {}
}
