-- Game Access verification fix (CREATE → REDEEM → SESSION → VALIDATION).
--
-- Four unconditional breakages in the access-code path are repaired here;
-- nothing else about the security model changes (hashes only, server-side
-- decisions, database-clock expiry, RLS + grants untouched). All four were
-- verified against a real PostgreSQL (embedded, Supabase-shaped) and all of
-- them surfaced to the end user as exactly the same generic message:
-- "Access could not be verified right now. Try again shortly."
--
-- 1) ADMIN AUTHORIZATION — public.has_admin_role() declared a local variable
--    named `current_role`. That is a reserved SQL keyword, so PL/pgSQL never
--    substitutes the variable: the final comparison became
--    `name = admin_role` and every call with 'admin'/'super_admin' aborted
--    with `operator does not exist: name = admin_role` (SQLSTATE 42883).
--    create_game_access_code() and the game_access_codes RLS policies call
--    has_admin_role('admin'), so authorized administrators could not create
--    or read game access codes. The variable is renamed (v_role); the role
--    hierarchy semantics are unchanged (super_admin > admin > operator;
--    'operator' still passes for any active admin role, as designed).
--
-- 2) AMBIGUOUS COLUMN REFERENCE — redeem_game_access() declares
--    `returns table (token text, expires_at timestamptz, server_now
--    timestamptz)`. PL/pgSQL turns those output columns into variables, so
--    the unqualified `expires_at` in the function's WHERE clause collided
--    with the game_access_codes column of the same name and every redemption
--    aborted with `column reference "expires_at" is ambiguous` (SQLSTATE
--    42702). The code columns are now table-qualified.
--
-- 3) WRONG RESULT TYPE IN RETURN QUERY — `timezone('utc', now())` yields
--    `timestamp without time zone`, but the function promises `timestamptz`.
--    PL/pgSQL's RETURN QUERY matches result types strictly (binary-coercible
--    only), so the final `return query select v_token, …, timezone('utc',
--    now())` aborted every redemption with `structure of query does not
--    match function result type` (SQLSTATE 42804). The redemption path now
--    uses the database clock directly — now(), an absolute timestamptz
--    instant — which is the required type and immune to any session
--    timezone reinterpretation.
--
-- 4) UNAVAILABLE HASHING HELPER — redeem_game_access() hashed the session
--    token with pgcrypto's digest() UNQUALIFIED while pinning
--    `set search_path = public`. On Supabase, pgcrypto is installed into the
--    `extensions` schema (never `public`), so the lookup failed at runtime
--    with `function digest(...) does not exist` (SQLSTATE 42883). The token
--    hash is now computed with PostgreSQL's CORE sha256(bytea) (available
--    since 11): encode(sha256(convert_to(token, 'UTF8')), 'hex') — the
--    identical lowercase SHA-256 hex digest the browser derives with Web
--    Crypto, with zero extension dependency.
--
-- The activation lifecycle below is the one introduced by migration
-- 20260910000000 and is restated so the final state converges no matter
-- which earlier migrations a project has already applied: creation does NOT
-- start the session timer (expires_at = the optional redeem-by deadline,
-- NULL by default), and the session expiry is computed server-side AT
-- REDEMPTION as now() + duration_minutes on the database clock.

alter table public.game_access_codes alter column expires_at drop not null;

-- 1) Reserved-word-safe admin authorization helper (semantics unchanged).
create or replace function public.has_admin_role(required_role public.admin_role)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role public.admin_role := public.current_admin_role();
begin
  if v_role is null then return false; end if;
  if v_role = 'super_admin' then return true; end if;
  if required_role = 'operator' then return true; end if;
  return v_role = required_role;
end;
$$;

-- Creation still waits for activation (no timer started here).
create or replace function public.create_game_access_code(
  p_code_hash text,
  p_duration_minutes integer,
  p_created_by uuid
)
returns table (id uuid, expires_at timestamptz, created_at timestamptz, duration_minutes integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_admin_role('admin') then
    raise exception using errcode = '42501', message = 'Only administrators can create game access codes.';
  end if;
  if p_created_by is distinct from (select auth.uid()) then
    raise exception using errcode = '42501', message = 'Game access codes must be created by the signed-in administrator.';
  end if;
  if p_code_hash is null or char_length(p_code_hash) <> 64 then
    raise exception using errcode = '22023', message = 'INVALID_CODE_HASH';
  end if;
  if p_duration_minutes is null or p_duration_minutes < 1 or p_duration_minutes > 10080 then
    raise exception using errcode = '22023', message = 'INVALID_DURATION';
  end if;

  return query
  insert into public.game_access_codes (code_hash, duration_minutes, created_by, expires_at)
  values (p_code_hash, p_duration_minutes, p_created_by, null)
  returning
    game_access_codes.id,
    game_access_codes.expires_at,
    game_access_codes.created_at,
    game_access_codes.duration_minutes;
end;
$$;

-- Redemption is the reference point for the session expiration: the session
-- expires at now() + duration_minutes on the DATABASE clock, regardless of
-- when (or by whom) the code was created.
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

  -- Table-qualified references: the RETURNS TABLE clause introduces
  -- expires_at as a PL/pgSQL variable, so a bare column name is ambiguous.
  select * into v_code
  from public.game_access_codes
  where game_access_codes.code_hash = p_code_hash
    and game_access_codes.active = true
    and game_access_codes.revoked_at is null
    and (game_access_codes.expires_at is null or game_access_codes.expires_at > now())
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

  -- Core sha256 (no pgcrypto): see the migration header. The activation
  -- timestamp (database clock) starts the session timer. now() is stable
  -- within the transaction, so expiry and server_now share one instant.
  insert into public.game_access_sessions (token_hash, code_id, account_id, expires_at)
  values (
    encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
    v_code.id,
    p_account_id,
    now() + make_interval(mins => v_code.duration_minutes)
  );

  return query
    select
      v_token,
      now() + make_interval(mins => v_code.duration_minutes),
      now();
end;
$$;

-- Re-assert the public surface (idempotent; unchanged from 20260902000002).
revoke all on function public.create_game_access_code(text, integer, uuid) from public;
revoke all on function public.redeem_game_access(text, text) from public;
revoke all on function public.check_game_access(text) from public;
grant execute on function public.create_game_access_code(text, integer, uuid) to authenticated;
grant execute on function public.redeem_game_access(text, text) to anon, authenticated;
grant execute on function public.check_game_access(text) to anon, authenticated;
