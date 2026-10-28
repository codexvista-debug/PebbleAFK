import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { generateSecretCode } from '@/lib/authUtils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isAuthorizedChief(req: NextRequest, passwordHash: string, username: string) {
  const supplied = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || '';
  if (!/^pb_[a-f0-9]{10}$/i.test(supplied)) return false;
  const expected = generateSecretCode(username, passwordHash);
  return crypto.timingSafeEqual(Buffer.from(supplied.toLowerCase()), Buffer.from(expected.toLowerCase()));
}

export async function GET(req: NextRequest) {
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });

  const { data: chiefRows, error: chiefError } = await supabase
    .from('users')
    .select('username, password_hash')
    .ilike('username', 'chief')
    .limit(1);
  if (chiefError) {
    console.warn('[Admin Termux Stream] Could not verify administrator:', chiefError.message);
    return NextResponse.json({ error: 'Could not verify administrator access.' }, { status: 503 });
  }
  const chief = chiefRows?.[0];
  if (!chief?.password_hash || !isAuthorizedChief(req, chief.password_hash, chief.username)) {
    return NextResponse.json({ error: 'Chief administrator access required.' }, { status: 403 });
  }

  const url = new URL(req.url);
  const target = url.searchParams.get('username')?.trim().toLowerCase() || '';
  if (target && !/^[a-z0-9]{1,16}$/i.test(target)) {
    return NextResponse.json({ error: 'Invalid Pebble username.' }, { status: 400 });
  }

  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('username, password_hash')
    .order('username', { ascending: true });
  if (usersError) {
    console.warn('[Admin Termux Stream] Could not list users:', usersError.message);
    return NextResponse.json({ error: 'Could not load Pebble users.' }, { status: 503 });
  }

  const usernames = (users || []).map((user) => user.username).filter((name): name is string => typeof name === 'string');
  if (!target) return NextResponse.json({ usernames }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });

  const owner = users?.find((user) => user.username?.toLowerCase() === target);
  if (!owner?.password_hash) return NextResponse.json({ error: 'Pebble user not found.' }, { status: 404 });
  const ownerSecret = generateSecretCode(owner.username, owner.password_hash);

  const [logsResult, statusResult, runsResult] = await Promise.all([
    supabase.rpc('read_termux_logs', { p_username: target, p_secret: ownerSecret, p_limit: 10000 }),
    supabase.rpc('read_termux_daemon_status', { p_username: target, p_secret: ownerSecret }),
    supabase.rpc('read_termux_daemon_runs', { p_username: target, p_secret: ownerSecret }),
  ]);

  if (logsResult.error || statusResult.error) {
    const message = logsResult.error?.message || statusResult.error?.message || 'Supabase request failed.';
    console.warn('[Admin Termux Stream] Could not load user stream:', message);
    return NextResponse.json({ error: 'Could not load this user’s Termux stream.' }, { status: 503 });
  }

  const logLines = Array.isArray(logsResult.data) ? logsResult.data : [];
  const daemonRevision = [...logLines].reverse().map((entry: { line?: unknown }) => {
    if (typeof entry?.line !== 'string') return '';
    return entry.line.match(/\[Build\] Revision ([a-f0-9]{7,40})\b/i)?.[1] || '';
  }).find(Boolean) || '';
  const expectedRevision = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_GIT_COMMIT_SHA || '').trim();

  return NextResponse.json({
    username: owner.username,
    usernames,
    logs: logLines,
    status: statusResult.data || null,
    runs: Array.isArray(runsResult.data) ? runsResult.data : [],
    daemonRevision,
    expectedRevision,
  }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
