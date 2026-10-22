-- ==============================================================================
-- NEXUS V3 PRE-FLIGHT READ-ONLY AUDIT & CHECKLIST
-- File: supabase/migrations/preflight_v3_check.sql
-- Run this in Supabase SQL Editor BEFORE applying migration v3.
-- ==============================================================================

-- 1. Check existing tables in public schema
select table_name, rowsecurity as rls_enabled
from pg_tables
where schemaname = 'public'
order by table_name;

-- 2. Count active codes and sessions to verify dataset size before migration
select 
  (select count(*) from public.game_access_codes) as total_codes,
  (select count(*) from public.game_access_codes where active = true) as active_codes,
  (select count(*) from public.game_access_codes where uses_count > 0) as used_codes,
  (select count(*) from public.game_access_codes where expires_at is null or expires_at > now()) as unexpired_codes,
  (select count(*) from public.game_access_sessions where revoked_at is null and expires_at > now()) as active_sessions;

-- 3. Inventory legacy (non-HMAC) codes
select 
  id, 
  duration_minutes, 
  uses_count, 
  active, 
  created_at, 
  expires_at,
  case 
    when uses_count >= 1 then 'USED'
    else 'UNREDEEMED'
  end as usage_state
from public.game_access_codes
where is_hmac is not true
order by created_at desc
limit 50;

-- 4. Check Vault extension status
select 
  exists (select 1 from pg_extension where extname = 'vault') as vault_extension_installed,
  exists (select 1 from pg_tables where schemaname = 'vault' and tablename = 'secrets') as vault_secrets_table_exists;

-- 5. Check existing grants on sensitive tables
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('game_access_codes', 'game_access_sessions', 'game_access_rate_limits', 'm11_snapshots')
  and grantee in ('PUBLIC', 'anon', 'authenticated')
order by table_name, grantee, privilege_type;

-- 6. Check existing search_path settings on functions in public schema
select 
  p.proname as function_name,
  p.prosecdef as is_security_definer,
  p.proconfig as configuration_settings
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'current_admin_role', 'has_admin_role', 'create_game_access_code',
    'generate_game_access_code', 'redeem_game_access', 'check_game_access',
    'revoke_game_access_session', 'prune_game_rate_limits', 'publish_m11_snapshot',
    'get_m11_snapshot', 'extract_client_ip'
  )
order by p.proname;
