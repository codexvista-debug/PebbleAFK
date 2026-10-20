import { supabase } from './supabaseClient';
import { BedrockAccount, ServerProfile, PlayerLogEntry } from '@/types';

/**
 * Universal Server Profiles Sync:
 * Saves server profiles centrally in Supabase under a metadata row '__meta_servers__',
 * ensuring all devices always see the exact same server profiles.
 */
export async function saveServersToSupabase(currentUser: string, servers: ServerProfile[]) {
  if (!supabase || !currentUser) return;
  try {
    const cleanUser = currentUser.trim();

    const { data: existing } = await supabase
      .from('accounts')
      .select('id')
      .ilike('username', cleanUser)
      .eq('bot_name', '__meta_servers__')
      .limit(1);

    const payload = {
      servers,
      updatedAt: Date.now(),
    };

    if (existing && existing.length > 0) {
      await supabase
        .from('accounts')
        .update({
          settings: payload,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing[0].id);
    } else {
      await supabase.from('accounts').insert([
        {
          username: cleanUser,
          bot_name: '__meta_servers__',
          server_host: 'pebbleafk.internal',
          server_port: 19132,
          settings: payload,
        },
      ]);
    }
  } catch (err) {
    console.warn('Failed to save servers to Supabase:', err);
  }
}

/**
 * Universal Server Profiles Loader:
 * Fetches centrally configured server profiles for the user from Supabase.
 */
export async function loadServersFromSupabase(currentUser: string): Promise<ServerProfile[] | null> {
  if (!supabase || !currentUser) return null;
  try {
    const cleanUser = currentUser.trim();
    const { data, error } = await supabase
      .from('accounts')
      .select('settings')
      .ilike('username', cleanUser)
      .eq('bot_name', '__meta_servers__')
      .limit(1);

    if (error || !data || data.length === 0) return null;
    const servers = data[0]?.settings?.servers;
    if (Array.isArray(servers)) {
      return servers;
    }
    return null;
  } catch (err) {
    console.warn('Failed to load servers from Supabase:', err);
    return null;
  }
}

/**
 * Universal Bedrock Accounts Loader:
 * Fetches all verified Bedrock accounts stored in Supabase for this user.
 */
export async function loadAccountsFromSupabase(currentUser: string): Promise<BedrockAccount[]> {
  if (!supabase || !currentUser) return [];
  try {
    const cleanUser = currentUser.trim();
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .ilike('username', cleanUser)
      .order('created_at', { ascending: true });

    if (error || !data) return [];

    const accounts: BedrockAccount[] = [];
    const seen = new Set<string>();

    data.forEach((row) => {
      const botName = (row.bot_name || '').trim();
      // Skip metadata rows and any legacy temporary names
      if (!botName || botName.startsWith('__') || botName.startsWith('bedrock_user_')) return;

      const key = botName.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        accounts.push({
          id: `acc_${row.id}`,
          username: botName,
          ign: botName,
          auth_type: 'microsoft',
          avatarUrl: row.settings?.avatarUrl,
          verified: true,
          addedAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
          settings: row.settings || {},
        });
      }
    });

    return accounts;
  } catch (err) {
    console.warn('Failed to load accounts from Supabase:', err);
    return [];
  }
}

/**
 * Ensures all verified Bedrock accounts and configured servers are persisted in Supabase
 * under the current user's profile.
 */
