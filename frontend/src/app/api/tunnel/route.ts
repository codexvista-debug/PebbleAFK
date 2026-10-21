import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { generateSecretCode } from '@/lib/authUtils';
import { sharedUserTunnels } from '@/lib/tunnelStore';

const userTunnels = sharedUserTunnels;
export const dynamic = 'force-dynamic';

const TUNNEL_TIMEOUT_MS = 300000; // 5 minutes (prevents premature disconnection on mobile backgrounding)

const noCacheHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0',
  'Pragma': 'no-cache',
  'Expires': '0',
  'Surrogate-Control': 'no-store',
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get('username')?.trim().toLowerCase() || 'default';

  // Supabase is the shared source of truth in production. An in-memory cache
  // can be different on each Vercel instance and may otherwise send the
  // browser back to an expired Cloudflare quick-tunnel URL.
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('tunnels')
        .select('*')
        .ilike('username', username)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: 'Tunnel registration store is temporarily unavailable.' }, { status: 503 });
      }

      if (data?.daemon_url) {
        const updatedAt = data.updated_at ? new Date(data.updated_at).getTime() : 0;
        const isLive = Date.now() - updatedAt < TUNNEL_TIMEOUT_MS;
        const tunnelObj = {
          url: data.daemon_url,
          tunnel_url: data.daemon_url,
          token: data.daemon_token || '',
          updatedAt,
          isLive,
        };
        userTunnels.set(username, tunnelObj);
        return NextResponse.json(tunnelObj, { headers: noCacheHeaders });
      }

      // An explicit empty registration means there is no current URL. Do not
      // fall back to a possibly stale per-instance cache in this case.
      return NextResponse.json({ url: '', tunnel_url: '', token: '', updatedAt: 0, isLive: false }, {
        headers: noCacheHeaders,
      });
    } catch (_) {
      // A failed read must not cause a temporary URL switch. The dashboard
      // keeps its last known URL and retries on the next poll.
      return NextResponse.json({ error: 'Tunnel registration store is temporarily unavailable.' }, { status: 503, headers: noCacheHeaders });
    }
  }

  // Local/development fallback only. Production reads above never trust this
  // instance-local map over the shared registration record.
  const cached = userTunnels.get(username);
  if (cached && cached.url) {
    const isLive = Date.now() - cached.updatedAt < TUNNEL_TIMEOUT_MS;
    return NextResponse.json({
      ...cached,
      tunnel_url: cached.url,
      isLive,
    }, { headers: noCacheHeaders });
  }

  return NextResponse.json({
    url: '',
    tunnel_url: '',
    token: '',
    updatedAt: cached?.updatedAt || 0,
    isLive: false,
  }, { headers: noCacheHeaders });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, url, token, action } = body;

    const cleanUsername = (typeof username === 'string' && username.trim())
      ? username.trim().toLowerCase()
      : 'default';

    let expectedSecret = '';
    if (cleanUsername !== 'default' && supabase) {
      try {
        const { data: user } = await supabase
          .from('users')
          .select('password_hash')
          .ilike('username', cleanUsername)
          .maybeSingle();

        if (user && user.password_hash) {
          expectedSecret = generateSecretCode(cleanUsername, user.password_hash);
          const providedSecret = typeof token === 'string' ? token.trim() : '';

          // Only block if a WRONG secret was explicitly provided
          if (providedSecret && providedSecret !== expectedSecret) {
            return NextResponse.json({
              error: `Unauthorized: Invalid daemon secret code for user @${cleanUsername}.`
            }, { status: 401 });
          }
        }
      } catch (_) {}
    }

    // 1. Handle Disconnect
    if (action === 'disconnect' || !url || (typeof url === 'string' && url.trim() === '')) {
      if (supabase) {
        try {
          const { error } = await supabase.from('tunnels').delete().ilike('username', cleanUsername);
          if (error) {
            return NextResponse.json({ error: 'Could not persist tunnel disconnect.' }, { status: 503 });
          }
        } catch (_) {
          return NextResponse.json({ error: 'Could not persist tunnel disconnect.' }, { status: 503 });
        }
      }
      userTunnels.delete(cleanUsername);
      return NextResponse.json({
        success: true,
        message: `Phone daemon tunnel disconnected for @${cleanUsername}`,
      });
    }

    // 2. Handle Connect / Heartbeat
    let cleanUrl = url.trim();
    if (cleanUrl.startsWith('https://')) {
      cleanUrl = cleanUrl.replace('https://', 'wss://');
    }

    const effectiveToken = (typeof token === 'string' && token.trim()) ? token.trim() : expectedSecret;

    const updatedAt = Date.now();
    const record = {
      url: cleanUrl,
      token: effectiveToken,
      updatedAt,
    };

    if (supabase) {
      try {
        const { error } = await supabase.from('tunnels').upsert({
          username: cleanUsername,
          daemon_url: cleanUrl,
          daemon_token: record.token,
          updated_at: new Date(updatedAt).toISOString(),
        }, { onConflict: 'username' });
        if (error) {
          // If upsert with onConflict hit an issue, fall back to clean delete + insert
          const { error: deleteError } = await supabase.from('tunnels').delete().ilike('username', cleanUsername);
          if (deleteError) throw deleteError;
          const { error: insertError } = await supabase.from('tunnels').insert({
            username: cleanUsername,
            daemon_url: cleanUrl,
            daemon_token: record.token,
            updated_at: new Date(updatedAt).toISOString(),
          });
          if (insertError) throw insertError;
        }
        // Cleanup is only needed on registration, not on each 15-second heartbeat.
        // A cleanup failure does not invalidate the current, successfully-written URL;
        // GET selects the newest record if old casing duplicates remain.
        if (action !== 'heartbeat') {
          const { error: cleanupError } = await supabase
            .from('tunnels')
            .delete()
            .neq('username', cleanUsername)
            .ilike('username', cleanUsername);
          if (cleanupError) console.warn('[Tunnel API] Could not remove older username-casing tunnel rows:', cleanupError.message);
        }
      } catch (err) {
        console.warn('[Tunnel API] Supabase persistence error; registration was not acknowledged:', err);
        return NextResponse.json({ error: 'Tunnel registration store is temporarily unavailable.' }, {
          status: 503,
          headers: noCacheHeaders,
        });
      }
    }

    userTunnels.set(cleanUsername, record);

    return NextResponse.json({
      success: true,
      message: action === 'heartbeat' ? 'Heartbeat received' : `Tunnel paired for user @${cleanUsername}`,
      data: record,
    }, { headers: noCacheHeaders });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
