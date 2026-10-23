import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { hashPassword, generateSecretCode, USERNAME_REGEX } from '@/lib/authUtils';
import { sharedUserTunnels } from '@/lib/tunnelStore';
import { getRegistrationsPaused, setRegistrationsPaused } from '@/lib/systemConfig';
import { FRESHSMP_DEFAULT_BOT_SETTINGS } from '@/types';

export const dynamic = 'force-dynamic';

interface UserSummaryItem {
  id: string;
  username: string;
  accountCount: number;
  connectedCount: number;
  secretCode?: string;
  createdAt: string;
  tunnelUrl?: string;
  isTunnelActive?: boolean;
  daemonReachable?: boolean;
  daemonProbeAt?: number;
}

interface AccountItem {
  id: string;
  botId: string;
  serverId?: string;
  owner: string;
  ign: string;
  serverHost: string;
  serverPort: number;
  serverName?: string;
  isConnected: boolean;
  connectedAt?: number;
  runtimeState: string;
  runtimeReason?: string;
  runtimeHost?: string;
  runtimePort?: number;
  runtimeUpdatedAt?: number;
  updatedAt?: string;
  createdAt?: string;
  settings?: any;
  daemonUrl?: string;
  registeredTunnel?: string;
  legitimacy: {
    status: 'legit' | 'leak' | 'unverified' | 'offline';
    badge: string;
    description: string;
    isLegit: boolean;
  };
}

interface AdminTunnelItem {
  username: string;
  url: string;
  token?: string;
  updatedAt: number;
  isRecent: boolean;
  activeBots: number;
  daemonReachable: boolean;
  probeAt: number;
  authError?: string;
}

interface LiveBotProbe {
  username: string;
  botId: string;
  accountId?: string;
  state: string;
  reason?: string;
  connectedAt?: number;
  uptime?: number;
  host?: string;
  port?: number;
  serverId?: string;
}

interface LiveDaemonProbe {
  reachable: boolean;
  probeAt: number;
  authError?: string;
  bots: Map<string, LiveBotProbe>;
}

// Probes registered phone daemons over WebSocket to capture their current bot states.
async function probeLiveDaemons(tunnels: Map<string, { url: string; token: string; updatedAt: number }>): Promise<Map<string, LiveDaemonProbe>> {
  const results = new Map<string, LiveDaemonProbe>();
  if (typeof WebSocket === 'undefined') return results;

  const probePromises: Promise<void>[] = [];

  tunnels.forEach((tData, owner) => {
    if (!tData.url || (!tData.url.startsWith('ws://') && !tData.url.startsWith('wss://'))) return;

    const p = new Promise<void>((resolve) => {
      let settled = false;
      let authenticated = false;
      let authError: string | undefined;
      const probeAt = Date.now();
      const bots = new Map<string, LiveBotProbe>();
      let timer: NodeJS.Timeout | null = null;
      let ws: WebSocket | null = null;

      const finish = () => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        results.set(owner, { reachable: authenticated, probeAt, authError, bots });
        try { ws?.close(); } catch (_) {}
        resolve();
      };

      timer = setTimeout(finish, 3500);

      try {
        ws = new WebSocket(tData.url);
        ws.onopen = () => {
          ws?.send(JSON.stringify({
            type: 'AUTH',
            payload: { username: owner, token: tData.token }
          }));
        };

        ws.onmessage = (event: any) => {
          try {
            const raw = typeof event.data === 'string' ? event.data : event.data?.toString();
            const msg = JSON.parse(raw);
            if (msg.type === 'AUTH_RESULT') {
              if (msg.payload?.success && !authenticated) {
                authenticated = true;
                ws?.send(JSON.stringify({ type: 'REQUEST_SYNC' }));
              } else if (!msg.payload?.success) {
                authError = msg.payload?.message || 'Daemon authentication failed';
                finish();
              }
            } else if (msg.type === 'BOT_STATE') {
              const p = msg.payload;
              if (authenticated && p?.botId) {
                const probeInfo: LiveBotProbe = {
                  username: (p.username || '').toLowerCase().trim(),
                  botId: (p.botId || '').toLowerCase().trim(),
                  accountId: (p.accountId || '').toLowerCase().trim(),
                  state: p.state,
                  reason: p.reason,
                  connectedAt: Number(p.connectedAt) || undefined,
                  uptime: Number(p.uptime) || undefined,
                  host: p.host,
                  port: p.port ? Number(p.port) : undefined,
                  serverId: p.serverId,
                };
                bots.set(probeInfo.botId, probeInfo);
              }
            }
          } catch (_) {}
        };

        ws.onerror = finish;
        ws.onclose = finish;
      } catch (_) {
        finish();
      }
    });

    probePromises.push(p);
  });

  await Promise.allSettled(probePromises);
  return results;
}

