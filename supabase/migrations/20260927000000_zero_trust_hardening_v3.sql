-- ==============================================================================
-- NEXUS V3 ZERO-TRUST SECURITY HARDENING MIGRATION
-- Migration: 20260927000000_zero_trust_hardening_v3.sql
--
-- Security Objectives:
-- 1. Eliminate hardcoded/static secrets; dynamic in-DB pepper generation with
--    exclusive Vault storage when present, strict fallback, and missing-secret exceptions.
-- 2. Audit log persistence on rate limits and lockouts via uniform empty-row
--    responses (no transaction rollbacks).
-- 3. Elimination of artificial latency/sleep calls across all database routines; deterministic progressive
--    lockout windows (5m -> 15m -> 60m).
-- 4. Dynamic trusted IP extraction via security_settings ('none', 'cf-connecting-ip',
--    'xff-first', 'xff-last'). When 'none', rate limiting is strictly per-account.
-- 5. Safe legacy code backfill (max_uses = greatest(uses_count, 1)) and configurable
--    legacy_codes_cutoff.
-- 6. Comprehensive Task C least-privilege grants, RLS, and search_path='' lockdown.
-- 7. Full compliance with auth.role() without modifying or defining the auth schema.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. PREREQUISITES & EXTENSIONS
-- ------------------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------------------------------------
-- 2. CONTROL PLANE HELPERS: Least Privilege & search_path Lockdown
-- ------------------------------------------------------------------------------
create or replace function public.current_admin_role()
returns public.admin_role
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.admin_users
  where id = (select auth.uid())
    and active = true
  limit 1;
$$;

revoke all on function public.current_admin_role() from public, anon;
grant execute on function public.current_admin_role() to authenticated, service_role;

create or replace function public.has_admin_role(required_role public.admin_role)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.admin_role := public.current_admin_role();
begin
  if v_role is null then return false; end if;
  if v_role = 'super_admin'::public.admin_role then return true; end if;
  if required_role = 'operator'::public.admin_role then return true; end if;
  return v_role = required_role;
end;
$$;

revoke all on function public.has_admin_role(public.admin_role) from public, anon;
grant execute on function public.has_admin_role(public.admin_role) to authenticated, service_role;

-- Text overload for backward compatibility with policies passing string literals
create or replace function public.has_admin_role(required_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_admin_role(required_role::public.admin_role);
$$;

revoke all on function public.has_admin_role(text) from public, anon;
grant execute on function public.has_admin_role(text) to authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 3. CONFIGURATION TABLE: security_settings
-- ------------------------------------------------------------------------------
create table if not exists public.security_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default pg_catalog.now()
);

alter table public.security_settings enable row level security;
revoke all on table public.security_settings from public, anon;
grant select on table public.security_settings to authenticated;
grant all on table public.security_settings to service_role;

-- Seed default settings
insert into public.security_settings (key, value)
values 
  ('trusted_ip_header', 'none'),
  ('legacy_codes_cutoff', '')
on conflict (key) do nothing;

drop policy if exists security_settings_admin_all on public.security_settings;
create policy security_settings_admin_all on public.security_settings
  for all to authenticated
  using (public.has_admin_role('admin'::public.admin_role))
  with check (public.has_admin_role('admin'::public.admin_role));

-- ------------------------------------------------------------------------------
-- 3. CRYPTOGRAPHIC PEPPERS (VAULT-FIRST STORAGE)
-- ------------------------------------------------------------------------------
create table if not exists public.security_peppers (
  key_name text primary key,
  pepper text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint security_peppers_key_len check (pg_catalog.char_length(key_name) between 1 and 64),
  constraint security_peppers_val_len check (pg_catalog.char_length(pepper) >= 32)
);

alter table public.security_peppers enable row level security;
revoke all on table public.security_peppers from public, anon, authenticated;
grant all on table public.security_peppers to service_role;

-- Generation & Storage routine: Vault first (if accessible), fallback table second.
do $$
declare
  v_has_vault boolean;
begin
  -- Check if vault.secrets exists AND caller has execute permission on pgsodium crypto engine
  select (
    exists (select 1 from pg_tables where schemaname = 'vault' and tablename = 'secrets')
    and coalesce((
      select has_function_privilege(p.oid, 'execute')
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'pgsodium' and p.proname = '_crypto_aead_det_noncegen'
      limit 1
    ), false)
  ) into v_has_vault;

  if v_has_vault then
    begin
      if not exists (select 1 from vault.secrets where name = 'access_code_pepper') then
        insert into vault.secrets (name, secret)
        values ('access_code_pepper', pg_catalog.encode(extensions.gen_random_bytes(32), 'hex'));
      end if;
      if not exists (select 1 from vault.secrets where name = 'client_ip_pepper') then
        insert into vault.secrets (name, secret)
        values ('client_ip_pepper', pg_catalog.encode(extensions.gen_random_bytes(32), 'hex'));
      end if;
    exception when others then
      v_has_vault := false;
    end;
  end if;

  if not v_has_vault then
    insert into public.security_peppers (key_name, pepper)
    values 
      ('access_code_pepper', pg_catalog.encode(extensions.gen_random_bytes(32), 'hex')),
      ('client_ip_pepper', pg_catalog.encode(extensions.gen_random_bytes(32), 'hex'))
    on conflict (key_name) do nothing;
  end if;
