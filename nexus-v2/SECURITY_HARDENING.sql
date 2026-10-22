-- ==============================================================================
-- MAGIC SCRIPT NEXUS: PRODUCTION BACKEND SECURITY HARDENING & RATE LIMITING
-- Database: Supabase / PostgreSQL 15+
-- Schema: public
-- Version: 2.1.0-Production
--
-- Security Pillars:
-- 1. Zero-Trust Access Model: Anon role has ZERO table access (SELECT, INSERT, UPDATE, DELETE denied).
-- 2. Strictly Gated RPCs: Only verified SECURITY DEFINER functions exposed to 'anon'.
-- 3. Server-Side Progressive Brute-Force Rate Limiting (Account ID + Window Locking).
-- 4. Cryptographic Nonce & Token Hashing (Zero plaintext tokens/hashes in transit or storage).
-- 5. Anti-Clock-Skew & Tamper Protection: Expirations derived exclusively from database clock (now()).
-- ==============================================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------------------
-- 1. RATE LIMITING AUDIT PLANE
-- ------------------------------------------------------------------------------
create table if not exists public.game_access_rate_limits (
  id uuid primary key default gen_random_uuid(),
  account_id text not null,
  success boolean not null default false,
  attempt_time timestamptz not null default timezone('utc', now()),
  ip_pseudo_hash text,
  constraint game_access_rate_limits_account_id check (account_id ~ '^[0-9]{9,11}$')
);

create index if not exists idx_rate_limits_account_window 
  on public.game_access_rate_limits (account_id, attempt_time desc);

alter table public.game_access_rate_limits enable row level security;

-- Revoke all direct permissions on rate limit table from anon and public
revoke all on table public.game_access_rate_limits from public, anon;
grant select on table public.game_access_rate_limits to authenticated;
grant all on table public.game_access_rate_limits to service_role;


