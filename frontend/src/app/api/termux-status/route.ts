import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function getSecret(req: NextRequest, username: string) {
  const secret = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || '';
  return /^[a-z0-9]{1,16}$/i.test(username) && /^pb_[a-f0-9]{10}$/i.test(secret) ? secret : '';
}

function unavailable(message: string) {
  if (/unauthorized|invalid.*(owner|secret)|permission denied/i.test(message)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  console.warn('[Termux Status API] Supabase request failed:', message);
  return NextResponse.json({ error: 'Termux uptime storage is temporarily unavailable. Apply the Supabase daemon-status migration and retry.' }, { status: 503 });
}

export async function GET(req: NextRequest) {
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const url = new URL(req.url);
  const username = url.searchParams.get('username')?.trim().toLowerCase() || '';
  const secret = getSecret(req, username);
  if (!secret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase.rpc('read_termux_daemon_status', {
    p_username: username,
    p_secret: secret,
  });
  if (error) return unavailable(error.message);
  return NextResponse.json({ username, status: data || null }, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}

export async function POST(req: NextRequest) {
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  try {
    const body = await req.json();
    const username = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : '';
    const secret = getSecret(req, username);
    if (!secret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const daemonStartedAt = Number(body?.daemonStartedAt);
    const lastSeenAt = Number(body?.lastSeenAt);
    const isOnline = body?.isOnline !== false;
    if (!Number.isFinite(daemonStartedAt) || daemonStartedAt <= 0 || daemonStartedAt > Date.now() + 60_000) {
      return NextResponse.json({ error: 'Invalid daemon start time.' }, { status: 400 });
    }
    if (!Number.isFinite(lastSeenAt) || lastSeenAt <= 0 || lastSeenAt > Date.now() + 60_000) {
      return NextResponse.json({ error: 'Invalid daemon heartbeat time.' }, { status: 400 });
    }

    const instanceId = typeof body?.instanceId === 'string' ? body.instanceId.slice(0, 120) : '';
    const { data, error } = await supabase.rpc('write_termux_daemon_status', {
      p_username: username,
      p_secret: secret,
      p_daemon_started_at_ms: Math.round(daemonStartedAt),
      p_last_seen_at_ms: Math.round(lastSeenAt),
      p_instance_id: instanceId,
      p_is_online: isOnline,
    });
    if (error) return unavailable(error.message);
    return NextResponse.json({ success: true, ...(data && typeof data === 'object' ? data : {}) }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (_) {
    return NextResponse.json({ error: 'Invalid daemon status payload.' }, { status: 400 });
  }
}