end;
$$;

create or replace function public.get_security_pepper(p_key text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  -- 1. Query Vault if available
  if exists (
    select 1 from pg_tables 
    where schemaname = 'vault' and tablename = 'decrypted_secrets'
  ) then
    begin
      execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
      into v_secret using p_key;
      if v_secret is not null and pg_catalog.char_length(v_secret) >= 32 then
        return v_secret;
      end if;
    exception when others then
      v_secret := null;
    end;
  end if;

  -- 2. Query fallback table if present
  if exists (
    select 1 from pg_tables 
    where schemaname = 'public' and tablename = 'security_peppers'
  ) then
    select pepper into v_secret 
    from public.security_peppers 
    where key_name = p_key 
    limit 1;
  end if;

  if v_secret is null or pg_catalog.char_length(v_secret) < 32 then
    raise exception using 
      errcode = 'P0002', 
      message = 'MISSING_SECURITY_PEPPER: Cryptographic secret ' || coalesce(p_key, 'NULL') || ' not configured.';
  end if;

  return v_secret;
end;
$$;

revoke all on function public.get_security_pepper(text) from public, anon, authenticated;
grant execute on function public.get_security_pepper(text) to service_role;

-- Optional pepper rotation procedure (admin / service_role only)
create or replace function public.rotate_security_pepper(p_key text, p_new_secret text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_has_vault boolean;
begin
  if auth.role() != 'service_role' and not public.has_admin_role('super_admin'::public.admin_role) then
    raise exception using errcode = '42501', message = 'Only super_admin or service_role can rotate security peppers.';
  end if;

  if p_key is null or p_new_secret is null or pg_catalog.char_length(p_new_secret) < 32 then
    raise exception using errcode = '22023', message = 'INVALID_PEPPER: Secret must be at least 32 characters.';
  end if;

  select (
    exists (select 1 from pg_tables where schemaname = 'vault' and tablename = 'secrets')
    and coalesce((
      select has_function_privilege(p.oid, 'execute')
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'pgsodium' and p.proname = '_crypto_aead_det_noncegen'
      limit 1
    ), false)
  ) into v_has_vault;

  if v_has_vault then
    begin
      update vault.secrets set secret = p_new_secret where name = p_key;
      if not found then
        insert into vault.secrets (name, secret) values (p_key, p_new_secret);
      end if;
    exception when others then
      v_has_vault := false;
    end;
  end if;

  if not v_has_vault then
    insert into public.security_peppers (key_name, pepper, created_at)
    values (p_key, p_new_secret, pg_catalog.now())
    on conflict (key_name) do update 
      set pepper = excluded.pepper, created_at = pg_catalog.now();
  end if;

  return true;
end;
$$;

revoke all on function public.rotate_security_pepper(text, text) from public, anon;
grant execute on function public.rotate_security_pepper(text, text) to authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 4. SECURITY AUDIT LOGGING
-- ------------------------------------------------------------------------------
create table if not exists public.security_audit_logs (
  id uuid primary key default extensions.gen_random_uuid(),
  event_type text not null,
  actor_id text,
  ip_address text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  constraint security_audit_logs_event_type check (pg_catalog.char_length(event_type) between 1 and 64)
);

create index if not exists idx_security_audit_logs_event_created 
  on public.security_audit_logs (event_type, created_at desc);

alter table public.security_audit_logs enable row level security;
revoke all on table public.security_audit_logs from public, anon;
grant select on table public.security_audit_logs to authenticated;
grant all on table public.security_audit_logs to service_role;

drop policy if exists security_audit_logs_admin_select on public.security_audit_logs;
create policy security_audit_logs_admin_select on public.security_audit_logs
  for select to authenticated
  using (public.has_admin_role('admin'::public.admin_role));

-- ------------------------------------------------------------------------------
-- 5. CLIENT IP & HEADERS INSPECTION
-- ------------------------------------------------------------------------------
create or replace function public.extract_client_ip()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_headers jsonb;
  v_mode text;
  v_raw text;
  v_hops text[];
begin
  select value into v_mode 
  from public.security_settings 
  where key = 'trusted_ip_header';

  if v_mode is null or v_mode = 'none' then
    return 'unknown';
  end if;

  begin
    v_headers := nullif(pg_catalog.current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := '{}'::jsonb;
  end;

  if v_headers is null then
    return 'unknown';
  end if;

  if v_mode = 'cf-connecting-ip' then
    v_raw := trim(coalesce(v_headers ->> 'cf-connecting-ip', ''));
    if v_raw ~ '^[0-9a-fA-F:\.]+$' then
      return v_raw;
    end if;
  elsif v_mode = 'xff-first' then
    v_raw := trim(coalesce(v_headers ->> 'x-forwarded-for', ''));
    if v_raw <> '' then
      v_hops := pg_catalog.string_to_array(v_raw, ',');
      if pg_catalog.array_length(v_hops, 1) > 0 then
        v_raw := trim(v_hops[1]);
        if v_raw ~ '^[0-9a-fA-F:\.]+$' then
          return v_raw;
        end if;
      end if;
    end if;
  elsif v_mode = 'xff-last' then
    v_raw := trim(coalesce(v_headers ->> 'x-forwarded-for', ''));
    if v_raw <> '' then
      v_hops := pg_catalog.string_to_array(v_raw, ',');
      if pg_catalog.array_length(v_hops, 1) > 0 then
        v_raw := trim(v_hops[pg_catalog.array_length(v_hops, 1)]);
        if v_raw ~ '^[0-9a-fA-F:\.]+$' then
          return v_raw;
        end if;
      end if;
    end if;
  end if;

  return 'unknown';
end;
$$;

revoke all on function public.extract_client_ip() from public, anon, authenticated;
grant execute on function public.extract_client_ip() to anon, authenticated, service_role;

create or replace function public.debug_inspect_request_headers()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_admin_role('super_admin'::public.admin_role) and auth.role() != 'service_role' then
    raise exception using errcode = '42501', message = 'Only super_admin or service_role can inspect request headers.';
  end if;

  return coalesce(nullif(pg_catalog.current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
end;
$$;

revoke all on function public.debug_inspect_request_headers() from public, anon;
grant execute on function public.debug_inspect_request_headers() to authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 7. GAME ACCESS CODES: Backfill & Constraints
-- ------------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'game_access_codes' and column_name = 'max_uses'
  ) then
    alter table public.game_access_codes add column max_uses integer default 1;
  end if;

  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'game_access_codes' and column_name = 'single_session_only'
  ) then
    alter table public.game_access_codes add column single_session_only boolean default true;
  end if;

  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'game_access_codes' and column_name = 'is_hmac'
  ) then
    alter table public.game_access_codes add column is_hmac boolean default false;
  end if;
end;
$$;

-- Safe backfill: legacy codes defaulted to greatest(uses_count, 1)
update public.game_access_codes
set max_uses = greatest(uses_count, 1)
where max_uses is null;

alter table public.game_access_codes
  alter column max_uses set not null,
  alter column max_uses set default 1;

alter table public.game_access_codes enable row level security;
revoke all on table public.game_access_codes from public, anon;
grant select on table public.game_access_codes to authenticated;
grant all on table public.game_access_codes to service_role;

drop policy if exists game_access_codes_admin_select on public.game_access_codes;
create policy game_access_codes_admin_select on public.game_access_codes
  for select to authenticated
  using (public.has_admin_role('admin'::public.admin_role));

-- ------------------------------------------------------------------------------
-- 8. RATE LIMITS & SESSIONS TABLES
-- ------------------------------------------------------------------------------
create table if not exists public.game_access_rate_limits (
  id uuid primary key default extensions.gen_random_uuid(),
  account_id text not null,
  ip_pseudo_hash text not null default 'unknown',
  success boolean not null,
  attempt_time timestamptz not null default pg_catalog.now(),
  constraint game_access_rate_limits_account_id check (account_id ~ '^[0-9]{9,11}$')
);

create index if not exists idx_game_rate_limits_acc_time 
  on public.game_access_rate_limits (account_id, attempt_time desc);

create index if not exists idx_game_rate_limits_ip_time 
  on public.game_access_rate_limits (ip_pseudo_hash, attempt_time desc);

alter table public.game_access_rate_limits enable row level security;
revoke all on table public.game_access_rate_limits from public, anon;
grant select on table public.game_access_rate_limits to authenticated;
grant all on table public.game_access_rate_limits to service_role;

drop policy if exists game_access_rate_limits_admin_select on public.game_access_rate_limits;
create policy game_access_rate_limits_admin_select on public.game_access_rate_limits
  for select to authenticated
  using (public.has_admin_role('admin'::public.admin_role));

do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'game_access_sessions' and column_name = 'single_session'
  ) then
    alter table public.game_access_sessions add column single_session boolean default true;
  end if;

  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'game_access_sessions' and column_name = 'revoked_at'
  ) then
    alter table public.game_access_sessions add column revoked_at timestamptz;
  end if;
