-- ==============================================================================
-- NEXUS V3 ZERO-TRUST HARDENING ROLLBACK SCRIPT
-- Migration: 20260927000000_zero_trust_hardening_v3_rollback.sql
-- ==============================================================================

-- 1. Drop debug inspection function
drop function if exists public.debug_inspect_request_headers();

-- 2. Drop pepper rotation helper
drop function if exists public.rotate_security_pepper(text, text);

-- 3. Revert RLS policies added by v3
drop policy if exists security_settings_admin_all on public.security_settings;
drop policy if exists security_audit_logs_admin_select on public.security_audit_logs;
drop policy if exists m11_snapshots_admin_select on public.m11_snapshots;
drop policy if exists game_access_rate_limits_admin_select on public.game_access_rate_limits;
drop policy if exists game_access_sessions_admin_select on public.game_access_sessions;
drop policy if exists game_access_codes_admin_select on public.game_access_codes;

-- Note: Data in public.game_access_codes, public.game_access_sessions, and
-- public.security_audit_logs is intentionally preserved to prevent data loss.
