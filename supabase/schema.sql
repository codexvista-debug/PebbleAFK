-- ==============================================================================
--    PebbleAFK - Complete Multi-User Schema (Bedrock Edition)
-- ==============================================================================

-- 1. Users table (for username + password authentication)
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 2. Tunnels / Device Pairing table (links phone/host tunnel to username)
create table if not exists public.tunnels (
  username text primary key,
  daemon_url text not null,
  daemon_token text default '',
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- 3. Bedrock Bot Accounts (linked directly to the username)
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null,               -- Links to public.users(username)
  bot_name text not null,               -- In-game Bedrock Gamertag / Email
  auth_type text default 'microsoft' check (auth_type in ('microsoft', 'offline')),
  server_host text not null,
  server_port integer default 19132,    -- Bedrock default port (19132)
  server_version text default 'auto',
  
  -- Bot settings
  auto_reconnect boolean default true,
  anti_afk jsonb default '{"enabled": true, "interval": 10, "swing": true, "rotate": true, "sneak": true}'::jsonb,
  
  -- Survival settings (Disabled by default)
  survival jsonb default '{"autoEat": false, "autoTotem": false}'::jsonb,
  
  -- Mob Farm settings
  mob_farm jsonb default '{"enabled": false, "targetRange": 3.5, "attackCooldownMs": 650}'::jsonb,
  
  -- Physics & Server compatibility
  settings jsonb default '{"physics": true, "acceptResourcePacks": true, "muteErrors": false, "autoDisconnectOnBan": false}'::jsonb,
  
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- 4. Enable RLS
alter table public.users enable row level security;
alter table public.tunnels enable row level security;
alter table public.accounts enable row level security;

-- Open policies for effortless client access
create policy "Allow all read/write for users" on public.users for all using (true) with check (true);
create policy "Allow all read/write for tunnels" on public.tunnels for all using (true) with check (true);
create policy "Allow all read/write for accounts" on public.accounts for all using (true) with check (true);

-- Run supabase/migrations/20261023_termux_log_history.sql after this base
-- schema to install private, per-user Termux log retention and its API RPCs.