end;
$$;

alter table public.game_access_sessions enable row level security;
revoke all on table public.game_access_sessions from public, anon;
grant select on table public.game_access_sessions to authenticated;
grant all on table public.game_access_sessions to service_role;

drop policy if exists game_access_sessions_admin_select on public.game_access_sessions;
create policy game_access_sessions_admin_select on public.game_access_sessions
  for select to authenticated
  using (public.has_admin_role('admin'::public.admin_role));

-- ------------------------------------------------------------------------------
-- 9. ADMIN CODE CREATION & MANAGEMENT RPCs
-- ------------------------------------------------------------------------------
create or replace function public.create_game_access_code(
  p_code_hash text,
  p_duration_minutes integer,
  p_created_by uuid,
  p_max_uses integer default 1,
  p_single_session boolean default true
)
returns table (id uuid, expires_at timestamptz, created_at timestamptz, duration_minutes integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code_pepper text;
  v_hmac_hash text;
  v_id uuid;
  v_now timestamptz := pg_catalog.now();
  v_actor text;
begin
  if auth.role() = 'service_role' then
    v_actor := 'service_role';
  else
    if not public.has_admin_role('admin'::public.admin_role) then
      raise exception using errcode = '42501', message = 'Only administrators or service role can create game access codes.';
    end if;
    if p_created_by is distinct from (select auth.uid()) then
      raise exception using errcode = '42501', message = 'Game access codes must be created by the signed-in administrator.';
    end if;
    v_actor := auth.uid()::text;
  end if;

  if p_code_hash is null or pg_catalog.char_length(p_code_hash) <> 64 then
    raise exception using errcode = '22023', message = 'INVALID_CODE_HASH';
  end if;

  if p_duration_minutes is null or p_duration_minutes < 1 or p_duration_minutes > 10080 then
    raise exception using errcode = '22023', message = 'INVALID_DURATION';
  end if;

  if p_max_uses is null or p_max_uses < 1 or p_max_uses > 1000000 then
    raise exception using errcode = '22023', message = 'INVALID_MAX_USES';
  end if;

  v_code_pepper := public.get_security_pepper('access_code_pepper');
  v_hmac_hash := pg_catalog.encode(extensions.hmac(pg_catalog.convert_to(p_code_hash, 'UTF8'), pg_catalog.convert_to(v_code_pepper, 'UTF8'), 'sha256'), 'hex');

  insert into public.game_access_codes (
    code_hash, duration_minutes, max_uses, single_session_only, is_hmac, created_by, created_at
  )
  values (
    v_hmac_hash, p_duration_minutes, p_max_uses, coalesce(p_single_session, true), true, p_created_by, v_now
  )
  returning public.game_access_codes.id into v_id;

  insert into public.security_audit_logs (event_type, actor_id, metadata)
  values (
    'code_generation',
    v_actor,
    pg_catalog.jsonb_build_object(
      'code_id', v_id,
      'duration_minutes', p_duration_minutes,
      'max_uses', p_max_uses,
      'single_session', p_single_session
    )
  );

  return query
  select v_id, null::timestamptz, v_now, p_duration_minutes;
end;
$$;

revoke all on function public.create_game_access_code(text, integer, uuid, integer, boolean) from public, anon;
grant execute on function public.create_game_access_code(text, integer, uuid, integer, boolean) to authenticated, service_role;

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
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- Crockford Base32
  v_code text := 'MS-';
  v_random_bytes bytea;
  v_code_sha256 text;
  v_code_pepper text;
  v_hmac_hash text;
  v_id uuid;
  v_now timestamptz := pg_catalog.now();
  v_char_idx integer;
  v_actor text;
begin
  if auth.role() = 'service_role' then
    v_actor := 'service_role';
  else
    if not public.has_admin_role('admin'::public.admin_role) then
      raise exception using errcode = '42501', message = 'Only administrators or service role can generate game access codes.';
    end if;
    v_actor := auth.uid()::text;
  end if;

  if p_duration_minutes is null or p_duration_minutes < 1 or p_duration_minutes > 10080 then
    raise exception using errcode = '22023', message = 'INVALID_DURATION';
  end if;

  if p_max_uses is null or p_max_uses < 1 or p_max_uses > 1000000 then
    raise exception using errcode = '22023', message = 'INVALID_MAX_USES';
  end if;

  v_random_bytes := extensions.gen_random_bytes(16);
  for i in 0..15 loop
    v_char_idx := (pg_catalog.get_byte(v_random_bytes, i) % 32) + 1;
    v_code := v_code || pg_catalog.substr(v_alphabet, v_char_idx, 1);
    if i = 3 or i = 7 or i = 11 then
      v_code := v_code || '-';
    end if;
  end loop;

  v_code_sha256 := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.upper(v_code), 'UTF8')), 'hex');
  v_code_pepper := public.get_security_pepper('access_code_pepper');
  v_hmac_hash := pg_catalog.encode(extensions.hmac(pg_catalog.convert_to(v_code_sha256, 'UTF8'), pg_catalog.convert_to(v_code_pepper, 'UTF8'), 'sha256'), 'hex');

  insert into public.game_access_codes (
    code_hash, duration_minutes, max_uses, single_session_only, is_hmac, created_by, created_at
  )
  values (
    v_hmac_hash, p_duration_minutes, p_max_uses, coalesce(p_single_session, false), true, (select auth.uid()), v_now
  )
  returning public.game_access_codes.id into v_id;

  insert into public.security_audit_logs (event_type, actor_id, metadata)
  values (
    'code_generation',
    v_actor,
    pg_catalog.jsonb_build_object(
      'code_id', v_id,
      'duration_minutes', p_duration_minutes,
      'max_uses', p_max_uses,
      'single_session', p_single_session,
      'entropy_bits', 80
    )
  );

  return query
  select v_code, v_id, p_duration_minutes, p_max_uses, v_now;
