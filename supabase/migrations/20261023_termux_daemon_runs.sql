create table if not exists public.termux_daemon_runs (
  run_id uuid primary key default gen_random_uuid(),
  username text not null,
  instance_id text not null,
  started_at timestamptz not null,
  last_seen_at timestamptz not null,
  ended_at timestamptz,
  stable_bots text[] not null default '{}',
  peak_stable_bots integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists termux_daemon_runs_owner_started_idx
  on public.termux_daemon_runs (username, started_at desc);
alter table public.termux_daemon_runs enable row level security;
revoke all on public.termux_daemon_runs from public, anon, authenticated;

create or replace function public.write_termux_daemon_status(
  p_username text,
  p_secret text,
  p_daemon_started_at_ms bigint,
  p_last_seen_at_ms bigint,
  p_instance_id text default '',
  p_is_online boolean default true,
  p_stable_bots text[] default '{}'
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
  v_instance_id text := left(coalesce(p_instance_id, ''), 120);
  v_active public.termux_daemon_runs%rowtype;
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

  select * into v_active from public.termux_daemon_runs
  where username = v_username and ended_at is null
  order by started_at desc limit 1 for update;

  if found and (not coalesce(p_is_online, true)
    or v_active.instance_id is distinct from v_instance_id
    or v_active.last_seen_at < now() - interval '75 seconds') then
    update public.termux_daemon_runs
      set ended_at = case
        when not coalesce(p_is_online, true) then v_last_seen_at
        when v_active.last_seen_at < now() - interval '75 seconds' then v_active.last_seen_at + interval '75 seconds'
        else v_active.last_seen_at
      end
    where run_id = v_active.run_id;
    v_active := null;
  end if;

  if coalesce(p_is_online, true) and v_active.run_id is null then
    insert into public.termux_daemon_runs(username, instance_id, started_at, last_seen_at, stable_bots, peak_stable_bots)
    values (v_username, v_instance_id, v_started_at, v_last_seen_at,
      coalesce(p_stable_bots, '{}'), cardinality(coalesce(p_stable_bots, '{}')))
    returning * into v_active;
  elsif coalesce(p_is_online, true) then
    update public.termux_daemon_runs as run set
      last_seen_at = v_last_seen_at,
      stable_bots = array(select distinct names.bot_name from unnest(run.stable_bots || coalesce(p_stable_bots, '{}')) as names(bot_name) order by names.bot_name),
      peak_stable_bots = greatest(run.peak_stable_bots, cardinality(coalesce(p_stable_bots, '{}')))
    where run.run_id = v_active.run_id;
  end if;

  insert into public.termux_daemon_status as current_status (
    username, daemon_started_at, last_seen_at, last_disconnected_at, instance_id, is_online, updated_at
  ) values (
    v_username, v_started_at, v_last_seen_at,
    case when coalesce(p_is_online, true) then null else v_last_seen_at end,
    v_instance_id, coalesce(p_is_online, true), now()
  ) on conflict (username) do update set
    last_disconnected_at = case
      when not coalesce(p_is_online, true) then v_last_seen_at
      when current_status.is_online and current_status.last_seen_at < now() - interval '75 seconds'
        then current_status.last_seen_at + interval '75 seconds'
      when current_status.is_online and current_status.daemon_started_at is distinct from v_started_at
        then current_status.last_seen_at
      else current_status.last_disconnected_at
    end,
    daemon_started_at = v_started_at,
    last_seen_at = v_last_seen_at,
    instance_id = v_instance_id,
    is_online = coalesce(p_is_online, true),
    updated_at = now();

  return jsonb_build_object('accepted', true);
end;
$$;

create or replace function public.read_termux_daemon_runs(p_username text, p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text := lower(trim(coalesce(p_username, '')));
  v_runs jsonb;
begin
  if not public.verify_termux_daemon_owner(v_username, p_secret) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'instanceId', run.instance_id,
    'startedAt', floor(extract(epoch from run.started_at) * 1000)::bigint,
    'endedAt', case when run.ended_at is not null then floor(extract(epoch from run.ended_at) * 1000)::bigint
      when run.last_seen_at < now() - interval '75 seconds' then floor(extract(epoch from (run.last_seen_at + interval '75 seconds')) * 1000)::bigint
      else null end,
    'lastSeenAt', floor(extract(epoch from run.last_seen_at) * 1000)::bigint,
    'stableBots', to_jsonb(run.stable_bots),
    'peakStableBots', run.peak_stable_bots
  ) order by run.started_at desc), '[]'::jsonb) into v_runs
  from (select * from public.termux_daemon_runs where username = v_username order by started_at desc limit 5) run;
  return v_runs;
end;
$$;

revoke all on function public.write_termux_daemon_status(text, text, bigint, bigint, text, boolean, text[]) from public;
grant execute on function public.write_termux_daemon_status(text, text, bigint, bigint, text, boolean, text[]) to anon, authenticated;
revoke all on function public.read_termux_daemon_runs(text, text) from public;
grant execute on function public.read_termux_daemon_runs(text, text) to anon, authenticated;
