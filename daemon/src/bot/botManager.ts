import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { Authflow, Titles } from 'prismarine-auth';
import { XboxClient } from 'prismarine-xbox-services';
import { BotConfig, ClientMessage, DaemonMessage } from '../types';
import { PebbleBotInstance } from './botInstance';
import { getAndSyncTokenFolder, ensureTokenAliases, backupTokens } from './tokenManager';

export class BotManager {
  private bots: Map<string, PebbleBotInstance> = new Map();
  private broadcastFn: (msg: DaemonMessage) => void;
  private currentVerificationId: number = 0;

  constructor(broadcastFn: (msg: DaemonMessage) => void) {
    this.broadcastFn = broadcastFn;
  }

  public getBot(id: string): PebbleBotInstance | undefined {
    return this.bots.get(id);
  }

  public getAllBots(): PebbleBotInstance[] {
    return Array.from(this.bots.values());
  }

  public startBot(config: BotConfig): PebbleBotInstance {
    let instance = this.bots.get(config.id);
    if (instance) {
      instance.stop();
    }

    instance = new PebbleBotInstance(config, (msg) => this.broadcastFn(msg));
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
      return;
    }

    for (const [bId, instance] of Array.from(this.bots.entries())) {
      if (bId.toLowerCase() === target || instance.config.username.toLowerCase() === target) {
        instance.stop();
        this.bots.delete(bId);
        return;
      }
    }
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
          const cfg = bot.config;
          this.stopBot(msg.payload.botId);
          setTimeout(() => this.startBot(cfg), 1000);
        }
        break;
      }

      case 'SEND_CHAT': {
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
          console.log(chalk.green(`[BotManager] Settings updated for ${bot.config.username}`));
        }
        break;
      }

      case 'VERIFY_ACCOUNT':
        this.verifyAccount(msg.payload.accountId, msg.payload.email);
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
            },
          });
        }
        break;
      }
    }
  }

  public async verifyAccount(accountId: string, email?: string) {
    const verificationId = ++this.currentVerificationId;
    const isNew = !email || email === 'new_account' || email.startsWith('acc_');
    const authKey = isNew ? `bedrock_user_${Date.now()}` : email;
    console.log(chalk.cyan(`[Auth] Initiating Bedrock/Xbox Device Verification for ${authKey}...`));

    try {
      const profilesFolder = getAndSyncTokenFolder();

      // Clean up any stale directory if present
      const staleNewAccFolder = path.join(profilesFolder, 'new_account');
      if (fs.existsSync(staleNewAccFolder)) {
        try { fs.rmSync(staleNewAccFolder, { recursive: true, force: true }); } catch (_) {}
      }

      const options = {
        authTitle: Titles.MinecraftNintendoSwitch,
        deviceType: 'Nintendo',
        flow: 'live' as const,
        forceRefresh: isNew ? true : false,
      };

      const flow = new Authflow(authKey, profilesFolder, options, (data: any) => {
        if (verificationId !== this.currentVerificationId) return;
        console.log(chalk.yellow(`[Auth Code] Xbox Code for ${authKey}: ${data.user_code}`));
        const directUri = data.user_code
          ? `https://www.microsoft.com/link?otc=${encodeURIComponent(data.user_code)}&prompt=login`
          : (data.verification_uri || 'https://www.microsoft.com/link');

        this.broadcastFn({
          type: 'MS_AUTH_CODE',
          payload: {
            botId: accountId,
            userCode: data.user_code,
            url: directUri,
            message: data.message,
          },
        });
      });

      let realGamertag = email && !email.startsWith('bedrock_user_') ? email : '';
      let xuid = '';

      try {
        const xbox = new XboxClient(flow as any);
        const profile = await xbox.getProfile('me');
        if (profile?.gamertag) {
          realGamertag = profile.gamertag;
        }
        if (profile?.xuid) {
          xuid = String(profile.xuid);
        }
      } catch (errProfile: any) {
        console.warn(chalk.yellow(`[Auth] Xbox profile lookup: ${errProfile.message}, fetching token directly...`));
        const xboxRes = await flow.getXboxToken();
        xuid = (xboxRes as any)?.userXUID || (xboxRes as any)?.xuid || '';
        if (!realGamertag) {
          realGamertag = email || authKey;
        }
      }

      if (verificationId !== this.currentVerificationId) {
        console.log(chalk.yellow(`[Auth] Discarding outdated verification result for ${authKey}`));
        return;
      }

      if (!realGamertag) {
        realGamertag = email || authKey;
      }

      // Ensure 90-day rolling token aliases are created
      ensureTokenAliases(profilesFolder, authKey, realGamertag);
      ensureTokenAliases(profilesFolder, realGamertag, authKey);
      backupTokens(profilesFolder);

      this.broadcastFn({
        type: 'ACCOUNT_VERIFIED',
        payload: {
          botId: accountId,
          email: authKey,
          ign: realGamertag,
          uuid: xuid,
        },
      });
      console.log(chalk.green(`[Auth Success] Bedrock/Xbox verified as: ${realGamertag} (XUID: ${xuid})`));
    } catch (err: any) {
      if (verificationId !== this.currentVerificationId) return;
      console.error(chalk.red(`[Auth] Device verification error:`), err.message);
      this.broadcastFn({
        type: 'AUTH_RESULT',
        payload: { success: false, message: err.message || 'Xbox authentication failed' },
      });
    }
  }
}
