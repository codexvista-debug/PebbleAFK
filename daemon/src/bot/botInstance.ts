import chalk from 'chalk';
import { randomUUID } from 'crypto';
const bedrock = require('bedrock-protocol');
import { BotConfig, BotLifecycleState, DaemonMessage, TelemetryPayload } from '../types';
import { getAndSyncTokenFolder } from './tokenManager';

function pingBedrockJsp(host: string, port: number, timeoutMs = 2000): Promise<{ version?: string; motd?: string; protocol?: string } | null> {
  return new Promise((resolve) => {
    let resolved = false;
    let timer: NodeJS.Timeout | null = null;
    let rakClient: any = null;
    try {
      const jspRaknet = (eval('require'))('jsp-raknet');
      rakClient = new jspRaknet.Client(host, port);
      timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try { rakClient?.close(); } catch (_) {}
          resolve(null);
        }
      }, timeoutMs);
      rakClient.ping((data: any) => {
        if (resolved) return;
        resolved = true;
        if (timer) clearTimeout(timer);
        try { rakClient?.close(); } catch (_) {}
        try {
          const str = typeof data === 'string' ? data : (data?.toString?.() || '');
          const parts = str.split(';');
          if (parts.length >= 4) {
            resolve({ motd: parts[1], protocol: parts[2], version: parts[3] });
            return;
          }
        } catch (_) {}
        resolve(null);
      });
    } catch (_) {
      if (timer) clearTimeout(timer);
      resolve(null);
    }
  });
}

function getBedrockSupportedVersions(): { versions: Record<string, number>; currentVersion: string } {
  try {
    const opts = (eval('require'))('bedrock-protocol/src/options');
    if (opts && opts.Versions) {
      const def = opts.defaultVersion || '1.26.30';
      return { versions: opts.Versions, currentVersion: def };
    }
  } catch (_) {}
  return { versions: { '1.21.50': 766, '1.26.30': 770, '1.26.51': 2193 }, currentVersion: '1.26.30' };
}

// Persistent memory cache of verified working Bedrock versions per host
const SERVER_VERSION_CACHE: Map<string, string> = new Map([
  ['donutsmp.net', '1.26.51'],
]);

const BEDROCK_CYCLE_VERSIONS = [
  '1.26.30', '1.26.51', '1.26.45', '1.26.40', '1.26.20', '1.26.10', '1.26.0',
  '1.21.50', '1.21.30', '1.20.80',
];

function resolveBedrockTargetVersion(
  userVersion?: string,
  pingProtocol?: string | number,
  pingVersion?: string,
  host?: string
): { version: string; isFallback: boolean; note?: string } {
  const { versions, currentVersion } = getBedrockSupportedVersions();
  const cleanHost = (host || '').toLowerCase();

  const trimmed = userVersion?.trim();
  const isAuto = !trimmed || trimmed.toLowerCase() === 'auto' || trimmed.toLowerCase() === 'default';

  if (!isAuto && trimmed) {
    let candidate = trimmed;
    if (candidate.startsWith('26.')) {
      candidate = `1.${candidate}`;
    }
    if (versions[candidate]) {
      return { version: candidate, isFallback: false };
    }
    if (versions[trimmed]) {
      return { version: trimmed, isFallback: false };
    }
    return {
      version: currentVersion,
      isFallback: true,
      note: `Version "${trimmed}" is not directly supported; using verified working version ${currentVersion}.`,
    };
  }

  // Prefer the Bedrock UDP advertisement over cached or host-based guesses.
  if (pingProtocol != null) {
    const protoNum = Number(pingProtocol);
    if (Number.isFinite(protoNum)) {
      const match = Object.keys(versions).find((v) => versions[v] === protoNum);
      if (match) {
        return { version: match, isFallback: false, note: `Auto-negotiated protocol ${protoNum} -> ${match}` };
      }
    }
  }

  if (pingVersion) {
    let candidate = pingVersion.trim();
    if (candidate.startsWith('26.')) {
      candidate = `1.${candidate}`;
    }
    if (versions[candidate]) {
      return { version: candidate, isFallback: false, note: `Auto-negotiated version string ${candidate}` };
    }
    if (versions[pingVersion]) {
      return { version: pingVersion, isFallback: false, note: `Auto-negotiated version string ${pingVersion}` };
    }
  }

  // Reuse a version only when the server did not advertise one.
  const cachedVer = SERVER_VERSION_CACHE.get(cleanHost);
  if (cachedVer && versions[cachedVer]) {
    return { version: cachedVer, isFallback: false, note: `Using verified Bedrock protocol for ${cleanHost} (${cachedVer})` };
  }

  // Known server fallback for cases where the Bedrock UDP ping is unavailable.
  if (cleanHost.includes('donutsmp')) {
    SERVER_VERSION_CACHE.set(cleanHost, '1.26.51');
    return { version: '1.26.51', isFallback: false, note: 'Auto-detected DonutSMP Bedrock protocol (1.26.51)' };
  }

  return {
    version: currentVersion,
    isFallback: false,
    note: `Using stable Minecraft Bedrock protocol (${currentVersion})`,
  };
}