end;
$$;

revoke all on function public.generate_game_access_code(integer, integer, boolean) from public, anon;
grant execute on function public.generate_game_access_code(integer, integer, boolean) to authenticated, service_role;

create or replace function public.revoke_game_access_session(
  p_account_id text,
  p_session_token text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer := 0;
  v_token_hash text;
  v_actor text;
begin
  if auth.role() = 'service_role' then
    v_actor := 'service_role';
  else
    if not public.has_admin_role('admin'::public.admin_role) then
      raise exception using errcode = '42501', message = 'Only administrators or service role can revoke account sessions.';
    end if;
    v_actor := auth.uid()::text;
  end if;

  if p_account_id is null or p_account_id !~ '^[0-9]{9,11}$' then
    raise exception using errcode = '22023', message = 'INVALID_ACCOUNT_ID';
  end if;

  if p_session_token is not null and pg_catalog.char_length(p_session_token) > 0 then
    v_token_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_session_token, 'UTF8')), 'hex');
    update public.game_access_sessions
    set revoked_at = pg_catalog.now()
    where account_id = p_account_id
      and token_hash = v_token_hash
      and revoked_at is null;
    get diagnostics v_deleted = row_count;
  else
    update public.game_access_sessions
    set revoked_at = pg_catalog.now()
    where account_id = p_account_id
      and revoked_at is null;
    get diagnostics v_deleted = row_count;
  end if;

  insert into public.security_audit_logs (event_type, actor_id, metadata)
  values (
    'session_revocation',
    v_actor,
    pg_catalog.jsonb_build_object(
      'target_account_id', p_account_id,
      'revoked_count', v_deleted,
      'has_token_filter', (p_session_token is not null)
    )
  );

  return v_deleted;