export async function syncAllToSupabase(
  currentUser: string,
  accounts: BedrockAccount[],
  servers: ServerProfile[] = []
) {
  if (!supabase || !currentUser) return;

  try {
    const cleanUser = currentUser.trim();

    // 1. Universally persist servers in __meta_servers__ if any
    if (servers && servers.length > 0) {
      await saveServersToSupabase(cleanUser, servers);
    }

    // 2. Fetch current real account rows for this user in Supabase
    const { data: existingRows } = await supabase
      .from('accounts')
      .select('id, bot_name, server_host')
      .ilike('username', cleanUser);

    const existingBotNames = new Set(
      (existingRows || [])
        .map((r) => (r.bot_name || '').trim().toLowerCase())
        .filter((n) => n && !n.startsWith('__'))
    );

    // 3. Upsert verified accounts into Supabase
    for (const acc of accounts) {
      if (!acc.verified) continue;
      const ign = (acc.ign || acc.username || '').trim();
      if (!ign || ign.includes('@') || ign.startsWith('bedrock_user_')) continue;

      if (!existingBotNames.has(ign.toLowerCase())) {
        const firstServer = servers[0];
        await supabase.from('accounts').insert([
          {
            username: cleanUser,
            bot_name: ign,
            auth_type: 'microsoft',
            server_host: firstServer?.serverHost || 'play.cubecraft.net',
            server_port: firstServer?.serverPort || 19132,
            server_version: firstServer?.serverVersion || 'auto',
            settings: { ...(acc.settings || {}), avatarUrl: acc.avatarUrl },
          },
        ]);
        existingBotNames.add(ign.toLowerCase());
      }
    }
  } catch (err) {
    console.warn('Supabase sync warning:', err);
  }
}

/**
 * Explicitly removes an unlinked Bedrock account from Supabase.
 */
export async function deleteAccountFromSupabase(currentUser: string, ign: string) {
  if (!supabase || !currentUser || !ign) return;
  try {
    const cleanUser = currentUser.trim();
    const cleanIgn = ign.trim();
    await supabase
      .from('accounts')
      .delete()
      .ilike('username', cleanUser)
      .ilike('bot_name', cleanIgn);
  } catch (err) {
    console.warn('Failed to delete account from Supabase:', err);
  }
}

/**
 * Saves and updates player connection & activity logs in Supabase.
 */
export async function saveAccountLogsToSupabase(
  currentUser: string,
  accountName: string,
  logs: PlayerLogEntry[]
) {
  if (!supabase || !currentUser || !accountName) return;
  try {
    const cleanUser = currentUser.trim();
    const cleanAccount = accountName.trim().replace(/^@/, '');
    const metaBotName = `__meta_logs_${cleanAccount.toLowerCase()}`;

    const payload = {
      logs: logs.slice(-150),
      updatedAt: Date.now(),
    };

    const { data: existing } = await supabase
      .from('accounts')
      .select('id')
      .ilike('username', cleanUser)
      .eq('bot_name', metaBotName)
      .limit(1);

    if (existing && existing.length > 0) {
      await supabase
        .from('accounts')
        .update({ settings: payload, updated_at: new Date().toISOString() })
        .eq('id', existing[0].id);
    } else {
      await supabase.from('accounts').insert([
        {
          username: cleanUser,
          bot_name: metaBotName,
          server_host: logs[0]?.serverHost || 'pebbleafk.internal',
          server_port: 19132,
          settings: payload,
        },
      ]);
    }
  } catch (err) {
    console.warn('Failed to save account logs to Supabase:', err);
  }
}

/**
 * Loads player connection & activity logs from Supabase.
 */
export async function loadAccountLogsFromSupabase(
  currentUser: string,
  accountName: string
): Promise<PlayerLogEntry[]> {
  if (!supabase || !currentUser || !accountName) return [];
  try {
    const cleanUser = currentUser.trim();
    const cleanAccount = accountName.trim().replace(/^@/, '');
    const metaBotName = `__meta_logs_${cleanAccount.toLowerCase()}`;

    const { data } = await supabase
      .from('accounts')
      .select('settings')
      .ilike('username', cleanUser)
      .eq('bot_name', metaBotName)
      .limit(1);

    if (data && data.length > 0 && data[0].settings) {
      const logs = data[0].settings.logs;
      if (Array.isArray(logs)) {
        return logs;
      }
    }
    return [];
  } catch (err) {
    console.warn('Failed to load account logs from Supabase:', err);
    return [];
  }
}