export function stripMinecraftFormatting(text: string): string {
  if (!text) return '';
  return text
    // Strip hex color codes: §x§r§r§g§g§b§b or &x&r&r&g&g&b&b
    .replace(/(?:§|&)x(?:(?:§|&)[0-9a-fA-F]){6}/gi, '')
    // Strip standard and extended Bedrock color/format codes
    .replace(/(?:§|&)[0-9a-zA-Z]/gi, '')
    // Strip any stray section signs
    .replace(/§+/g, '')
    .trim();
}

const BEDROCK_DISCONNECT_REASONS: Record<number, string> = {
  0: 'Unknown disconnect',
  1: 'Outdated client / version mismatch',
  2: 'Outdated server',
  3: 'Server full',
  4: 'Kicked by admin or moderator',
  5: 'Kicked by anti-cheat / movement packet check',
  6: 'Kicked: client timed out / no response',
  7: 'Server shutting down / restart',
  8: 'Invalid authentication or Xbox token expired',
  9: 'Kicked: world corruption or chunk loading error',
  10: 'Kicked: duplicate login (account logged in from elsewhere)',
  11: 'Kicked: subserver transfer initiated',
  12: 'Kicked: idle / AFK timeout exceeded',
  13: 'Kicked: server whitelist active',
};

const RAKNET_DISCONNECT_REASONS: Record<string, string> = {
  '16': 'ID_CONNECTION_REQUEST_ACCEPTED',
  '17': 'Connection attempt failed (server unreachable or offline)',
  '18': 'Already connected to server',
  '19': 'New incoming connection',
  '20': 'Server is full (no free incoming connections)',
  '21': 'Server closed connection (disconnection notification)',
  '22': 'Connection lost (RakNet reliable packet timeout: packets/ACKs dropped by network)',
  '23': 'Banned from server',
  '24': 'Invalid server password',
  '25': 'Incompatible RakNet protocol version',
  '26': 'Connection rate-limited (IP recently connected)',
  'timeout': 'Connection timed out (no packets received from server)',
};

export function formatDisconnectReason(raw: any): string {
  if (raw === undefined || raw === null) return '';
  const str = typeof raw === 'object' ? (raw?.message || JSON.stringify(raw)) : String(raw).trim();
  if (RAKNET_DISCONNECT_REASONS[str]) {
    return RAKNET_DISCONNECT_REASONS[str];
  }
  const num = Number(str);
  if (Number.isFinite(num) && BEDROCK_DISCONNECT_REASONS[num]) {
    return BEDROCK_DISCONNECT_REASONS[num];
  }
  return stripMinecraftFormatting(str);
}

export class PebbleBotInstance {
  public config: BotConfig;
  public state: BotLifecycleState = 'DISCONNECTED';
  public chatHistory: any[] = [];
  private broadcastFn: (msg: DaemonMessage) => void;
  private client: any = null;
  private connectStartTime: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private tickSyncInterval: NodeJS.Timeout | null = null;
  private playerAuthInterval: NodeJS.Timeout | null = null;
  private antiAfkInterval: NodeJS.Timeout | null = null;
  private telemetryInterval: NodeJS.Timeout | null = null;
  private isExplicitlyStopped: boolean = false;
  private clientTick: bigint = 0n;
  private autoVersionOverride: string | null = null;
  private reconnectAttemptCount: number = 0;
  private currentVersionCandidate: string | null = null;
  private lastAttemptedVersion: string | null = null;
  private connectionStable: boolean = false;
  private stableConnectionTimer: NodeJS.Timeout | null = null;
  private lastAuthInputErrorAt: number = 0;
  private originalHost: string;
  private originalPort: number;
  private isTransferring: boolean = false;
  private hasSpawnedPosition: boolean = false;
  private lastServerNotice: string = '';
  private lastDisconnectReason: string = '';

  // Telemetry cache
  private position = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
  private health: number = 20;
  private maxHealth: number = 20;
  private food: number = 20;
  private saturation: number = 5;

  constructor(config: BotConfig, broadcastFn: (msg: DaemonMessage) => void) {
    this.config = config;
    this.originalHost = config.host;
    this.originalPort = config.port || 19132;
    this.broadcastFn = broadcastFn;
  }

  public getUptime(): number {
    if (!this.connectStartTime || (this.state !== 'SPAWNED' && this.state !== 'LOGGED_IN')) return 0;
    return Math.floor((Date.now() - this.connectStartTime) / 1000);
  }