end;
$$;

revoke all on function public.revoke_game_access_session(text, text) from public, anon;
grant execute on function public.revoke_game_access_session(text, text) to authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 10. REDEEM GAME ACCESS: Zero-Sleep, Deterministic Lockout & Audit Persistence
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
  v_raw_ip text;
  v_ip_pepper text;
  v_ip_hash text;
  v_code_pepper text;
  v_hmac_hash text;
  v_now timestamptz := pg_catalog.now();
  v_code_row public.game_access_codes%rowtype;
  v_session_token text;
  v_token_hash text;
  v_session_expires timestamptz;
  v_account_failures integer := 0;
  v_account_failures_60m integer := 0;
  v_ip_failures integer := 0;
  v_ip_failures_60m integer := 0;
  v_last_failed_time timestamptz;
  v_lockout_interval interval := interval '0 seconds';
  v_cutoff_str text;
  v_legacy_allowed boolean := true;
begin
  -- 1. Argument validation: return empty on malformed input (uniform failure)
  if p_account_id is null or p_account_id !~ '^[0-9]{9,11}$' then
    return;
  end if;

  if p_code_hash is null or pg_catalog.char_length(p_code_hash) <> 64 then
    return;
  end if;

  -- 2. Client IP extraction
  v_raw_ip := public.extract_client_ip();
  if v_raw_ip = 'unknown' then
    v_ip_hash := 'unknown';
  else
    v_ip_pepper := public.get_security_pepper('client_ip_pepper');
    v_ip_hash := pg_catalog.encode(extensions.hmac(pg_catalog.convert_to(v_raw_ip, 'UTF8'), pg_catalog.convert_to(v_ip_pepper, 'UTF8'), 'sha256'), 'hex');
  end if;

  -- 3. Atomic advisory locking
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('acc_lock:' || p_account_id));
  if v_ip_hash <> 'unknown' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('ip_lock:' || v_ip_hash));
  end if;

  -- 4. Evaluate Account-level failure counts and progressive lockout window
  select 
    coalesce(pg_catalog.count(*) filter (where attempt_time >= v_now - interval '15 minutes'), 0),
    coalesce(pg_catalog.count(*) filter (where attempt_time >= v_now - interval '60 minutes'), 0),
    max(attempt_time)
  into v_account_failures, v_account_failures_60m, v_last_failed_time
  from public.game_access_rate_limits
  where account_id = p_account_id
    and success = false
    and attempt_time >= v_now - interval '60 minutes';

  if v_account_failures_60m >= 15 then
    v_lockout_interval := interval '60 minutes';
  elsif v_account_failures >= 10 then
    v_lockout_interval := interval '15 minutes';
  elsif v_account_failures >= 5 then
    v_lockout_interval := interval '5 minutes';
  end if;

  -- If IP is resolved (not 'unknown'), evaluate IP-level lockout window
  if v_ip_hash <> 'unknown' then
    select 
      coalesce(pg_catalog.count(*) filter (where attempt_time >= v_now - interval '15 minutes'), 0),
      coalesce(pg_catalog.count(*) filter (where attempt_time >= v_now - interval '60 minutes'), 0),
      greatest(coalesce(v_last_failed_time, '1970-01-01'::timestamptz), coalesce(max(attempt_time), '1970-01-01'::timestamptz))
    into v_ip_failures, v_ip_failures_60m, v_last_failed_time
    from public.game_access_rate_limits
    where ip_pseudo_hash = v_ip_hash
      and success = false
      and attempt_time >= v_now - interval '60 minutes';

    if v_ip_failures_60m >= 30 and v_lockout_interval < interval '60 minutes' then
      v_lockout_interval := interval '60 minutes';
    elsif v_ip_failures >= 20 and v_lockout_interval < interval '15 minutes' then
      v_lockout_interval := interval '15 minutes';
    elsif v_ip_failures >= 10 and v_lockout_interval < interval '5 minutes' then
      v_lockout_interval := interval '5 minutes';
    end if;
  end if;

  -- 5. Enforce active lockout window (commit audit & failure record without raising)
  if v_lockout_interval > interval '0 seconds' and v_last_failed_time is not null and v_now < (v_last_failed_time + v_lockout_interval) then
    insert into public.game_access_rate_limits (account_id, ip_pseudo_hash, success, attempt_time)
    values (p_account_id, v_ip_hash, false, v_now);

    insert into public.security_audit_logs (event_type, actor_id, ip_address, metadata)
    values (
      'rate_limit_lockout',
      p_account_id,
      v_ip_hash,
      pg_catalog.jsonb_build_object(
        'status', 'ACTIVE_LOCKOUT',
        'lockout_window_seconds', extract(epoch from v_lockout_interval),
        'account_failures', v_account_failures,
        'ip_failures', v_ip_failures
      )
    );
    return;
  end if;

  -- 6. Compute HMAC hash of the input code hash
  v_code_pepper := public.get_security_pepper('access_code_pepper');
  v_hmac_hash := pg_catalog.encode(extensions.hmac(pg_catalog.convert_to(p_code_hash, 'UTF8'), pg_catalog.convert_to(v_code_pepper, 'UTF8'), 'sha256'), 'hex');

  -- Attempt primary match on HMAC-peppered codes
  select * into v_code_row
  from public.game_access_codes
  where code_hash = v_hmac_hash
    and is_hmac = true
  for update;

  -- If not found, attempt legacy SHA-256 match if within cutoff
  if v_code_row.id is null then
    select value into v_cutoff_str
    from public.security_settings
    where key = 'legacy_codes_cutoff';

    if v_cutoff_str is not null and v_cutoff_str <> '' then
      if v_now > v_cutoff_str::timestamptz then
        v_legacy_allowed := false;
      end if;
    end if;

    if v_legacy_allowed then
      select * into v_code_row
      from public.game_access_codes
      where code_hash = p_code_hash
        and (is_hmac is false or is_hmac is null)
      for update;

      -- Seamless in-place migration to HMAC upon successful legacy redemption
      if v_code_row.id is not null then
        update public.game_access_codes
        set code_hash = v_hmac_hash,
            is_hmac = true
        where id = v_code_row.id;
      end if;
    end if;
  end if;

  -- 7. Validate code state & usage limits
  if v_code_row.id is null
     or v_code_row.active = false
     or v_code_row.revoked_at is not null
     or (v_code_row.expires_at is not null and v_code_row.expires_at <= v_now)
     or v_code_row.uses_count >= v_code_row.max_uses
  then
    insert into public.game_access_rate_limits (account_id, ip_pseudo_hash, success, attempt_time)
    values (p_account_id, v_ip_hash, false, v_now);

    -- Log audit entry if a progressive lockout threshold was just reached
    if (v_account_failures + 1) in (5, 10, 15) or (v_ip_failures + 1) in (10, 20, 30) then
      insert into public.security_audit_logs (event_type, actor_id, ip_address, metadata)
      values (
        'rate_limit_lockout',
        p_account_id,
        v_ip_hash,
        pg_catalog.jsonb_build_object(
          'threshold_triggered', true,
          'account_failures', v_account_failures + 1,
          'ip_failures', v_ip_failures + 1
        )
      );
    end if;

    return;
  end if;

  -- 8. Valid Redemption: Update code usage under row lock
  update public.game_access_codes
  set uses_count = uses_count + 1,
      account_id = p_account_id,
      redeemed_at = v_now
  where id = v_code_row.id;

  -- If single_session_only is enforced, revoke existing active sessions for this account
  if coalesce(v_code_row.single_session_only, true) then
    update public.game_access_sessions s
    set revoked_at = v_now
    where s.account_id = p_account_id
      and s.revoked_at is null
      and s.expires_at > v_now;
  end if;

  -- 9. Mint session token (256 bits entropy)
  v_session_token := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_session_token, 'UTF8')), 'hex');
  v_session_expires := v_now + (v_code_row.duration_minutes || ' minutes')::interval;

  insert into public.game_access_sessions (
    token_hash, code_id, account_id, created_at, expires_at, single_session
  )
  values (
    v_token_hash, v_code_row.id, p_account_id, v_now, v_session_expires, coalesce(v_code_row.single_session_only, true)
  );

  insert into public.game_access_rate_limits (account_id, ip_pseudo_hash, success, attempt_time)
  values (p_account_id, v_ip_hash, true, v_now);

  return query
  select v_session_token, v_session_expires, v_now;
