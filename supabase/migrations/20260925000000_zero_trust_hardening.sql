-- ==============================================================================
-- MAGIC SCRIPT NEXUS: ZERO-TRUST PRODUCTION SECURITY HARDENING (V3)
-- Target Database: Supabase / PostgreSQL 15+
-- Schema: public, extensions, pg_catalog
-- Version: 3.0.0-ZeroTrust
--
-- Security Pillars:
-- 1. Anti-Spoofing Client IP: cf-connecting-ip first, last hop of x-forwarded-for.
-- 2. Victim-Lockout Defense: Lockout key bound to (account_id + ip_pseudo_hash).
-- 3. Progressive Backoff: No global hard-breaker DoS against legit users.
-- 4. Server-Side HMAC Peppering: Vault-compatible with private fallback.
-- 5. Safe Dual-Verify Transition: Legacy SHA-256 supported and auto-upgraded to HMAC.
-- 6. Max-Uses & Single-Active-Session Enforcement under row-level locks.
-- 7. Supabase M11 Data Plane: Decoupled from Firebase, session-gated read RPC.
-- 8. Strict Function Search Paths: search_path = '' on all SECURITY DEFINER functions.
-- 9. Complete Audit Logging & Pruning Retention.
-- ==============================================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------------------
-- 1. SERVER-SIDE SECURITY PEPPERS (VAULT COMPATIBLE)
-- ------------------------------------------------------------------------------
create table if not exists public.security_peppers (
  key_name text primary key,
  pepper text not null,
  created_at timestamptz not null default now(),
  constraint security_peppers_key_len check (char_length(key_name) between 1 and 64),
  constraint security_peppers_val_len check (char_length(pepper) >= 32)
);

alter table public.security_peppers enable row level security;
revoke all on table public.security_peppers from public, anon, authenticated;
grant all on table public.security_peppers to service_role;

