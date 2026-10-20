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
      // Default to verified stable release (1.21.50) so production SMP servers don't drop packets
      return { versions: opts.Versions, currentVersion: '1.21.50' };
    }
  } catch (_) {}
  return { versions: { '1.21.50': 766, '1.26.51': 2193 }, currentVersion: '1.21.50' };
}

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

  // Known server auto-resolutions
  if (cleanHost.includes('freshsmp')) {
    return { version: '1.21.50', isFallback: false, note: 'Auto-detected FreshSMP Bedrock protocol (1.21.50)' };
  }
  if (cleanHost.includes('donutsmp')) {
    return { version: '1.26.51', isFallback: false, note: 'Auto-detected DonutSMP Bedrock protocol (1.26.51)' };
  }

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

  return {
    version: currentVersion,
    isFallback: false,
    note: `Using stable Minecraft Bedrock protocol (${currentVersion})`,
  };
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
  private antiAfkInterval: NodeJS.Timeout | null = null;
  private telemetryInterval: NodeJS.Timeout | null = null;
  private isExplicitlyStopped: boolean = false;
  private clientTick: bigint = 0n;
  private autoVersionOverride: string | null = null;

  // Telemetry cache
  private position = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
  private health: number = 20;
  private maxHealth: number = 20;
  private food: number = 20;
  private saturation: number = 5;

  constructor(config: BotConfig, broadcastFn: (msg: DaemonMessage) => void) {
    this.config = config;
    this.broadcastFn = broadcastFn;
  }

  public async start() {
    this.isExplicitlyStopped = false;
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
      const targetVersion = this.autoVersionOverride || resolved.version;

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

      this.applyFastPath(client);
      client.once('connect_allowed', () => this.applyFastPath(client));

      // Overcome Bedrock's resource pack handshake requirement
      let initialPackOfferHandled = false;
      const writePacket = client.write.bind(client);
      client.write = (packetName: string, params: any) => {
        if (
          packetName === 'resource_pack_client_response' &&
          params?.response_status === 'completed' &&
          !initialPackOfferHandled
        ) {
          initialPackOfferHandled = true;
          this.logActivity('status', 'Accepted Bedrock resource pack offer (headless client mode).');
          return writePacket(packetName, {
            ...params,
            response_status: 'have_all_packs',
            response_status_name: 'downloadingfinished',
          });
        }
        return writePacket(packetName, params);
      };

      client.on('resource_packs_info', () => {
        initialPackOfferHandled = false;
      });

      // Session event: Microsoft/Xbox authentication finished
      client.once('session', () => {
        this.applyFastPath(client);
        console.log(chalk.green(`[PebbleAFK] Bedrock session established for ${this.config.username}`));
        this.logActivity('connect', 'Microsoft/Xbox authentication verified; joining game server...');
      });

      // Join event: Server accepted player connection
      client.on('join', () => {
        this.applyFastPath(client);
        this.connectStartTime = Date.now();
        this.updateState('LOGGED_IN');
        this.logActivity('connect', `Successfully joined Bedrock server ${this.config.host}:${this.config.port}`);
        this.handleSystemMessage(`Connected to ${this.config.host}:${this.config.port}`);
      });

      // Spawn event: Player loaded into the world
      client.on('spawn', () => {
        this.applyFastPath(client);
        if (!this.connectStartTime) this.connectStartTime = Date.now();
        this.updateState('SPAWNED');
        this.logActivity('spawn', '🌍 Spawned into Bedrock world!');
        this.handleSystemMessage(`🌍 Spawned into world as @${this.config.username}`);

        // Start tick_sync heartbeat to prevent timeout disconnects
        if (this.tickSyncInterval) clearInterval(this.tickSyncInterval);
        this.clientTick = 0n;
        this.tickSyncInterval = setInterval(() => {
          if (this.client !== client || this.state !== 'SPAWNED') return;
          try {
            client.write('tick_sync', { request_time: this.clientTick, response_time: 0n });
            this.clientTick += 10n;
          } catch (_) {}
        }, 500);

        client.on('tick_sync', (packet: any) => {
          if (packet?.response_time) {
            this.clientTick = BigInt(packet.response_time);
          }
        });

        this.setupTelemetry();
        this.setupAntiAfk();
      });

      // Start Game packet: captures spawn coordinates & world info
      client.on('start_game', (packet: any) => {
        if (packet?.player_position) {
          this.position = {
            x: Math.round(packet.player_position.x * 10) / 10,
            y: Math.round(packet.player_position.y * 10) / 10,
            z: Math.round(packet.player_position.z * 10) / 10,
            yaw: Math.round((packet.rotation?.z ?? 0) * 10) / 10,
            pitch: Math.round((packet.rotation?.x ?? 0) * 10) / 10,
          };
          this.emitTelemetry();
        }
      });

      // Move Player packet: updates bot position
      client.on('move_player', (packet: any) => {
        if (packet?.position) {
          this.position.x = Math.round(packet.position.x * 10) / 10;
          this.position.y = Math.round(packet.position.y * 10) / 10;
          this.position.z = Math.round(packet.position.z * 10) / 10;
          if (packet.yaw !== undefined) this.position.yaw = Math.round(packet.yaw * 10) / 10;
          if (packet.pitch !== undefined) this.position.pitch = Math.round(packet.pitch * 10) / 10;
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

      // Disconnect event
      client.on('disconnect', (packet: any) => {
        const reason = packet?.message || packet?.reason || 'Disconnected from server';
        console.log(chalk.red(`[PebbleAFK] Bot ${this.config.username} disconnected: ${reason}`));

        // Auto-detect version requirement if server reports client is outdated
        const versionMatch = reason.match(/(?:supports|requires|versions?:?)[\s:]*([0-9.]+)/i);
        if (versionMatch && versionMatch[1]) {
          let reqVer = versionMatch[1];
          if (reqVer.startsWith('26.')) reqVer = `1.${reqVer}`;
          this.autoVersionOverride = reqVer;
          console.log(chalk.yellow(`[PebbleAFK] Server requested Bedrock version ${reqVer}. Auto-adjusting target version...`));
          this.logActivity('status', `🔄 Server requested version ${reqVer}. Auto-adjusting target version...`);
        }

        this.logActivity('disconnect', `Disconnected: ${reason}`);
        this.cleanup();
        this.updateState('KICKED', reason);
        this.handleAutoReconnect();
      });

      // Error event
      client.on('error', (err: any) => {
        const errMsg = err?.message || String(err);
        console.log(chalk.red(`[PebbleAFK] Bot ${this.config.username} error: ${errMsg}`));
        let descriptiveReason = errMsg;
        if (errMsg.includes('Connect timed out') || errMsg.includes('timed out')) {
          if (isAutoVersion) {
            // If connection timed out on auto, try alternating between 1.21.50 and 1.21.30
            this.autoVersionOverride = this.autoVersionOverride === '1.21.30' ? '1.21.50' : '1.21.30';
          }
          descriptiveReason = `Connect timed out: ${cleanHost}:${cleanPort} sent no reply to RakNet UDP packets. (Server Bedrock gateway is offline or dropping UDP traffic).`;
        }
        this.logActivity('error', descriptiveReason);
        this.cleanup();
        this.updateState('ERROR', descriptiveReason);
        this.handleAutoReconnect();
      });

      // Close event
      client.on('close', () => {
        if (this.state !== 'DISCONNECTED' && this.state !== 'KICKED' && this.state !== 'ERROR') {
          this.cleanup();
          this.updateState('DISCONNECTED', 'Connection closed');
          this.handleAutoReconnect();
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
      this.applyFastPath(this.client);
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

  private setupAntiAfk() {
    if (this.antiAfkInterval) clearInterval(this.antiAfkInterval);
    if (!this.config.settings?.antiAfk) return;

    const intervalSec = Math.max(5, this.config.settings.antiAfkInterval || 10);
    let step = 0;

    this.antiAfkInterval = setInterval(() => {
      if (!this.client || this.state !== 'SPAWNED') return;
      try {
        step++;
        // Subtle yaw perturbation
        const deltaYaw = (step % 2 === 0 ? 5 : -5);
        this.position.yaw = (this.position.yaw + deltaYaw) % 360;

        // Bedrock animate swing
        this.client.write('animate', {
          action_id: 1, // Swing arm
          runtime_entity_id: this.client.entityId || 1n,
        });
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
    if (this.chatHistory.length > 150) {
      this.chatHistory.shift();
    }
    this.broadcastFn({
      type: 'CHAT_MESSAGE',
      payload: chatMsg,
    });
  }

  public handleSystemMessage(text: string) {
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

    // Clean section signs (§) for clean readable text
    let cleanSender = sender.replace(/§[0-9a-fk-or]/gi, '').trim();
    let cleanText = (rawMsg || '').replace(/§[0-9a-fk-or]/gi, '').trim();

    if (!cleanText) return;

    // Pattern recognition: extract player sender if embedded in message (e.g., "<Player> Hi" or "[Rank] Player: Hi" or "Player » Hi")
    if (!cleanSender || cleanSender === 'Server' || cleanSender === 'System') {
      const matchBracket = cleanText.match(/^<([a-zA-Z0-9_]{3,16})>\s*(.*)$/);
      const matchColon = cleanText.match(/^(?:\[[^\]]+\]\s*)*([a-zA-Z0-9_]{3,16})\s*[:»>]\s*(.*)$/);

      if (matchBracket) {
        cleanSender = matchBracket[1];
        cleanText = matchBracket[2];
        isSystem = false;
      } else if (matchColon) {
        cleanSender = matchColon[1];
        cleanText = matchColon[2];
        isSystem = false;
      }
    }

    if (!cleanSender) {
      cleanSender = isSystem ? 'System' : 'Server';
    }

    this.pushChat({
      botId: this.config.id,
      serverId: this.config.serverId,
      accountUsername: this.config.username,
      id: randomUUID(),
      timestamp: Date.now(),
      raw: rawMsg,
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
        console.log(chalk.cyan(`[PebbleAFK] Executing auto-reconnect for ${this.config.username}...`));
        this.start();
      }
    }, delay);
  }

  private applyFastPath(client: any) {
    if (!client) return;
    try {
      if (!client._immediateSendPatched) {
        client._immediateSendPatched = true;
        const origSendMCPE = client.sendMCPE?.bind(client);
        if (origSendMCPE) {
          client.sendMCPE = (buffer: any, immediate?: boolean) => {
            return origSendMCPE(buffer, true);
          };
        }
      }

      if (!client._encryptedImmediatePatched) {
        client._encryptedImmediatePatched = true;
        const origOnEncrypted = client.onEncryptedPacket;
        if (typeof origOnEncrypted === 'function') {
          client.onEncryptedPacket = (buf: any) => {
            const packet = client.batchHeader ? Buffer.concat([Buffer.from([client.batchHeader]), buf]) : buf;
            client.sendMCPE(packet, true);
          };
          if (client.cipher) {
            client.cipher.removeListener('data', origOnEncrypted);
            client.cipher.on('data', client.onEncryptedPacket);
          }
        }
      }

      const conn = client.connection;
      if (conn && !conn._immediateSendReliablePatched) {
        conn._immediateSendReliablePatched = true;
        if (typeof conn.sendReliable === 'function') {
          const origSend = conn.sendReliable.bind(conn);
          conn.sendReliable = (buffer: any, immediate?: boolean) => {
            return origSend(buffer, true);
          };
        }
        if (typeof conn.plainSendReliable === 'function') {
          const origPlain = conn.plainSendReliable.bind(conn);
          conn.plainSendReliable = (buffer: any, immediate?: boolean) => {
            const res = origPlain(buffer, true);
            try { conn.raknet?.connection?.sendQueue(); } catch (_) {}
            return res;
          };
        }
      }

      const rakClient = conn?.raknet;
      const innerConn = rakClient?.connection;
      if (innerConn && !innerConn._fastQueuePatched) {
        innerConn._fastQueuePatched = true;

        const origAdd = innerConn.addEncapsulatedToQueue?.bind(innerConn);
        if (origAdd) {
          innerConn.addEncapsulatedToQueue = function (pk: any, flags: any) {
            const res = origAdd(pk, flags);
            try { innerConn.sendQueue(); } catch (_) {}
            return res;
          };
        }

        const origUpdate = innerConn.update?.bind(innerConn);
        if (origUpdate) {
          innerConn.update = function (timestamp: number) {
            while (innerConn.recvQueue && innerConn.recvQueue.length > 0) {
              const chunk = innerConn.recvQueue.splice(0, 32);
              for (const msg of chunk) {
                try { innerConn.receiveOnline(msg); } catch (_) {}
              }
            }
            return origUpdate(timestamp);
          };
        }
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
  }
}