  public async start() {
    this.isExplicitlyStopped = false;
    this.connectionStable = false;
    this.lastServerNotice = '';
    this.lastDisconnectReason = '';
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.updateState('CONNECTING');
    this.logActivity('connect', `Connecting to Bedrock server ${this.config.host}:${this.config.port}...`);

    try {
      const profilesFolder = getAndSyncTokenFolder();
      const isOffline = this.config.authType === 'offline';
      const cleanHost = (this.config.host || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
      const cleanPort = Number(this.config.port) || 19132;

      let hasNativeRaknet = false;
      try {
        (eval('require'))('raknet-native');
        hasNativeRaknet = true;
      } catch (_) {}

      const rakBackend = hasNativeRaknet ? 'raknet-native' : 'jsp-raknet';

      let pingRes: { motd?: string; protocol?: string; version?: string } | null = null;
      const rawUserVersion = this.config.version?.trim();
      const isAutoVersion = !rawUserVersion || rawUserVersion.toLowerCase() === 'auto' || rawUserVersion.toLowerCase() === 'default';

      if (isAutoVersion) {
        this.logActivity('status', `🔍 Pinging Bedrock UDP port ${cleanHost}:${cleanPort}...`);
        try {
          pingRes = await pingBedrockJsp(cleanHost, cleanPort, 2500);
          if (pingRes) {
            console.log(chalk.cyan(`[PebbleAFK] Bedrock ping response from ${cleanHost}:${cleanPort}: protocol=${pingRes.protocol}, version=${pingRes.version}`));
            this.logActivity('status', `✓ Bedrock server online: Protocol ${pingRes.protocol || 'auto'}, Version ${pingRes.version || 'auto'}`);
          } else {
            this.logActivity('warning', `⚠️ No UDP ping response from ${cleanHost}:${cleanPort}. Server may be offline or filtering Unconnected Ping.`);
          }
        } catch (_) {
          this.logActivity('warning', `⚠️ UDP ping probe failed for ${cleanHost}:${cleanPort}. Proceeding with default protocol.`);
        }
      }

      const resolved = resolveBedrockTargetVersion(rawUserVersion, pingRes?.protocol, pingRes?.version, cleanHost);
      const targetVersion = this.autoVersionOverride || this.currentVersionCandidate || resolved.version;
      this.lastAttemptedVersion = targetVersion;

      this.logActivity('connect', `🚀 Initiating RakNet handshake with ${cleanHost}:${cleanPort} (Minecraft Bedrock ${targetVersion}, Transport: ${rakBackend})...`);

      const clientOptions: any = {
        host: cleanHost,
        port: cleanPort,
        username: this.config.username,
        offline: isOffline,
        profilesFolder: isOffline ? undefined : profilesFolder,
        version: targetVersion,
        transport: 'raknet',
        raknetBackend: rakBackend,
        useRaknetWorkers: false,
        skipPing: rakBackend === 'jsp-raknet' || !pingRes,
        connectTimeout: 45000,
        onMsaCode: (data: any) => {
          console.log(chalk.yellow(`[MS Auth] Code for ${this.config.username}: ${data.user_code}`));
          const directUri = data.user_code
            ? `https://www.microsoft.com/link?otc=${encodeURIComponent(data.user_code)}&prompt=login`
            : (data.verification_uri || 'https://www.microsoft.com/link');

          this.broadcastFn({
            type: 'MS_AUTH_CODE',
            payload: {
              botId: this.config.id,
              userCode: data.user_code,
              url: directUri,
              message: data.message,
            },
          });
        },
      };

      console.log(chalk.cyan(`[PebbleAFK] Spawning client for ${this.config.username} -> ${cleanHost}:${cleanPort} (version: ${targetVersion}, backend: ${rakBackend})`));
      const client = bedrock.createClient(clientOptions);
      this.client = client;

      this.hookConnectionDiagnostics(client);
      client.once('connect_allowed', () => this.hookConnectionDiagnostics(client));

      // Session event: Microsoft/Xbox authentication finished
      client.once('session', () => {
        this.hookConnectionDiagnostics(client);
        console.log(chalk.green(`[PebbleAFK] Bedrock session established for ${this.config.username}`));
        this.logActivity('connect', 'Microsoft/Xbox authentication verified; joining game server...');
      });

      // Join event: Server accepted player connection
      client.on('join', () => {
        this.hookConnectionDiagnostics(client);
        this.connectStartTime = Date.now();
        this.updateState('LOGGED_IN');
        this.logActivity('connect', `Successfully joined Bedrock server ${this.config.host}:${this.config.port}`);
        this.handleSystemMessage(`Connected to ${this.config.host}:${this.config.port}`);
        this.pushChat({
          botId: this.config.id,
          serverId: this.config.serverId,
          accountUsername: this.config.username,
          id: randomUUID(),
          timestamp: Date.now(),
          raw: 'New session started',
          formattedText: 'New session started',
          sender: 'System',
          type: 'session_divider',
        });
      });

      // Spawn event: Player loaded into the world
      client.on('spawn', () => {
        this.hookConnectionDiagnostics(client);
        if (!this.connectStartTime) this.connectStartTime = Date.now();
        this.updateState('SPAWNED');
        this.logActivity('spawn', '🌍 Spawned into Bedrock world!');
        this.handleSystemMessage(`🌍 Spawned into world as @${this.config.username}`);

        // Mark this protocol as proven only after a stable session. Short-lived
        // spawns should still allow auto-reconnect to try another Bedrock version.
        this.connectionStable = false;
        if (this.stableConnectionTimer) clearTimeout(this.stableConnectionTimer);
        this.stableConnectionTimer = setTimeout(() => {
          if (this.client !== client || this.state !== 'SPAWNED') return;
          this.connectionStable = true;
          this.reconnectAttemptCount = 0;
          this.currentVersionCandidate = null;
          SERVER_VERSION_CACHE.set(cleanHost, targetVersion);
        }, 60_000);

        // Start Bedrock authoritative input keepalive loops
        this.clientTick = 0n;
        this.startTickSyncLoop(client);
        this.startPlayerAuthInputLoop(client);

        this.setupTelemetry();
        this.setupAntiAfk();
      });

      // Start Game packet: captures spawn coordinates & world info, and confirms chunk radius
      client.on('start_game', (packet: any) => {
        if (packet?.player_position) {
          this.position = {
            x: Math.round(packet.player_position.x * 100) / 100,
            y: Math.round(packet.player_position.y * 100) / 100,
            z: Math.round(packet.player_position.z * 100) / 100,
            yaw: Math.round((packet.rotation?.z ?? 0) * 10) / 10,
            pitch: Math.round((packet.rotation?.x ?? 0) * 10) / 10,
          };
          this.hasSpawnedPosition = true;
          this.emitTelemetry();
        }
        try {
          client.write('request_chunk_radius', { chunk_radius: 8 });
        } catch (_) {}
      });

      // Confirm chunk loading so server knows client finished downloading terrain
      client.on('network_chunk_publisher_update', (packet: any) => {
        try {
          client.write('request_chunk_radius', { chunk_radius: 8 });
        } catch (_) {}
      });

      client.on('chunk_radius_update', (packet: any) => {
        try {
          client.write('request_chunk_radius', { chunk_radius: packet.chunk_radius || 8 });
        } catch (_) {}
      });

      // Handle subserver dimension changes (e.g. transfer to /lifesteal)
      client.on('change_dimension', (packet: any) => {
        console.log(chalk.cyan(`[PebbleAFK] Dimension change acknowledged for @${this.config.username}`));
        this.logActivity('status', `🔄 Dimension change acknowledged (moving to subserver)`);
        try {
          client.write('player_action', {
            runtime_entity_id: client.entityId || 1n,
            action: 'dimension_change_ack',
            position: { x: 0, y: 0, z: 0 },
            result_position: { x: 0, y: 0, z: 0 },
            face: 0,
          });
          client.write('request_chunk_radius', { chunk_radius: 8 });
        } catch (_) {}
      });

      client.on('respawn', (packet: any) => {
        if (packet?.position) {
          this.position.x = Math.round(packet.position.x * 100) / 100;
          this.position.y = Math.round(packet.position.y * 100) / 100;
          this.position.z = Math.round(packet.position.z * 100) / 100;
          this.hasSpawnedPosition = true;
        }
        try {
          client.write('player_action', {
            runtime_entity_id: client.entityId || 1n,
            action: 'respawn',
            position: { x: 0, y: 0, z: 0 },
            result_position: { x: 0, y: 0, z: 0 },
            face: 0,
          });
          client.write('request_chunk_radius', { chunk_radius: 8 });
        } catch (_) {}
      });

      // Move Player packet: updates bot position & acknowledges server teleports
      client.on('move_player', (packet: any) => {
        if (packet?.position) {
          this.position.x = Math.round(packet.position.x * 100) / 100;
          this.position.y = Math.round(packet.position.y * 100) / 100;
          this.position.z = Math.round(packet.position.z * 100) / 100;
          if (packet.yaw !== undefined) this.position.yaw = Math.round(packet.yaw * 10) / 10;
          if (packet.pitch !== undefined) this.position.pitch = Math.round(packet.pitch * 10) / 10;
          this.hasSpawnedPosition = true;

          // Acknowledge server-initiated teleports / subserver transitions immediately
          if (packet.mode === 'teleport' || packet.mode === 'reset') {
            try {
              client.write('player_auth_input', {
                pitch: this.position.pitch || 0,
                yaw: this.position.yaw || 0,
                position: { ...this.position },
                move_vector: { x: 0, z: 0 },
                head_yaw: this.position.yaw || 0,
                input_data: {},
                input_mode: 'touch',
                play_mode: 'normal',
                interaction_model: 'classic',
                interact_rotation: { x: 0, z: 0 },
                tick: this.clientTick,
                delta: { x: 0, y: 0, z: 0 },
                analogue_move_vector: { x: 0, z: 0 },
                camera_orientation: { x: 0, y: 0, z: 0 },
                raw_move_vector: { x: 0, z: 0 },
              });
            } catch (_) {}
          }
        }
      });

      // Text packet: in-game chat and system announcements
      client.on('text', (packet: any) => {
        this.handleBedrockText(packet);
      });

      // Modal Form Request: Bedrock server menus / forms
      client.on('modal_form_request', (packet: any) => {
        this.handleBedrockForm(packet);
      });

      // Bedrock Titles, Queue status & Action Bar notifications
      client.on('set_title', (packet: any) => {
        const titleText = (packet.text || packet.message || '').trim();
        if (titleText) {
          const clean = stripMinecraftFormatting(titleText);
          this.lastServerNotice = clean;
          this.handleSystemMessage(`📢 ${clean}`);
        }
      });

      // Subserver Transfer request (e.g. /lifesteal gateway)
      client.on('transfer', (packet: any) => {
        const targetHost = packet.server_address || this.config.host;
        const targetPort = packet.port || 19132;
        console.log(chalk.cyan(`[PebbleAFK] 🔄 Subserver transfer requested for @${this.config.username} -> ${targetHost}:${targetPort}`));
        this.logActivity('status', `🔄 Transferring to subserver (${targetHost}:${targetPort})...`);
        this.handleSystemMessage(`🔄 Server transferring to subserver ${targetHost}:${targetPort}...`);

        this.isTransferring = true;
        this.cleanup();
        try {
          client.close();
        } catch (_) {}

        this.config.host = targetHost;
        this.config.port = targetPort;
        setTimeout(() => {
          this.isTransferring = false;
          this.start();
        }, 600);
      });

      const handleDisconnect = (rawReason: string, isError = false) => {
        if (this.isTransferring) return;
        if (this.state === 'DISCONNECTED') return;

        let reason = rawReason || '';
        if (this.lastDisconnectReason && this.lastDisconnectReason !== 'Server closed connection / session ended') {
          reason = this.lastDisconnectReason;
        } else if (this.lastServerNotice) {
          reason = reason ? `${reason} (Last server notice: "${this.lastServerNotice}")` : this.lastServerNotice;
        }
        if (!reason) {
          reason = 'Server closed connection / session ended';
        }
        reason = formatDisconnectReason(reason);
        this.lastDisconnectReason = reason;

        // Auto-detect version requirement if server reports client is outdated
        const versionMatch = reason.match(/(?:supports|requires|versions?:?)[\s:]*([0-9.]+)/i);
        if (versionMatch && versionMatch[1]) {
          let reqVer = versionMatch[1];
          if (reqVer.startsWith('26.')) reqVer = `1.${reqVer}`;
          this.autoVersionOverride = reqVer;
          SERVER_VERSION_CACHE.set(cleanHost, reqVer);
          console.log(chalk.yellow(`[PebbleAFK] Server requested Bedrock version ${reqVer}. Saved to verified cache.`));
          this.logActivity('status', `🔄 Server requested version ${reqVer}. Auto-adjusting target version...`);
        }

        console.log(chalk.red(`[PebbleAFK] ❌ Bot @${this.config.username} disconnected from ${cleanHost}:${cleanPort}: ${reason}`));
        this.logActivity('disconnect', `Disconnected from ${cleanHost}: ${reason}`);
        this.cleanup();
        this.updateState(isError ? 'ERROR' : 'DISCONNECTED', reason);
        this.handleAutoReconnect();
      };

      // 1. Kick event from bedrock-protocol
      client.on('kick', (packet: any) => {
        if (this.isTransferring) return;
        let reason = '';
        if (packet?.message) {
          reason = formatDisconnectReason(packet.message);
        } else if (packet?.filtered_message) {
          reason = formatDisconnectReason(packet.filtered_message);
        } else if (packet?.reason != null) {
          reason = formatDisconnectReason(packet.reason);
        }
        handleDisconnect(reason || 'Kicked by server', false);
      });

      // 2. Disconnect packet from server
      client.on('disconnect', (packet: any) => {
        if (this.isTransferring) return;
        let reason = '';
        if (packet?.message) {
          reason = formatDisconnectReason(packet.message);
        } else if (packet?.filtered_message) {
          reason = formatDisconnectReason(packet.filtered_message);
        } else if (packet?.reason != null) {
          reason = formatDisconnectReason(packet.reason);
        }
        handleDisconnect(reason || 'Disconnected from server', false);
      });

      // 3. Error event
      client.on('error', (err: any) => {
        if (this.isTransferring) return;
        const errMsg = err?.message || String(err);
        let descriptiveReason = formatDisconnectReason(errMsg);
        if (errMsg.includes('Connect timed out') || errMsg.includes('timed out')) {
          descriptiveReason = `Connect timed out: ${cleanHost}:${cleanPort} sent no reply to RakNet UDP packets. (Server Bedrock gateway offline or filtering UDP traffic).`;
        }
        handleDisconnect(descriptiveReason, true);
      });

      // 4. Close event
      client.on('close', () => {
        if (this.isTransferring) return;
        if (this.state !== 'DISCONNECTED' && this.state !== 'ERROR') {
          handleDisconnect(this.lastDisconnectReason || 'Server closed connection / session ended');
        }
      });

    } catch (err: any) {
      console.error(chalk.red(`[PebbleAFK] Failed to create Bedrock bot instance:`), err);
      this.updateState('ERROR', err.message || 'Initialization error');
      this.handleAutoReconnect();
    }
  }

  public stop() {
    this.isExplicitlyStopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cleanup();
    if (this.client) {
      try { this.client.close(); } catch (_) {}
      this.client = null;
    }
    this.updateState('DISCONNECTED', 'Stopped by user');
    this.logActivity('disconnect', 'Bot stopped.');
  }

  public sendChat(message: string) {
    if (!this.client || (this.state !== 'LOGGED_IN' && this.state !== 'SPAWNED')) {
      console.log(chalk.yellow(`[PebbleAFK] Cannot send chat: bot is not connected`));
      return;
    }

    try {
      this.hookConnectionDiagnostics(this.client);
      if (message.startsWith('/')) {
        // Send as Bedrock command
        const uuid = randomUUID();
        try {
          this.client.write('command_request', {
            command: message,
            origin: {
              type: 'player',
              uuid,
              request_id: uuid,
              player_entity_id: this.client.entityId || 0n,
            },
            internal: false,
            version: '',
          });
        } catch (err: any) {
          console.warn(chalk.yellow(`[PebbleAFK] command_request notice: ${err?.message}`));
        }

        // Also send as chat packet for Geyser / Bungee / Velocity proxies that parse chat slash commands
        try {
          this.client.write('text', {
            type: 'chat',
            needs_translation: false,
            source_name: this.client.username || this.config.username,
            message,
            xuid: '',
            platform_chat_id: '',
          });
        } catch (_) {}
      } else {
        // Send as regular chat
        this.client.write('text', {
          type: 'chat',
          needs_translation: false,
          source_name: this.client.username || this.config.username,
          message,
          xuid: '',
          platform_chat_id: '',
        });
      }
      this.pushChat({
        botId: this.config.id,
        serverId: this.config.serverId,
        accountUsername: this.config.username,
        id: randomUUID(),
        timestamp: Date.now(),
        raw: message,
        formattedText: message,
        sender: this.config.username,
        type: 'chat',
      });
      this.logActivity('chat', `Sent: ${message}`);
    } catch (err: any) {
      console.log(chalk.red(`[PebbleAFK] Failed to send chat:`), err);
    }
  }

  public submitForm(formId: number, responseData: any) {
    if (!this.client) return;
    try {
      this.client.write('modal_form_response', {
        form_id: formId,
        has_response_data: true,
        data: JSON.stringify(responseData),
      });
      this.logActivity('control', `Submitted form #${formId}`);
    } catch (err: any) {
      console.log(chalk.red(`[PebbleAFK] Failed to submit form:`), err);
    }
  }

  public closeForm(formId: number) {
    if (!this.client) return;
    try {
      this.client.write('modal_form_response', {
        form_id: formId,
        has_response_data: false,
      });
    } catch (_) {}
  }

  private startTickSyncLoop(client: any) {
    if (this.tickSyncInterval) clearInterval(this.tickSyncInterval);
    // Modern Bedrock protocols (1.20.80+) do not use client tick_sync; bedrock-protocol manages this internally when needed.
    if (typeof client.versionLessThanOrEqualTo === 'function' && !client.versionLessThanOrEqualTo('1.20.80')) {
      return;
    }
    this.clientTick = 0n;
    this.tickSyncInterval = setInterval(() => {
      if (this.client !== client || (this.state !== 'SPAWNED' && this.state !== 'LOGGED_IN')) return;
      try {
        client.write('tick_sync', { request_time: this.clientTick, response_time: 0n });
      } catch (_) {}
    }, 1000);

    client.on('tick_sync', (packet: any) => {
      if (packet?.response_time) {
        this.clientTick = BigInt(packet.response_time);
      }
    });
  }

  private startPlayerAuthInputLoop(client: any) {
    if (this.playerAuthInterval) clearInterval(this.playerAuthInterval);
    this.playerAuthInterval = setInterval(() => {
      if (this.client !== client || (this.state !== 'SPAWNED' && this.state !== 'LOGGED_IN') || !this.hasSpawnedPosition) return;
      try {
        // Bedrock clients send player_auth_input once per game tick (20 packets/sec).
        this.clientTick += 1n;

        // Continuous player authoritative inputs prevent Bedrock server / Geyser timeout watchdogs
        client.write('player_auth_input', {
          pitch: this.position.pitch || 0,
          yaw: this.position.yaw || 0,
          position: { ...this.position },
          move_vector: { x: 0, z: 0 },
          head_yaw: this.position.yaw || 0,
          input_data: {},
          input_mode: 'touch',
          play_mode: 'normal',
          interaction_model: 'classic',
          interact_rotation: { x: 0, z: 0 },
          tick: this.clientTick,
          delta: { x: 0, y: 0, z: 0 },
          analogue_move_vector: { x: 0, z: 0 },
          camera_orientation: { x: 0, y: 0, z: 0 },
          raw_move_vector: { x: 0, z: 0 },
        });
      } catch (err: any) {
        const now = Date.now();
        if (now - this.lastAuthInputErrorAt >= 10_000) {
          this.lastAuthInputErrorAt = now;
          const reason = err?.message || String(err);
          this.logActivity('status', `⚠️ Bedrock input heartbeat failed: ${reason}`);
        }
      }
    }, 50);
  }

  private setupAntiAfk() {
    if (this.antiAfkInterval) clearInterval(this.antiAfkInterval);
    if (!this.config.settings?.antiAfk) return;

    const intervalSec = Math.max(5, this.config.settings.antiAfkInterval || 10);
    let step = 0;

    this.antiAfkInterval = setInterval(() => {
      if (!this.client || this.state !== 'SPAWNED' || !this.hasSpawnedPosition) return;
      try {
        step++;
        // Subtle yaw perturbation
        const deltaYaw = (step % 2 === 0 ? 3 : -3);
        this.position.yaw = (this.position.yaw + deltaYaw) % 360;

        // Bedrock animate swing (arm swing is standard anti-AFK recognized by servers)
        this.client.write('animate', {
          action_id: 1, // Swing arm
          runtime_entity_id: this.client.entityId || 1n,
        });

        // The regular per-tick input loop sends this updated yaw on its next tick.
      } catch (_) {}
    }, intervalSec * 1000);
  }

  private setupTelemetry() {
    if (this.telemetryInterval) clearInterval(this.telemetryInterval);
    this.telemetryInterval = setInterval(() => {
      if (this.state === 'SPAWNED') {
        this.emitTelemetry();
      }
    }, 2000);
  }

  private emitTelemetry() {
    const uptime = this.connectStartTime ? Math.floor((Date.now() - this.connectStartTime) / 1000) : 0;
    const payload: TelemetryPayload = {
      botId: this.config.id,
      serverId: this.config.serverId,
      accountUsername: this.config.username,
      connectedAt: this.connectStartTime,
      version: this.config.version || 'Bedrock',
      health: this.health,
      maxHealth: this.maxHealth,
      food: this.food,
      saturation: this.saturation,
      position: { ...this.position },
      dimension: 'overworld',
      gamemode: 'survival',
      ping: 25,
      uptime,
      yaw: this.position.yaw,
      pitch: this.position.pitch,
    };

    this.broadcastFn({
      type: 'TELEMETRY',
      payload,
    });
  }

  public pushChat(chatMsg: any) {
    this.chatHistory.push(chatMsg);
    if (this.chatHistory.length > 250) {
      this.chatHistory.shift();
    }

    // Stream live chat to Termux terminal in real time
    const cleanContent = stripMinecraftFormatting(chatMsg.formattedText || chatMsg.raw || '');
    console.log(chalk.magenta(`[Chat • @${this.config.username}] <${chatMsg.sender}> ${cleanContent}`));

    this.broadcastFn({
      type: 'CHAT_MESSAGE',
      payload: chatMsg,
    });
  }

  public handleSystemMessage(text: string) {
    const clean = stripMinecraftFormatting(text);
    if (clean.toLowerCase().includes('server') || clean.toLowerCase().includes('kick') || clean.toLowerCase().includes('afk')) {
      this.lastServerNotice = clean;
    }

    this.pushChat({
      botId: this.config.id,
      serverId: this.config.serverId,
      accountUsername: this.config.username,
      id: randomUUID(),
      timestamp: Date.now(),
      raw: text,
      formattedText: text,
      sender: 'System',
      type: 'system',
    });
  }

  private handleBedrockText(packet: any) {
    if (!packet) return;

    let rawMsg = packet.message || '';
    let sender = packet.source_name || '';
    let isSystem = false;

    // If message is empty but parameters array has values, join them
    if (!rawMsg && Array.isArray(packet.parameters) && packet.parameters.length > 0) {
      rawMsg = packet.parameters.join(' ');
    }

    // 1. Handle JSON / rawtext
    if (typeof rawMsg === 'string' && (rawMsg.startsWith('{') || rawMsg.startsWith('['))) {
      try {
        const parsed = JSON.parse(rawMsg);
        if (parsed.rawtext && Array.isArray(parsed.rawtext)) {
          rawMsg = parsed.rawtext.map((item: any) => item.text || '').join('');
        } else if (parsed.text) {
          rawMsg = parsed.text + (parsed.extra ? parsed.extra.map((e: any) => e.text || '').join('') : '');
        }
      } catch (_) {}
    }

    // 2. Handle translation packet (used by Geyser / Bedrock for chat and announcements)
    if (packet.type === 'translation' || packet.needs_translation) {
      isSystem = true;
      const params: string[] = Array.isArray(packet.parameters) ? packet.parameters : [];
      const key = packet.message || '';

      if (key.includes('chat.type.text') || key === '%s') {
        if (params.length >= 2) {
          sender = params[0].replace(/^<|>$/g, '').trim();
          rawMsg = params.slice(1).join(' ');
          isSystem = false;
        } else if (params.length === 1) {
          rawMsg = params[0];
        }
      } else if (key.includes('multiplayer.player.joined')) {
        rawMsg = `${params[0] || 'A player'} joined the game`;
        sender = 'Server';
      } else if (key.includes('multiplayer.player.left')) {
        rawMsg = `${params[0] || 'A player'} left the game`;
        sender = 'Server';
      } else if (params.length > 0) {
        rawMsg = params.join(' ');
      }
    } else if (packet.type === 'system' || packet.type === 'announcement' || packet.type === 'popup' || packet.type === 'tip') {
      isSystem = true;
      if (!sender) sender = 'System';
    } else if (packet.type === 'chat' || packet.type === 'whisper') {
      if (!sender) sender = packet.source_name || '';
    }

    // Clean section signs (§) and formatting codes
    let cleanSender = stripMinecraftFormatting(sender);
    let cleanText = stripMinecraftFormatting(rawMsg);

    if (!cleanText) return;

    // Pattern recognition: extract player sender if embedded in message
    // Handles formats like:
    // "<Player> message"
    // "MEMBER Player ▶ message"
    // "MEMBER _CyanCanvas78406 ▶ CyanCanvas78406"
    // "[MEMBER] Player: message"
    // "Player ▶ message"
    // "Player » message"
    // "Player: message"
    if (!cleanSender || cleanSender === 'Server' || cleanSender === 'System') {
      const matchAngle = cleanText.match(/^<([a-zA-Z0-9_]{3,16})>\s*([\s\S]*)$/);
      const matchSeparator = cleanText.match(/^(?:\[?[a-zA-Z0-9_+\- ]+\]?\s+)?([a-zA-Z0-9_]{3,16})\s*[▶:»>]\s*([\s\S]*)$/);

      if (matchAngle) {
        cleanSender = matchAngle[1];
        cleanText = matchAngle[2];
        isSystem = false;
      } else if (matchSeparator) {
        cleanSender = matchSeparator[1];
        cleanText = matchSeparator[2];
        isSystem = false;
      }
    }

    if (!cleanSender) {
      cleanSender = isSystem ? 'System' : 'Server';
    }

    if (isSystem || cleanSender.toLowerCase().includes('server') || cleanText.toLowerCase().includes('kick') || cleanText.toLowerCase().includes('afk')) {
      this.lastServerNotice = cleanText;
    }

    this.pushChat({
      botId: this.config.id,
      serverId: this.config.serverId,
      accountUsername: this.config.username,
      id: randomUUID(),
      timestamp: Date.now(),
      raw: isSystem ? rawMsg : cleanText,
      formattedText: cleanText,
      sender: cleanSender,
      type: isSystem ? 'system' : 'chat',
    });
  }

  private handleBedrockForm(packet: any) {
    try {
      const formId = packet?.form_id;
      const formData = typeof packet?.data === 'string' ? JSON.parse(packet.data) : packet?.data;
      if (!formData) return;

      this.broadcastFn({
        type: 'BEDROCK_FORM',
        payload: {
          botId: this.config.id,
          formId,
          title: formData.title || 'Bedrock Form',
          content: formData.content || '',
          type: formData.type || 'form',
          buttons: formData.buttons,
        },
      });
      this.logActivity('control', `Received Bedrock Form: "${formData.title || 'Menu'}"`);
    } catch (err) {
      console.log(chalk.yellow('[PebbleAFK] Failed to parse Bedrock form:'), err);
    }
  }

  private handleAutoReconnect() {
    if (this.isExplicitlyStopped) return;
    if (!this.config.settings?.autoReconnect) return;

    const delay = Math.max(3000, this.config.settings.autoReconnectDelay || 5000);
    console.log(chalk.yellow(`[PebbleAFK] Scheduling auto-reconnect in ${delay / 1000}s for ${this.config.username}...`));
    this.updateState('RECONNECTING', `Reconnecting in ${delay / 1000}s`);

    this.reconnectTimer = setTimeout(() => {
      if (!this.isExplicitlyStopped) {
        const rawUserVersion = this.config.version?.trim();
        const isAuto = !rawUserVersion || rawUserVersion.toLowerCase() === 'auto' || rawUserVersion.toLowerCase() === 'default';

        if (this.connectionStable) {
          // Retry the version that was stable for at least a minute.
          this.connectionStable = false;
          this.currentVersionCandidate = null;
          this.reconnectAttemptCount = 0;
        } else if (isAuto && !this.autoVersionOverride) {
          // A short-lived spawn is not enough to trust a protocol; try the next one.
          const previousIndex = this.lastAttemptedVersion
            ? BEDROCK_CYCLE_VERSIONS.indexOf(this.lastAttemptedVersion)
            : -1;
          const nextIdx = previousIndex >= 0
            ? (previousIndex + 1) % BEDROCK_CYCLE_VERSIONS.length
            : this.reconnectAttemptCount % BEDROCK_CYCLE_VERSIONS.length;
          const candidate = BEDROCK_CYCLE_VERSIONS[nextIdx];
          this.currentVersionCandidate = candidate;
          this.logActivity('status', `🔄 Trying Bedrock protocol candidate: ${candidate}...`);
          console.log(chalk.cyan(`[PebbleAFK] Version probe candidate: ${candidate} (Attempt #${this.reconnectAttemptCount + 1})`));
          this.reconnectAttemptCount++;
        } else {
          this.currentVersionCandidate = null;
        }

        console.log(chalk.cyan(`[PebbleAFK] Executing auto-reconnect for ${this.config.username}...`));
        this.start();
      }
    }, delay);
  }

  private hookConnectionDiagnostics(client: any) {
    if (!client) return;
    try {
      const conn = client.connection;
      if (conn && !conn._disconnectReasonHooked) {
        conn._disconnectReasonHooked = true;
        const origOnClose = conn.onCloseConnection;
        conn.onCloseConnection = (reason: any) => {
          if (reason !== undefined && reason !== null) {
            const decoded = formatDisconnectReason(reason);
            if (decoded) this.lastDisconnectReason = decoded;
          }
          if (typeof origOnClose === 'function') {
            origOnClose(reason);
          }
        };
      }

      if (conn?.raknet && !conn.raknet._disconnectHooked) {
        conn.raknet._disconnectHooked = true;
        conn.raknet.on('disconnect', (ev: any) => {
          const r = ev?.reason || ev?.message || ev;
          if (r !== undefined && r !== null) {
            const decoded = formatDisconnectReason(r);
            if (decoded) this.lastDisconnectReason = decoded;
          }
        });
      }
    } catch (_) {}
  }

  private updateState(newState: BotLifecycleState, reason?: string) {
    this.state = newState;
    const uptime = this.connectStartTime ? Math.floor((Date.now() - this.connectStartTime) / 1000) : 0;
    this.broadcastFn({
      type: 'BOT_STATE',
      payload: {
        botId: this.config.id,
        serverId: this.config.serverId,
        username: this.config.username,
        accountId: this.config.accountId,
        version: this.config.version,
        state: newState,
        reason,
        connectedAt: this.connectStartTime,
        uptime,
      },
    });
  }

  private logActivity(type: any, message: string) {
    this.broadcastFn({
      type: 'ACTIVITY_LOG',
      payload: {
        id: randomUUID(),
        botId: this.config.id,
        timestamp: Date.now(),
        type,
        message,
      },
    });
  }

  private cleanup() {
    if (this.playerAuthInterval) {
      clearInterval(this.playerAuthInterval);
      this.playerAuthInterval = null;
    }
    if (this.tickSyncInterval) {
      clearInterval(this.tickSyncInterval);
      this.tickSyncInterval = null;
    }
    if (this.antiAfkInterval) {
      clearInterval(this.antiAfkInterval);
      this.antiAfkInterval = null;
    }
    if (this.telemetryInterval) {
      clearInterval(this.telemetryInterval);
      this.telemetryInterval = null;
    }
    if (this.stableConnectionTimer) {
      clearTimeout(this.stableConnectionTimer);
      this.stableConnectionTimer = null;
    }
  }
}
