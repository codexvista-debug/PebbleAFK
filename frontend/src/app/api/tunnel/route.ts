import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { generateSecretCode } from '@/lib/authUtils';
import { sharedUserTunnels } from '@/lib/tunnelStore';

const userTunnels = sharedUserTunnels;
export const dynamic = 'force-dynamic';

const TUNNEL_TIMEOUT_MS = 300000; // 5 minutes (prevents premature disconnection on mobile backgrounding)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get('username')?.trim().toLowerCase() || 'default';

  // 1. Check in-memory cache
  const cached = userTunnels.get(username);
  if (cached && cached.url) {
    const isLive = Date.now() - cached.updatedAt < TUNNEL_TIMEOUT_MS;
    return NextResponse.json({
      ...cached,
      tunnel_url: cached.url,
      isLive,
    });
  }

  // 2. Check Supabase
  if (supabase) {
    try {
      const { data } = await supabase
        .from('tunnels')
        .select('*')
        .ilike('username', username)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data && data.daemon_url) {
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
        return NextResponse.json(tunnelObj);
      }
    } catch (_) {}
  }

  return NextResponse.json({
    url: '',
    tunnel_url: '',
    token: '',
    updatedAt: cached?.updatedAt || 0,
    isLive: false,
  });
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
      userTunnels.delete(cleanUsername);
      if (supabase) {
        try {
          await supabase.from('tunnels').delete().ilike('username', cleanUsername);
        } catch (_) {}
      }
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

    const record = {
      url: cleanUrl,
      token: effectiveToken,
      updatedAt: Date.now(),
    };

    userTunnels.set(cleanUsername, record);

    if (supabase) {
      try {
        await supabase.from('tunnels').upsert({
          username: cleanUsername,
          daemon_url: cleanUrl,
          daemon_token: record.token,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'username' });
      } catch (_) {}
    }

    return NextResponse.json({
      success: true,
      message: action === 'heartbeat' ? 'Heartbeat received' : `Tunnel paired for user @${cleanUsername}`,
      data: record,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
