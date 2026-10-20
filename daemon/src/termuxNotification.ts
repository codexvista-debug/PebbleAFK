import { execFile } from 'child_process';
import type { BotManager } from './bot/botManager';

let notificationTicker: NodeJS.Timeout | null = null;
let lastTitle = '';
let lastContent = '';

function formatUptime(totalSec: number): string {
  if (totalSec <= 0) return '0s';
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function updateTermuxNotification(botManager: BotManager) {
  try {
    const bots = botManager.getAllBots();
    const onlineBots = bots.filter((b) => b.state === 'SPAWNED' || b.state === 'LOGGED_IN');

    let title = 'PebbleAFK • Standby';
    let content = '💤 0 bots online | Standby for server connection';

    if (onlineBots.length > 0) {
      // Find server with connected bots & find highest uptime
      let bestHost = onlineBots[0].config.host || 'Bedrock Server';
      let highestUptime = 0;

      for (const b of onlineBots) {
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

      const count = onlineBots.length;
      const uptimeStr = formatUptime(highestUptime);

      title = `PebbleAFK • ${serverLabel}`;
      content = `🟢 ${count} bot${count === 1 ? '' : 's'} online | Uptime: ${uptimeStr}`;
    }

    // Only invoke if changed or periodic tick
    if (title !== lastTitle || content !== lastContent) {
      lastTitle = title;
      lastContent = content;
    }

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
      () => {
        // Silently ignore if not in Termux environment
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
  // Tick every 5 seconds to update uptime and live bot status
  notificationTicker = setInterval(() => {
    updateTermuxNotification(botManager);
  }, 5000);
}
