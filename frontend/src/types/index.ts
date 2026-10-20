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
}

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

export interface ChatMessage {
  botId: string;
  serverId?: string;
  accountUsername?: string;
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
  type: 'status' | 'connect' | 'spawn' | 'command' | 'survival' | 'anti_afk' | 'disconnect' | 'reconnect' | 'chat' | 'control';
  message: string;
}

export type SocketStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'AUTHENTICATED' | 'AUTH_ERROR';

export interface MsAuthData {
  botId: string;
  userCode: string;
  url: string;
  message: string;
}
