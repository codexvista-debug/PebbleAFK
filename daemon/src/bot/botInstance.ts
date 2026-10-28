import chalk from 'chalk';
import dns from 'dns';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { Authflow, Titles } from 'prismarine-auth';
const bedrock = require('./bedrockProtocol');
import { BotConfig, BotLifecycleState, BossBarPayload, DaemonMessage, FreshSmpDiagnosticEvent, FreshSmpDiagnosticPhase, FreshSmpDiagnosticState, TelemetryPayload } from '../types';
import { getAndSyncTokenFolder, migrateTokenCache } from './tokenManager';
import { signetCommandRetryDelayMs, signetConnectionRecoveryDelayMs, shouldResetFreshSmpSession } from './signet';

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

async function resolveBedrockIpv4Addresses(host: string): Promise<string[]> {
  try {
    const results = await dns.promises.lookup(host, { family: 4, all: true, verbatim: true });
    return [...new Set(results.map((result) => result.address))].sort();
  } catch (_) {
    return [];
  }
}

function getBedrockSupportedVersions(): { versions: Record<string, number>; currentVersion: string } {
  try {
    const opts = (eval('require'))('bedrock-protocol/src/options');
    if (opts && opts.Versions) {
      const def = opts.defaultVersion || opts.CURRENT_VERSION || '1.26.51';
      return { versions: opts.Versions, currentVersion: def };
    }
  } catch (_) {}
  return { versions: { '1.21.50': 766, '1.26.30': 770, '1.26.51': 2193, '1.26.60': 2225 }, currentVersion: '1.26.60' };
}

// Persistent memory cache of verified working Bedrock versions per host
const SERVER_VERSION_CACHE: Map<string, string> = new Map([
  ['donutsmp.net', '1.26.51'],
  ['freshsmp.fun', '1.26.60'],
  ['play.freshsmp.fun', '1.26.60'],
]);
const SERVER_ENDPOINT_CURSORS = new Map<string, number>();
// Once a Bedrock edge has completed the full game handshake, prefer that edge
// for other accounts on the same daemon/host. Ping responses alone do not
// guarantee that a gateway will accept RakNet Open Connection requests.
const SERVER_WORKING_ENDPOINTS = new Map<string, string>();

