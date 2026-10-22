-- ==============================================================================
-- MAGIC SCRIPT NEXUS: PRODUCTION BACKEND SECURITY HARDENING & RATE LIMITING
-- Database: Supabase / PostgreSQL 15+
-- Schema: public
-- Version: 2.2.0-Production
--
-- Security Pillars:
-- 1. Zero-Trust Access Model: Anon role has ZERO table access (SELECT, INSERT, UPDATE, DELETE denied).
-- 2. Concurrency-Safe Atomic Advisory Locks per Account ID.
-- 3. Failed-Attempt Accounting: Committed without rollback; zero trust in client-side reporting.
-- 4. Lockout Preservation: Attempts during active lockout do not extend the lockout indefinitely.
-- 5. Privileged Maintenance: Pruning restricted to administrators and service_role.
-- 6. Column-Level Least Privilege: Secret code_hash is never exposed to authenticated or anon queries.
-- 7. Full Schema Compatibility: Idempotent and independent of optional visitor telemetry schema.
-- ==============================================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------------------
-- 1. RATE LIMITING AUDIT PLANE
-- ------------------------------------------------------------------------------
create table if not exists public.game_access_rate_limits (
  id uuid primary key default gen_random_uuid(),
  account_id text not null,
  success boolean not null default false,
  attempt_time timestamptz not null default now(),
  ip_pseudo_hash text,
  constraint game_access_rate_limits_account_id check (account_id ~ '^[0-9]{9,11}$')
);

create index if not exists idx_rate_limits_account_window 
  on public.game_access_rate_limits (account_id, attempt_time desc);

alter table public.game_access_rate_limits enable row level security;

-- Revoke all direct permissions on rate limit table from anon and public
revoke all on table public.game_access_rate_limits from public, anon;
revoke all on table public.game_access_rate_limits from authenticated;
grant select on table public.game_access_rate_limits to authenticated;
grant all on table public.game_access_rate_limits to service_role;

drop policy if exists game_access_rate_limits_admin_select on public.game_access_rate_limits;
create policy game_access_rate_limits_admin_select on public.game_access_rate_limits
  for select to authenticated
  using (public.has_admin_role('admin'));


-- ------------------------------------------------------------------------------
-- 2. HARDENED REDEMPTION RPC WITH ATOMIC ADVISORY LOCK & RATE LIMITING
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
  v_last_success timestamptz;
begin
  -- A. Strict Input Sanitization & Validation
  if p_account_id is null or p_account_id !~ '^[0-9]{9,11}$' then
    raise exception using errcode = '22023', message = 'INVALID_ACCOUNT_ID';
  end if;

  if p_code_hash is null or char_length(p_code_hash) <> 64 or p_code_hash !~ '^[0-9a-fA-F]{64}$' then
    raise exception using errcode = '22023', message = 'INVALID_ACCESS_CODE';
  end if;

  -- B. Concurrency-Safe Atomic Coordination: Transaction-scoped advisory lock per account ID
  perform pg_advisory_xact_lock(hashtext('game_access_account:' || p_account_id));

  -- C. Rate Limit Enforcement: Failures since last successful redemption within 5-minute window
  select coalesce(max(attempt_time), '1970-01-01'::timestamptz) into v_last_success
  from public.game_access_rate_limits
  where account_id = p_account_id
    and success = true;

  select count(*) into v_recent_failures
  from public.game_access_rate_limits
  where account_id = p_account_id
    and success = false
    and attempt_time > (now() - v_lockout_window)
    and attempt_time > v_last_success;

  if v_recent_failures >= v_max_failures then
    -- Lockout active: Do not insert another failure record during lockout to prevent DoS window extension
    raise exception using 
      errcode = 'P0001', 
      message = 'RATE_LIMIT_EXCEEDED: Security threshold triggered. Too many failed attempts for this Account ID. Please wait 5 minutes before retrying.';
  end if;

  -- D. Atomic Lock & Fetch Access Code
  select * into v_code
  from public.game_access_codes
  where game_access_codes.code_hash = lower(p_code_hash)
    and game_access_codes.active = true
    and game_access_codes.revoked_at is null
    and (game_access_codes.expires_at is null or game_access_codes.expires_at > now())
  for update;

  -- E. Failed Attempt Persistence (Commit without aborting transaction)
  if not found then
    insert into public.game_access_rate_limits (account_id, success, attempt_time)
    values (p_account_id, false, now());

    -- Return 0 rows. The transaction commits, ensuring the failure row persists on disk!
    -- Callers check (!row || !row.token) and map to GameAccessError('unavailable').
    return;
  end if;

  -- F. Success Path: Increment usage and record activation
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

  -- Record successful attempt to reset threshold context for subsequent attempts
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
      s.expires_at > now()
      and c.active = true
      and c.revoked_at is null
    ) as valid,
    s.expires_at,
    now() as server_now,
    s.account_id
  from public.game_access_sessions s
  join public.game_access_codes c on c.id = s.code_id
  where s.token_hash = lower(p_token_hash)
  limit 1;
