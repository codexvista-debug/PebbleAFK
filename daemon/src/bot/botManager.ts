import chalk from 'chalk';
import { Authflow, Titles } from 'prismarine-auth';
import { BotConfig, ClientMessage, DaemonMessage } from '../types';
import { PebbleBotInstance } from './botInstance';
import { getAndSyncTokenFolder } from './tokenManager';

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

      const xboxRes = await flow.getXboxToken();
      if (verificationId !== this.currentVerificationId) return;

      const userHash = xboxRes?.userHash || '';
      const xuid = (xboxRes as any)?.userXUID || (xboxRes as any)?.xuid || '';
      const gamertag = email || authKey;

      this.broadcastFn({
        type: 'ACCOUNT_VERIFIED',
        payload: {
          botId: accountId,
          email: authKey,
          ign: gamertag,
          uuid: xuid || userHash,
        },
      });
      console.log(chalk.green(`[Auth] Xbox authentication verified for ${gamertag}`));
    } catch (err: any) {
      console.error(chalk.red(`[Auth] Device verification error:`), err.message);
    }
  }
}
