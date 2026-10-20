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

export interface BotConfig {
  id: string;
  serverId?: string;
  username: string;
  accountId?: string;
  authType: 'microsoft' | 'offline';
  host: string;
  port: number;
  version?: string;
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

export interface ChatMessagePayload {
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

export interface TelemetryPayload {
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

export interface BedrockFormPayload {
  botId: string;
  formId: number;
  title: string;
  content?: string;
  type: 'form' | 'modal' | 'custom_form';
  buttons?: BedrockFormButton[];
}

export interface ContainerSlot {
  slot: number;
  name: string;
  displayName: string;
  count: number;
  customName?: string;
  lore?: string[];
}

export interface ContainerWindowPayload {
  botId: string;
  windowId: number;
  title: string;
  type: string;
  slotsCount: number;
  slots: (ContainerSlot | null)[];
}

export interface ActivityLog {
  id: string;
  botId: string;
  timestamp: number;
  type: 'status' | 'connect' | 'spawn' | 'command' | 'survival' | 'anti_afk' | 'disconnect' | 'reconnect' | 'chat' | 'control';
  message: string;
}

// Client to Daemon Messages
export type ClientMessage =
  | { type: 'AUTH'; payload: { token: string; username?: string } }
  | { type: 'START_BOT'; payload: BotConfig }
  | { type: 'STOP_BOT'; payload: { botId: string; accountId?: string; username?: string } }
  | { type: 'RESTART_BOT'; payload: { botId: string } }
  | { type: 'SEND_CHAT'; payload: { botId: string; message: string; targetAccount?: string } }
  | { type: 'SUBMIT_FORM'; payload: { botId: string; formId: number; responseData: any } }
  | { type: 'CLOSE_FORM'; payload: { botId: string; formId: number } }
  | { type: 'CLICK_SLOT'; payload: { botId: string; windowId: number; slot: number } }
  | { type: 'UPDATE_SETTINGS'; payload: { botId: string; settings: Partial<BotSettings> } }
  | { type: 'REQUEST_SYNC'; payload?: { botId?: string } }
  | { type: 'VERIFY_ACCOUNT'; payload: { accountId: string; email?: string } }
  | { type: 'PING' };

// Daemon to Client Messages
export type DaemonMessage =
  | { type: 'AUTH_RESULT'; payload: { success: boolean; message?: string } }
  | { type: 'BOT_STATE'; payload: { botId: string; serverId?: string; username?: string; accountId?: string; version?: string; state: BotLifecycleState; reason?: string; connectedAt?: number; uptime?: number } }
  | { type: 'CHAT_MESSAGE'; payload: ChatMessagePayload }
  | { type: 'TELEMETRY'; payload: TelemetryPayload }
  | { type: 'BEDROCK_FORM'; payload: BedrockFormPayload }
  | { type: 'CONTAINER_WINDOW'; payload: ContainerWindowPayload }
  | { type: 'WINDOW_CLOSE'; payload: { botId: string; windowId: number } }
  | { type: 'MS_AUTH_CODE'; payload: { botId: string; userCode: string; url: string; message: string } }
  | { type: 'ACCOUNT_VERIFIED'; payload: { botId: string; email: string; ign: string; uuid?: string } }
  | { type: 'ACTIVITY_LOG'; payload: ActivityLog }
  | { type: 'PONG'; payload: { timestamp: number } }
  | { type: 'SERVER_INFO'; payload: { version: string; activeBots: string[] } };
