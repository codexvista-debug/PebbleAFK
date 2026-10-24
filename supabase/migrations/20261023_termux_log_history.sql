-- Per-PebbleAFK-user daemon history. Only the authenticated RPCs below can
-- read/write it; raw anon/authenticated table access stays blocked by RLS.
create extension if not exists pgcrypto with schema extensions;
do $$
begin
  execute 'create extension if not exists pg_cron';
exception when others then
  raise notice 'pg_cron is unavailable; expired rows will still be purged on log reads/writes.';
end;
$$;

create table if not exists public.termux_logs (
  id bigint generated always as identity primary key,
  username text not null,
  line text not null,
  created_at timestamptz not null default now()
);

create index if not exists termux_logs_owner_time_idx
  on public.termux_logs (lower(username), created_at desc);

alter table public.termux_logs enable row level security;

create or replace function public.verify_termux_log_owner(p_username text, p_secret text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_password_hash text;
  v_username text := lower(trim(coalesce(p_username, '')));
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

create or replace function public.append_termux_logs(p_username text, p_secret text, p_logs jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_username text := lower(trim(coalesce(p_username, '')));
  v_inserted integer := 0;
  v_item jsonb;
  v_line text;
  v_ms double precision;
  v_timestamp timestamptz;
begin
  if not public.verify_termux_log_owner(v_username, p_secret) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if jsonb_typeof(p_logs) <> 'array' or jsonb_array_length(p_logs) > 100 then
    raise exception 'invalid log batch';
  end if;

  for v_item in select value from jsonb_array_elements(p_logs)
  loop
    v_line := left(coalesce(v_item->>'line', ''), 4000);
    if v_line <> '' then
      begin
        v_ms := (v_item->>'timestamp')::double precision;
        v_timestamp := to_timestamp(v_ms / 1000.0);
        if v_timestamp < now() - interval '7 days' or v_timestamp > now() + interval '5 minutes' then
          v_timestamp := now();
        end if;
      exception when others then
        v_timestamp := now();
      end;
      insert into public.termux_logs (username, line, created_at)
      values (v_username, v_line, v_timestamp);
      v_inserted := v_inserted + 1;
    end if;
  end loop;
  delete from public.termux_logs where created_at < now() - interval '24 hours';
  return jsonb_build_object('inserted', v_inserted);
end;
$$;

create or replace function public.read_termux_logs(p_username text, p_secret text, p_limit integer default 10000)
returns table (id bigint, line text, created_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_username text := lower(trim(coalesce(p_username, '')));
begin
  if not public.verify_termux_log_owner(v_username, p_secret) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  delete from public.termux_logs where lower(username) = v_username and termux_logs.created_at < now() - interval '24 hours';
  return query
    select recent.id, recent.line, recent.created_at
    from (
      select l.id, l.line, l.created_at
      from public.termux_logs l
      where lower(l.username) = v_username and l.created_at >= now() - interval '24 hours'
      order by l.created_at desc, l.id desc
      limit greatest(1, least(coalesce(p_limit, 10000), 10000))
    ) recent
    order by recent.created_at asc, recent.id asc;
end;
$$;

create or replace function public.purge_expired_termux_logs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.termux_logs where created_at < now() - interval '24 hours';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on public.termux_logs from anon, authenticated;
revoke all on function public.verify_termux_log_owner(text, text) from public, anon, authenticated;
revoke all on function public.append_termux_logs(text, text, jsonb) from public;
revoke all on function public.read_termux_logs(text, text, integer) from public;
revoke all on function public.purge_expired_termux_logs() from public, anon, authenticated;
grant execute on function public.append_termux_logs(text, text, jsonb) to anon, authenticated;
grant execute on function public.read_termux_logs(text, text, integer) to anon, authenticated;

-- Supabase projects with pg_cron installed purge continuously; reads and writes
-- also purge that user's expired rows, so retention still works without pg_cron.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      execute $schedule$select cron.schedule('pebbleafk-termux-log-retention', '*/15 * * * *', 'select public.purge_expired_termux_logs()')$schedule$;
    exception when others then
      raise notice 'Could not register Termux log retention cron job: %', sqlerrm;
    end;
  end if;
end;
$$;
