export interface BotSettings {
  physics: boolean;
  acceptResourcePacks: boolean;
  autoEat: boolean;
  autoTotem: boolean;
  antiAfk: boolean;
  antiAfkInterval: number;
  mobFarm: boolean;
  mobFarmRange: number;
  mobFarmIntervalMs: number;
  autoReconnect: boolean;
  autoReconnectDelay: number;
  joinDelay?: number;
  joinCommandEnabled?: boolean;
  joinCommand?: string;
  joinCommandDelay?: number;
}

/** Defaults applied to newly created server profiles. FreshSMP profiles also
 * enable the server-specific /lifesteal command via the preset below. */
export const DEFAULT_BOT_SETTINGS: BotSettings = {
  physics: true,
  acceptResourcePacks: true,
  autoEat: false,
  autoTotem: false,
  antiAfk: true,
  antiAfkInterval: 10,
  mobFarm: false,
  mobFarmRange: 3.5,
  mobFarmIntervalMs: 650,
  autoReconnect: true,
  autoReconnectDelay: 5000,
  joinDelay: 0,
  joinCommandEnabled: false,
  joinCommand: '',
  joinCommandDelay: 3,
};

export const FRESHSMP_DEFAULT_BOT_SETTINGS: BotSettings = {
  ...DEFAULT_BOT_SETTINGS,
  physics: true,
  acceptResourcePacks: true,
  joinCommandEnabled: true,
  joinCommand: '/lifesteal',
  joinCommandDelay: 10,
};

export const MAX_BEDROCK_ACCOUNTS = 50;

export interface BedrockAccount {
  id: string;
  username: string;
  auth_type: 'microsoft' | 'offline';
  ign?: string;
  uuid?: string;
  verified: boolean;
  addedAt: number;
  authError?: string;
  expectedIgn?: string;
  avatarUrl?: string;
  settings?: Record<string, any>;
}

export type Account = BedrockAccount;

export interface ServerProfile {
  id: string;
  name: string;
  pebbleUser?: string | null;
  accountId: string;
  assignedAccountIds?: string[];
  serverHost: string;
  serverPort: number;
  serverVersion: string;
  authType?: 'offline' | 'microsoft';
  autoReconnect: boolean;
  settings: BotSettings;
}

export type BotLifecycleState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'LOGGED_IN'
  | 'SPAWNED'
  | 'RECONNECTING'
  | 'KICKED'
  | 'ERROR';

export type FreshSmpDiagnosticPhase = 'offline' | 'connecting' | 'lobby' | 'queue' | 'lifesteal' | 'reconnecting';
export interface FreshSmpDiagnosticEvent {
  id: string;
  timestamp: number;
  category: 'connection' | 'resource_pack' | 'queue' | 'subserver' | 'protocol';
  severity: 'info' | 'success' | 'warning' | 'error';
  message: string;
  durationMs?: number;
}
export interface FreshSmpDiagnosticState {
  botId: string;
  serverId?: string;
  accountId?: string;
  username: string;
  phase: FreshSmpDiagnosticPhase;
  phaseSince: number;
  lifestealAttemptStartedAt?: number;
  lifestealSessionStartedAt?: number;
  events: FreshSmpDiagnosticEvent[];
}

export interface ChatMessage {
  botId: string;
  serverId?: string;
  accountUsername?: string;
  /** Accounts that received the same event when viewing several bots together. */
  sourceAccountIds?: string[];
  id: string;
  timestamp: number;
  raw: string;
  formattedText: string;
  sender?: string;
  type: 'chat' | 'system' | 'session_divider' | 'death' | 'error';
}

export interface Telemetry {
  botId: string;
  serverId?: string;
  accountUsername?: string;
  connectedAt?: number;
  version?: string;
  health: number;
  maxHealth: number;
  food: number;
  saturation: number;
  position: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
  };
  dimension: string;
  gamemode: string;
  ping: number;
  uptime: number;
  facing?: string;
  yaw?: number;
  pitch?: number;
}

export interface BossBar {
  botId: string;
  serverId?: string;
  accountUsername?: string;
  visible: boolean;
  title?: string;
  progress?: number;
}

export interface BedrockFormButton {
  text: string;
  image?: { type: 'path' | 'url'; data: string };
}

export interface BedrockForm {
  botId: string;
  formId: number;
  title: string;
  content?: string;
  type: 'form' | 'modal' | 'custom_form';
  buttons?: BedrockFormButton[];
}

export interface ActivityLog {
  id: string;
  botId: string;
  timestamp: number;
  type: 'status' | 'connect' | 'spawn' | 'command' | 'survival' | 'anti_afk' | 'disconnect' | 'reconnect' | 'chat' | 'control' | 'warning';
  message: string;
}

export type PlayerLogType =
  | 'connecting'
  | 'handshake'
  | 'connected'
  | 'spawned'
  | 'kicked'
  | 'error'
  | 'disconnected'
  | 'reconnecting'
  | 'chat'
  | 'warning'
  | 'info';

export interface PlayerLogEntry {
  id: string;
  accountName: string;
  serverHost: string;
  timestamp: number;
  type: PlayerLogType;
  message: string;
  details?: string;
  status: 'info' | 'success' | 'warning' | 'error';
}

export type SocketStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'AUTHENTICATED' | 'AUTH_ERROR';

export interface MsAuthData {
  botId: string;
  userCode: string;
  url: string;
  message: string;
  targetEmail?: string;
}
