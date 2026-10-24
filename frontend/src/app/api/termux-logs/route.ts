import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function authorized(req: NextRequest, username: string) {
  const secret = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || '';
  return /^[a-z0-9]{1,16}$/i.test(username) && /^pb_[a-f0-9]{10}$/i.test(secret) ? secret : '';
}

function rpcErrorResponse(message: string) {
  if (/unauthorized|invalid.*(owner|secret)|permission denied/i.test(message)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  console.warn('[Termux Logs API] Supabase request failed:', message);
  return NextResponse.json({ error: 'Termux log history is temporarily unavailable. Apply the Supabase migration and retry.' }, { status: 503 });
}

export async function GET(req: NextRequest) {
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const url = new URL(req.url);
  const username = url.searchParams.get('username')?.trim().toLowerCase() || '';
  const secret = authorized(req, username);
  if (!secret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase.rpc('read_termux_logs', {
    p_username: username,
    p_secret: secret,
    p_limit: 10000,
  });
  if (error) return rpcErrorResponse(error.message);
  return NextResponse.json({ username, logs: Array.isArray(data) ? data : [] }, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}

export async function POST(req: NextRequest) {
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  try {
    const body = await req.json();
    const username = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : '';
    const secret = authorized(req, username);
    if (!secret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!Array.isArray(body?.logs) || body.logs.length < 1 || body.logs.length > 100) {
      return NextResponse.json({ error: 'Provide between 1 and 100 log lines.' }, { status: 400 });
    }

    const logs = body.logs.map((entry: unknown) => {
      const item = typeof entry === 'string' ? { line: entry, timestamp: Date.now() } : entry as { line?: unknown; timestamp?: unknown };
      return {
        line: typeof item?.line === 'string' ? item.line.slice(0, 4000) : '',
        timestamp: Number.isFinite(Number(item?.timestamp)) ? Number(item.timestamp) : Date.now(),
      };
    });
    if (logs.some((entry: { line: string }) => !entry.line)) {
      return NextResponse.json({ error: 'Each log line must contain text.' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('append_termux_logs', {
      p_username: username,
      p_secret: secret,
      p_logs: logs,
    });
    if (error) return rpcErrorResponse(error.message);
    return NextResponse.json({ success: true, ...((data && typeof data === 'object') ? data : {}) });
  } catch (_) {
    return NextResponse.json({ error: 'Invalid log batch.' }, { status: 400 });
  }
}