end;
$$;

revoke all on function public.redeem_game_access(text, text) from public;
grant execute on function public.redeem_game_access(text, text) to anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 11. CHECK GAME ACCESS RPC
-- ------------------------------------------------------------------------------
create or replace function public.check_game_access(p_token_hash text)
returns table (valid boolean, expires_at timestamptz, server_now timestamptz, account_id text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_session record;
  v_code record;
  v_now timestamptz := pg_catalog.now();
begin
  if p_token_hash is null or pg_catalog.char_length(p_token_hash) <> 64 then
    return;
  end if;

  select * into v_session 
  from public.game_access_sessions 
  where token_hash = p_token_hash 
  limit 1;

  if v_session.id is null then
    return;
  end if;

  select * into v_code 
  from public.game_access_codes 
  where id = v_session.code_id 
  limit 1;

  if v_session.revoked_at is not null or v_session.expires_at <= v_now 
     or v_code.active is false or v_code.revoked_at is not null then
    return query select false, v_session.expires_at, v_now, v_session.account_id;
  else
    return query select true, v_session.expires_at, v_now, v_session.account_id;
  end if;
end;
$$;

revoke all on function public.check_game_access(text) from public;
grant execute on function public.check_game_access(text) to anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 12. PRIVILEGED MAINTENANCE PRUNING
-- ------------------------------------------------------------------------------
drop function if exists public.prune_game_rate_limits(interval);
create or replace function public.prune_game_rate_limits(p_retention interval default interval '7 days')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted_limits integer := 0;
  v_deleted_sessions integer := 0;
  v_deleted_snapshots integer := 0;
begin
  if auth.role() != 'service_role' and not public.has_admin_role('admin'::public.admin_role) then
    raise exception using errcode = '42501', message = 'Only administrators or service role can execute maintenance pruning.';
  end if;

  if p_retention < interval '1 day' or p_retention > interval '365 days' then
    raise exception using errcode = '22023', message = 'Retention interval must be between 1 and 365 days.';
  end if;

  delete from public.game_access_rate_limits
  where attempt_time < pg_catalog.now() - p_retention;
  get diagnostics v_deleted_limits = row_count;

  delete from public.game_access_sessions
  where expires_at < pg_catalog.now() - p_retention;
  get diagnostics v_deleted_sessions = row_count;

  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'm11_snapshots') then
    delete from public.m11_snapshots
    where created_at < pg_catalog.now() - p_retention;
    get diagnostics v_deleted_snapshots = row_count;
  end if;

  return v_deleted_limits + v_deleted_sessions + v_deleted_snapshots;