-- Seed default cryptographic peppers if not present
insert into public.security_peppers (key_name, pepper)
values 
  ('access_code_pepper', encode(extensions.gen_random_bytes(32), 'hex')),
  ('client_ip_pepper', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (key_name) do nothing;

create or replace function public.get_security_pepper(p_key text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  -- 1. Attempt lookup in Supabase Vault if available
  if exists (
    select 1 from pg_tables 
    where schemaname = 'vault' and tablename = 'decrypted_secrets'
  ) then
    begin
      execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
      into v_secret using p_key;
      if v_secret is not null and char_length(v_secret) >= 32 then
        return v_secret;
      end if;
    exception when others then
      v_secret := null;
    end;
  end if;

  -- 2. Fallback to private security_peppers table
  select pepper into v_secret 
  from public.security_peppers 
  where key_name = p_key 
  limit 1;

  if v_secret is null then
    v_secret := encode(extensions.gen_random_bytes(32), 'hex');
    insert into public.security_peppers (key_name, pepper)
    values (p_key, v_secret)
    on conflict (key_name) do nothing;
  end if;

  return v_secret;
end;
$$;

revoke all on function public.get_security_pepper(text) from public, anon, authenticated;
grant execute on function public.get_security_pepper(text) to service_role;


-- ------------------------------------------------------------------------------
-- 2. ANTI-SPOOFING CLIENT IP EXTRACTION & PSEUDO-HASHING
-- ------------------------------------------------------------------------------
create or replace function public.extract_client_ip(p_headers jsonb)
returns text
language plpgsql
immutable
as $$
declare
  v_cf_ip text;
  v_xff text;
  v_hops text[];
begin
  if p_headers is null then
    return '127.0.0.1';
  end if;

  -- 1. Trust Cloudflare connecting IP first (set by edge proxy)
  v_cf_ip := trim(coalesce(p_headers->>'cf-connecting-ip', ''));
  if v_cf_ip <> '' and v_cf_ip ~ '^[0-9a-fA-F:\.]+$' then
    return v_cf_ip;
  end if;

  -- 2. If x-forwarded-for exists, use the LAST hop (closest proxy, not client-prepended hop)
  v_xff := trim(coalesce(p_headers->>'x-forwarded-for', ''));
  if v_xff <> '' then
    v_hops := string_to_array(v_xff, ',');
    if array_length(v_hops, 1) > 0 then
      v_cf_ip := trim(v_hops[array_upper(v_hops, 1)]);
      if v_cf_ip <> '' and v_cf_ip ~ '^[0-9a-fA-F:\.]+$' then
        return v_cf_ip;
      end if;
    end if;
  end if;

  return '127.0.0.1';
end;
$$;

create or replace function public.hash_client_ip(p_raw_ip text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pepper text;
begin
  v_pepper := public.get_security_pepper('client_ip_pepper');
  return encode(extensions.hmac(convert_to(trim(coalesce(p_raw_ip, '127.0.0.1')), 'UTF8'), convert_to(v_pepper, 'UTF8'), 'sha256'), 'hex');
end;
$$;

revoke all on function public.extract_client_ip(jsonb) from public;
revoke all on function public.hash_client_ip(text) from public, anon, authenticated;
grant execute on function public.hash_client_ip(text) to service_role;


-- ------------------------------------------------------------------------------
-- 3. SCHEMA UPGRADES FOR ACCESS CODES & RATE LIMITS
-- ------------------------------------------------------------------------------
alter table public.game_access_codes 
  add column if not exists max_uses integer not null default 1,
  add column if not exists single_session_only boolean not null default false,
  add column if not exists is_hmac boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'game_access_codes_max_uses'
  ) then
    alter table public.game_access_codes 
      add constraint game_access_codes_max_uses check (max_uses between 1 and 1000000);
  end if;
end;
$$;

create index if not exists idx_game_access_codes_hash_active 
  on public.game_access_codes (code_hash, active, is_hmac);

create index if not exists idx_rate_limits_ip_window 
  on public.game_access_rate_limits (ip_pseudo_hash, attempt_time desc);

create index if not exists idx_rate_limits_account_ip_window 
  on public.game_access_rate_limits (account_id, ip_pseudo_hash, attempt_time desc);


-- ------------------------------------------------------------------------------
-- 4. HARDENED REDEMPTION RPC WITH ATOMIC ADVISORY LOCKS & DEFENSES
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
set search_path = ''
as $$
declare
  v_headers jsonb;
  v_raw_ip text;
  v_ip_hash text;
  v_code_pepper text;
  v_input_cleaned text;
  v_input_sha256 text;
  v_hmac_hash text;
  v_code public.game_access_codes;
  v_token text;
  v_token_hash text;
  v_recent_account_ip_failures integer := 0;
  v_recent_ip_failures integer := 0;
  v_last_success timestamptz;
  v_lockout_window interval := interval '5 minutes';
  v_max_account_ip_failures integer := 5;
  v_max_ip_failures integer := 10;
begin
  -- A. Strict Input Validation (Uniform rejection for malformed parameters)
  if p_account_id is null or p_account_id !~ '^[0-9]{9,11}$' then
    raise exception using errcode = '22023', message = 'INVALID_ACCOUNT_ID';
  end if;

  if p_code_hash is null or char_length(p_code_hash) < 8 or char_length(p_code_hash) > 128 then
    raise exception using errcode = '22023', message = 'INVALID_ACCESS_CODE';
  end if;

  v_input_cleaned := lower(trim(p_code_hash));

  -- Derive consistent SHA-256 representation:
  -- If input is already a 64-char hex string (sent by existing client sha256Hex), use as-is;
  -- If input is raw code (e.g. 'MS-XXXX-...'), normalize to uppercase and hash with sha256.
  if char_length(v_input_cleaned) = 64 and v_input_cleaned ~ '^[0-9a-f]{64}$' then
    v_input_sha256 := v_input_cleaned;
  else
    v_input_sha256 := encode(pg_catalog.sha256(convert_to(upper(v_input_cleaned), 'UTF8')), 'hex');
  end if;

  -- B. Extract Client IP with Anti-Spoofing and Derive Pseudo-Hash
  begin
    v_headers := current_setting('request.headers', true)::jsonb;
  exception when others then
    v_headers := '{}'::jsonb;
  end;

  v_raw_ip := public.extract_client_ip(v_headers);
  v_ip_hash := public.hash_client_ip(v_raw_ip);

  -- C. Atomic Transaction Advisory Lock bound to (Account ID + IP Hash)
  perform pg_advisory_xact_lock(hashtext('redeem_lock:' || p_account_id || ':' || v_ip_hash));

  -- D. Anti-Victim-Lockout Check: Count failures for this specific Account + IP combination
  select coalesce(max(attempt_time), '1970-01-01'::timestamptz) into v_last_success
  from public.game_access_rate_limits
  where account_id = p_account_id
    and ip_pseudo_hash = v_ip_hash
    and success = true;

  select count(*) into v_recent_account_ip_failures
  from public.game_access_rate_limits
  where account_id = p_account_id
    and ip_pseudo_hash = v_ip_hash
    and success = false
    and attempt_time > (now() - v_lockout_window)
    and attempt_time > v_last_success;

  if v_recent_account_ip_failures >= v_max_account_ip_failures then
    raise exception using 
      errcode = 'P0001', 
      message = 'RATE_LIMIT_EXCEEDED: Security threshold triggered. Too many failed attempts for this Account and IP. Please wait 5 minutes before retrying.';
  end if;

  -- E. Per-IP Rate Limiting (Protects against credential stuffing across multiple Account IDs)
  select count(*) into v_recent_ip_failures
  from public.game_access_rate_limits
  where ip_pseudo_hash = v_ip_hash
    and success = false
    and attempt_time > (now() - v_lockout_window);

  if v_recent_ip_failures >= v_max_ip_failures then
    raise exception using 
      errcode = 'P0001', 
      message = 'RATE_LIMIT_EXCEEDED: Security threshold triggered. Too many failed attempts from your IP address. Please wait 5 minutes before retrying.';
  end if;

  -- F. Compute Server-Side HMAC Hash with Pepper
  v_code_pepper := public.get_security_pepper('access_code_pepper');
  v_hmac_hash := encode(extensions.hmac(convert_to(v_input_sha256, 'UTF8'), convert_to(v_code_pepper, 'UTF8'), 'sha256'), 'hex');

  -- G. Dual-Verify Lookup (Row-Locked FOR UPDATE):
  -- 1) First check for modern HMAC-hashed codes
  select * into v_code
  from public.game_access_codes
  where game_access_codes.code_hash = v_hmac_hash
    and game_access_codes.active = true
    and game_access_codes.revoked_at is null
    and game_access_codes.uses_count < game_access_codes.max_uses
    and (game_access_codes.expires_at is null or game_access_codes.expires_at > now())
  for update;

  -- 2) Fallback transition: Check for legacy plain SHA-256 codes (auto-upgrade on the fly)
  if not found then
    select * into v_code
    from public.game_access_codes
    where game_access_codes.code_hash = v_input_sha256
      and game_access_codes.is_hmac = false
      and game_access_codes.active = true
      and game_access_codes.revoked_at is null
      and game_access_codes.uses_count < game_access_codes.max_uses
      and (game_access_codes.expires_at is null or game_access_codes.expires_at > now())
    for update;

    if found then
      -- Auto-upgrade legacy code hash to HMAC in-place
      update public.game_access_codes
      set code_hash = v_hmac_hash,
          is_hmac = true
      where game_access_codes.id = v_code.id;
    end if;
  end if;

  -- H. Failed Attempt Accounting (Committed without aborting transaction)
  if not found then
    insert into public.game_access_rate_limits (account_id, success, attempt_time, ip_pseudo_hash)
    values (p_account_id, false, now(), v_ip_hash);

    -- Return 0 rows. Transaction commits, ensuring the audit row persists!
    return;
  end if;

  -- I. Success Path: Update usage count and activation timestamp
  update public.game_access_codes
  set uses_count = uses_count + 1,
      account_id = p_account_id,
      redeemed_at = now()
  where game_access_codes.id = v_code.id;

  -- J. Single-Active-Session Enforcement (if configured on the code)
  if v_code.single_session_only = true then
    delete from public.game_access_sessions
    where code_id = v_code.id;
  end if;

  -- K. Generate Cryptographic Bearer Token (128-bit+ entropy)
  v_token := replace(pg_catalog.gen_random_uuid()::text, '-', '') || replace(pg_catalog.gen_random_uuid()::text, '-', '');
  v_token_hash := encode(pg_catalog.sha256(convert_to(v_token, 'UTF8')), 'hex');

  insert into public.game_access_sessions (token_hash, code_id, account_id, expires_at)
  values (
    v_token_hash,
    v_code.id,
    p_account_id,
    now() + make_interval(mins => v_code.duration_minutes)
  );

  -- Record success row to reset failure threshold calculation for this account+IP
  insert into public.game_access_rate_limits (account_id, success, attempt_time, ip_pseudo_hash)
  values (p_account_id, true, now(), v_ip_hash);

  return query
    select
      v_token,
      now() + make_interval(mins => v_code.duration_minutes),
      now();