async function waitForNativeRaknetPreparation(): Promise<void> {
  const statusFile = process.env.PEBBLEAFK_NATIVE_STATUS_FILE;
  if (!statusFile) return;

  const deadline = Date.now() + 180_000;
  let announcedWait = false;
  while (Date.now() < deadline) {
    let status = '';
    try { status = fs.readFileSync(statusFile, 'utf8').trim(); } catch (_) {}
    if (status !== 'pending') return;

    if (!announcedWait) {
      announcedWait = true;
      console.log(chalk.cyan('[PebbleAFK] Waiting for the one-time native RakNet setup before starting Bedrock handshakes.'));
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  console.warn(chalk.yellow('[PebbleAFK] Native RakNet setup is still pending after 3 minutes; attempting the available fallback transport.'));
}

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
    SERVER_VERSION_CACHE.set(cleanHost, '1.26.60');
    return { version: '1.26.60', isFallback: false, note: 'Using FreshSMP HTTPS-advertised Bedrock protocol (1.26.60)' };
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
  const cleaned = stripMinecraftFormatting(str);
  if (/<(?:!doctype|html)\b/i.test(cleaned)) {
    const status = cleaned.match(/\b(429\s+Too Many Requests|502\s+Bad Gateway|503\s+Service Unavailable|504\s+Gateway Timeout)\b/i);
    if (status) return `Remote endpoint returned HTTP ${status[1]}.`;
    const title = cleaned.match(/<title[^>]*>([^<]{1,100})<\/title>/i)?.[1]?.trim();
    return title ? `Remote endpoint returned an error page (${title}).` : 'Remote endpoint returned an HTML error page.';
  }
  return cleaned.length > 600 ? `${cleaned.slice(0, 600)}…` : cleaned;
}

function isPermanentBedrockAuthRejection(reason: string): boolean {
  return /multiplayer\/bedrock\/authentication/i.test(reason) && /\b401\b|\bUNAUTHORIZED\b/i.test(reason);
}

export class PebbleBotInstance {
  private static lastHandshakeTime: number = 0;
  private static handshakeQueue: Promise<void> = Promise.resolve();
  private static recentChatConsoleLines = new Map<string, number>();
  private static nextFreshSmpRecoveryAt: number = 0;
  public config: BotConfig;
  public state: BotLifecycleState = 'DISCONNECTED';
  public chatHistory: any[] = [];
  private broadcastFn: (msg: DaemonMessage) => void;
  private client: any = null;
  private startInProgress: boolean = false;
  private handshakeDelayResolver: (() => void) | null = null;
  private startGeneration: number = 0;
  private connectStartTime: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private tickSyncInterval: NodeJS.Timeout | null = null;
  private playerAuthInterval: NodeJS.Timeout | null = null;
  private antiAfkInterval: NodeJS.Timeout | null = null;
  private telemetryInterval: NodeJS.Timeout | null = null;
  private stableRewardInterval: NodeJS.Timeout | null = null;
  private stableBalanceInterval: NodeJS.Timeout | null = null;
  private stablePayoutTimer: NodeJS.Timeout | null = null;
  private balanceCheckRequestedAt = 0;
  private payoutSequenceActive = false;
  private stablePayUsernameAtAutomationSetup = '';
  private isExplicitlyStopped: boolean = false;
  private clientTick: bigint = 0n;
  private autoVersionOverride: string | null = null;
  private reconnectAttemptCount: number = 0;
  private reconnectFailureCount: number = 0;
  private loginThrottleCount: number = 0;
  private duplicateLoginCount: number = 0;
  private endpointAttemptCursor: number = 0;
  private hasAttemptedEndpoint: boolean = false;
  private currentVersionCandidate: string | null = null;
  private lastAttemptedVersion: string | null = null;
  private connectionStable: boolean = false;
  private shouldProbeVersionOnReconnect: boolean = false;
  private joinCommandTimer: NodeJS.Timeout | null = null;
  private joinCommandClient: any = null;
  private subserverJoinCommandTimer: NodeJS.Timeout | null = null;
  private subserverJoinCommandClient: any = null;
  private isInSubserver: boolean = false;
  private isSubserverQueueActive: boolean = false;
  private lastQueueStatusLogAt: number = 0;
  private lastQueueDiagnosticAt: number = 0;
  private lastQueueDiagnosticMessage: string = '';
  private requiredResourcePackCount: number = 0;
  private resourcePacksMustBeAccepted: boolean = false;
  private lastSubserverTimeoutAt: number = 0;
  private lastLifestealCommandAt: number = 0;
  private lastAlreadyConnectedAt: number = 0;
  private subserverQueueTimeoutCount: number = 0;
  private static nextSubserverCommandAt: number = 0;
  private lastAuthInputErrorAt: number = 0;
  private originalHost: string;
  private originalPort: number;
  private isTransferring: boolean = false;
  private hasTransferredToFreshSmpSubserver: boolean = false;
  private hasTransferredToSubserver: boolean = false;
  private hasSpawnedPosition: boolean = false;
  private runtimeEntityId: bigint | null = null;
  private lastServerNotice: string = '';
  private lastServerNoticeAt: number = 0;
  private lastDisconnectReason: string = '';
  private bossBars = new Map<string, { title: string; progress?: number; updatedAt: number }>();
  private currentAfkBossBar: BossBarPayload | null = null;
  private freshSmpPhase: FreshSmpDiagnosticPhase = 'offline';
  private freshSmpPhaseSince = Date.now();
  private freshSmpEvents: FreshSmpDiagnosticEvent[] = [];
  private lifestealAttemptStartedAt = 0;
  private lifestealSessionStartedAt = 0;
  private shortLifestealReturnCount = 0;
  private freshSmpRecoveryCount = 0;
  private signetNextAction = '';
  private signetNextActionAt = 0;
  private lifestealThresholdReported = false;
  private lifestealThresholdTimer: NodeJS.Timeout | null = null;
  private lifestealStabilityTimer: NodeJS.Timeout | null = null;

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

  public getConnectedAt(): number | undefined {
    return this.connectStartTime || undefined;
  }

  public getLastDisconnectReason(): string {
    return this.lastDisconnectReason;
  }

  public refreshStableAccountAutomations() {
    this.setupStableAccountAutomations(this.client);
  }

  private isFreshSmpProfile(): boolean {
    return `${this.originalHost} ${this.config.host}`.toLowerCase().includes('freshsmp');
  }

  public getFreshSmpDiagnostics(): FreshSmpDiagnosticState | null {
    if (!this.isFreshSmpProfile()) return null;
    return {
      botId: this.config.id,
      serverId: this.config.serverId,
      accountId: this.config.accountId,
      username: this.config.username,
      phase: this.freshSmpPhase,
      phaseSince: this.freshSmpPhaseSince,
      lifestealAttemptStartedAt: this.lifestealAttemptStartedAt || undefined,
      lifestealSessionStartedAt: this.lifestealSessionStartedAt || undefined,
      signet: {
        shortReturnStreak: this.shortLifestealReturnCount,
        queueFailureStreak: this.subserverQueueTimeoutCount,
        recoveryCycle: this.freshSmpRecoveryCount,
        nextAction: this.signetNextAction || undefined,
        nextActionAt: this.signetNextActionAt || undefined,
      },
      events: [...this.freshSmpEvents],
    };
  }

  private publishFreshSmpDiagnostics() {
    const payload = this.getFreshSmpDiagnostics();
    if (payload) this.broadcastFn({ type: 'FRESHSMP_DIAGNOSTICS', payload });
  }

  private setFreshSmpPhase(phase: FreshSmpDiagnosticPhase) {
    if (!this.isFreshSmpProfile()) return;
    if (phase === 'lobby') {
      this.hasTransferredToFreshSmpSubserver = false;
      this.hasTransferredToSubserver = false;
      this.cancelSubserverJoinCommand();
    }
    if (this.freshSmpPhase === phase) return;
    this.freshSmpPhase = phase;
    this.freshSmpPhaseSince = Date.now();
    this.publishFreshSmpDiagnostics();
  }

  private recordFreshSmpEvent(category: FreshSmpDiagnosticEvent['category'], severity: FreshSmpDiagnosticEvent['severity'], message: string, durationMs?: number) {
    if (!this.isFreshSmpProfile()) return;
    this.freshSmpEvents = [...this.freshSmpEvents.slice(-99), {
      id: randomUUID(), timestamp: Date.now(), category, severity, message, durationMs,
    }];
    this.publishFreshSmpDiagnostics();
  }

  private setSignetNextAction(action = '', at = 0) {
    this.signetNextAction = action;
    this.signetNextActionAt = at;
    this.publishFreshSmpDiagnostics();
  }

  private armLifestealThreshold(origin: 'attempt' | 'queue') {
    if (!this.isFreshSmpProfile() || !this.lifestealAttemptStartedAt || this.lifestealThresholdReported) return;
    if (this.lifestealThresholdTimer) clearTimeout(this.lifestealThresholdTimer);
    const dueAt = this.lifestealAttemptStartedAt + 60_000;
    this.lifestealThresholdTimer = setTimeout(() => {
      this.lifestealThresholdTimer = null;
      if (this.isInSubserver || !this.lifestealAttemptStartedAt) return;
      const elapsed = Date.now() - this.lifestealAttemptStartedAt;
      if (elapsed < 60_000) return;
      this.lifestealThresholdReported = true;
      const detail = origin === 'queue'
        ? 'FreshSMP has kept this account in the /lifesteal queue for at least 60 seconds.'
        : 'No confirmed /lifesteal queue or subserver entry arrived within 60 seconds.';
      this.recordFreshSmpEvent('queue', 'error', detail, elapsed);
      this.logActivity('warning', detail);
      if (origin === 'attempt' && !this.isSubserverQueueActive) {
        this.finishLifestealAttempt('No FreshSMP queue response arrived', 'warning');
        this.isSubserverQueueActive = false;
        this.setFreshSmpPhase('lobby');
        this.subserverQueueTimeoutCount += 1;
        this.handleSignetTransferFailure('No confirmed /lifesteal queue or subserver response arrived within 60 seconds.');
      }
    }, Math.max(0, dueAt - Date.now()));
  }

  private handleSignetTransferFailure(reason: string) {
    if (shouldResetFreshSmpSession(this.shortLifestealReturnCount, this.subserverQueueTimeoutCount) && this.scheduleFreshSmpRecovery(reason)) return;

    const attempt = Math.max(1, this.shortLifestealReturnCount, this.subserverQueueTimeoutCount);
    const retryDelay = signetCommandRetryDelayMs(attempt);
    const retryNote = `${reason} Signet will retry /lifesteal in ${Math.ceil(retryDelay / 1000)}s (short returns ${this.shortLifestealReturnCount}/3, queue failures ${this.subserverQueueTimeoutCount}/3).`;
    this.recordFreshSmpEvent('queue', 'warning', retryNote);
    this.logActivity('warning', retryNote);
    this.triggerJoinCommandRetry(retryDelay);
  }

  private scheduleFreshSmpRecovery(reason: string): boolean {
    if (!this.isFreshSmpProfile() || this.isExplicitlyStopped || !this.config.settings?.autoReconnect || !this.client || this.reconnectTimer) return false;

    this.freshSmpRecoveryCount = Math.min(this.freshSmpRecoveryCount + 1, 5);
    const localDelay = signetConnectionRecoveryDelayMs(this.freshSmpRecoveryCount);
    const now = Date.now();
    const reconnectAt = Math.max(now + localDelay, PebbleBotInstance.nextFreshSmpRecoveryAt);
    // Preserve a 12-second daemon-wide login slot so simultaneous recoveries
    // don't turn a proxy hiccup into a burst of Bedrock handshakes.
    PebbleBotInstance.nextFreshSmpRecoveryAt = reconnectAt + 12_000;
    const delay = reconnectAt - now;
    const recoveryNote = `Signet recovery cycle ${this.freshSmpRecoveryCount}: resetting the FreshSMP Bedrock session and reconnecting in ${Math.ceil(delay / 1000)}s. ${reason}`;

    this.recordFreshSmpEvent('connection', 'warning', recoveryNote);
    this.logActivity('warning', recoveryNote);
    this.setFreshSmpPhase('reconnecting');
    this.updateState('RECONNECTING', `Signet session recovery; reconnecting in ${Math.ceil(delay / 1000)}s`);
    this.setSignetNextAction('Reconnect to FreshSMP', reconnectAt);

    this.isInSubserver = false;
    this.isSubserverQueueActive = false;
    this.isTransferring = false;
    this.hasTransferredToFreshSmpSubserver = false;
    this.hasTransferredToSubserver = false;
    this.lastLifestealCommandAt = 0;
    this.lastAlreadyConnectedAt = 0;
    this.config.host = this.originalHost;
    this.config.port = this.originalPort;
    this.finishLifestealAttempt('Signet FreshSMP recovery cycle started', 'warning');
    this.cleanup();

    const oldClient = this.client;
    this.client = null;
    try { oldClient.close(); } catch (_) {}

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.isExplicitlyStopped) this.start();
    }, delay);
    return true;
  }

  private finishLifestealAttempt(reason: string, severity: FreshSmpDiagnosticEvent['severity']) {
    if (this.lifestealThresholdTimer) clearTimeout(this.lifestealThresholdTimer);
    this.lifestealThresholdTimer = null;
    if (this.lifestealStabilityTimer) clearTimeout(this.lifestealStabilityTimer);
    this.lifestealStabilityTimer = null;
    const duration = this.lifestealSessionStartedAt ? Date.now() - this.lifestealSessionStartedAt : 0;
    if (this.lifestealSessionStartedAt) {
      const underMinute = duration < 60_000;
      this.recordFreshSmpEvent('subserver', underMinute ? 'error' : severity,
        `${reason}; confirmed Lifesteal session lasted ${(duration / 1000).toFixed(1)}s${underMinute ? ' (under the 60-second stability threshold)' : ''}.`, duration);
    } else if (this.lifestealAttemptStartedAt) {
      const durationMs = Date.now() - this.lifestealAttemptStartedAt;
      this.recordFreshSmpEvent('queue', severity, `${reason}; /lifesteal attempt lasted ${(durationMs / 1000).toFixed(1)}s.`, durationMs);
    }
    this.lifestealAttemptStartedAt = 0;
    this.lifestealSessionStartedAt = 0;
    this.lifestealThresholdReported = false;
    this.balanceCheckRequestedAt = 0;
    this.payoutSequenceActive = false;
    if (this.stablePayoutTimer) {
      clearTimeout(this.stablePayoutTimer);
      this.stablePayoutTimer = null;
    }
  }

  private armLifestealStabilityTimer() {
    if (!this.isFreshSmpProfile() || !this.lifestealSessionStartedAt) return;
    if (this.lifestealStabilityTimer) clearTimeout(this.lifestealStabilityTimer);
    this.lifestealStabilityTimer = setTimeout(() => {
      this.lifestealStabilityTimer = null;
      if (!this.isInSubserver || !this.lifestealSessionStartedAt) return;
      const duration = Date.now() - this.lifestealSessionStartedAt;
      if (duration < 60_000) return;
      this.shortLifestealReturnCount = 0;
      this.subserverQueueTimeoutCount = 0;
      this.freshSmpRecoveryCount = 0;
      this.setSignetNextAction();
      const detail = 'Account remained confirmed in FreshSMP Lifesteal for 60 seconds; recovery backoff reset.';
      this.recordFreshSmpEvent('subserver', 'success', detail, duration);
      this.logActivity('status', detail);
      this.setupStableAccountAutomations(this.client);
    }, Math.max(0, this.lifestealSessionStartedAt + 60_000 - Date.now()));
  }

  public async start() {
    if (this.startInProgress || (this.client && !this.isTransferring)) {
      console.log(chalk.gray(`[PebbleAFK] Ignoring duplicate connect request for ${this.config.username}; a connection attempt is already active.`));
      return;
    }

    this.isExplicitlyStopped = false;
    this.setSignetNextAction();
    const startGeneration = ++this.startGeneration;
    this.startInProgress = true;
    this.clearBossBars();
    this.isInSubserver = false;
    this.isSubserverQueueActive = false;
    // Preserve the command timestamp across a FreshSMP transfer: queue/entry
    // notices may arrive only after the destination client has spawned.
    if (!this.hasTransferredToFreshSmpSubserver) this.lastLifestealCommandAt = 0;
    this.lastAlreadyConnectedAt = 0;
    this.connectionStable = false;
    this.lastServerNotice = '';
    this.lastServerNoticeAt = 0;
    this.lastDisconnectReason = '';
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.updateState('CONNECTING');
    this.setFreshSmpPhase('connecting');
    this.recordFreshSmpEvent('connection', 'info', `Connecting to ${this.config.host}:${this.config.port}; Bedrock version ${this.config.version || 'auto'}.`);
    this.logActivity('connect', `Connecting to Bedrock server ${this.config.host}:${this.config.port}...`);

    try {
      const profilesFolder = getAndSyncTokenFolder();
      const isOffline = this.config.authType === 'offline';
      const cleanHost = (this.config.host || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
      const cleanPort = Number(this.config.port) || 19132;
      const isFreshSmpHost = cleanHost.toLowerCase().includes('freshsmp');
      const freshSmpSignallingUrl = isFreshSmpHost ? `https://${cleanHost}:${cleanPort}` : undefined;

      // Keep every RakNet packet in this attempt on one IPv4 (DNS round-robin must not
      // split a session), but rotate to another advertised edge after a silent timeout.
      const ipv4Addresses = await resolveBedrockIpv4Addresses(cleanHost);
      let connectHost = cleanHost;
      if (ipv4Addresses.length && !isFreshSmpHost) {
        const hostKey = cleanHost.toLowerCase();
        const knownWorkingEndpoint = SERVER_WORKING_ENDPOINTS.get(hostKey);
        const knownWorkingIndex = knownWorkingEndpoint ? ipv4Addresses.indexOf(knownWorkingEndpoint) : -1;
        if (knownWorkingIndex >= 0) {
          this.endpointAttemptCursor = knownWorkingIndex;
          this.hasAttemptedEndpoint = true;
        } else if (!this.hasAttemptedEndpoint) {
          this.endpointAttemptCursor = SERVER_ENDPOINT_CURSORS.get(hostKey) || 0;
          SERVER_ENDPOINT_CURSORS.set(hostKey, (this.endpointAttemptCursor + 1) % ipv4Addresses.length);
          this.hasAttemptedEndpoint = true;
        }
        const endpointIndex = this.endpointAttemptCursor % ipv4Addresses.length;
        connectHost = ipv4Addresses[endpointIndex];
        console.log(chalk.gray(`[PebbleAFK] Pinned host ${cleanHost} -> IPv4 ${connectHost} (edge ${endpointIndex + 1}/${ipv4Addresses.length})`));
      }

      // FreshSMP now exposes its public NetherNet signalling endpoint over TLS.
      // Keep its hostname intact for certificate verification; it does not need
      // the daemon's native RakNet setup or IPv4 edge pinning.
      if (!isFreshSmpHost) await waitForNativeRaknetPreparation();
      if (startGeneration !== this.startGeneration || this.isExplicitlyStopped) return;

      let hasNativeRaknet = false;
      if (!isFreshSmpHost) {
        try {
          (eval('require'))('raknet-native');
          hasNativeRaknet = true;
        } catch (_) {}
      }

      const rakBackend = hasNativeRaknet ? 'raknet-native' : 'jsp-raknet';
      if (!isFreshSmpHost && !hasNativeRaknet) {
        this.logActivity('warning', 'Native RakNet is unavailable; using the JavaScript fallback, which some secured Bedrock gateways may reject.');
        if (!ipv4Addresses.length && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(connectHost)) {
          throw new Error(`Could not resolve an IPv4 address for ${cleanHost}; the JavaScript RakNet fallback requires an IPv4 endpoint.`);
        }
      }

      let pingRes: { motd?: string; protocol?: string | number; version?: string; gameVersion?: string } | null = null;
      const rawUserVersion = this.config.version?.trim();
      const isAutoVersion = !rawUserVersion || rawUserVersion.toLowerCase() === 'auto' || rawUserVersion.toLowerCase() === 'default';

      if (isAutoVersion) {
        if (isFreshSmpHost) {
          this.logActivity('status', `🔍 Checking FreshSMP's TLS NetherNet endpoint ${freshSmpSignallingUrl}/v1/join...`);
          try {
            const response = await bedrock.ping({
              transport: 'nethernet',
              host: cleanHost,
              port: cleanPort,
              timeout: 15_000,
              nethernet: { signalling: 'http', url: freshSmpSignallingUrl },
            });
            pingRes = response;
            const advertisedVersion = response.gameVersion || response.version || 'not supplied';
            console.log(chalk.cyan(`[PebbleAFK] FreshSMP HTTPS NetherNet response from ${freshSmpSignallingUrl}: protocol=${response.protocol ?? 'not supplied'}, version=${advertisedVersion}`));
            this.logActivity('status', `✓ FreshSMP NetherNet signalling is online: ${advertisedVersion}, protocol ${response.protocol ?? 'not supplied'}.`);
          } catch (error: any) {
            this.logActivity('warning', `⚠️ FreshSMP HTTPS NetherNet discovery failed at ${freshSmpSignallingUrl}: ${error?.message || 'unknown error'}.`);
          }
        } else {
          this.logActivity('status', `🔍 Pinging Bedrock UDP port ${cleanHost}:${cleanPort}...`);
          try {
            if (ipv4Addresses.length || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(connectHost)) {
              pingRes = await pingBedrockJsp(connectHost, cleanPort, 2500);
            }
            if (pingRes) {
              console.log(chalk.cyan(`[PebbleAFK] Bedrock ping response from ${cleanHost} (${connectHost}):${cleanPort}: protocol=${pingRes.protocol}, version=${pingRes.version}`));
              this.logActivity('status', `✓ Bedrock server online: Protocol ${pingRes.protocol || 'auto'}, Version ${pingRes.version || 'auto'}`);
            } else {
              this.logActivity('warning', `⚠️ No UDP ping response from ${cleanHost}:${cleanPort}. Server may be offline or filtering Unconnected Ping.`);
            }
          } catch (_) {
            this.logActivity('warning', `⚠️ UDP ping probe failed for ${cleanHost}:${cleanPort}. Proceeding with default protocol.`);
          }
        }
      }

      // A stop or a newer lifecycle request can happen while the UDP version
      // probe is pending. Never let that stale async start resurrect a bot.
      if (startGeneration !== this.startGeneration || this.isExplicitlyStopped) return;

      const resolved = resolveBedrockTargetVersion(rawUserVersion, pingRes?.protocol, pingRes?.version, cleanHost);
      // Automatic profiles use the version advertised by the verified HTTPS
      // NetherNet probe. bedrockProtocol installs FreshSMP's pinned 26.60
      // packet schema before the client is loaded.
      const targetVersion = isFreshSmpHost && isAutoVersion
        ? resolved.version
        : this.autoVersionOverride || this.currentVersionCandidate || resolved.version;
      this.lastAttemptedVersion = targetVersion;

      const advertisedProtocol = Number(pingRes?.protocol);
      if (isFreshSmpHost && isAutoVersion && Number.isFinite(advertisedProtocol) && advertisedProtocol > 0) {
        const supportedProtocols = Object.values(getBedrockSupportedVersions().versions);
        if (!supportedProtocols.includes(advertisedProtocol)) {
          const advertisedVersion = pingRes?.gameVersion || pingRes?.version || `protocol ${advertisedProtocol}`;
          this.logActivity('warning', `FreshSMP advertises ${advertisedVersion} (${advertisedProtocol}), which this daemon's packet data does not support yet; trying ${targetVersion} over TLS NetherNet for backward compatibility.`);
          this.recordFreshSmpEvent('protocol', 'warning', `FreshSMP advertises ${advertisedVersion} (${advertisedProtocol}); this daemon supports through ${getBedrockSupportedVersions().currentVersion} and will try ${targetVersion} over TLS NetherNet.`);
        }
      }

      const transportLabel = isFreshSmpHost ? 'NetherNet HTTPS signalling' : `RakNet (${rakBackend})`;
      this.logActivity('connect', `🚀 Initiating ${transportLabel} connection with ${cleanHost}:${cleanPort} (Minecraft Bedrock ${targetVersion})...`);
      this.recordFreshSmpEvent('connection', 'info', isFreshSmpHost
        ? `NetherNet HTTPS attempt: signalling ${freshSmpSignallingUrl}; Bedrock ${targetVersion}.`
        : `RakNet attempt: logical host ${cleanHost}:${cleanPort}, pinned IPv4 ${connectHost}, edge ${ipv4Addresses.indexOf(connectHost) + 1 || 1}/${ipv4Addresses.length || 1}, Bedrock ${targetVersion}, backend ${rakBackend}.`);

      const clientOptions: any = {
        host: isFreshSmpHost ? cleanHost : connectHost,
        port: cleanPort,
        username: this.config.username,
        offline: isOffline,
        profilesFolder: isOffline ? undefined : profilesFolder,
        version: targetVersion,
        transport: isFreshSmpHost ? 'nethernet' : 'raknet',
        ...(isFreshSmpHost
          ? { nethernet: { signalling: 'http', url: freshSmpSignallingUrl, signallingConnectTimeout: 25_000 } }
          : { raknetBackend: rakBackend }),
        useRaknetWorkers: false,
        // The built-in HTTP probe above has already verified the TLS endpoint.
        // Skip duplicate discovery: FreshSMP's TLS probe above already returned
        // the protocol/version and selected the transport for this attempt.
        skipPing: isFreshSmpHost || rakBackend === 'jsp-raknet' || !pingRes,
        // RakNet retries its open-connection request for several seconds. Avoid leaving
        // silent endpoints hanging for 45s before endpoint rotation/reconnect can begin.
        connectTimeout: isFreshSmpHost ? 30_000 : 18_000,
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

      if (!isOffline) {
        const authCacheKey = this.config.authCacheKey?.trim() || this.config.username;
        if (this.config.authCacheKey) {
          // One-time migration for accounts linked before Pebble stored XUIDs.
          migrateTokenCache(profilesFolder, this.config.username, authCacheKey);
        }
        clientOptions.authflow = new Authflow(
          authCacheKey,
          profilesFolder,
          {
            authTitle: Titles.MinecraftNintendoSwitch,
            deviceType: 'Nintendo',
            flow: 'live',
          },
          (data: any) => {
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
        );
      }

      // Serialize the reservation as well as the wait. Previously several
      // accounts could calculate the same delay before any one updated
      // lastHandshakeTime, then all launch together after that shared wait.
      // Keep the historical 12s cadence while reserving each slot atomically,
      // so accounts start promptly without launching as one simultaneous burst.
      const minSpacingMs = 12_000;
      const previousHandshake = PebbleBotInstance.handshakeQueue;
      let releaseHandshakeQueue: () => void = () => {};
      PebbleBotInstance.handshakeQueue = new Promise<void>((resolve) => {
        releaseHandshakeQueue = resolve;
      });
      await previousHandshake;

      let client: any;
      try {
        if (startGeneration !== this.startGeneration || this.isExplicitlyStopped) return;
        const waitMs = Math.max(0, PebbleBotInstance.lastHandshakeTime + minSpacingMs - Date.now());
        if (waitMs > 0) {
          this.logActivity('connect', `⏳ Waiting ${(waitMs / 1000).toFixed(1)}s for the next staggered RakNet slot...`);
          console.log(chalk.cyan(`[PebbleAFK] Staggering connection for ${this.config.username} by ${waitMs}ms`));
          await new Promise<void>((resolve) => {
            let timer: NodeJS.Timeout | null = null;
            const finishWait = () => {
              if (timer) clearTimeout(timer);
              timer = null;
              if (this.handshakeDelayResolver === finishWait) this.handshakeDelayResolver = null;
              resolve();
            };
            this.handshakeDelayResolver = finishWait;
            timer = setTimeout(finishWait, waitMs);
          });
        }
        if (startGeneration !== this.startGeneration || this.isExplicitlyStopped) return;
        PebbleBotInstance.lastHandshakeTime = Date.now();
        console.log(chalk.cyan(`[PebbleAFK] Spawning client for ${this.config.username} -> ${cleanHost}:${cleanPort} (version: ${targetVersion}, transport: ${isFreshSmpHost ? 'nethernet-https' : rakBackend})`));
        client = bedrock.createClient(clientOptions);
        this.client = client;
      } finally {
        releaseHandshakeQueue();
      }

      let recentPlayStatus = 'not received';
      const clientStatuses: Record<number, string> = { 0: 'disconnected', 1: 'connecting', 2: 'authenticating', 3: 'initializing', 4: 'initialized' };
      this.recordFreshSmpEvent('protocol', 'info', `bedrock-protocol client status at instrumentation: ${clientStatuses[Number(client.status)] || client.status}.`);
      client.on('status', (status: number) => {
        this.recordFreshSmpEvent('protocol', status === 0 ? 'warning' : 'info', `bedrock-protocol client status changed to ${clientStatuses[Number(status)] || status}.`);
      });
      client.on('packet', (decoded: any) => {
        const packetName = decoded?.data?.name;
        const params = decoded?.data?.params || {};
        if (!packetName) return;
        if (packetName === 'network_settings') {
          this.recordFreshSmpEvent('protocol', 'info', `Received Bedrock network_settings (compression threshold ${params.compression_threshold ?? 'unknown'}).`);
        } else if (packetName === 'play_status') {
          const statuses: Record<number, string> = {
            0: 'login_success', 1: 'failed_client', 2: 'failed_spawn', 3: 'player_spawn',
            4: 'failed_invalid_tenant', 5: 'failed_vanilla_edu', 6: 'failed_edu_vanilla', 7: 'failed_server_full',
          };
          recentPlayStatus = typeof params.status === 'number'
            ? (statuses[params.status] || `unknown(${params.status})`)
            : String(params.status || 'unknown');
          const failed = recentPlayStatus !== 'login_success' && recentPlayStatus !== 'player_spawn';
          this.recordFreshSmpEvent('protocol', failed ? 'error' : 'success', `Server play_status: ${recentPlayStatus}.`);
        } else if (packetName === 'start_game') {
          this.recordFreshSmpEvent('protocol', 'info', `Received start_game (game version ${params.game_version || 'not supplied'}); latest play_status was ${recentPlayStatus}.`);
        } else if (packetName === 'change_dimension') {
          this.recordFreshSmpEvent('subserver', 'info', `Server sent change_dimension to ${params.dimension ?? 'unknown'}; awaiting FreshSMP Lifesteal/AFK-zone confirmation.`);
        } else if (packetName === 'transfer') {
          this.recordFreshSmpEvent('subserver', 'info', `Inbound transfer packet target: ${params.server_address || 'same host'}:${params.port || 19132}.`);
        } else if (packetName === 'disconnect') {
          const reason = params.message || params.filtered_message || params.reason || 'no reason supplied';
          this.recordFreshSmpEvent('connection', 'error', `Inbound Bedrock disconnect packet: ${String(reason).slice(0, 400)}.`);
        }
      });

      // Capture the actual automatic resource-pack replies made by bedrock-protocol.
      const originalWrite = client.write.bind(client);
      client.write = (name: string, params: any) => {
        if (name === 'resource_pack_client_response') {
          const statusNames: Record<string, string> = { '0': 'none', '1': 'refused', '2': 'send_packs', '3': 'have_all_packs', '4': 'completed', none: 'none', refused: 'refused', send_packs: 'send_packs', have_all_packs: 'have_all_packs', completed: 'completed' };
          const status = String(params?.response_status ?? 'unknown');
          const ids = Array.isArray(params?.resourcepackids) ? params.resourcepackids.length : 0;
          const potentialMismatch = this.resourcePacksMustBeAccepted && this.requiredResourcePackCount > 0 && statusNames[status] === 'completed' && ids === 0;
          this.recordFreshSmpEvent('resource_pack', potentialMismatch ? 'warning' : 'info', `Client sent resource_pack_client_response: ${statusNames[status] || status}, ${ids} pack ID(s).${potentialMismatch ? ` Server required ${this.requiredResourcePackCount} pack(s), but the client reports completion with no pack IDs; this is a protocol compatibility lead, not yet proof of the disconnect cause.` : ''}`);
        }
        return originalWrite(name, params);
      };

      // Observe, but leave the automatic resource-pack response to bedrock-protocol.
      client.on('resource_packs_info', (packet: any) => {
        const count = (packet?.texture_packs?.length || 0) + (packet?.behaviour_packs?.length || packet?.behavior_packs?.length || 0);
        this.requiredResourcePackCount = count;
        this.resourcePacksMustBeAccepted = Boolean(packet?.must_accept);
        this.recordFreshSmpEvent('resource_pack', 'info', `Server sent resource-pack info (${count} pack(s); must_accept=${Boolean(packet?.must_accept)}). bedrock-protocol will auto-acknowledge.`);
      });
      client.on('resource_pack_stack', (packet: any) => {
        const count = (packet?.resource_packs?.length || 0) + (packet?.behavior_packs?.length || packet?.behaviour_packs?.length || 0);
        this.recordFreshSmpEvent('resource_pack', 'success', `Server sent resource-pack stack (${count} pack(s)); waiting for spawn to confirm login completed.`);
      });

      this.hookConnectionDiagnostics(client);
      client.once('connect_allowed', () => this.hookConnectionDiagnostics(client));

      // Session event: Microsoft/Xbox authentication finished
      client.once('session', () => {
        this.hookConnectionDiagnostics(client);
        console.log(chalk.green(`[PebbleAFK] Microsoft/Xbox authentication session established for ${this.config.username}; awaiting Bedrock RakNet handshake.`));
        this.logActivity('connect', 'Microsoft/Xbox authentication verified; awaiting the Bedrock RakNet handshake...');
        this.recordFreshSmpEvent('connection', 'success', 'Microsoft/Xbox authentication completed; awaiting Bedrock login and resource-pack negotiation.');
      });

      // Join event: Server accepted player connection
      client.on('join', () => {
        this.hookConnectionDiagnostics(client);
        this.connectStartTime = Date.now();
        this.updateState('LOGGED_IN');
        this.recordFreshSmpEvent('connection', 'success', 'Bedrock encryption handshake completed; awaiting server login_success and world spawn.');
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
        if (this.hasTransferredToFreshSmpSubserver) {
          this.setFreshSmpPhase('queue');
          this.recordFreshSmpEvent('subserver', 'info', 'Spawned on the FreshSMP transfer target; waiting for explicit Lifesteal/AFK-zone confirmation.');
        } else {
          this.setFreshSmpPhase('lobby');
        }
        this.recordFreshSmpEvent('connection', 'success', 'World spawn completed; Bedrock login/resource-pack handshake reached spawn.');
        this.logActivity('spawn', '🌍 Spawned into Bedrock world!');
        this.handleSystemMessage(`🌍 Spawned into world as @${this.config.username}`);

        // A successful spawn proves this protocol is accepted. Do not rotate
        // versions later for ordinary queue timeouts, kicks, or network drops.
        this.connectionStable = true;
        this.reconnectAttemptCount = 0;
        this.reconnectFailureCount = 0;
        this.loginThrottleCount = 0;
        this.duplicateLoginCount = 0;
        if (ipv4Addresses.includes(connectHost)) {
          SERVER_WORKING_ENDPOINTS.set(cleanHost.toLowerCase(), connectHost);
        }
        this.currentVersionCandidate = null;
        SERVER_VERSION_CACHE.set(cleanHost, targetVersion);
        this.scheduleJoinCommand(client);
        this.scheduleSubserverJoinCommand(client);

        // Start Bedrock authoritative input keepalive loops
        this.clientTick = 0n;
        this.startTickSyncLoop(client);
        this.startPlayerAuthInputLoop(client);

        this.setupTelemetry();
        this.setupAntiAfk();
        this.setupStableAccountAutomations(client);
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
          if (this.isFreshSmpProfile()) this.handleBedrockText({ type: 'system', source_name: 'System', message: clean }, false);
          this.handleSystemMessage(`📢 ${clean}`);
        }
      });

      // Subserver Transfer request (e.g. /lifesteal gateway)
      client.on('transfer', (packet: any) => {
        if (this.client !== client || this.isTransferring) return;
        const targetHost = packet.server_address || this.config.host;
        const targetPort = packet.port || 19132;
        this.recordFreshSmpEvent('subserver', 'info', `Server requested a Bedrock transfer to ${targetHost}:${targetPort}.`);
        console.log(chalk.cyan(`[PebbleAFK] 🔄 Subserver transfer requested for @${this.config.username} -> ${targetHost}:${targetPort}`));
        this.logActivity('status', `🔄 Transferring to subserver (${targetHost}:${targetPort})...`);
        this.handleSystemMessage(`🔄 Server transferring to subserver ${targetHost}:${targetPort}...`);

        this.isTransferring = true;
        this.hasTransferredToSubserver = true;
        if (this.isFreshSmpProfile()) this.hasTransferredToFreshSmpSubserver = true;
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
        this.finishLifestealAttempt(`Connection ended: ${reason}`, 'error');
        this.recordFreshSmpEvent('connection', 'error', `Bedrock connection ended: ${reason}`);
        this.setFreshSmpPhase('reconnecting');

        if (ipv4Addresses.length > 1 && /connect timed out|no reply to RakNet UDP packets|filtering UDP/i.test(reason)) {
          const hostKey = cleanHost.toLowerCase();
          if (SERVER_WORKING_ENDPOINTS.get(hostKey) === connectHost) {
            SERVER_WORKING_ENDPOINTS.delete(hostKey);
          }
          this.endpointAttemptCursor = (this.endpointAttemptCursor + 1) % ipv4Addresses.length;
          SERVER_ENDPOINT_CURSORS.set(hostKey, this.endpointAttemptCursor);
          const nextAddress = ipv4Addresses[this.endpointAttemptCursor];
          this.logActivity('status', `🔁 Bedrock edge ${connectHost} did not answer RakNet; next retry will use ${nextAddress}.`);
          console.log(chalk.yellow(`[PebbleAFK] Rotating Bedrock IPv4 edge ${connectHost} -> ${nextAddress} after RakNet timeout.`));
        }

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
        this.isInSubserver = false;
        this.isSubserverQueueActive = false;
        this.lastLifestealCommandAt = 0;
        this.lastAlreadyConnectedAt = 0;
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
          descriptiveReason = `Connect timed out: ${cleanHost}:${cleanPort} sent no reply to RakNet UDP packets. The selected server edge or network path did not answer.`;
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
    this.handshakeDelayResolver?.();
    this.handshakeDelayResolver = null;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cleanup();
    this.finishLifestealAttempt('Bot was stopped manually', 'warning');
    this.setFreshSmpPhase('offline');
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
        if (/^\/?lifesteal(?:\s|$)/i.test(message.trim())) {
          this.lastLifestealCommandAt = Date.now();
          this.lifestealAttemptStartedAt = this.lastLifestealCommandAt;
          this.lifestealSessionStartedAt = 0;
          this.lifestealThresholdReported = false;
          this.lastQueueDiagnosticAt = 0;
          this.lastQueueDiagnosticMessage = '';
          this.setFreshSmpPhase('queue');
          this.recordFreshSmpEvent('queue', 'info', 'Sent /lifesteal; waiting for FreshSMP queue or subserver confirmation.');
          this.armLifestealThreshold('attempt');
        }
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

    // Do not send another transfer request while FreshSMP still has this
    // account in its Lifesteal queue (or after it reached the AFK area).
    if (this.isInSubserver || this.isSubserverQueueActive) {
      this.setSignetNextAction();
      return;
    }

    const isFreshSmp = this.isFreshSmpProfile();
    const configuredCommand = this.config.settings?.joinCommand?.trim().slice(0, 256) || (isFreshSmp ? '/lifesteal' : '');
    if (!configuredCommand) {
      this.setSignetNextAction();
      return;
    }

    const command = configuredCommand.startsWith('/') ? configuredCommand : `/${configuredCommand}`;
    const minDelay = command.toLowerCase().includes('lifesteal') ? 10000 : 3000;
    let finalDelay = Math.max(delayMs, minDelay);

    // Stagger subserver transfer commands across bots so multiple bots never collide in FreshSMP queue
    if (command.toLowerCase().includes('lifesteal')) {
      const now = Date.now();
      const minSeparation = 8000;
      const scheduledAt = Math.max(now + finalDelay, PebbleBotInstance.nextSubserverCommandAt);
      finalDelay = scheduledAt - now;
      // Reserve the next slot after this command, rather than comparing now to
      // a future timestamp (which used to compound delays across every account).
      PebbleBotInstance.nextSubserverCommandAt = scheduledAt + minSeparation;
    }

    console.log(chalk.cyan(`[PebbleAFK] Scheduling join/transfer command for @${this.config.username} (${command}) in ${Math.round(finalDelay / 1000)}s...`));
    this.logActivity('status', `Join/transfer command (${command}) scheduled in ${Math.round(finalDelay / 1000)}s.`);
    this.setSignetNextAction(`Retry ${command}`, Date.now() + finalDelay);

    this.joinCommandTimer = setTimeout(() => {
      this.joinCommandTimer = null;
      this.setSignetNextAction();
      if (this.isInSubserver || this.isSubserverQueueActive) return;
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

    // A fresh client is created after a transfer. Do not issue /lifesteal
    // again on the destination server or reset the queue/session it just joined.
    if (this.isFreshSmpProfile() && this.hasTransferredToFreshSmpSubserver) return;

    const isFreshSmp = this.isFreshSmpProfile();
    const delaySeconds = isFreshSmp ? 10 : Math.min(300, Math.max(3, Number(this.config.settings?.joinCommandDelay ?? 3) || 3));
    this.triggerJoinCommandRetry(delaySeconds * 1000);
  }

  private cancelSubserverJoinCommand() {
    if (this.subserverJoinCommandTimer) {
      clearTimeout(this.subserverJoinCommandTimer);
      this.subserverJoinCommandTimer = null;
    }
    this.subserverJoinCommandClient = null;
  }

  private scheduleSubserverJoinCommand(client: any) {
    if (!this.hasTransferredToSubserver || this.subserverJoinCommandClient === client) return;
    this.cancelSubserverJoinCommand();

    const settings = this.config.settings;
    const configuredCommand = settings?.subserverJoinCommand?.trim().slice(0, 256) || '';
    if (settings?.subserverJoinCommandEnabled !== true || !configuredCommand) return;

    const command = configuredCommand.startsWith('/') ? configuredCommand : `/${configuredCommand}`;
    const delaySeconds = Math.min(300, Math.max(0, Number(settings.subserverJoinCommandDelay ?? 5) || 0));
    this.subserverJoinCommandClient = client;
    this.logActivity('status', `Subserver command (${command}) scheduled ${delaySeconds}s after transfer spawn.`);

    this.subserverJoinCommandTimer = setTimeout(() => {
      this.subserverJoinCommandTimer = null;
      this.subserverJoinCommandClient = null;
      if (this.client !== client || !this.hasTransferredToSubserver) return;
      if (this.isFreshSmpProfile() && this.freshSmpPhase === 'lobby') return;
      if (this.state !== 'SPAWNED' && this.state !== 'LOGGED_IN') return;

      this.logActivity('command', `Running subserver join command: ${command}`);
      this.sendChat(command);
    }, delaySeconds * 1000);
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

  public isStableFreshSmpSession(client = this.client): boolean {
    return Boolean(
      client && this.client === client && this.state === 'SPAWNED' &&
      this.isFreshSmpProfile() && this.isInSubserver && this.freshSmpPhase === 'lifesteal' &&
      this.lifestealSessionStartedAt > 0 && Date.now() - this.lifestealSessionStartedAt >= 60_000
    );
  }

  private getStablePayUsername(): string {
    const username = (this.config.settings?.stablePayUsername || '').trim().replace(/^@/, '');
    return /^[A-Za-z0-9_]{3,16}$/.test(username) ? username : '';
  }

  private setupStableAccountAutomations(client: any) {
    if (this.stableRewardInterval) clearInterval(this.stableRewardInterval);
    if (this.stableBalanceInterval) clearInterval(this.stableBalanceInterval);
    this.stableRewardInterval = null;
    this.stableBalanceInterval = null;

    if (!client || this.client !== client || !this.isFreshSmpProfile()) return;

    const settings = this.config.settings || ({} as BotConfig['settings']);
    if (settings.stableRewardEnabled ?? true) {
      this.stableRewardInterval = setInterval(() => {
        if (!this.isStableFreshSmpSession(client)) return;
        const command = '/afkrewards spin';
        this.logActivity('command', `Running scheduled stable-account command: ${command}`);
        this.sendChat(command);
      }, 5 * 60_000);
    }

    const payUsername = this.getStablePayUsername();
    if (payUsername !== this.stablePayUsernameAtAutomationSetup) {
      this.stablePayUsernameAtAutomationSetup = payUsername;
      this.payoutSequenceActive = false;
      if (this.stablePayoutTimer) {
        clearTimeout(this.stablePayoutTimer);
        this.stablePayoutTimer = null;
      }
    }
    if (settings.stablePayEnabled === true && payUsername) {
      this.stableBalanceInterval = setInterval(() => {
        if (!this.isStableFreshSmpSession(client)) return;
        const now = Date.now();
        if (this.balanceCheckRequestedAt && now - this.balanceCheckRequestedAt <= 20_000) return;
        this.balanceCheckRequestedAt = now;
        this.sendChat('/bal');
      }, 60_000);
    } else {
      this.balanceCheckRequestedAt = 0;
      if (this.stablePayoutTimer) {
        clearTimeout(this.stablePayoutTimer);
        this.stablePayoutTimer = null;
      }
      this.payoutSequenceActive = false;
    }
  }

  private handleStableBalanceResponse(cleanText: string) {
    if (!this.balanceCheckRequestedAt || Date.now() - this.balanceCheckRequestedAt > 20_000 || !this.isStableFreshSmpSession()) return;
    const match = cleanText.match(/\b(?:your\s+)?balance\b[^0-9$]{0,30}\$?\s*([\d,]+(?:\.\d+)?)\s*([kmb])?/i)
      || cleanText.match(/\$\s*([\d,]+(?:\.\d+)?)\s*([kmb])?/i);
    if (!match) return;

    this.balanceCheckRequestedAt = 0;
    const amount = Number(match[1].replace(/,/g, ''));
    const multiplier = ({ k: 1_000, m: 1_000_000, b: 1_000_000_000 } as Record<string, number>)[(match[2] || '').toLowerCase()] || 1;
    const balance = amount * multiplier;
    if (!Number.isFinite(balance)) return;
    if (balance < 10_000) return;

    if (this.config.settings?.stablePayEnabled !== true || this.payoutSequenceActive) return;
    const username = this.getStablePayUsername();
    if (!username) return;
    this.payoutSequenceActive = true;
    this.logActivity('status', `Stable FreshSMP balance check found $${Math.round(balance).toLocaleString()} (10k threshold met); first /pay to ${username} scheduled in 3 seconds.`);
    this.stablePayoutTimer = setTimeout(() => {
      this.stablePayoutTimer = null;
      if (!this.isStableFreshSmpSession() || this.config.settings?.stablePayEnabled !== true || this.getStablePayUsername() !== username) {
        this.payoutSequenceActive = false;
        return;
      }
      this.sendChat(`/pay ${username} 10k`);
      this.logActivity('status', `Second /pay to ${username} scheduled in 3 seconds.`);
      this.stablePayoutTimer = setTimeout(() => {
        this.stablePayoutTimer = null;
        if (this.isStableFreshSmpSession() && this.config.settings?.stablePayEnabled === true && this.getStablePayUsername() === username) {
          this.sendChat(`/pay ${username} 10k`);
        }
        this.payoutSequenceActive = false;
      }, 3_000);
    }, 3_000);
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

  public syncTelemetry() {
    if (this.state === 'SPAWNED' || this.state === 'LOGGED_IN') {
      this.emitTelemetry();
    }
  }

  public pushChat(chatMsg: any) {
    this.chatHistory.push(chatMsg);
    if (this.chatHistory.length > 250) {
      this.chatHistory.shift();
    }

    // Stream live chat to Termux terminal in real time. When several of this
    // user's accounts share a server, the server broadcasts the same line to
    // every session. Keep each account event for the dashboard, but avoid
    // synchronously writing identical duplicate lines to Termux/stdout.
    const cleanContent = stripMinecraftFormatting(chatMsg.formattedText || chatMsg.raw || '');
    const chatServerKey = this.config.serverId || `${this.config.host}:${this.config.port}`;
    const chatLogKey = `${chatServerKey}\u0000${String(chatMsg.sender || '').toLowerCase()}\u0000${cleanContent.toLowerCase()}`;
    const now = Date.now();
    const lastLoggedAt = PebbleBotInstance.recentChatConsoleLines.get(chatLogKey) || 0;
    if (now - lastLoggedAt > 1500) {
      PebbleBotInstance.recentChatConsoleLines.set(chatLogKey, now);
      if (PebbleBotInstance.recentChatConsoleLines.size > 1000) {
        for (const [key, loggedAt] of PebbleBotInstance.recentChatConsoleLines) {
          if (now - loggedAt > 5000) PebbleBotInstance.recentChatConsoleLines.delete(key);
        }
        while (PebbleBotInstance.recentChatConsoleLines.size > 1000) {
          const oldestKey = PebbleBotInstance.recentChatConsoleLines.keys().next().value;
          if (oldestKey === undefined) break;
          PebbleBotInstance.recentChatConsoleLines.delete(oldestKey);
        }
      }
      console.log(chalk.magenta(`[Chat • @${this.config.username}] <${chatMsg.sender}> ${cleanContent}`));
    }

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
      const firstConfirmedSessionSignal = !this.lifestealSessionStartedAt;
      this.isInSubserver = true;
      this.isSubserverQueueActive = false;
      this.subserverQueueTimeoutCount = 0;
      if (firstConfirmedSessionSignal && this.isFreshSmpProfile()) {
        this.lifestealSessionStartedAt = Date.now();
        this.setFreshSmpPhase('lifesteal');
        const attemptDuration = this.lifestealAttemptStartedAt
          ? Date.now() - this.lifestealAttemptStartedAt
          : undefined;
        this.recordFreshSmpEvent(
          'subserver',
          'success',
          `FreshSMP AFK/reward boss bar confirmed this account is in the AFK zone / Lifesteal subserver${attemptDuration !== undefined ? ` after ${(attemptDuration / 1000).toFixed(1)}s` : ''}.`,
          attemptDuration,
        );
        this.armLifestealStabilityTimer();
      }
      if (this.lifestealThresholdTimer) {
        clearTimeout(this.lifestealThresholdTimer);
        this.lifestealThresholdTimer = null;
      }
      if (this.joinCommandTimer) {
        clearTimeout(this.joinCommandTimer);
        this.joinCommandTimer = null;
      }
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

  private handleBedrockText(packet: any, emitChat = true) {
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
    this.handleStableBalanceResponse(cleanText);

    if (/declined the resource pack|resource pack.*declined/i.test(cleanText)) {
      this.recordFreshSmpEvent('resource_pack', 'warning', `Server reported a resource-pack decline: ${cleanText}`);
    }

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

    const hasRecentLifestealRequest = Date.now() - this.lastLifestealCommandAt <= 180_000;
    const isFreshSmp = this.isFreshSmpProfile();
    const alreadyConnectedMatch = isFreshSmp && hasRecentLifestealRequest &&
      /you are already connected to this server/i.test(cleanText);
    if (alreadyConnectedMatch) {
      this.lastAlreadyConnectedAt = Date.now();
      this.isInSubserver = true;
      this.isSubserverQueueActive = false;
      this.subserverQueueTimeoutCount = 0;
      if (!this.lifestealSessionStartedAt) this.lifestealSessionStartedAt = Date.now();
      this.setFreshSmpPhase('lifesteal');
      this.armLifestealStabilityTimer();
      this.recordFreshSmpEvent('subserver', 'success', 'FreshSMP confirmed this account is already connected to Lifesteal.');
      if (this.lifestealThresholdTimer) clearTimeout(this.lifestealThresholdTimer);
      this.lifestealThresholdTimer = null;
      if (this.joinCommandTimer) {
        clearTimeout(this.joinCommandTimer);
        this.joinCommandTimer = null;
      }
      this.logActivity('status', 'FreshSMP confirmed this account is already connected to the requested server; suppressing redundant /lifesteal retries.');
    }

    const queuePosition = cleanText.match(/\bposition\s*:?\s*(\d+)\s*\/\s*(\d+).*?\beta\s*:?\s*(\d+)\s*(?:s|sec|secs|seconds?)\b/i);
    const isLifestealQueueStatus = hasRecentLifestealRequest && !this.isInSubserver && /\blifesteal\b/i.test(cleanText) && (
      /\bqueued\b/i.test(cleanText) || Boolean(queuePosition)
    );

    if (isLifestealQueueStatus && !isLifestealTimeout) {
      const wasQueueActive = this.isSubserverQueueActive;
      this.isSubserverQueueActive = true;
      this.setFreshSmpPhase('queue');
      this.armLifestealThreshold('queue');
      const queueStatus = queuePosition
        ? `position ${queuePosition[1]}/${queuePosition[2]}, ETA ${queuePosition[3]}s`
        : 'waiting for a queue position';
      const now = Date.now();
      const queueFingerprint = queuePosition ? `${queuePosition[1]}/${queuePosition[2]}` : cleanText.slice(0, 80);
      if (!wasQueueActive || queueFingerprint !== this.lastQueueDiagnosticMessage || now - this.lastQueueDiagnosticAt >= 15_000) {
        this.lastQueueDiagnosticMessage = queueFingerprint;
        this.lastQueueDiagnosticAt = now;
        this.recordFreshSmpEvent('queue', 'info', `FreshSMP queue notice from ${cleanSender}: "${cleanText.slice(0, 240)}" (${queueStatus}).`);
      }

      // Queue position messages can arrive frequently. Keep useful state in
      // the account log without mirroring every server countdown update.
      if (!wasQueueActive || now - this.lastQueueStatusLogAt >= 30_000) {
        this.lastQueueStatusLogAt = now;
        this.logActivity('status', `FreshSMP Lifesteal queue active (${queueStatus}); holding retries until the server completes or cancels the transfer.`);
      }
      if (this.joinCommandTimer) {
        clearTimeout(this.joinCommandTimer);
        this.joinCommandTimer = null;
      }
    }

    if (isLifestealTimeout) {
      const now = Date.now();
      // Some proxies deliver the same queue cancellation as both a system
      // message and a chat line. Do not count or schedule that twice.
      const alreadyConnectedRecently = now - this.lastAlreadyConnectedAt <= 15_000;
      if (alreadyConnectedRecently || this.isInSubserver) {
        this.recordFreshSmpEvent('queue', 'warning', `FreshSMP sent a duplicate/late timeout notice while the account was considered connected: ${cleanSender}: "${cleanText.slice(0, 240)}".`);
        this.logActivity('warning', 'Ignored a Lifesteal timeout notice because FreshSMP recently confirmed this account is already connected; waiting for session state instead of reissuing /lifesteal.');
      } else if (hasRecentLifestealRequest && now - this.lastSubserverTimeoutAt >= 5000) {
        this.lastSubserverTimeoutAt = now;
        this.recordFreshSmpEvent('queue', 'error', `FreshSMP timeout/cancellation notice from ${cleanSender}: "${cleanText.slice(0, 240)}".`);
        this.finishLifestealAttempt(`FreshSMP ended the /lifesteal queue: ${cleanText}`, 'error');
        this.isInSubserver = false;
        this.isSubserverQueueActive = false;
        this.setFreshSmpPhase('lobby');
        this.subserverQueueTimeoutCount += 1;

        this.subserverQueueTimeoutCount = Math.min(this.subserverQueueTimeoutCount, 3);
        const retryReason = `FreshSMP ended the Lifesteal queue attempt (${cleanText.slice(0, 180)}).`;
        console.log(chalk.yellow(`[PebbleAFK] Signet detected queue failure ${this.subserverQueueTimeoutCount}/3 for @${this.config.username}.`));
        this.handleSignetTransferFailure(retryReason);
      }
    }

    if (/entered the AFK zone/i.test(cleanText)) {
      const firstEntry = !this.isInSubserver;
      this.isInSubserver = true;
      this.isSubserverQueueActive = false;
      if (firstEntry) {
        this.lifestealSessionStartedAt = Date.now();
        this.setFreshSmpPhase('lifesteal');
        const attemptDuration = this.lifestealAttemptStartedAt ? Date.now() - this.lifestealAttemptStartedAt : undefined;
        this.recordFreshSmpEvent('subserver', 'success', `FreshSMP confirmed entry into the AFK zone / Lifesteal subserver${attemptDuration !== undefined ? ` after ${(attemptDuration / 1000).toFixed(1)}s` : ''}.`, attemptDuration);
        this.armLifestealStabilityTimer();
      }
      if (this.lifestealThresholdTimer) clearTimeout(this.lifestealThresholdTimer);
      this.lifestealThresholdTimer = null;
      this.subserverQueueTimeoutCount = 0;
      if (this.joinCommandTimer) {
        clearTimeout(this.joinCommandTimer);
        this.joinCommandTimer = null;
      }
    }
    const ownWelcome = cleanText.match(/\bwelcome\s+_?([a-zA-Z0-9_]{3,16})\s+to\s+play\.freshsmp\.fun\b/i);
    if (ownWelcome && ownWelcome[1].toLowerCase() === this.config.username.replace(/^_/, '').toLowerCase()) {
      const priorSessionDuration = this.lifestealSessionStartedAt ? Date.now() - this.lifestealSessionStartedAt : 0;
      this.recordFreshSmpEvent('subserver', this.lifestealSessionStartedAt && Date.now() - this.lifestealSessionStartedAt < 60_000 ? 'error' : 'warning', `FreshSMP lobby welcome received for this account: "${cleanText.slice(0, 240)}".`);
      if (this.lifestealSessionStartedAt) this.finishLifestealAttempt('FreshSMP returned this account to its lobby', 'warning');
      this.isInSubserver = false;
      this.isSubserverQueueActive = false;
      this.setFreshSmpPhase('lobby');
      const alreadyConnectedThenReturnedToLobby = Date.now() - this.lastAlreadyConnectedAt <= 30_000;
      this.lastAlreadyConnectedAt = 0;
      const wasStableSession = priorSessionDuration >= 60_000;
      if (wasStableSession) {
        this.shortLifestealReturnCount = 0;
        this.subserverQueueTimeoutCount = 0;
        this.freshSmpRecoveryCount = 0;
      }
      const countsAsShortReturn = !wasStableSession && (
        (priorSessionDuration > 0 && priorSessionDuration < 60_000)
        || alreadyConnectedThenReturnedToLobby
        || hasRecentLifestealRequest
      );
      const shouldRejoinLifesteal = priorSessionDuration > 0 || alreadyConnectedThenReturnedToLobby || hasRecentLifestealRequest;
      if (shouldRejoinLifesteal) {
        if (countsAsShortReturn) this.shortLifestealReturnCount = Math.min(this.shortLifestealReturnCount + 1, 3);
        const cause = alreadyConnectedThenReturnedToLobby
          ? 'after an already-connected response'
          : priorSessionDuration
            ? `${priorSessionDuration < 60_000 ? 'after only' : 'after'} ${(priorSessionDuration / 1000).toFixed(1)}s in Lifesteal`
            : 'before Lifesteal entry was confirmed';
        const recoveryScheduled = countsAsShortReturn && shouldResetFreshSmpSession(this.shortLifestealReturnCount, this.subserverQueueTimeoutCount)
          ? this.scheduleFreshSmpRecovery(`FreshSMP returned this account to its lobby ${cause}; Signet reached the repeated short-return threshold.`)
          : false;
        if (!recoveryScheduled && !this.joinCommandTimer && !this.reconnectTimer) {
          this.handleSignetTransferFailure(`FreshSMP returned this account to its lobby ${cause}.`);
        }
      }
    }
    if (isSystem || cleanSender.toLowerCase().includes('server') || cleanText.toLowerCase().includes('kick') || cleanText.toLowerCase().includes('afk') || isLifestealTimeout) {
      this.lastServerNotice = isLifestealTimeout ? `${cleanSender}: ${cleanText}` : cleanText;
      this.lastServerNoticeAt = Date.now();
    }

    if (emitChat) this.pushChat({
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
    if (isPermanentBedrockAuthRejection(reason)) {
      this.setFreshSmpPhase('offline');
      this.logActivity('error', 'Automatic reconnect paused: Microsoft rejected this account at Bedrock multiplayer authentication (401). Check Minecraft access and Xbox multiplayer privacy/family settings, then manually reconnect.');
      return;
    }
    if (!this.config.settings?.autoReconnect) return;
    if (this.reconnectTimer) return;

    const baseDelay = Math.max(3000, this.config.settings.autoReconnectDelay || 5000);
    const isLoginThrottled = /logging in too fast|try again later|wait at least|rate.?limit|too many requests|http\s*429|\b429\b/i.test(reason);
    const isDuplicateLogin = /already logged in|duplicate login|logged in from elsewhere/i.test(reason);
    const isTransportTimeout = /no reply to RakNet UDP packets|Connect timed out|filtering UDP|network path did not answer/i.test(reason);
    const isEncryptedPacketFailure = /checksum mismatch|bad encrypted packet|badPacket/i.test(reason);
    const isUnexplainedSessionEnd = /server closed connection\s*\/\s*session ended/i.test(reason);
    let delay: number;
    if (isDuplicateLogin) {
      // A gateway can keep the previous player session alive briefly after a
      // disconnect. Back off long enough for it to expire instead of racing it.
      this.duplicateLoginCount++;
      delay = Math.min(30_000 * (2 ** Math.min(this.duplicateLoginCount - 1, 3)), 240_000);
    } else if (isLoginThrottled) {
      this.loginThrottleCount++;
      delay = Math.max(12_000, Math.min(15_000 * (2 ** Math.min(this.loginThrottleCount - 1, 3)), 120_000));
    } else {
      this.reconnectFailureCount++;
      const retryBaseDelay = isUnexplainedSessionEnd ? Math.max(baseDelay, 15_000) : baseDelay;
      const exponentialDelay = Math.min(retryBaseDelay * (2 ** Math.min(this.reconnectFailureCount - 1, 4)), 60_000);
      // Bad encrypted packets often happen during a server-side subserver
      // transfer. Give the gateway time to settle instead of immediately
      // repeating a handshake that is likely to be rejected again.
      delay = isEncryptedPacketFailure
        ? Math.max(15_000, Math.min(exponentialDelay, 120_000))
        : Math.max(baseDelay, exponentialDelay);
    }
    // Add jitter so multiple concurrent bots stagger connection handshakes and avoid gateway rate-limiting
    const jitter = Math.floor(Math.random() * 4000);
    delay += jitter;
    const reconnectDescription = isDuplicateLogin
      ? `Server still sees this account logged in; waiting ${Math.ceil(delay / 1000)}s for the old session to clear`
      : isLoginThrottled
      ? /too many requests|http\s*429|\b429\b/i.test(reason)
        ? `Remote service rate-limited this connection; backing off for ${Math.ceil(delay / 1000)}s`
        : `Server login throttle; backing off for ${Math.ceil(delay / 1000)}s`
      : isEncryptedPacketFailure
        ? `Encrypted packet rejected; backing off for ${Math.ceil(delay / 1000)}s before reconnect`
        : isUnexplainedSessionEnd
          ? `Server ended the session without a reason; cooling down for ${Math.ceil(delay / 1000)}s before reconnect`
      : isTransportTimeout
        ? `RakNet endpoint did not reply; retrying in ${Math.ceil(delay / 1000)}s`
        : `Reconnecting in ${Math.ceil(delay / 1000)}s`;
    const reconnectFailureNumber = isDuplicateLogin
      ? this.duplicateLoginCount
      : isLoginThrottled
        ? this.loginThrottleCount
        : this.reconnectFailureCount;
    console.log(chalk.yellow(`[PebbleAFK] ${reconnectDescription} for ${this.config.username} (failure ${reconnectFailureNumber}).`));
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
    if (this.stableRewardInterval) {
      clearInterval(this.stableRewardInterval);
      this.stableRewardInterval = null;
    }
    if (this.stableBalanceInterval) {
      clearInterval(this.stableBalanceInterval);
      this.stableBalanceInterval = null;
    }
    if (this.stablePayoutTimer) {
      clearTimeout(this.stablePayoutTimer);
      this.stablePayoutTimer = null;
    }
    this.balanceCheckRequestedAt = 0;
    this.payoutSequenceActive = false;
    if (this.joinCommandTimer) {
      clearTimeout(this.joinCommandTimer);
      this.joinCommandTimer = null;
    }
    this.cancelSubserverJoinCommand();
    this.joinCommandClient = null;
    this.isSubserverQueueActive = false;
    this.runtimeEntityId = null;
    this.hasSpawnedPosition = false;
  }
}