end;
$$;

revoke all on function public.prune_game_rate_limits(interval) from public, anon;
grant execute on function public.prune_game_rate_limits(interval) to authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 13. SUPABASE M11 SNAPSHOT PIPELINE
-- ------------------------------------------------------------------------------
create table if not exists public.m11_snapshots (
  id uuid primary key default extensions.gen_random_uuid(),
  round_identifier text not null,
  cells jsonb not null,
  cell_count integer not null default 50,
  created_at timestamptz not null default pg_catalog.now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint m11_snapshots_round_id check (pg_catalog.char_length(round_identifier) between 1 and 128),
  constraint m11_snapshots_cell_count check (cell_count = 50)
);

create index if not exists idx_m11_snapshots_created_at 
  on public.m11_snapshots (created_at desc);

alter table public.m11_snapshots enable row level security;
revoke all on table public.m11_snapshots from public, anon;
grant select on table public.m11_snapshots to authenticated;
grant all on table public.m11_snapshots to service_role;

drop policy if exists m11_snapshots_admin_select on public.m11_snapshots;
create policy m11_snapshots_admin_select on public.m11_snapshots
  for select to authenticated
  using (public.has_admin_role('admin'::public.admin_role));

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
  v_now timestamptz := pg_catalog.now();
  v_count integer;
  v_key text;
  v_cell jsonb;
  v_val text;
