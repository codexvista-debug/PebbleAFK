import chalk from 'chalk';
import { randomUUID } from 'crypto';
const bedrock = require('bedrock-protocol');
import { BotConfig, BotLifecycleState, BossBarPayload, DaemonMessage, TelemetryPayload } from '../types';
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
  ['freshsmp.fun', '1.26.51'],
  ['play.freshsmp.fun', '1.26.51'],
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
  if (cleanHost.includes('freshsmp')) {
    SERVER_VERSION_CACHE.set(cleanHost, '1.26.51');
    return { version: '1.26.51', isFallback: false, note: 'Auto-detected FreshSMP Bedrock protocol (1.26.51)' };
  }
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
  private static lastHandshakeTime: number = 0;
  public config: BotConfig;
  public state: BotLifecycleState = 'DISCONNECTED';
  public chatHistory: any[] = [];
  private broadcastFn: (msg: DaemonMessage) => void;
  private client: any = null;
  private startInProgress: boolean = false;
  private startGeneration: number = 0;
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
  private reconnectFailureCount: number = 0;
  private loginThrottleCount: number = 0;
  private currentVersionCandidate: string | null = null;
  private lastAttemptedVersion: string | null = null;
  private connectionStable: boolean = false;
  private shouldProbeVersionOnReconnect: boolean = false;
  private joinCommandTimer: NodeJS.Timeout | null = null;
  private joinCommandClient: any = null;
  private isInSubserver: boolean = false;
  private static lastSubserverCommandAt: number = 0;
  private lastAuthInputErrorAt: number = 0;
  private originalHost: string;
  private originalPort: number;
  private isTransferring: boolean = false;
  private hasSpawnedPosition: boolean = false;
  private runtimeEntityId: bigint | null = null;
  private lastServerNotice: string = '';
  private lastServerNoticeAt: number = 0;
  private lastDisconnectReason: string = '';
  private bossBars = new Map<string, { title: string; progress?: number; updatedAt: number }>();
  private currentAfkBossBar: BossBarPayload | null = null;

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
    if (this.startInProgress || (this.client && !this.isTransferring)) {
      console.log(chalk.gray(`[PebbleAFK] Ignoring duplicate connect request for ${this.config.username}; a connection attempt is already active.`));
      return;
    }

    this.isExplicitlyStopped = false;
    const startGeneration = ++this.startGeneration;
    this.startInProgress = true;
    this.clearBossBars();
    this.connectionStable = false;
    this.lastServerNotice = '';
    this.lastServerNoticeAt = 0;
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

      // A stop or a newer lifecycle request can happen while the UDP version
      // probe is pending. Never let that stale async start resurrect a bot.
      if (startGeneration !== this.startGeneration || this.isExplicitlyStopped) return;

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

      // Stagger Bedrock RakNet connection handshakes so concurrent bots never send
      // simultaneous Open Connection Request UDP packets from the same device/IP.
      const minSpacingMs = 6500;
      const now = Date.now();
      const waitMs = Math.max(0, (PebbleBotInstance.lastHandshakeTime + minSpacingMs) - now);
      if (waitMs > 0) {
        this.logActivity('connect', `⏳ Staggering RakNet connection by ${(waitMs / 1000).toFixed(1)}s to avoid server gateway rate-limiting...`);
        console.log(chalk.cyan(`[PebbleAFK] Staggering connection for ${this.config.username} by ${waitMs}ms`));
        await new Promise((r) => setTimeout(r, waitMs));
        if (startGeneration !== this.startGeneration || this.isExplicitlyStopped) return;
      }
      PebbleBotInstance.lastHandshakeTime = Date.now();

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
        if (this.client !== client) return;
        this.hookConnectionDiagnostics(client);
        if (!this.connectStartTime) this.connectStartTime = Date.now();
        this.updateState('SPAWNED');
        this.logActivity('spawn', '🌍 Spawned into Bedrock world!');
        this.handleSystemMessage(`🌍 Spawned into world as @${this.config.username}`);

        // A successful spawn proves this protocol is accepted. Do not rotate
        // versions later for ordinary queue timeouts, kicks, or network drops.
        this.connectionStable = true;
        this.reconnectAttemptCount = 0;
        this.reconnectFailureCount = 0;
        this.loginThrottleCount = 0;
        this.currentVersionCandidate = null;
        SERVER_VERSION_CACHE.set(cleanHost, targetVersion);
        this.scheduleJoinCommand(client);

        // Start Bedrock authoritative input keepalive loops
        this.clientTick = 0n;
        this.startTickSyncLoop(client);
        this.startPlayerAuthInputLoop(client);

        this.setupTelemetry();
        this.setupAntiAfk();
      });

      // Start Game packet: captures spawn coordinates & world info, and confirms chunk radius
      client.on('start_game', (packet: any) => {
        try {
          if (packet?.runtime_entity_id !== undefined) {
            this.runtimeEntityId = BigInt(packet.runtime_entity_id);
          }
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
        } catch (err: any) {
          console.error(chalk.red(`[PebbleAFK] start_game packet handling error: ${err?.message}`));
        }
      });

      // bedrock-protocol requests the initial chunk radius after resource-pack
      // negotiation. Do not echo chunk_radius_update/network_chunk_publisher_update
      // with another request_chunk_radius: servers reply to that request and the
      // echo creates a request/update loop that can overwhelm proxy subservers.
      const finiteCoordinate = (value: unknown, fallback: number) => {
        const coordinate = Number(value);
        return value !== null && value !== undefined && Number.isFinite(coordinate)
          ? coordinate
          : fallback;
      };

      // Handle subserver dimension changes (e.g. transfer to /lifesteal)
      client.on('change_dimension', (packet: any) => {
        const targetX = finiteCoordinate(packet?.position?.x, this.position.x);
        const targetY = finiteCoordinate(packet?.position?.y, this.position.y);
        const targetZ = finiteCoordinate(packet?.position?.z, this.position.z);
        const ackPosition = {
          x: Math.floor(targetX),
          y: Math.floor(targetY),
          z: Math.floor(targetZ),
        };
        this.position.x = Math.round(targetX * 100) / 100;
        this.position.z = Math.round(targetZ * 100) / 100;
        if (Number.isFinite(targetY) && targetY >= -128 && targetY <= 1000) {
          this.position.y = Math.round(targetY * 100) / 100;
        }
        this.hasSpawnedPosition = true;

        console.log(chalk.cyan(`[PebbleAFK] Dimension ${packet?.dimension ?? 'change'} acknowledged for @${this.config.username}`));
        this.logActivity('status', `🔄 Dimension change acknowledged at ${ackPosition.x}, ${ackPosition.y}, ${ackPosition.z}`);
        try {
          client.write('player_action', {
            runtime_entity_id: this.runtimeEntityId || (client as any)?.entityId || 1n,
            action: 'dimension_change_ack',
            position: ackPosition,
            result_position: ackPosition,
            face: 0,
          });
          // A dimension transition needs one radius request; the server's
          // subsequent radius updates are responses and must not be echoed.
          client.write('request_chunk_radius', { chunk_radius: 8 });
        } catch (_) {}
      });

      client.on('respawn', (packet: any) => {
        try {
          if (packet?.runtime_entity_id !== undefined) {
            this.runtimeEntityId = BigInt(packet.runtime_entity_id);
          }
          if (packet?.position) {
            this.position.x = Math.round(finiteCoordinate(packet.position.x, this.position.x) * 100) / 100;
            this.position.y = Math.round(finiteCoordinate(packet.position.y, this.position.y) * 100) / 100;
            this.position.z = Math.round(finiteCoordinate(packet.position.z, this.position.z) * 100) / 100;
            this.hasSpawnedPosition = true;
          }
          const respawnPosition = {
            x: Math.floor(this.position.x),
            y: Math.floor(this.position.y),
            z: Math.floor(this.position.z),
          };
          client.write('player_action', {
            runtime_entity_id: this.runtimeEntityId || (client as any)?.entityId || 1n,
            action: 'respawn',
            position: respawnPosition,
            result_position: respawnPosition,
            face: 0,
          });
          client.write('request_chunk_radius', { chunk_radius: 8 });
        } catch (_) {}
      });

      // Move Player packet: updates bot position & acknowledges server teleports
      client.on('move_player', (packet: any) => {
        // Crucial: Only accept move_player packets targeting this bot!
        // Ignore packets for other players/mobs in the world to prevent coordinate corruption!
        if (this.runtimeEntityId !== null && packet?.runtime_id !== undefined) {
          if (BigInt(packet.runtime_id) !== this.runtimeEntityId) {
            return;
          }
        }

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
                input_data: { handled_teleport: true },
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

      // Bedrock boss bars arrive as incremental events; keep a per-entity cache
      // so title/progress updates can be combined into one account-scoped state.
      client.on('boss_event', (packet: any) => {
        this.handleBossBarPacket(packet);
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
          this.lastServerNoticeAt = Date.now();
          this.handleSystemMessage(`📢 ${clean}`);
        }
      });

      // Subserver Transfer request (e.g. /lifesteal gateway)
      client.on('transfer', (packet: any) => {
        if (this.client !== client || this.isTransferring) return;
        const targetHost = packet.server_address || this.config.host;
        const targetPort = packet.port || 19132;
        console.log(chalk.cyan(`[PebbleAFK] 🔄 Subserver transfer requested for @${this.config.username} -> ${targetHost}:${targetPort}`));
        this.logActivity('status', `🔄 Transferring to subserver (${targetHost}:${targetPort})...`);
        this.handleSystemMessage(`🔄 Server transferring to subserver ${targetHost}:${targetPort}...`);

        this.isTransferring = true;
        this.cleanup();
        this.client = null;
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

      let disconnectHandled = false;
      const handleDisconnect = (rawReason: string, isError = false) => {
        if (this.isTransferring || disconnectHandled || this.client !== client || this.isExplicitlyStopped) return;
        // bedrock-protocol can emit kick/disconnect/error/close for one server
        // rejection. Handle the first event only so it schedules one reconnect.
        disconnectHandled = true;

        const recentServerNotice = this.lastServerNotice && Date.now() - this.lastServerNoticeAt <= 30_000
          ? this.lastServerNotice
          : '';
        let reason = rawReason || '';
        if (this.lastDisconnectReason && this.lastDisconnectReason !== 'Server closed connection / session ended') {
          reason = this.lastDisconnectReason;
          if (recentServerNotice) reason = `${reason} (Last server notice: "${recentServerNotice}")`;
        } else if (recentServerNotice) {
          reason = reason ? `${reason} (Last server notice: "${recentServerNotice}")` : recentServerNotice;
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

        this.shouldProbeVersionOnReconnect = Boolean(versionMatch || /(?:outdated|unsupported|incompatible)\s+(?:bedrock\s+)?(?:client|server|protocol|version)|\bprotocol\s+version\b.*\b(?:mismatch|unsupported|invalid)\b|\bversion\s+mismatch\b/i.test(reason));

        console.log(chalk.red(`[PebbleAFK] ❌ Bot @${this.config.username} disconnected from ${cleanHost}:${cleanPort}: ${reason}`));
        this.logActivity('disconnect', `Disconnected from ${cleanHost}: ${reason}`);
        this.cleanup();
        if (this.client === client) this.client = null;
        try { client.close(); } catch (_) {}
        this.updateState(isError ? 'ERROR' : 'DISCONNECTED', reason);
        this.handleAutoReconnect(reason);
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
      if (startGeneration !== this.startGeneration || this.isExplicitlyStopped) return;
      console.error(chalk.red(`[PebbleAFK] Failed to create Bedrock bot instance:`), err);
      const reason = err?.message || 'Initialization error';
      this.cleanup();
      if (this.client) {
        try { this.client.close(); } catch (_) {}
        this.client = null;
      }
      this.updateState('ERROR', reason);
      this.handleAutoReconnect(reason);
    } finally {
      if (startGeneration === this.startGeneration) this.startInProgress = false;
    }
  }

  public stop() {
    this.isExplicitlyStopped = true;
    this.startGeneration++;
    this.startInProgress = false;
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

  private writeChatPacket(client: any, message: string) {
    const packet = {
      category: 'authored',
      type: 'chat',
      needs_translation: false,
      source_name: client.username || this.config.username,
      message,
      xuid: '',
      platform_chat_id: '',
      has_filtered_message: false,
    };

    // Stable 1.26.40-1.26.51 uses a category-specific TextPacket type enum
    // (authored chat = 0). The current minecraft-data schema selects the
    // authored body correctly but writes the pre-change global chat value (1),
    // which makes servers parse the packet as the wrong message type.
    if (client.versionGreaterThanOrEqualTo('1.26.40') && client.versionLessThanOrEqualTo('1.26.51')) {
      const encoded = client.serializer.createPacketBuffer({ name: 'text', params: packet });
      if (encoded[0] !== 0x09 || encoded[2] !== 1) {
        throw new Error('Unexpected Bedrock TextPacket layout for stable 1.26.x');
      }
      encoded[3] = 0;
      client.sendBuffer(encoded, true);
      return;
    }

    client.write('text', packet);
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
              request_id: '',
              player_entity_id: this.runtimeEntityId || (this.client as any)?.entityId || 0n,
            },
            internal: false,
            version: this.client.versionGreaterThanOrEqualTo('1.26.0') ? 'latest' : '',
          });
        } catch (err: any) {
          console.warn(chalk.yellow(`[PebbleAFK] command_request notice: ${err?.message}`));
          // Some older proxies only inspect chat packets for commands. Use that
          // compatibility path only if the Bedrock command packet could not be serialized.
          this.writeChatPacket(this.client, message);
        }
      } else {
        // Send as regular chat
        this.writeChatPacket(this.client, message);
      }
      // Do not optimistically add a chat row here. Bedrock servers echo
      // authored chat through the text packet; rendering both creates a
      // duplicate in the dashboard even though the message is sent once.
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

  public triggerJoinCommandRetry(delayMs = 10000) {
    if (this.joinCommandTimer) {
      clearTimeout(this.joinCommandTimer);
      this.joinCommandTimer = null;
    }

    // If already in Lifesteal / AFK zone, do not trigger transfer command
    if (this.isInSubserver) return;

    const isFreshSmp = this.config.host.toLowerCase().includes('freshsmp');
    const configuredCommand = this.config.settings?.joinCommand?.trim().slice(0, 256) || (isFreshSmp ? '/lifesteal' : '');
    if (!configuredCommand) return;

    const command = configuredCommand.startsWith('/') ? configuredCommand : `/${configuredCommand}`;
    const minDelay = command.toLowerCase().includes('lifesteal') ? 10000 : 3000;
    let finalDelay = Math.max(delayMs, minDelay);

    // Stagger subserver transfer commands across bots so multiple bots never collide in FreshSMP queue
    if (command.toLowerCase().includes('lifesteal')) {
      const now = Date.now();
      const timeSinceLast = now - PebbleBotInstance.lastSubserverCommandAt;
      const minSeparation = 8000;
      if (timeSinceLast < minSeparation) {
        finalDelay += (minSeparation - timeSinceLast);
      }
      PebbleBotInstance.lastSubserverCommandAt = now + finalDelay;
    }

    console.log(chalk.cyan(`[PebbleAFK] Scheduling join/transfer command for @${this.config.username} (${command}) in ${Math.round(finalDelay / 1000)}s...`));
    this.logActivity('status', `Join/transfer command (${command}) scheduled in ${Math.round(finalDelay / 1000)}s.`);

    this.joinCommandTimer = setTimeout(() => {
      this.joinCommandTimer = null;
      if (this.isInSubserver) return;
      if (this.state === 'SPAWNED' || this.state === 'LOGGED_IN') {
        console.log(chalk.cyan(`[PebbleAFK] Running join/transfer command for @${this.config.username}: ${command}`));
        this.logActivity('command', `Running join command: ${command}`);
        this.sendChat(command);
      }
    }, finalDelay);
  }

  private scheduleJoinCommand(client: any) {
    if (this.joinCommandClient === client) return;
    this.joinCommandClient = client;

    const isFreshSmp = this.config.host.toLowerCase().includes('freshsmp');
    const delaySeconds = isFreshSmp ? 10 : Math.min(300, Math.max(3, Number(this.config.settings?.joinCommandDelay ?? 3) || 3));
    this.triggerJoinCommandRetry(delaySeconds * 1000);
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
          runtime_entity_id: this.runtimeEntityId || (this.client as any)?.entityId || 1n,
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

  public getBossBar(): BossBarPayload | null {
    return this.currentAfkBossBar;
  }

  private handleBossBarPacket(packet: any) {
    if (!packet) return;

    const rawType = packet.type ?? packet.event_type;
    const eventType = String(rawType ?? '').toLowerCase();
    const targetId = String(packet.target_entity_id ?? packet.boss_entity_id ?? packet.entity_id ?? 'default');
    const numericType = Number(rawType);
    const isShow = eventType === 'show_bar' || eventType === 'show' || numericType === 0;
    const isHide = eventType === 'hide_bar' || eventType === 'hide' || numericType === 2;
    const isProgress = eventType === 'set_bar_progress' || eventType === 'health_percentage' || numericType === 4;
    const isTitle = eventType === 'set_bar_title' || eventType === 'title' || numericType === 5;

    if (isHide) {
      this.bossBars.delete(targetId);
    } else if (isShow || isProgress || isTitle) {
      const previous = this.bossBars.get(targetId);
      const packetTitle = typeof packet.title === 'string' && packet.title
        ? packet.title
        : (typeof packet.filtered_title === 'string' && packet.filtered_title ? packet.filtered_title : '');
      const title = packetTitle || previous?.title || '';
      const rawProgress = Number(packet.progress ?? packet.health_percentage);
      const progress = Number.isFinite(rawProgress)
        ? Math.max(0, Math.min(1, rawProgress))
        : previous?.progress;
      this.bossBars.set(targetId, { title, progress, updatedAt: Date.now() });
    } else {
      return;
    }

    const afkBar = Array.from(this.bossBars.values())
      .filter((bar) => /\b(?:afk|reward)\b/i.test(stripMinecraftFormatting(bar.title)))
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (afkBar) {
      this.isInSubserver = true;
    }
    const next: BossBarPayload | null = afkBar
      ? {
          botId: this.config.id,
          serverId: this.config.serverId,
          accountUsername: this.config.username,
          visible: true,
          title: afkBar.title,
          progress: afkBar.progress,
        }
      : null;

    // Avoid unnecessary UI renders on unrelated boss updates, but still emit
    // progress/title changes for the AFK reward bar.
    const previous = this.currentAfkBossBar;
    if (
      previous?.visible === next?.visible &&
      previous?.title === next?.title &&
      previous?.progress === next?.progress
    ) return;

    this.currentAfkBossBar = next;
    this.broadcastFn({
      type: 'BOSS_BAR',
      payload: next || {
        botId: this.config.id,
        serverId: this.config.serverId,
        accountUsername: this.config.username,
        visible: false,
      },
    });
  }

  private clearBossBars() {
    this.bossBars.clear();
    if (!this.currentAfkBossBar) return;
    this.currentAfkBossBar = null;
    this.broadcastFn({
      type: 'BOSS_BAR',
      payload: {
        botId: this.config.id,
        serverId: this.config.serverId,
        accountUsername: this.config.username,
        visible: false,
      },
    });
  }

  public handleSystemMessage(text: string) {
    const clean = stripMinecraftFormatting(text);
    if (clean.toLowerCase().includes('server') || clean.toLowerCase().includes('kick') || clean.toLowerCase().includes('afk')) {
      this.lastServerNotice = clean;
      this.lastServerNoticeAt = Date.now();
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
    try {
      let rawMsg = packet.message || packet.text || '';
      let sender = packet.source_name || packet.sender || '';
      let isSystem = false;

      // Handle when rawMsg is an object (rawtext JSON or text object)
      if (typeof rawMsg === 'object' && rawMsg !== null) {
        try {
          if (rawMsg.rawtext && Array.isArray(rawMsg.rawtext)) {
            rawMsg = rawMsg.rawtext.map((item: any) => item.text || '').join('');
          } else if (rawMsg.text) {
            rawMsg = rawMsg.text + (rawMsg.extra ? rawMsg.extra.map((e: any) => e.text || '').join('') : '');
          } else {
            rawMsg = JSON.stringify(rawMsg);
          }
        } catch (_) {}
      }

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

    const isLifestealTimeout =
      (/^lifesteal$/i.test(cleanSender) && /\btimed\s*out\b|\btimeout\b/i.test(cleanText)) ||
      /\b<lifesteal>\s*timed\s*out\b/i.test(rawMsg) ||
      /\b<lifesteal>\s*timed\s*out\b/i.test(cleanText) ||
      (/\blifesteal\b/i.test(cleanText) && /\btimed\s*out\b|\btimeout\b/i.test(cleanText));

    if (isLifestealTimeout) {
      this.isInSubserver = false;
      console.log(chalk.yellow(`[PebbleAFK] FreshSMP queue notice for @${this.config.username}: "${cleanText}". (Subserver queue timed out; rejoining /lifesteal in 8s)...`));
      this.logActivity(
        'warning',
        `FreshSMP queue notice from ${cleanSender}: "${cleanText}". (Subserver transfer queue timed out; automatically rejoining /lifesteal in 8s).`
      );
      this.triggerJoinCommandRetry(8000);
    }

    if (/entered the AFK zone/i.test(cleanText)) {
      this.isInSubserver = true;
    }
    if (/welcome\s+_\S+\s+to\s+play\.freshsmp\.fun/i.test(cleanText)) {
      this.isInSubserver = false;
    }
    if (isSystem || cleanSender.toLowerCase().includes('server') || cleanText.toLowerCase().includes('kick') || cleanText.toLowerCase().includes('afk') || isLifestealTimeout) {
      this.lastServerNotice = isLifestealTimeout ? `${cleanSender}: ${cleanText}` : cleanText;
      this.lastServerNoticeAt = Date.now();
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
  } catch (err: any) {
    console.warn(chalk.yellow(`[PebbleAFK] handleBedrockText parse notice: ${err?.message}`));
  }
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

  private handleAutoReconnect(reason = '') {
    if (this.isExplicitlyStopped) return;
    if (!this.config.settings?.autoReconnect) return;
    if (this.reconnectTimer) return;

    const baseDelay = Math.max(3000, this.config.settings.autoReconnectDelay || 5000);
    const isLoginThrottled = /logging in too fast|try again later|wait at least|rate.?limit|no reply to RakNet UDP packets|Connect timed out|filtering UDP/i.test(reason);
    let delay: number;
    if (isLoginThrottled) {
      this.loginThrottleCount++;
      delay = Math.max(12_000, Math.min(15_000 * (2 ** Math.min(this.loginThrottleCount - 1, 3)), 120_000));
    } else {
      this.reconnectFailureCount++;
      delay = Math.max(baseDelay, Math.min(baseDelay * (2 ** Math.min(this.reconnectFailureCount - 1, 4)), 60_000));
    }
    // Add jitter so multiple concurrent bots stagger connection handshakes and avoid gateway rate-limiting
    const jitter = Math.floor(Math.random() * 4000);
    delay += jitter;
    const reconnectDescription = isLoginThrottled
      ? `FreshSMP gateway throttle/timeout; backing off for ${Math.ceil(delay / 1000)}s`
      : `Reconnecting in ${Math.ceil(delay / 1000)}s`;
    console.log(chalk.yellow(`[PebbleAFK] ${reconnectDescription} for ${this.config.username} (failure ${isLoginThrottled ? this.loginThrottleCount : this.reconnectFailureCount}).`));
    this.updateState('RECONNECTING', reconnectDescription);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.isExplicitlyStopped) {
        const shouldProbeVersion = this.shouldProbeVersionOnReconnect;
        this.shouldProbeVersionOnReconnect = false;
        const rawUserVersion = this.config.version?.trim();
        const isAuto = !rawUserVersion || rawUserVersion.toLowerCase() === 'auto' || rawUserVersion.toLowerCase() === 'default';

        if (this.connectionStable) {
          // The server already accepted this protocol by spawning the player.
          this.connectionStable = false;
          this.currentVersionCandidate = null;
          this.reconnectAttemptCount = 0;
        } else if (isAuto && !this.autoVersionOverride && shouldProbeVersion) {
          // Only explicit protocol/version failures justify trying another version.
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
          this.reconnectAttemptCount = 0;
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
        host: this.config.host,
        port: this.config.port,
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
    if (this.joinCommandTimer) {
      clearTimeout(this.joinCommandTimer);
      this.joinCommandTimer = null;
    }
    this.joinCommandClient = null;
    this.runtimeEntityId = null;
    this.hasSpawnedPosition = false;
  }
}