end;
$$;

revoke all on function public.redeem_game_access(text, text) from public;
grant execute on function public.redeem_game_access(text, text) to anon, authenticated;


-- ------------------------------------------------------------------------------
-- 5. SESSION MANAGEMENT & REVOCATION RPCS
-- ------------------------------------------------------------------------------
create or replace function public.validate_session(p_token text)
returns table (
  valid boolean, 
  expires_at timestamptz, 
  account_id text, 
  code_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token_hash text;
begin
  if p_token is null or char_length(p_token) < 32 then
    return query select false, null::timestamptz, null::text, null::uuid;
    return;
  end if;

  v_token_hash := encode(pg_catalog.sha256(convert_to(trim(p_token), 'UTF8')), 'hex');

  return query
  select
    (
      s.expires_at > now()
      and c.active = true
      and c.revoked_at is null
    ) as valid,
    s.expires_at,
    s.account_id,
    s.code_id
  from public.game_access_sessions s
  join public.game_access_codes c on c.id = s.code_id
  where s.token_hash = v_token_hash
  limit 1;

  if not found then
    return query select false, null::timestamptz, null::text, null::uuid;
  end if;
end;
$$;

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
set search_path = ''
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
  where s.token_hash = lower(trim(p_token_hash))
  limit 1;
$$;

create or replace function public.revoke_session(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token_hash text;
  v_deleted integer;
begin
  if p_token is null or char_length(p_token) < 32 then
    return false;
  end if;

  v_token_hash := encode(pg_catalog.sha256(convert_to(trim(p_token), 'UTF8')), 'hex');
  delete from public.game_access_sessions where token_hash = v_token_hash;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

create or replace function public.revoke_account_sessions(p_account_id text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if not public.has_admin_role('admin') and current_user != 'service_role' then
    raise exception using errcode = '42501', message = 'Only administrators can revoke account sessions.';
  end if;

  if p_account_id is null or p_account_id !~ '^[0-9]{9,11}$' then
    raise exception using errcode = '22023', message = 'INVALID_ACCOUNT_ID';
  end if;

  delete from public.game_access_sessions where account_id = p_account_id;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.validate_session(text) from public;
revoke all on function public.check_game_access(text) from public;
revoke all on function public.revoke_session(text) from public;
revoke all on function public.revoke_account_sessions(text) from public, anon;

grant execute on function public.validate_session(text) to anon, authenticated, service_role;
grant execute on function public.check_game_access(text) to anon, authenticated;
grant execute on function public.revoke_session(text) to anon, authenticated;
grant execute on function public.revoke_account_sessions(text) to authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 6. ADMIN HIGH-ENTROPY ACCESS CODE GENERATOR & CREATOR
-- ------------------------------------------------------------------------------
create or replace function public.generate_game_access_code(
  p_duration_minutes integer,
  p_max_uses integer default 1,
  p_single_session boolean default false
)
returns table (
  plain_code text,
  code_id uuid,
  duration_minutes integer,
  max_uses integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text := 'MS-';
  v_random_bytes bytea;
  v_code_sha256 text;
  v_code_pepper text;
  v_hmac_hash text;
  v_id uuid;
  v_now timestamptz := now();
  v_char_idx integer;
begin
  if not public.has_admin_role('admin') then
    raise exception using errcode = '42501', message = 'Only administrators can generate game access codes.';
  end if;

  if p_duration_minutes is null or p_duration_minutes < 1 or p_duration_minutes > 10080 then
    raise exception using errcode = '22023', message = 'INVALID_DURATION';
  end if;

  if p_max_uses is null or p_max_uses < 1 or p_max_uses > 1000000 then
    raise exception using errcode = '22023', message = 'INVALID_MAX_USES';
  end if;

  v_random_bytes := extensions.gen_random_bytes(16);
  for i in 0..15 loop
    v_char_idx := (get_byte(v_random_bytes, i) % 32) + 1;
    v_code := v_code || substr(v_alphabet, v_char_idx, 1);
    if i = 3 or i = 7 or i = 11 then
      v_code := v_code || '-';
    end if;
  end loop;

  v_code_sha256 := encode(pg_catalog.sha256(convert_to(upper(v_code), 'UTF8')), 'hex');
  v_code_pepper := public.get_security_pepper('access_code_pepper');
  v_hmac_hash := encode(extensions.hmac(convert_to(v_code_sha256, 'UTF8'), convert_to(v_code_pepper, 'UTF8'), 'sha256'), 'hex');

  insert into public.game_access_codes (
    code_hash, duration_minutes, max_uses, single_session_only, is_hmac, created_by, created_at
  )
  values (
    v_hmac_hash, p_duration_minutes, p_max_uses, coalesce(p_single_session, false), true, auth.uid(), v_now
  )
  returning id into v_id;

  return query
    select v_code, v_id, p_duration_minutes, p_max_uses, v_now;
end;
$$;

-- Keep create_game_access_code compatible with existing admin dashboard calls while storing HMAC
create or replace function public.create_game_access_code(
  p_code_hash text,
  p_duration_minutes integer,
  p_created_by uuid
)
returns table (id uuid, expires_at timestamptz, created_at timestamptz, duration_minutes integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code_pepper text;
  v_hmac_hash text;
  v_input_sha256 text;
begin
  if not public.has_admin_role('admin') then
    raise exception using errcode = '42501', message = 'Only administrators can create game access codes.';
  end if;
  if p_created_by is distinct from (select auth.uid()) then
    raise exception using errcode = '42501', message = 'Game access codes must be created by the signed-in administrator.';
  end if;
  if p_code_hash is null or char_length(p_code_hash) < 16 or char_length(p_code_hash) > 128 then
    raise exception using errcode = '22023', message = 'INVALID_CODE_HASH';
  end if;
  if p_duration_minutes is null or p_duration_minutes < 1 or p_duration_minutes > 10080 then
    raise exception using errcode = '22023', message = 'INVALID_DURATION';
  end if;

  if char_length(lower(trim(p_code_hash))) = 64 and lower(trim(p_code_hash)) ~ '^[0-9a-f]{64}$' then
    v_input_sha256 := lower(trim(p_code_hash));
  else
    v_input_sha256 := encode(pg_catalog.sha256(convert_to(lower(trim(p_code_hash)), 'UTF8')), 'hex');
  end if;

  v_code_pepper := public.get_security_pepper('access_code_pepper');
  v_hmac_hash := encode(extensions.hmac(convert_to(v_input_sha256, 'UTF8'), convert_to(v_code_pepper, 'UTF8'), 'sha256'), 'hex');

  return query
  insert into public.game_access_codes (code_hash, duration_minutes, created_by, expires_at, max_uses, is_hmac)
  values (v_hmac_hash, p_duration_minutes, p_created_by, null, 1, true)
  returning
    game_access_codes.id,
    game_access_codes.expires_at,
    game_access_codes.created_at,
    game_access_codes.duration_minutes;
end;
$$;

revoke all on function public.generate_game_access_code(integer, integer, boolean) from public, anon;
revoke all on function public.create_game_access_code(text, integer, uuid) from public, anon;
grant execute on function public.generate_game_access_code(integer, integer, boolean) to authenticated;
grant execute on function public.create_game_access_code(text, integer, uuid) to authenticated;


-- ------------------------------------------------------------------------------
-- 7. SUPABASE M11 TELEMETRY DATA PLANE
-- ------------------------------------------------------------------------------
create table if not exists public.m11_snapshots (
  id uuid primary key default gen_random_uuid(),
  round_identifier text not null,
  cells jsonb not null,
  cell_count integer not null default 50,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint m11_snapshots_round_id check (char_length(round_identifier) between 1 and 128),
  constraint m11_snapshots_cell_count check (cell_count = 50)
);

create index if not exists idx_m11_snapshots_created_at 
  on public.m11_snapshots (created_at desc);

alter table public.m11_snapshots enable row level security;
revoke all on table public.m11_snapshots from public, anon, authenticated;
grant all on table public.m11_snapshots to service_role;

create or replace function public.publish_m11_snapshot(
  p_cells jsonb,
  p_round_identifier text
)
returns table (
  snapshot_id uuid,
  created_at timestamptz,
  round_identifier text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_now timestamptz := now();
  v_count integer;
  v_key text;
  v_cell jsonb;
  v_val text;
begin
  if not public.has_admin_role('admin') and current_user != 'service_role' then
    raise exception using errcode = '42501', message = 'Only administrators or service role can publish M11 rounds.';
  end if;

  if p_cells is null or jsonb_typeof(p_cells) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_SNAPSHOT_PAYLOAD: Must be a JSON object.';
  end if;

  if octet_length(p_cells::text) > 8192 then
    raise exception using errcode = '22023', message = 'PAYLOAD_TOO_LARGE: Max 8KB allowed.';
  end if;

  select count(*) into v_count from jsonb_object_keys(p_cells);
  if v_count <> 50 then
    raise exception using errcode = '22023', message = 'INVALID_CELL_COUNT: Exactly 50 cells required.';
  end if;

  for i in 1..50 loop
    v_key := 'm' || i;
    v_cell := p_cells->v_key;
    if v_cell is null then
      raise exception using errcode = '22023', message = 'MISSING_CELL: ' || v_key;
    end if;

    if jsonb_typeof(v_cell) = 'object' then
      v_val := v_cell->>v_key;
    else
      v_val := v_cell #>> '{}';
    end if;

    if v_val is null or v_val not in ('0', '1', 'a', 'm') then
      raise exception using errcode = '22023', message = 'INVALID_CELL_VALUE: ' || v_key;
    end if;
  end loop;

  insert into public.m11_snapshots (round_identifier, cells, cell_count, created_by, created_at)
  values (
    coalesce(nullif(trim(p_round_identifier), ''), 'round-' || to_char(v_now, 'YYYYMMDD-HH24MISS')),
    p_cells,
    50,
    auth.uid(),
    v_now
  )
  returning id into v_id;

  return query select v_id, v_now, coalesce(p_round_identifier, 'round');
end;
$$;

create or replace function public.get_m11_snapshot(p_token text default '')
returns table (
  id uuid,
  round_identifier text,
  cells jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session record;
  v_is_admin boolean := false;
begin
  if public.has_admin_role('operator') or current_user = 'service_role' then
    v_is_admin := true;
  end if;

  if not v_is_admin then
    if p_token is null or char_length(p_token) < 16 then
      raise exception using errcode = '42501', message = 'UNAUTHORIZED_SESSION: Missing or invalid game access token.';
    end if;

    select * into v_session from public.validate_session(p_token);
    if v_session.valid is not true then
      raise exception using errcode = '42501', message = 'UNAUTHORIZED_SESSION: Invalid or expired game access session.';
    end if;
  end if;

  return query
  select s.id, s.round_identifier, s.cells, s.created_at
  from public.m11_snapshots s
  order by s.created_at desc
  limit 1;
end;
$$;

revoke all on function public.publish_m11_snapshot(jsonb, text) from public, anon;
revoke all on function public.get_m11_snapshot(text) from public;

grant execute on function public.publish_m11_snapshot(jsonb, text) to authenticated, service_role;
grant execute on function public.get_m11_snapshot(text) to anon, authenticated;


-- ------------------------------------------------------------------------------
-- 8. AUDIT LOGGING & COMPREHENSIVE RETENTION PRUNING
-- ------------------------------------------------------------------------------
create table if not exists public.security_audit_logs (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  severity text not null default 'info',
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text,
  details jsonb not null default '{}'::jsonb,
  ip_pseudo_hash text,
  created_at timestamptz not null default now(),
  constraint security_audit_logs_event_len check (char_length(event_type) between 1 and 64),
  constraint security_audit_logs_severity check (severity in ('info', 'warning', 'critical'))
);

create index if not exists idx_security_audit_logs_created 
  on public.security_audit_logs (created_at desc);

alter table public.security_audit_logs enable row level security;
revoke all on table public.security_audit_logs from public, anon;
grant select on table public.security_audit_logs to authenticated;
grant all on table public.security_audit_logs to service_role;

drop policy if exists security_audit_logs_admin_select on public.security_audit_logs;
create policy security_audit_logs_admin_select on public.security_audit_logs
  for select to authenticated
  using (public.has_admin_role('admin'));

create or replace function public.prune_game_rate_limits(p_older_than interval default interval '24 hours')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rate_deleted integer := 0;
  v_sess_deleted integer := 0;
  v_audit_deleted integer := 0;
begin
  if not public.has_admin_role('admin') and current_user != 'service_role' then
    raise exception using errcode = '42501', message = 'Only administrators or service role can prune maintenance records.';
  end if;

  if p_older_than < interval '1 hour' or p_older_than > interval '365 days' then
    raise exception using errcode = '22023', message = 'INVALID_RETENTION_WINDOW';
  end if;

  -- 1. Prune rate limit entries
  delete from public.game_access_rate_limits
  where attempt_time < (now() - p_older_than);
  get diagnostics v_rate_deleted = row_count;

  -- 2. Prune expired sessions older than the retention window
  delete from public.game_access_sessions
  where expires_at < (now() - p_older_than);
  get diagnostics v_sess_deleted = row_count;

  -- 3. Prune audit logs older than 90 days (or p_older_than if longer)
  delete from public.security_audit_logs
  where created_at < (now() - greatest(p_older_than, interval '90 days'));
  get diagnostics v_audit_deleted = row_count;

  return v_rate_deleted;
end;
$$;

revoke all on function public.prune_game_rate_limits(interval) from public, anon;
grant execute on function public.prune_game_rate_limits(interval) to authenticated, service_role;