-- ------------------------------------------------------------------------------
-- 2. HARDENED REDEMPTION RPC WITH RATE LIMITING (SECURITY DEFINER)
-- ------------------------------------------------------------------------------
create or replace function public.redeem_game_access(
  p_code_hash text, 
  p_account_id text
)
returns table (
  token text, 
  expires_at timestamptz, 
  server_now timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code public.game_access_codes;
  v_token text;
  v_recent_failures integer := 0;
  v_lockout_window interval := interval '5 minutes';
  v_max_failures integer := 5;
begin
  -- A. Strict Input Sanitization & Validation
  if p_account_id is null or p_account_id !~ '^[0-9]{9,11}$' then
    raise exception using errcode = '22023', message = 'INVALID_ACCOUNT_ID';
  end if;

  if p_code_hash is null or char_length(p_code_hash) <> 64 or p_code_hash !~ '^[0-9a-fA-F]{64}$' then
    raise exception using errcode = '22023', message = 'INVALID_ACCESS_CODE';
  end if;

  -- B. Rate Limit Enforcement: Max 5 failed attempts per Account in 5 minutes
  select count(*) into v_recent_failures
  from public.game_access_rate_limits
  where account_id = p_account_id
    and success = false
    and attempt_time > (now() - v_lockout_window);

  if v_recent_failures >= v_max_failures then
    -- Record excessive attempt event
    insert into public.game_access_rate_limits (account_id, success, attempt_time)
    values (p_account_id, false, now());

    raise exception using 
      errcode = 'P0001', 
      message = 'RATE_LIMIT_EXCEEDED: Security threshold triggered. Too many failed attempts for this Account ID. Please wait 5 minutes before retrying.';
  end if;

  -- C. Atomic Lock & Fetch Access Code
  select * into v_code
  from public.game_access_codes
  where game_access_codes.code_hash = lower(p_code_hash)
    and game_access_codes.active = true
    and game_access_codes.revoked_at is null
    and (game_access_codes.expires_at is null or game_access_codes.expires_at > now())
  for update;

  -- D. Failure Handling with Audit Logging
  if not found then
    -- Record failed attempt to trigger rate limit progression
    insert into public.game_access_rate_limits (account_id, success, attempt_time)
    values (p_account_id, false, now());

    raise exception using 
      errcode = '28000', 
      message = 'ACCESS_CODE_UNAVAILABLE: Invalid, expired, or already revoked access key.';
  end if;

  -- E. Success Path: Increment usage and record activation
  update public.game_access_codes
  set uses_count = uses_count + 1,
      account_id = p_account_id,
      redeemed_at = now()
  where game_access_codes.id = v_code.id;

  -- Generate 64-character high-entropy cryptographic bearer token
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  -- Register active session with server-calculated expiration
  insert into public.game_access_sessions (token_hash, code_id, account_id, expires_at)
  values (
    encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
    v_code.id,
    p_account_id,
    now() + make_interval(mins => v_code.duration_minutes)
  );

  -- Record successful attempt to reset threshold context
  insert into public.game_access_rate_limits (account_id, success, attempt_time)
  values (p_account_id, true, now());

  -- Return bearer token, server expiration, and server clock
  return query
    select
      v_token,
      now() + make_interval(mins => v_code.duration_minutes),
      now();
end;
$$;


-- ------------------------------------------------------------------------------
-- 3. HARDENED SESSION REVALIDATION RPC (SECURITY DEFINER)
-- ------------------------------------------------------------------------------
create or replace function public.check_game_access(p_token_hash text)
returns table (
  valid boolean, 
  expires_at timestamptz, 
  server_now timestamptz, 
  account_id text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    (
      s.expires_at > timezone('utc', now())
      and c.active = true
      and c.revoked_at is null
    ) as valid,
    s.expires_at,
    timezone('utc', now()) as server_now,
    s.account_id
  from public.game_access_sessions s
  join public.game_access_codes c on c.id = s.code_id
  where s.token_hash = lower(p_token_hash)
  limit 1;
$$;


-- ------------------------------------------------------------------------------
-- 4. PERMISSIONS & ZERO-TRUST LEAST PRIVILEGE GRANTS
-- ------------------------------------------------------------------------------
-- Ensure public/anon cannot execute administrative or schema routines
revoke all on function public.create_game_access_code(text, integer, uuid) from public, anon;
revoke all on function public.redeem_game_access(text, text) from public;
revoke all on function public.check_game_access(text) from public;

-- Grant execution ONLY to necessary entry points
grant execute on function public.create_game_access_code(text, integer, uuid) to authenticated;
grant execute on function public.redeem_game_access(text, text) to anon, authenticated;
grant execute on function public.check_game_access(text) to anon, authenticated;

-- Explicitly revoke all direct CRUD privileges on core game tables from anon and public
revoke all on table public.game_access_codes from public, anon;
revoke all on table public.game_access_sessions from public, anon;
revoke all on table public.visitor_sessions from public, anon;
revoke all on table public.security_events from public, anon;

-- Re-assert Row Level Security on all critical tables
alter table public.game_access_codes enable row level security;
alter table public.game_access_sessions enable row level security;
alter table public.visitor_sessions enable row level security;
alter table public.security_events enable row level security;

-- Admin RLS Policies for authenticated administrators
drop policy if exists game_access_codes_admin_select on public.game_access_codes;
create policy game_access_codes_admin_select on public.game_access_codes
  for select to authenticated
  using (public.has_admin_role('admin'));

drop policy if exists game_access_codes_admin_update on public.game_access_codes;
create policy game_access_codes_admin_update on public.game_access_codes
  for update to authenticated
  using (public.has_admin_role('admin'))
  with check (public.has_admin_role('admin'));

drop policy if exists game_access_sessions_admin_select on public.game_access_sessions;
create policy game_access_sessions_admin_select on public.game_access_sessions
  for select to authenticated
  using (public.has_admin_role('admin'));

drop policy if exists visitor_sessions_admin_select on public.visitor_sessions;
create policy visitor_sessions_admin_select on public.visitor_sessions
  for select to authenticated
  using (public.has_admin_role('admin'));

drop policy if exists security_events_admin_select on public.security_events;
create policy security_events_admin_select on public.security_events
  for select to authenticated
  using (public.has_admin_role('admin'));


-- ------------------------------------------------------------------------------
-- 5. AUTOMATED MAINTENANCE: PRUNE RATE LIMIT RECORDS OLDER THAN 24 HOURS
-- ------------------------------------------------------------------------------
create or replace function public.prune_game_rate_limits()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.game_access_rate_limits
  where attempt_time < (now() - interval '24 hours');
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.prune_game_rate_limits() from public, anon;
grant execute on function public.prune_game_rate_limits() to authenticated, service_role;