export async function GET(req: NextRequest) {
  try {
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase client not initialized' }, { status: 500 });
    }

    // 1. Fetch all registered users
    const { data: users, error: usersErr } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (usersErr) {
      return NextResponse.json({ error: usersErr.message }, { status: 500 });
    }

    // 2. Fetch all accounts from Supabase
    const { data: allAccounts, error: accsErr } = await supabase
      .from('accounts')
      .select('*')
      .order('created_at', { ascending: false });

    if (accsErr) {
      return NextResponse.json({ error: accsErr.message }, { status: 500 });
    }

    // 3. Fetch all registered tunnels from Supabase
    const { data: allTunnels } = await supabase
      .from('tunnels')
      .select('*')
      .order('updated_at', { ascending: false });

    const tunnelMap = new Map<string, { url: string; token: string; updatedAt: number }>();

    (allTunnels || []).forEach((t: any) => {
      const u = (t.username || '').toLowerCase().trim();
      if (u && t.daemon_url) {
        tunnelMap.set(u, {
          url: t.daemon_url,
          token: t.daemon_token || '',
          updatedAt: t.updated_at ? new Date(t.updated_at).getTime() : 0,
        });
      }
    });

    // Merge in-memory live cache (most recent)
    sharedUserTunnels.forEach((val, u) => {
      const lower = u.toLowerCase().trim();
      const existing = tunnelMap.get(lower);
      if (!existing || val.updatedAt > existing.updatedAt) {
        tunnelMap.set(lower, val);
      }
    });

    // 4. Live probe all active daemons to detect active bots
    const liveDaemonsByOwner = await probeLiveDaemons(tunnelMap);

    // 5. Build user server profile map from __meta_servers__
    const userServersMap = new Map<string, any[]>();
    (allAccounts || []).forEach((row) => {
      const lowerOwner = (row.username || '').toLowerCase().trim();
      if (row.bot_name === '__meta_servers__' && Array.isArray(row.settings?.servers)) {
        userServersMap.set(lowerOwner, row.settings.servers);
      }
    });

    // 6. Deduplicate the account inventory in memory, then expand it into one
    // deployment per assigned server profile. A read-only admin GET must never
    // delete account rows from the user's inventory.
    const accountRowsByKey = new Map<string, any>();
    (allAccounts || []).forEach((row) => {
      const botName = (row.bot_name || '').trim();
      if (!botName || botName.startsWith('__')) return;
      const owner = (row.username || '').toLowerCase().trim();
      const key = `${owner}::${botName.replace(/^@/, '').toLowerCase().trim()}`;
      const current = accountRowsByKey.get(key);
      if (!current || new Date(row.updated_at || row.created_at || 0).getTime() > new Date(current.updated_at || current.created_at || 0).getTime()) {
        accountRowsByKey.set(key, row);
      }
    });

    const realAccounts: AccountItem[] = [];
    const now = Date.now();
    accountRowsByKey.forEach((row) => {
      const owner = (row.username || '').trim();
      const lowerOwner = owner.toLowerCase();
      const botName = (row.bot_name || '').trim();
      const cleanBotName = botName.replace(/^@/, '').toLowerCase().trim();
      const rowId = String(row.id);
      const accountId = `acc_${rowId}`.toLowerCase();
      const userTunnel = tunnelMap.get(lowerOwner);
      const daemonProbe = liveDaemonsByOwner.get(lowerOwner);
      const userServers = userServersMap.get(lowerOwner) || [];
      const runtimeBots = Array.from(daemonProbe?.bots.values() || []);

      const assignments = userServers.filter((server) => {
        const assigned = Array.isArray(server.assignedAccountIds) ? server.assignedAccountIds : [];
        return assigned.some((id: unknown) => {
          const lowerId = String(id).toLowerCase().trim();
          return lowerId === accountId || lowerId === rowId.toLowerCase() || lowerId === cleanBotName;
        }) || String(server.accountId || '').toLowerCase().trim() === accountId;
      });

      // The daemon's exact server/account identity is authoritative when the
      // profile metadata predates explicit account assignments.
      const runtimeAssignments = runtimeBots
        .filter((bot) => bot.accountId === accountId || bot.accountId === rowId.toLowerCase())
        .map((bot) => userServers.find((server) => server.id?.toLowerCase() === bot.serverId?.toLowerCase()))
        .filter(Boolean);
      runtimeAssignments.forEach((server) => {
        if (!assignments.some((item) => item.id === server!.id)) assignments.push(server);
      });

      if (assignments.length === 0 && row.server_host) {
        const savedHost = String(row.server_host).toLowerCase().trim();
        const savedPort = Number(row.server_port || 19132);
        assignments.push(...userServers.filter((server) =>
          String(server.serverHost || '').toLowerCase().trim() === savedHost &&
          Number(server.serverPort || 19132) === savedPort
        ));
      }

      const resolvedServers = assignments.length > 0
        ? assignments
        : userServers.length === 1
          ? [userServers[0]]
          : [undefined];

      resolvedServers.forEach((server: any) => {
        const serverId = server?.id ? String(server.id) : undefined;
        const botId = serverId ? `${serverId}__${accountId}` : accountId;
        const probe = runtimeBots.find((candidate) => candidate.botId === botId.toLowerCase()) ||
          runtimeBots.find((candidate) => candidate.accountId === accountId && candidate.serverId?.toLowerCase() === serverId?.toLowerCase());
        const daemonReachable = Boolean(daemonProbe?.reachable);
        const runtimeState = probe?.state || (daemonReachable ? 'DISCONNECTED' : userTunnel?.url ? 'UNKNOWN' : 'DISCONNECTED');
        const isConnected = runtimeState === 'SPAWNED' || runtimeState === 'LOGGED_IN';
        const activeDaemonUrl = (isConnected ? userTunnel?.url : row.settings?.daemon_url || userTunnel?.url) || '';
        const serverHost = server?.serverHost || probe?.host || row.server_host || 'Unknown server';
        const serverPort = Number(server?.serverPort || probe?.port || row.server_port || 19132);
        const serverName = server?.name || server?.id || '';

        let legitimacy: AccountItem['legitimacy'] = {
          status: 'offline',
          badge: runtimeState === 'UNKNOWN' ? 'Daemon status unknown' : 'Standby / Offline',
          description: runtimeState === 'UNKNOWN'
            ? `Could not verify this bot because @${owner}'s daemon is not reachable right now.`
            : userTunnel?.url
              ? daemonReachable ? `Daemon reachable at ${userTunnel.url}; this exact bot is ${runtimeState.toLowerCase()}.` : 'Phone daemon is not reachable.'
              : 'No phone daemon registered for this user',
          isLegit: true,
        };

        if (isConnected) {
          const foreignOwner = Array.from(tunnelMap.entries()).find(([otherOwner, tunnel]) =>
            otherOwner !== lowerOwner && tunnel.url && activeDaemonUrl && tunnel.url === activeDaemonUrl
          )?.[0];
          legitimacy = foreignOwner
            ? { status: 'leak', badge: `Foreign Tunnel (@${foreignOwner})`, description: `Bot is running through @${foreignOwner}'s registered tunnel.`, isLegit: false }
            : { status: 'legit', badge: 'Verified Legit Owner', description: `Live bot state confirmed by @${owner}'s daemon.`, isLegit: true };
        }

        realAccounts.push({
          id: rowId,
          botId,
          serverId,
          owner,
          ign: botName,
          serverHost,
          serverPort,
          serverName,
          isConnected,
          connectedAt: isConnected ? (probe?.connectedAt || row.settings?.connected_at || undefined) : undefined,
          runtimeState,
          runtimeReason: probe?.reason,
          runtimeHost: probe?.host,
          runtimePort: probe?.port,
          runtimeUpdatedAt: daemonProbe?.probeAt,
          updatedAt: row.updated_at,
          createdAt: row.created_at,
          settings: row.settings || {},
          daemonUrl: activeDaemonUrl,
          registeredTunnel: userTunnel?.url,
          legitimacy,
        });
      });
    });

    // 6. Build user summary list
    const userList: UserSummaryItem[] = (users || []).map((u) => {
      const lowerU = (u.username || '').toLowerCase().trim();
      const userAccounts = realAccounts.filter((a) => a.owner.toLowerCase().trim() === lowerU);
      const uniqueAccounts = new Set(userAccounts.map((a) => a.id));
      const connectedCount = new Set(userAccounts.filter((a) => a.isConnected).map((a) => a.id)).size;
      const secretCode = u.password_hash ? generateSecretCode(u.username, u.password_hash) : undefined;
      const userTunnel = tunnelMap.get(lowerU);
      const daemonProbe = liveDaemonsByOwner.get(lowerU);
      const isTunnelActive = Boolean(daemonProbe?.reachable);

      return {
        id: u.id,
        username: u.username,
        accountCount: uniqueAccounts.size,
        connectedCount,
        secretCode,
        createdAt: u.created_at || new Date().toISOString(),
        tunnelUrl: userTunnel?.url,
        isTunnelActive,
        daemonReachable: Boolean(daemonProbe?.reachable),
        daemonProbeAt: daemonProbe?.probeAt || now,
      };
    });

    // 7. Build tunnel overview list
    const tunnelList: AdminTunnelItem[] = [];
    tunnelMap.forEach((t, u) => {
      const activeBots = new Set(realAccounts.filter((a) => a.owner.toLowerCase().trim() === u && a.isConnected).map((a) => a.id)).size;
      const isRecent = Boolean(t.url && Date.now() - t.updatedAt < 300000);
      const daemonProbe = liveDaemonsByOwner.get(u);
      tunnelList.push({
        username: u,
        url: t.url,
        token: t.token || '',
        updatedAt: t.updatedAt,
        isRecent,
        activeBots,
        daemonReachable: Boolean(daemonProbe?.reachable),
        probeAt: daemonProbe?.probeAt || now,
        authError: daemonProbe?.authError,
      });
    });

    const activeTunnelsCount = tunnelList.filter((t) => t.daemonReachable).length;
    const isRegistrationsPaused = await getRegistrationsPaused();

    return NextResponse.json({
      stats: {
        totalUsers: userList.length,
        totalAccounts: new Set(realAccounts.map((a) => `${a.owner.toLowerCase()}::${a.id}`)).size,
        totalConnected: new Set(realAccounts.filter((a) => a.isConnected).map((a) => `${a.owner.toLowerCase()}::${a.id}`)).size,
        totalTunnels: activeTunnelsCount,
        isRegistrationsPaused,
      },
      isRegistrationsPaused,
      users: userList,
      accounts: realAccounts,
      tunnels: tunnelList,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function sendStopBotToDaemon(
  daemonUrl: string,
  username: string,
  token: string,
  botIgn: string,
  lastBotId?: string,
  exactBotId?: string
): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      if (typeof WebSocket === 'undefined') {
        return resolve(false);
      }
      const ws = new WebSocket(daemonUrl);
      const timer = setTimeout(() => {
        try { ws.close(); } catch {}
        resolve(false);
      }, 3500);

      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: 'AUTH',
          payload: { username, token }
        }));
      };

      ws.onmessage = (event: any) => {
        try {
          const raw = typeof event.data === 'string' ? event.data : event.data?.toString();
          const msg = JSON.parse(raw);
          if (msg.type === 'AUTH_RESULT' && msg.payload?.success) {
            if (exactBotId || lastBotId || botIgn) {
              ws.send(JSON.stringify({
                type: 'STOP_BOT',
                payload: { botId: exactBotId || lastBotId || botIgn, id: exactBotId || lastBotId || botIgn, username: botIgn }
              }));
            }
            if (!exactBotId && lastBotId && lastBotId.toLowerCase() !== botIgn.toLowerCase()) {
              ws.send(JSON.stringify({
                type: 'STOP_BOT',
                payload: { botId: lastBotId, id: lastBotId, username: lastBotId }
              }));
            }
            setTimeout(() => {
              clearTimeout(timer);
              try { ws.close(); } catch {}
              resolve(true);
            }, 600);
          }
        } catch {}
      };

      ws.onerror = () => {
        clearTimeout(timer);
        try { ws.close(); } catch {}
        resolve(false);
      };
    } catch {
      resolve(false);
    }
  });
}

