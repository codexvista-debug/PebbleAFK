import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import chalk from 'chalk';
import { Authflow, Titles } from 'prismarine-auth';
import { XboxClient } from 'prismarine-xbox-services';
import { BotConfig, ClientMessage, DaemonMessage } from '../types';
import { PebbleBotInstance } from './botInstance';
import { getAndSyncTokenFolder, migrateTokenCache } from './tokenManager';

function describeBedrockVerificationError(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error ?? 'Unknown verification error');
  const isBedrockUnauthorized = /401\s+Unauthorized/i.test(detail) &&
    (/multiplayer\/bedrock\/authentication/i.test(detail) || /UNAUTHORIZED/i.test(detail));

  if (isBedrockUnauthorized) {
    return `Microsoft's Minecraft Bedrock multiplayer-authentication service rejected this account (HTTP 401 / UNAUTHORIZED). This happens before FreshSMP or RakNet is reached. Confirm this exact Microsoft account can sign in to the official Minecraft Bedrock game and join an online multiplayer server; check that it has Minecraft access and that Xbox privacy/family settings allow multiplayer. Signing out of the browser cannot grant game entitlement or multiplayer permission. Provider detail: ${detail}`;
  }

  return `Microsoft account verification failed: ${detail}`;
}

export class BotManager {
  private bots: Map<string, PebbleBotInstance> = new Map();
  private desiredBots: Map<string, BotConfig> = new Map();
  private broadcastFn: (msg: DaemonMessage) => void;
  private currentVerificationId: number = 0;
  private readonly desiredBotsPath = path.join(process.cwd(), '.pebbleafk-bots.json');

  constructor(broadcastFn: (msg: DaemonMessage) => void) {
    this.broadcastFn = broadcastFn;
    this.loadDesiredBots();
  }

  private loadDesiredBots() {
    try {
      if (!fs.existsSync(this.desiredBotsPath)) return;
      const saved = JSON.parse(fs.readFileSync(this.desiredBotsPath, 'utf8'));
      if (!Array.isArray(saved)) return;

      for (const config of saved.slice(0, 100)) {
        if (
          config && typeof config.id === 'string' && config.id &&
          typeof config.username === 'string' && config.username &&
          typeof config.host === 'string' && config.host &&
          Number.isFinite(Number(config.port)) &&
          (config.authType === 'microsoft' || config.authType === 'offline') &&
          config.settings && typeof config.settings === 'object'
        ) {
          this.desiredBots.set(config.id, config as BotConfig);
        }
      }

      if (this.desiredBots.size > 0) {
        const configs = Array.from(this.desiredBots.values());
        console.log(chalk.cyan(`[BotManager] Restoring ${configs.length} active bot${configs.length === 1 ? '' : 's'} after daemon restart...`));
        // Let the daemon listener and tunnel supervisor finish starting, then
        // rehydrate the sessions with the normal per-account handshake spacing.
        setTimeout(() => {
          configs.forEach((config, index) => {
            setTimeout(() => {
              // A user may have stopped an account while the dashboard was
              // reconnecting; do not resurrect a config removed in that gap.
              if (this.desiredBots.has(config.id)) this.startBot(config);
            }, index * 1000);
          });
        }, 1200);
      }
    } catch (error: any) {
      console.warn(chalk.yellow(`[BotManager] Could not restore saved bot sessions: ${error?.message || error}`));
    }
  }

