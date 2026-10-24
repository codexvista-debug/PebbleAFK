-- Persist the Termux process lifetime independently of any browser session.
create extension if not exists pgcrypto with schema extensions;

create or replace function public.verify_termux_daemon_owner(p_username text, p_secret text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_username text := lower(trim(coalesce(p_username, '')));
  v_password_hash text;
  v_expected text;
begin
  if v_username !~ '^[a-z0-9]{1,16}$' then return false; end if;
  select u.password_hash into v_password_hash
  from public.users u
  where lower(u.username) = v_username
  order by u.created_at asc
  limit 1;
  if v_password_hash is null then return false; end if;
  v_expected := 'pb_' || substr(encode(digest(v_username || ':' || v_password_hash || ':_pbb_extra_bedrock_sec', 'sha256'), 'hex'), 1, 10);
  return lower(coalesce(p_secret, '')) = v_expected;
end;
$$;

create table if not exists public.termux_daemon_status (
  username text primary key,
  daemon_started_at timestamptz not null,
  last_seen_at timestamptz not null,
  last_disconnected_at timestamptz,
  instance_id text not null default '',
  is_online boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.termux_daemon_status enable row level security;
revoke all on public.termux_daemon_status from public, anon, authenticated;

create or replace function public.write_termux_daemon_status(
  p_username text,
  p_secret text,
  p_daemon_started_at_ms bigint,
  p_last_seen_at_ms bigint,
  p_instance_id text default '',
  p_is_online boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text := lower(trim(coalesce(p_username, '')));
  v_started_at timestamptz;
  v_last_seen_at timestamptz;
begin
  if not public.verify_termux_daemon_owner(v_username, p_secret) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if p_daemon_started_at_ms is null or p_daemon_started_at_ms <= 0
    or p_last_seen_at_ms is null or p_last_seen_at_ms <= 0 then
    raise exception 'invalid daemon timestamps';
  end if;

  v_started_at := to_timestamp(p_daemon_started_at_ms / 1000.0);
  v_last_seen_at := to_timestamp(p_last_seen_at_ms / 1000.0);
  if v_started_at > now() + interval '1 minute' or v_last_seen_at > now() + interval '1 minute' then
    raise exception 'daemon timestamps cannot be in the future';
  end if;
  if v_last_seen_at < now() - interval '2 days' then v_last_seen_at := now(); end if;

  insert into public.termux_daemon_status as current_status (
    username, daemon_started_at, last_seen_at, last_disconnected_at, instance_id, is_online, updated_at
  ) values (
    v_username, v_started_at, v_last_seen_at,
    case when coalesce(p_is_online, true) then null else v_last_seen_at end,
    left(coalesce(p_instance_id, ''), 120), coalesce(p_is_online, true), now()
  )
  on conflict (username) do update set
    last_disconnected_at = case
      when not coalesce(p_is_online, true) then v_last_seen_at
      when current_status.is_online and current_status.last_seen_at < now() - interval '75 seconds'
        then current_status.last_seen_at + interval '45 seconds'
      when current_status.is_online and current_status.daemon_started_at is distinct from v_started_at
        then current_status.last_seen_at
      else current_status.last_disconnected_at
    end,
    daemon_started_at = v_started_at,
    last_seen_at = v_last_seen_at,
    instance_id = left(coalesce(p_instance_id, ''), 120),
    is_online = coalesce(p_is_online, true),
    updated_at = now();

  return jsonb_build_object('accepted', true);
end;
$$;

create or replace function public.read_termux_daemon_status(p_username text, p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text := lower(trim(coalesce(p_username, '')));
  v_status public.termux_daemon_status%rowtype;
  v_online boolean;
  v_disconnected_at timestamptz;
begin
  if not public.verify_termux_daemon_owner(v_username, p_secret) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select * into v_status from public.termux_daemon_status where username = v_username;
  if not found then
    return jsonb_build_object(
      'daemonStartedAt', null,
      'lastSeenAt', null,
      'lastDisconnectedAt', null,
      'isOnline', false,
      'instanceId', null
    );
  end if;

  v_online := v_status.is_online and v_status.last_seen_at >= now() - interval '75 seconds';
  v_disconnected_at := v_status.last_disconnected_at;
  if v_status.is_online and not v_online then
    v_disconnected_at := v_status.last_seen_at + interval '45 seconds';
  end if;

  return jsonb_build_object(
    'daemonStartedAt', floor(extract(epoch from v_status.daemon_started_at) * 1000)::bigint,
    'lastSeenAt', floor(extract(epoch from v_status.last_seen_at) * 1000)::bigint,
    'lastDisconnectedAt', case when v_disconnected_at is null then null else floor(extract(epoch from v_disconnected_at) * 1000)::bigint end,
    'isOnline', v_online,
    'instanceId', v_status.instance_id
  );
end;
$$;

revoke all on function public.verify_termux_daemon_owner(text, text) from public, anon, authenticated;
revoke all on function public.write_termux_daemon_status(text, text, bigint, bigint, text, boolean) from public;
revoke all on function public.read_termux_daemon_status(text, text) from public;
grant execute on function public.write_termux_daemon_status(text, text, bigint, bigint, text, boolean) to anon, authenticated;
grant execute on function public.read_termux_daemon_status(text, text) to anon, authenticated;
