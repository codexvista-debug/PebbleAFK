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
}

interface AccountItem {
  id: string;
  owner: string;
  ign: string;
  serverHost: string;
  serverPort: number;
  isConnected: boolean;
  connectedAt?: number;
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
}

// Proactively probes live phone daemons over WebSocket to detect running bots in real-time
async function probeLiveDaemons(tunnels: Map<string, { url: string; token: string; updatedAt: number }>): Promise<Map<string, Set<string>>> {
  const results = new Map<string, Set<string>>();
  if (typeof WebSocket === 'undefined') return results;

  const probePromises: Promise<void>[] = [];

  tunnels.forEach((tData, owner) => {
    const isLive = Boolean(tData.url && Date.now() - tData.updatedAt < 300000);
    if (!isLive || (!tData.url.startsWith('ws://') && !tData.url.startsWith('wss://'))) return;

    const p = new Promise<void>((resolve) => {
      let settled = false;
      let timer: NodeJS.Timeout | null = null;
      let ws: WebSocket | null = null;

      const finish = () => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        try { ws?.close(); } catch (_) {}
        resolve();
      };

      timer = setTimeout(finish, 1800);

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
            if (msg.type === 'AUTH_RESULT' && msg.payload?.success) {
              ws?.send(JSON.stringify({ type: 'REQUEST_SYNC' }));
            } else if (msg.type === 'BOT_STATE') {
              const p = msg.payload;
              if (p?.state === 'SPAWNED' || p?.state === 'LOGGED_IN') {
                let userSet = results.get(owner);
                if (!userSet) {
                  userSet = new Set<string>();
                  results.set(owner, userSet);
                }
                if (p.username) userSet.add(p.username.toLowerCase().trim());
                if (p.botId) userSet.add(p.botId.toLowerCase().trim());
                if (p.accountId) userSet.add(p.accountId.toLowerCase().trim());
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
    const liveOnlineBotsByOwner = await probeLiveDaemons(tunnelMap);

    // 5. Separate metadata rows from real Bedrock accounts & determine connection state
    const realAccounts: AccountItem[] = [];

    (allAccounts || []).forEach((row) => {
      const lowerOwner = (row.username || '').toLowerCase().trim();
      const botName = (row.bot_name || '').trim();

      if (!botName.startsWith('__')) {
        const userTunnel = tunnelMap.get(lowerOwner);
        // Authoritative liveness: Phone daemon must have sent heartbeat within 300 seconds (5m)
        const isTunnelLive = Boolean(userTunnel?.url && Date.now() - userTunnel.updatedAt < 300000);

        const onlineBotSet = liveOnlineBotsByOwner.get(lowerOwner);
        const cleanBotName = botName.replace(/^@/, '').toLowerCase().trim();
        const rowIdStr = String(row.id).toLowerCase();

        // Check if detected as online by daemon probe or marked connected in DB
        let isLiveOnDaemon = false;
        if (onlineBotSet && isTunnelLive) {
          if (
            onlineBotSet.has(cleanBotName) ||
            onlineBotSet.has(botName.toLowerCase()) ||
            onlineBotSet.has(rowIdStr) ||
            onlineBotSet.has(`acc_${rowIdStr}`)
          ) {
            isLiveOnDaemon = true;
          } else {
            // If user has active daemon with online bots and only 1 registered account, match it
            const ownerAccounts = (allAccounts || []).filter(
              (a) => (a.username || '').toLowerCase().trim() === lowerOwner && !a.bot_name?.startsWith('__')
            );
            if (ownerAccounts.length === 1 && onlineBotSet.size > 0) {
              isLiveOnDaemon = true;
            }
          }
        }

        const rawConnected = Boolean(row.settings?.is_connected) || isLiveOnDaemon;
        const isConnected = rawConnected && isTunnelLive;

        const activeDaemonUrl = (row.settings?.daemon_url || '').trim() || (isConnected ? userTunnel?.url || '' : '');

        let legitimacy: AccountItem['legitimacy'];

        if (!isConnected) {
          legitimacy = {
            status: 'offline',
            badge: 'Standby / Offline',
            description: userTunnel?.url
              ? isTunnelLive
                ? `Phone daemon live on ${userTunnel.url} (Bot offline)`
                : `Phone daemon offline (Last heartbeat ${Math.max(1, Math.round((Date.now() - userTunnel.updatedAt) / 60000))}m ago)`
              : 'No phone daemon registered for this user',
            isLegit: true,
          };
        } else {
          // Connected bot - analyze legitimacy
          if (!activeDaemonUrl && !userTunnel?.url) {
            legitimacy = {
              status: 'unverified',
              badge: 'Unregistered Daemon',
              description: `User @${row.username} has no active phone daemon registered in the system!`,
              isLegit: false,
            };
          } else {
            // Check if activeDaemonUrl belongs to another user
            let foreignOwner: string | null = null;
            if (activeDaemonUrl) {
              tunnelMap.forEach((tData, tUser) => {
                if (
                  !foreignOwner &&
                  tUser !== lowerOwner &&
                  tData.url &&
                  (tData.url === activeDaemonUrl || activeDaemonUrl.includes(tData.url) || tData.url.includes(activeDaemonUrl))
                ) {
                  foreignOwner = tUser;
                }
              });
            }

            if (foreignOwner) {
              legitimacy = {
                status: 'leak',
                badge: `Foreign Tunnel (@${foreignOwner})`,
                description: `CRITICAL LEAK: Account owned by @${row.username} is routed through @${foreignOwner}'s phone tunnel!`,
                isLegit: false,
              };
            } else if (
              userTunnel?.url &&
              activeDaemonUrl &&
              !userTunnel.url.includes(activeDaemonUrl) &&
              !activeDaemonUrl.includes(userTunnel.url)
            ) {
              legitimacy = {
                status: 'leak',
                badge: 'Tunnel URL Mismatch',
                description: `Account is routed via ${activeDaemonUrl}, but @${row.username}'s registered tunnel is ${userTunnel.url}`,
                isLegit: false,
              };
            } else if (!userTunnel?.url && activeDaemonUrl) {
              legitimacy = {
                status: 'unverified',
                badge: 'Direct Tunnel (Standalone)',
                description: `Connected directly via ${activeDaemonUrl} without user-registered phone daemon.`,
                isLegit: true,
              };
            } else {
              legitimacy = {
                status: 'legit',
                badge: 'Verified Legit Owner',
                description: `Legitimate connection: Running securely on @${row.username}'s dedicated phone daemon tunnel.`,
                isLegit: true,
              };
            }
          }
        }

        realAccounts.push({
          id: row.id,
          owner: row.username,
          ign: botName,
          serverHost: row.server_host || 'play.freshsmp.fun',
          serverPort: row.server_port || 19132,
          isConnected,
          connectedAt: isConnected ? (row.settings?.connected_at || Date.now()) : undefined,
          updatedAt: row.updated_at,
          createdAt: row.created_at,
          settings: row.settings || {},
          daemonUrl: activeDaemonUrl,
          registeredTunnel: userTunnel?.url,
          legitimacy,
        });
      }
    });

    // 6. Build user summary list
    const userList: UserSummaryItem[] = (users || []).map((u) => {
      const lowerU = (u.username || '').toLowerCase().trim();
      const userAccounts = realAccounts.filter((a) => a.owner.toLowerCase().trim() === lowerU);
      const connectedCount = userAccounts.filter((a) => a.isConnected).length;
      const secretCode = u.password_hash ? generateSecretCode(u.username, u.password_hash) : undefined;
      const userTunnel = tunnelMap.get(lowerU);
      const isTunnelActive = Boolean(userTunnel?.url && Date.now() - userTunnel.updatedAt < 300000);

      return {
        id: u.id,
        username: u.username,
        accountCount: userAccounts.length,
        connectedCount,
        secretCode,
        createdAt: u.created_at || new Date().toISOString(),
        tunnelUrl: userTunnel?.url,
        isTunnelActive,
      };
    });

    // 7. Build tunnel overview list
    const tunnelList: AdminTunnelItem[] = [];
    tunnelMap.forEach((t, u) => {
      const activeBots = realAccounts.filter((a) => a.owner.toLowerCase().trim() === u && a.isConnected).length;
      const isRecent = Boolean(t.url && Date.now() - t.updatedAt < 300000);
      tunnelList.push({
        username: u,
        url: t.url,
        token: t.token || '',
        updatedAt: t.updatedAt,
        isRecent,
        activeBots,
      });
    });

    const activeTunnelsCount = tunnelList.filter((t) => t.isRecent).length;
    const isRegistrationsPaused = await getRegistrationsPaused();

    return NextResponse.json({
      stats: {
        totalUsers: userList.length,
        totalAccounts: realAccounts.length,
        totalConnected: realAccounts.filter((a) => a.isConnected).length,
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
  lastBotId?: string
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
            if (botIgn) {
              ws.send(JSON.stringify({
                type: 'STOP_BOT',
                payload: { botId: botIgn, id: botIgn, username: botIgn }
              }));
            }
            if (lastBotId && lastBotId.toLowerCase() !== botIgn.toLowerCase()) {
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
      const { accountId, ign } = body;
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
          await sendStopBotToDaemon(daemonUrl, owner, token, botIgn, existingSettings.last_bot_id);
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