$$;


-- ------------------------------------------------------------------------------
-- 4. PRIVILEGED MAINTENANCE PRUNING (SECURITY DEFINER)
-- ------------------------------------------------------------------------------
create or replace function public.prune_game_rate_limits(p_older_than interval default interval '24 hours')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  -- Only authenticated administrators or service_role can execute maintenance pruning
  if not public.has_admin_role('admin') and current_user != 'service_role' then
    raise exception using errcode = '42501', message = 'Only administrators or service role can prune rate limit records.';
  end if;

  if p_older_than < interval '1 hour' or p_older_than > interval '365 days' then
    raise exception using errcode = '22023', message = 'INVALID_RETENTION_WINDOW';
  end if;

  delete from public.game_access_rate_limits
  where attempt_time < (now() - p_older_than);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.prune_game_rate_limits(interval) from public, anon;
grant execute on function public.prune_game_rate_limits(interval) to authenticated, service_role;

-- Seamless integration into existing security monitoring cleanup workflow
create or replace function public.prune_security_monitoring(p_retention_days integer default 90)
returns table (events_deleted bigint, visitors_deleted bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_events bigint := 0;
  v_visitors bigint := 0;
  v_cutoff timestamptz;
begin
  if not public.has_admin_role('admin') and current_user != 'service_role' then
    raise exception using errcode = '42501', message = 'Only administrators can prune monitoring data.';
  end if;

  if p_retention_days is null or p_retention_days < 7 or p_retention_days > 365 then
    raise exception using errcode = '22023', message = 'INVALID_RETENTION';
  end if;

  v_cutoff := now() - (p_retention_days || ' days')::interval;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'security_events') then
    delete from public.security_events where created_at < v_cutoff;
    get diagnostics v_events = row_count;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'visitor_sessions') then
    delete from public.visitor_sessions where last_seen_at < v_cutoff;
    get diagnostics v_visitors = row_count;
  end if;

  -- Maintain rate limits in the same maintenance sweep (prune records older than 24 hours)
  perform public.prune_game_rate_limits(interval '24 hours');

  return query select v_events, v_visitors;
end;
$$;


-- ------------------------------------------------------------------------------
-- 5. PERMISSIONS & ZERO-TRUST LEAST PRIVILEGE GRANTS
-- ------------------------------------------------------------------------------
-- Revoke all function execution from public
revoke all on function public.create_game_access_code(text, integer, uuid) from public, anon;
revoke all on function public.redeem_game_access(text, text) from public;
revoke all on function public.check_game_access(text) from public;

-- Grant execution to minimum required entry points
grant execute on function public.create_game_access_code(text, integer, uuid) to authenticated;
grant execute on function public.redeem_game_access(text, text) to anon, authenticated;
grant execute on function public.check_game_access(text) to anon, authenticated;

-- Explicitly revoke all direct CRUD privileges on core game tables from anon and public
revoke all on table public.game_access_codes from public, anon;
revoke all on table public.game_access_sessions from public, anon;

-- Maintain column-level least-privilege on game_access_codes (code_hash is NEVER granted)
revoke all on table public.game_access_codes from authenticated;
grant select (
  id, duration_minutes, active, expires_at, created_at, created_by,
  revoked_at, uses_count, account_id, redeemed_at
) on table public.game_access_codes to authenticated;
grant update (active, revoked_at) on table public.game_access_codes to authenticated;

revoke all on table public.game_access_sessions from authenticated;
grant select (id, code_id, account_id, created_at, expires_at)
  on table public.game_access_sessions to authenticated;

grant all on table public.game_access_codes, public.game_access_sessions to service_role;

-- Re-assert Row Level Security on core game tables
alter table public.game_access_codes enable row level security;
alter table public.game_access_sessions enable row level security;

-- Admin RLS Policies for authenticated administrators
drop policy if exists game_access_codes_admin_select on public.game_access_codes;
drop policy if exists game_access_codes_select on public.game_access_codes;
create policy game_access_codes_admin_select on public.game_access_codes
  for select to authenticated
  using (public.has_admin_role('admin'));

drop policy if exists game_access_codes_admin_update on public.game_access_codes;
drop policy if exists game_access_codes_update on public.game_access_codes;
create policy game_access_codes_admin_update on public.game_access_codes
  for update to authenticated
  using (public.has_admin_role('admin'))
  with check (public.has_admin_role('admin'));

drop policy if exists game_access_sessions_admin_select on public.game_access_sessions;
drop policy if exists game_access_sessions_select on public.game_access_sessions;
create policy game_access_sessions_admin_select on public.game_access_sessions
  for select to authenticated
  using (public.has_admin_role('admin'));
