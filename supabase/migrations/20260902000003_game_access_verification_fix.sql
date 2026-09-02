-- Apple of Fortune (Game Console) access-code verification fix.
--
-- Root cause of "Access could not be verified right now. Try again shortly."
-- on freshly created Supabase projects:
--
--   * Supabase pre-installs pgcrypto in the `extensions` schema (it is NOT in
--     `public`). Migration 02 only runs `create extension if not exists
--     pgcrypto`, which is a no-op there.
--   * `redeem_game_access` is SECURITY DEFINER with `set search_path = public`,
--     so its body cannot resolve `digest()` (pgcrypto) at runtime:
--
--       function digest(unknown, unknown) does not exist  (SQLSTATE 42883)
--
--     PostgREST returns that error to the anonymous game client and the
--     browser's safe error classifier maps it to the generic message.
--   * Admin-side creation (`create_game_access_code`) never calls a pgcrypto
--     function at runtime, which is exactly why code creation kept working.
--   * Session expiry timestamps live in `expires_at` and no migration of the
--     redeemed rows is required.
--
-- Fix: hash the server-generated session token with PostgreSQL's built-in
-- pg_catalog `sha256(bytea)` (available since PostgreSQL 11), eliminating the
-- pgcrypto extension dependency from the verification path. The signature,
-- return shape, SECURITY DEFINER mode, search_path, and privileges are
-- unchanged; no tables, roles, or RLS policies are touched.
--
-- Applies cleanly with the normal workflow:
--   supabase link --project-ref eeffakpnyhqoxgbpxelj
--   supabase db push

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
  where code_hash = p_code_hash
    and active = true
    and revoked_at is null
    and expires_at > timezone('utc', now())
  for update;

  if not found then
    raise exception using errcode = '28000', message = 'ACCESS_CODE_UNAVAILABLE';
  end if;

  update public.game_access_codes
  set uses_count = uses_count + 1,
      account_id = p_account_id,
      redeemed_at = timezone('utc', now())
  where game_access_codes.id = v_code.id;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.game_access_sessions (token_hash, code_id, account_id, expires_at)
  values (
    encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
    v_code.id,
    p_account_id,
    v_code.expires_at
  );

  return query select v_token, v_code.expires_at, timezone('utc', now());
end;
$$;

-- Keep the least-privilege contract identical to migration 02. Anonymous game
-- clients must be able to redeem; they still receive no direct table access.
revoke all on function public.redeem_game_access(text, text) from public;
grant execute on function public.redeem_game_access(text, text) to anon, authenticated;