export async function POST(req: NextRequest) {
  try {
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase client not initialized' }, { status: 500 });
    }

    const body = await req.json();
    const { action } = body;

    // Action 0: Pause or Resume public registrations
    if (action === 'toggle_registrations') {
      const { paused } = body;
      const current = await getRegistrationsPaused();
      const targetState = typeof paused === 'boolean' ? paused : !current;
      const success = await setRegistrationsPaused(targetState);
      if (!success) {
        return NextResponse.json({ error: 'Failed to update registration status in database' }, { status: 500 });
      }
      return NextResponse.json({
        success: true,
        isRegistrationsPaused: targetState,
        message: targetState ? 'Public registrations are now PAUSED.' : 'Public registrations are now RESUMED & OPEN.',
      });
    }

    // Action 2: Reset user password
    if (action === 'reset_password') {
      const { username, newPassword } = body;
      if (!username || !newPassword) {
        return NextResponse.json({ error: 'username and newPassword required' }, { status: 400 });
      }

      if (typeof newPassword !== 'string' || newPassword.length < 4) {
        return NextResponse.json({ error: 'Password must be at least 4 characters long' }, { status: 400 });
      }

      const cleanUser = username.trim();
      const newHash = hashPassword(newPassword);

      const { error } = await supabase
        .from('users')
        .update({ password_hash: newHash })
        .ilike('username', cleanUser);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: `Password for @${cleanUser} successfully updated!`,
        newSecretCode: generateSecretCode(cleanUser, newHash),
      });
    }

    // Action 3: Create new user
    if (action === 'create_user') {
      const { username, password } = body;
      if (!username || !password) {
        return NextResponse.json({ error: 'username and password required' }, { status: 400 });
      }

      const cleanUsername = username.trim();
      if (!USERNAME_REGEX.test(cleanUsername)) {
        return NextResponse.json({
          error: 'Username must be 1 to 16 characters long, using only letters and numbers.',
        }, { status: 400 });
      }

      const hashedPassword = hashPassword(password);

      // Check duplicate
      const { data: existing } = await supabase
        .from('users')
        .select('username')
        .ilike('username', cleanUsername)
        .maybeSingle();

      if (existing) {
        return NextResponse.json({ error: `User '${cleanUsername}' already exists` }, { status: 400 });
      }

      // Insert user directly into public.users
      const { error: insErr } = await supabase.from('users').insert([
        { username: cleanUsername, password_hash: hashedPassword },
      ]);

      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 500 });
      }

      // Create default server profile in __meta_servers__
      try {
        const defaultProfile = {
          id: 'srv_freshsmp',
          name: 'FreshSMP',
          pebbleUser: cleanUsername,
          accountId: '',
          assignedAccountIds: [],
          serverHost: 'play.freshsmp.fun',
          serverPort: 19132,
          serverVersion: 'auto',
          authType: 'microsoft',
          autoReconnect: true,
          settings: { ...FRESHSMP_DEFAULT_BOT_SETTINGS },
        };
        await supabase.from('accounts').insert([
          {
            username: cleanUsername,
            bot_name: '__meta_servers__',
            server_host: 'pebbleafk.internal',
            server_port: 19132,
            settings: { servers: [defaultProfile], updatedAt: Date.now() },
          },
        ]);
      } catch (_) {}

      return NextResponse.json({
        success: true,
        message: `User @${cleanUsername} created successfully!`,
      });
    }

    // Action 4: Delete user
    if (action === 'delete_user') {
      const { username } = body;
      if (!username) {
        return NextResponse.json({ error: 'username required' }, { status: 400 });
      }

      const cleanUser = username.trim();
      const lowerUser = cleanUser.toLowerCase();

      // 1. Purge live in-memory tunnel cache
      sharedUserTunnels.delete(lowerUser);
      sharedUserTunnels.delete(cleanUser);

      // 2. Delete user's tunnel from Supabase
      try {
        await supabase.from('tunnels').delete().ilike('username', cleanUser);
        await supabase.from('tunnels').delete().eq('username', cleanUser);
        await supabase.from('tunnels').delete().eq('username', lowerUser);
      } catch (e) {
        console.warn('Error purging user tunnel:', e);
      }

      // 3. Delete all Minecraft accounts, server profiles, and logs
      try {
        await supabase.from('accounts').delete().ilike('username', cleanUser);
        await supabase.from('accounts').delete().eq('username', cleanUser);
        await supabase.from('accounts').delete().eq('username', lowerUser);
      } catch (e) {
        console.warn('Error purging user accounts & metadata:', e);
      }

      // 4. Delete user record from Supabase users table
      const { error: delErr } = await supabase.from('users').delete().ilike('username', cleanUser);

      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: `User @${cleanUser} and all associated accounts, server profiles, and tunnels permanently deleted.`
      });
    }

    // Action 5: Delete Bedrock account
    if (action === 'delete_account') {
      const { accountId } = body;
      if (!accountId) {
        return NextResponse.json({ error: 'accountId required' }, { status: 400 });
      }

      const cleanId = String(accountId).replace(/^acc_/, '');
      const { error: delErr } = await supabase.from('accounts').delete().eq('id', cleanId);
      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: 'Bedrock account deleted successfully' });
    }

    // Action 6: Disconnect Bedrock account
    if (action === 'disconnect_account') {
      const { accountId, ign, botId } = body;
      if (!accountId) {
        return NextResponse.json({ error: 'accountId required' }, { status: 400 });
      }

      const cleanId = String(accountId).replace(/^acc_/, '');
      const { data: accRow } = await supabase.from('accounts').select('*').eq('id', cleanId).maybeSingle();
      const existingSettings = accRow?.settings || {};
      const owner = (accRow?.username || '').trim().toLowerCase();
      const botIgn = (ign || accRow?.bot_name || '').trim();

      // 1. Mark disconnected in Supabase
      await supabase
        .from('accounts')
        .update({
          settings: {
            ...existingSettings,
            is_connected: false,
            connected_at: null,
            disconnected_at: Date.now(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', cleanId);

      // 2. Proactively terminate the bot on the active phone daemon
      let daemonUrl = sharedUserTunnels.get(owner)?.url;
      if (!daemonUrl && supabase) {
        const { data: tunRow } = await supabase
          .from('tunnels')
          .select('daemon_url')
          .ilike('username', owner)
          .maybeSingle();
        daemonUrl = tunRow?.daemon_url;
      }

      if (daemonUrl && (daemonUrl.startsWith('ws://') || daemonUrl.startsWith('wss://'))) {
        try {
          const { data: userRow } = await supabase
            .from('users')
            .select('password_hash')
            .ilike('username', owner)
            .maybeSingle();
          const token = userRow?.password_hash ? generateSecretCode(owner, userRow.password_hash) : '';
          await sendStopBotToDaemon(daemonUrl, owner, token, botIgn, existingSettings.last_bot_id, botId);
        } catch (e) {
          console.warn('[Admin] Failed to send STOP_BOT to daemon:', e);
        }
      }

      return NextResponse.json({ success: true, message: `Bedrock account ${botIgn || accountId} disconnected successfully` });
    }

    // Action 7: Disconnect / Clear Tunnel
    if (action === 'disconnect_tunnel') {
      const { username } = body;
      if (!username) {
        return NextResponse.json({ error: 'username required' }, { status: 400 });
      }

      const cleanUser = username.trim().toLowerCase();
      sharedUserTunnels.delete(cleanUser);

      await supabase.from('tunnels').update({
        daemon_url: '',
        updated_at: new Date().toISOString(),
      }).ilike('username', cleanUser);

      // Also set all accounts for this user as disconnected
      const { data: userAccs } = await supabase
        .from('accounts')
        .select('id, settings')
        .ilike('username', cleanUser);

      if (userAccs && userAccs.length > 0) {
        for (const acc of userAccs) {
          const updatedSettings = {
            ...(acc.settings || {}),
            is_connected: false,
            connected_at: null,
          };
          await supabase
            .from('accounts')
            .update({
              settings: updatedSettings,
              updated_at: new Date().toISOString(),
            })
            .eq('id', acc.id);
        }
      }

      return NextResponse.json({ success: true, message: `Phone daemon tunnel and active bots disconnected for @${cleanUser}` });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