begin
  if auth.role() != 'service_role' and not public.has_admin_role('admin'::public.admin_role) then
    raise exception using errcode = '42501', message = 'Only administrators or service role can publish M11 rounds.';
  end if;

  if p_cells is null or pg_catalog.jsonb_typeof(p_cells) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_SNAPSHOT_PAYLOAD: Must be a JSON object.';
  end if;

  select pg_catalog.count(*) into v_count from pg_catalog.jsonb_object_keys(p_cells);
  if v_count <> 50 then
    raise exception using errcode = '22023', message = 'INVALID_SNAPSHOT_PAYLOAD: Must contain exactly 50 cells (m1..m50).';
  end if;

  for i in 1..50 loop
    v_key := 'm' || i;
    v_cell := p_cells -> v_key;
    if v_cell is null or pg_catalog.jsonb_typeof(v_cell) <> 'object' then
      raise exception using errcode = '22023', message = 'INVALID_SNAPSHOT_PAYLOAD: Cell ' || v_key || ' must be an object.';
    end if;
    v_val := v_cell ->> v_key;
    if v_val is null or (v_val <> '0' and v_val <> '1') then
      raise exception using errcode = '22023', message = 'INVALID_SNAPSHOT_PAYLOAD: Cell ' || v_key || ' value must be string "0" or "1".';
    end if;
  end loop;

  insert into public.m11_snapshots (round_identifier, cells, cell_count, created_at, created_by)
  values (
    coalesce(nullif(trim(p_round_identifier), ''), 'round_' || pg_catalog.to_char(v_now, 'YYYYMMDD_HH24MISS')),
    p_cells,
    50,
    v_now,
    (select auth.uid())
  )
  returning public.m11_snapshots.id into v_id;

  return query
  select v_id, v_now, coalesce(nullif(trim(p_round_identifier), ''), 'round_' || pg_catalog.to_char(v_now, 'YYYYMMDD_HH24MISS'));
end;
$$;

revoke all on function public.publish_m11_snapshot(jsonb, text) from public, anon;
grant execute on function public.publish_m11_snapshot(jsonb, text) to authenticated, service_role;

create or replace function public.get_m11_snapshot(p_token text)
returns table (
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
  v_token_hash text;
  v_now timestamptz := pg_catalog.now();
begin
  if auth.role() = 'service_role' or public.has_admin_role('operator'::public.admin_role) then
    v_is_admin := true;
  end if;

  if not v_is_admin then
    if p_token is null or pg_catalog.char_length(p_token) < 16 then
      raise exception using errcode = '42501', message = 'UNAUTHORIZED: Valid session token required.';
    end if;

    v_token_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_token, 'UTF8')), 'hex');

    select s.* into v_session
    from public.game_access_sessions s
    join public.game_access_codes c on c.id = s.code_id
    where s.token_hash = v_token_hash
      and s.revoked_at is null
      and s.expires_at > v_now
      and c.active is true
      and c.revoked_at is null
    limit 1;

    if v_session.id is null then
      raise exception using errcode = '42501', message = 'UNAUTHORIZED: Session token is expired, revoked, or invalid.';
    end if;
  end if;

  return query
  select s.round_identifier, s.cells, s.created_at
  from public.m11_snapshots s
  order by s.created_at desc
  limit 1;
end;
$$;

revoke all on function public.get_m11_snapshot(text) from public;
grant execute on function public.get_m11_snapshot(text) to anon, authenticated, service_role;
