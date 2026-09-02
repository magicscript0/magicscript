-- Apple of Fortune (Game Console) runtime fix for modern PostgreSQL.
--
-- Three real runtime failures remained after migration 03 (pgcrypto/digest):
--
-- 1) has_admin_role() raised
--       ERROR 42883: operator does not exist: name = admin_role
--    on EVERY check against 'admin' or 'super_admin'. The PL/pgSQL variable
--    named `current_role` is masked by the SQL keyword CURRENT_ROLE (which is
--    of type `name`), so `return current_role = required_role` compares a
--    `name` value with the admin_role enum. The early-return branches for
--    'super_admin'/'operator' also never fire for the intended role, because
--    the keyword is read instead of the variable. Creation RPCs that call
--    has_admin_role() therefore fail with the hidden 42883 error.
--
-- 2) redeem_game_access() raised
--       ERROR 42702: column reference "expires_at" is ambiguous
--                      It could refer to either a PL/pgSQL variable or a
--                      table column.
--    on PostgreSQL 14+ (including Supabase's PG15/16/17/18). The rowtype
--    variable `v_code public.game_access_codes` makes the unqualified
--    `code_hash` / `active` / `revoked_at` / `expires_at` references in the
--    `select ... into v_code` ambiguous with the variable's fields.
--
-- 3) redeem_game_access() (and check_game_access()) raised
--       ERROR 42804: structure of query does not match function result type
--                      Returned type timestamp without time zone does not
--                      match expected type timestamp with time zone in
--                      column "server_now"
--    `timezone('utc', now())` returns `timestamp without time zone`, but the
--    RPC result column is declared `timestamptz`.
--
-- The browser maps all three to the generic "Access could not be verified
-- right now. Try again shortly." message. Admin-side creation kept working
-- only when has_admin_role() was never reached (or was bypassed by earlier
-- short-circuiting), which is why the two sides behaved differently.
--
-- Fix (no schema/table changes, no new objects):
--   * rename the PL/pgSQL variable to v_current_role,
--   * qualify every WHERE column reference with the table name,
--   * return the timestamptz value `now()` in RPC result columns.
-- Signatures, return shapes, SECURITY DEFINER mode, search_path, grants and
-- RLS policies are unchanged. Apply over migrations 00-03:
--   supabase link --project-ref eeffakpnyhqoxgbpxelj
--   supabase db push

create or replace function public.has_admin_role(required_role public.admin_role)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_current_role public.admin_role := public.current_admin_role();
begin
  if v_current_role is null then return false; end if;
  if v_current_role = 'super_admin' then return true; end if;
  if required_role = 'operator' then return true; end if;
  return v_current_role = required_role;
end;
$$;

create or replace function public.redeem_game_access(p_code_hash text, p_account_id text)
returns table (token text, expires_at timestamptz, server_now timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code public.game_access_codes;
  v_token text;
begin
  if p_account_id is null or p_account_id !~ '^[0-9]{9,11}$' then
    raise exception using errcode = '22023', message = 'INVALID_ACCOUNT_ID';
  end if;
  if p_code_hash is null or char_length(p_code_hash) <> 64 then
    raise exception using errcode = '22023', message = 'INVALID_ACCESS_CODE';
  end if;

  select * into v_code
  from public.game_access_codes
  where game_access_codes.code_hash = p_code_hash
    and game_access_codes.active = true
    and game_access_codes.revoked_at is null
    and game_access_codes.expires_at > now()
  for update;

  if not found then
    raise exception using errcode = '28000', message = 'ACCESS_CODE_UNAVAILABLE';
  end if;

  update public.game_access_codes
  set uses_count = uses_count + 1,
      account_id = p_account_id,
      redeemed_at = now()
  where game_access_codes.id = v_code.id;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.game_access_sessions (token_hash, code_id, account_id, expires_at)
  values (
    encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
    v_code.id,
    p_account_id,
    v_code.expires_at
  );

  return query select v_token, v_code.expires_at, now();
end;
$$;

create or replace function public.check_game_access(p_token_hash text)
returns table (valid boolean, expires_at timestamptz, server_now timestamptz, account_id text)
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
    now(),
    s.account_id
  from public.game_access_sessions s
  join public.game_access_codes c on c.id = s.code_id
  where s.token_hash = p_token_hash
  limit 1;
$$;

-- Keep the least-privilege contract identical to migration 02/03. Anonymous
-- game clients must be able to redeem/check; they still receive no direct
-- table access.
revoke all on function public.redeem_game_access(text, text) from public;
revoke all on function public.check_game_access(text) from public;
grant execute on function public.redeem_game_access(text, text) to anon, authenticated;
grant execute on function public.check_game_access(text) to anon, authenticated;
