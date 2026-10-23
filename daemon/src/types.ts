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
  subserverJoinCommandEnabled?: boolean;
  subserverJoinCommand?: string;
  subserverJoinCommandDelay?: number;
  freshSmpHourlyCommandEnabled?: boolean;
  freshSmpHourlyCommand?: string;
  freshSmpBalancePayEnabled?: boolean;
  freshSmpBalancePayUsername?: string;
}

export interface BotConfig {
  id: string;
  serverId?: string;
  username: string;
  accountId?: string;
  authCacheKey?: string;
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

export interface BossBarPayload {
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
  type: 'status' | 'connect' | 'spawn' | 'command' | 'survival' | 'anti_afk' | 'disconnect' | 'reconnect' | 'chat' | 'control' | 'warning';
  message: string;
}

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

// Client to Daemon Messages
export type ClientMessage =
  | { type: 'AUTH'; payload: { token: string; username?: string; sessionId?: string; deviceLabel?: string } }
  | { type: 'DISCONNECT_DEVICE_SESSION'; payload: { sessionId: string } }
  | { type: 'START_BOT'; payload: BotConfig }
  | { type: 'STOP_BOT'; payload: { botId: string; accountId?: string; username?: string } }
  | { type: 'RESTART_BOT'; payload: { botId: string } }
  | { type: 'SEND_CHAT'; payload: { botId: string; message: string; targetAccount?: string } }
  | { type: 'SUBMIT_FORM'; payload: { botId: string; formId: number; responseData: any } }
  | { type: 'CLOSE_FORM'; payload: { botId: string; formId: number } }
  | { type: 'CLICK_SLOT'; payload: { botId: string; windowId: number; slot: number } }
  | { type: 'UPDATE_SETTINGS'; payload: { botId: string; settings: Partial<BotSettings> } }
  | { type: 'REQUEST_SYNC'; payload?: { botId?: string } }
  | { type: 'VERIFY_ACCOUNT'; payload: { accountId: string; email?: string; authCacheKey?: string } }
  | { type: 'UPDATE_DAEMON'; payload?: { reason?: string } }
  | { type: 'RESTART_DAEMON'; payload?: { reason?: string } }
  | { type: 'SHUTDOWN_DAEMON' }
  | { type: 'GET_TERMINAL_LOGS' }
  | { type: 'PING' };

// Daemon to Client Messages
export type DaemonMessage =
  | { type: 'AUTH_RESULT'; payload: { success: boolean; message?: string } }
  | { type: 'DEVICE_SESSIONS'; payload: { sessions: { sessionId: string; label: string; userAgent: string; ip: string; connectedAt: number; lastSeenAt: number; connected: boolean }[] } }
  | { type: 'DEVICE_SESSION_REMOVED'; payload: { sessionId: string; message: string } }
  | { type: 'BOT_STATE'; payload: { botId: string; serverId?: string; username?: string; accountId?: string; version?: string; state: BotLifecycleState; reason?: string; connectedAt?: number; uptime?: number; host?: string; port?: number } }
  | { type: 'CHAT_MESSAGE'; payload: ChatMessagePayload }
  | { type: 'TELEMETRY'; payload: TelemetryPayload }
  | { type: 'BOSS_BAR'; payload: BossBarPayload }
  | { type: 'BEDROCK_FORM'; payload: BedrockFormPayload }
  | { type: 'CONTAINER_WINDOW'; payload: ContainerWindowPayload }
  | { type: 'WINDOW_CLOSE'; payload: { botId: string; windowId: number } }
  | { type: 'MS_AUTH_CODE'; payload: { botId: string; userCode: string; url: string; message: string; targetEmail?: string } }
  | { type: 'ACCOUNT_VERIFY_RESULT'; payload: { accountId: string; success: boolean; message?: string } }
  | { type: 'ACCOUNT_VERIFIED'; payload: { botId: string; email: string; ign: string; uuid?: string; avatarUrl?: string } }
  | { type: 'ACTIVITY_LOG'; payload: ActivityLog }
  | { type: 'FRESHSMP_DIAGNOSTICS'; payload: FreshSmpDiagnosticState }
  | { type: 'PONG'; payload: { timestamp: number } }
  | { type: 'SERVER_INFO'; payload: { version: string; activeBots: string[] } }
  | { type: 'TERMINAL_LOGS'; payload: { logs: string[]; timestamp: number } }
  | { type: 'TERMINAL_LOG_LINE'; payload: { line: string; timestamp: number } };