  private persistDesiredBots() {
    const temporaryPath = `${this.desiredBotsPath}.tmp`;
    try {
      fs.writeFileSync(temporaryPath, JSON.stringify(Array.from(this.desiredBots.values())), { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(temporaryPath, this.desiredBotsPath);
      try { fs.chmodSync(this.desiredBotsPath, 0o600); } catch (_) {}
    } catch (error: any) {
      try { if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath); } catch (_) {}
      console.warn(chalk.yellow(`[BotManager] Could not persist active bot sessions: ${error?.message || error}`));
    }
  }

  public clearDesiredBots() {
    this.desiredBots.clear();
    this.persistDesiredBots();
  }

  public getBot(id: string): PebbleBotInstance | undefined {
    return this.bots.get(id);
  }

  public getAllBots(): PebbleBotInstance[] {
    return Array.from(this.bots.values());
  }

  public startBot(config: BotConfig): PebbleBotInstance {
    const cleanUser = (config.username || '').toLowerCase().trim();

    // 1. Ensure any existing bot with the same ID OR the same Minecraft username is terminated first
    for (const [bId, existing] of Array.from(this.bots.entries())) {
      const existingUser = (existing.config?.username || '').toLowerCase().trim();
      if (bId === config.id || (cleanUser && existingUser === cleanUser)) {
        console.log(chalk.yellow(`[BotManager] Stopping existing instance of ${existing.config.username} (${bId}) before starting new session`));
        existing.stop();
        this.bots.delete(bId);
        this.desiredBots.delete(bId);
      }
    }

    this.desiredBots.set(config.id, { ...config, settings: { ...config.settings } });
    this.persistDesiredBots();
    const instance = new PebbleBotInstance(config, (msg) => this.broadcastFn(msg));
    this.bots.set(config.id, instance);
    instance.start();
    return instance;
  }

  public stopBot(idOrName: string) {
    if (!idOrName) return;
    const target = idOrName.toLowerCase();

    const directBot = this.bots.get(idOrName);
    if (directBot) {
      directBot.stop();
      this.bots.delete(idOrName);
      this.desiredBots.delete(idOrName);
      this.persistDesiredBots();
      return;
    }

    for (const [bId, instance] of Array.from(this.bots.entries())) {
      if (bId.toLowerCase() === target || instance.config.username.toLowerCase() === target) {
        instance.stop();
        this.bots.delete(bId);
        this.desiredBots.delete(bId);
        this.persistDesiredBots();
        return;
      }
    }

    // Also cancel a session that is queued for restoration but has not started
    // yet, or remove it if the daemon recovered before the dashboard reconnects.
    let removedDesiredBot = false;
    for (const [botId, config] of Array.from(this.desiredBots.entries())) {
      if (botId.toLowerCase() === target || config.username.toLowerCase() === target) {
        this.desiredBots.delete(botId);
        removedDesiredBot = true;
      }
    }
    if (removedDesiredBot) this.persistDesiredBots();
  }

  public handleClientMessage(msg: ClientMessage) {
    switch (msg.type) {
      case 'START_BOT':
        console.log(chalk.cyan(`[BotManager] Starting Bedrock bot: ${msg.payload.username} (${msg.payload.id})`));
        this.startBot(msg.payload);
        break;

      case 'STOP_BOT':
        console.log(chalk.yellow(`[BotManager] Stopping Bedrock bot: ${msg.payload.botId}`));
        this.stopBot(msg.payload.botId);
        break;

      case 'RESTART_BOT': {
        const bot = this.getBot(msg.payload.botId);
        if (bot) {
          const cfg = { ...bot.config, settings: { ...bot.config.settings } };
          bot.stop();
          this.bots.delete(msg.payload.botId);
          this.desiredBots.set(msg.payload.botId, cfg);
          this.persistDesiredBots();
          setTimeout(() => this.startBot(cfg), 1000);
        }
        break;
      }

      case 'SEND_CHAT': {
        if (msg.payload.botId === '__ALL__' || msg.payload.botId === 'all') {
          console.log(chalk.cyan(`[BotManager] Broadcasting chat to all active bots: ${msg.payload.message}`));
          this.getAllBots().forEach((bot, idx) => {
            setTimeout(() => {
              bot.sendChat(msg.payload.message);
            }, idx * 150);
          });
          break;
        }
        const bot = this.getBot(msg.payload.botId);
        if (bot) {
          bot.sendChat(msg.payload.message);
        } else {
          console.warn(chalk.yellow(`[BotManager] Chat target bot not found: ${msg.payload.botId}`));
        }
        break;
      }

      case 'SUBMIT_FORM': {
        const bot = this.getBot(msg.payload.botId);
        if (bot) {
          bot.submitForm(msg.payload.formId, msg.payload.responseData);
        }
        break;
      }

      case 'CLOSE_FORM': {
        const bot = this.getBot(msg.payload.botId);
        if (bot) {
          bot.closeForm(msg.payload.formId);
        }
        break;
      }

      case 'UPDATE_SETTINGS': {
        const bot = this.getBot(msg.payload.botId);
        if (bot) {
          bot.config.settings = { ...bot.config.settings, ...msg.payload.settings };
          this.desiredBots.set(msg.payload.botId, { ...bot.config, settings: { ...bot.config.settings } });
          this.persistDesiredBots();
          console.log(chalk.green(`[BotManager] Settings updated for ${bot.config.username}`));
        }
        break;
      }

      case 'VERIFY_ACCOUNT':
        this.verifyAccount(msg.payload.accountId, msg.payload.email, msg.payload.authCacheKey);
        break;

      case 'REQUEST_SYNC': {
        for (const [botId, instance] of Array.from(this.bots.entries())) {
          this.broadcastFn({
            type: 'BOT_STATE',
            payload: {
              botId,
              serverId: instance.config.serverId,
              username: instance.config.username,
              accountId: instance.config.accountId,
              version: instance.config.version,
              state: instance.state,
              host: instance.config.host,
              port: instance.config.port,
            },
          });

          const freshSmpDiagnostics = instance.getFreshSmpDiagnostics();
          if (freshSmpDiagnostics) {
            this.broadcastFn({ type: 'FRESHSMP_DIAGNOSTICS', payload: freshSmpDiagnostics });
          }

          const bossBar = instance.getBossBar();
          this.broadcastFn({
            type: 'BOSS_BAR',
            payload: bossBar || {
              botId,
              serverId: instance.config.serverId,
              accountUsername: instance.config.username,
              visible: false,
            },
          });

          // Sync buffered chat history for this bot so dashboard chat loads immediately
          if (instance.chatHistory && instance.chatHistory.length > 0) {
            for (const chatMsg of instance.chatHistory) {
              this.broadcastFn({
                type: 'CHAT_MESSAGE',
                payload: chatMsg,
              });
            }
          }
        }
        break;
      }
    }
  }

  public async verifyAccount(accountId: string, email?: string, stableAuthCacheKey?: string) {
    const verificationId = ++this.currentVerificationId;
    const cleanEmail = email?.trim().toLowerCase();
    const cleanStableKey = stableAuthCacheKey?.trim();
    const isNew = !cleanStableKey && (!cleanEmail || cleanEmail === 'new_account' || cleanEmail.startsWith('acc_') || cleanEmail.startsWith('bedrock_user_'));
    const authKey = cleanStableKey || (isNew ? `bedrock_user_${Date.now()}` : cleanEmail!);
    const loginHint = cleanEmail?.includes('@') ? cleanEmail : undefined;
    console.log(chalk.cyan(`[Auth] Initiating Bedrock/Xbox Device Verification for ${authKey}...`));

    try {
      const profilesFolder = getAndSyncTokenFolder();

      const options = {
        authTitle: Titles.MinecraftNintendoSwitch,
        deviceType: 'Nintendo',
        flow: 'live' as const,
      };

      const flow = new Authflow(authKey, profilesFolder, options, (data: any) => {
        if (verificationId !== this.currentVerificationId) return;
        console.log(chalk.yellow(`[Auth Code] Xbox Code for ${authKey}: ${data.user_code}`));
        const directUri = data.user_code
          ? `https://login.live.com/oauth20_remoteconnect.srf?otc=${encodeURIComponent(data.user_code)}${loginHint ? `&login_hint=${encodeURIComponent(loginHint)}` : ''}&prompt=login`
          : (data.verification_uri || 'https://login.live.com/oauth20_remoteconnect.srf');

        this.broadcastFn({
          type: 'MS_AUTH_CODE',
          payload: {
            botId: accountId,
            userCode: data.user_code,
            url: directUri,
            message: data.message,
            targetEmail: loginHint,
          },
        });
      });

      let realGamertag = '';
      let xuid = '';
      let xboxAvatarUrl = '';

      // 1. Primary: Generate EC key pair and retrieve Minecraft Bedrock authentication chain
      console.log(chalk.cyan(`[Auth] Requesting Bedrock token chain...`));
      const keyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'secp384r1' });
      const clientX509 = keyPair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
      let chain: string[];
      try {
        chain = await (flow as any).getMinecraftBedrockChain(clientX509);
      } catch (errBedrock: any) {
        // An Xbox profile alone is not proof that the account can authenticate
        // with Minecraft Bedrock. Fail closed instead of creating a bot that
        // will repeatedly fail its Bedrock login later.
        throw new Error(describeBedrockVerificationError(errBedrock));
      }

      if (!Array.isArray(chain) || chain.length < 2 || typeof chain[1] !== 'string') {
        throw new Error('Microsoft sign-in completed, but did not return a valid Minecraft Bedrock authentication chain. Confirm this account can sign in to Minecraft Bedrock and try again.');
      }

      try {
        const jwt = chain[1];
        const payloadStr = Buffer.from(jwt.split('.')[1], 'base64').toString('utf8');
        const bedrockPayload = JSON.parse(payloadStr);
        if (bedrockPayload?.extraData?.displayName) {
          realGamertag = bedrockPayload.extraData.displayName;
          console.log(chalk.green(`[Auth] Retrieved Bedrock Gamertag: ${realGamertag}`));
        }
        if (bedrockPayload?.extraData?.XUID) {
          xuid = String(bedrockPayload.extraData.XUID);
        }
      } catch (errPayload: any) {
        throw new Error(`Microsoft returned a Bedrock token chain that PebbleAFK could not read: ${errPayload?.message || String(errPayload)}`);
      }

      // 2. Secondary: Query official Xbox Live profile REST endpoint for Gamertag and Gamerpic
      try {
        console.log(chalk.cyan(`[Auth] Querying Xbox Live profile settings...`));
        const xbl = await flow.getXboxToken('http://xboxlive.com');
        const res = await fetch('https://profile.xboxlive.com/users/me/settings?settings=Gamertag,GameDisplayName,GameDisplayPicRaw', {
          headers: {
            Authorization: `XBL3.0 x=${xbl.userHash};${xbl.XSTSToken}`,
            'x-xbl-contract-version': '2',
            'accept-language': 'en-US'
          }
        });
        if (res.ok) {
          const profileData: any = await res.json();
          const settings = Object.fromEntries((profileData.profileUsers?.[0]?.settings || []).map((s: any) => [s.id, s.value]));
          if (settings.Gamertag && !realGamertag) {
            realGamertag = settings.Gamertag;
            console.log(chalk.green(`[Auth] Retrieved Xbox Gamertag: ${realGamertag}`));
          }
          if (settings.GameDisplayPicRaw) {
            xboxAvatarUrl = settings.GameDisplayPicRaw;
          }
          if (profileData.profileUsers?.[0]?.id && !xuid) {
            xuid = String(profileData.profileUsers[0].id);
          }
        } else {
          console.warn(chalk.yellow(`[Auth] Xbox Profile HTTP ${res.status}: ${res.statusText}`));
        }
      } catch (errXbox: any) {
        console.warn(chalk.yellow(`[Auth] Xbox profile lookup note: ${errXbox.message}`));
      }

      // 3. Fallback: Query Xbox User XUID directly if needed
      if (!realGamertag) {
        try {
          const xboxRes = await flow.getXboxToken();
          xuid = xuid || (xboxRes as any)?.userXUID || (xboxRes as any)?.xuid || '';
        } catch (_) {}
      }

      // Ensure Xbox gamerpic fallback for Bedrock
      if (!xboxAvatarUrl && realGamertag) {
        xboxAvatarUrl = `https://avatar-ssl.xboxlive.com/avatar/${encodeURIComponent(realGamertag)}/avatarpic-l.png`;
      }

      if (verificationId !== this.currentVerificationId) {
        console.log(chalk.yellow(`[Auth] Discarding outdated verification result for ${authKey}`));
        return;
      }

      if (!realGamertag || realGamertag.startsWith('bedrock_user_')) {
        throw new Error('Could not retrieve your official Xbox Gamertag. Please make sure your Microsoft account has an Xbox Live profile.');
      }

      // Store this session under the stable Xbox identity. The gamertag/email
      // cache can still be used as a migration source for accounts created by
      // older releases, but it is never selected by guessing other accounts.
      const canonicalAuthKey = xuid ? `xuid_${xuid}` : realGamertag;
      if (canonicalAuthKey && canonicalAuthKey !== authKey) {
        migrateTokenCache(profilesFolder, authKey, canonicalAuthKey, true);
      }

      this.broadcastFn({
        type: 'ACCOUNT_VERIFIED',
        payload: {
          botId: accountId,
          email: cleanEmail || authKey,
          ign: realGamertag,
          uuid: xuid,
          avatarUrl: xboxAvatarUrl,
        },
      });
      console.log(chalk.green(`[Auth Success] Bedrock/Xbox verified as: ${realGamertag} (XUID: ${xuid})`));
    } catch (err: any) {
      if (verificationId !== this.currentVerificationId) return;
      console.error(chalk.red(`[Auth] Device verification error:`), err.message);
      this.broadcastFn({
        type: 'ACCOUNT_VERIFY_RESULT',
        payload: { accountId, success: false, message: err.message || 'Microsoft account verification failed' },
      });
    }
  }
}
