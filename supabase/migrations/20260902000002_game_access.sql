-- Apple of Fortune (Game Console) end-user access control.
--
-- This is a SEPARATE access system from Supabase Auth / admin_users:
-- administrators keep signing in with email + password, while end users
-- enter the Game Console with an Account ID (a plain numeric identifier)
-- plus an Access Code issued from the Admin Dashboard.
--
-- Security model:
--  * Only the SHA-256 hash of an access code is persisted; plaintext codes
--    are generated in the admin's browser and shown exactly once.
--  * Session tokens are opaque random values; only their SHA-256 hash is
--    stored. The plaintext token lives solely in the end user's browser.
--  * Every expiration/revocation decision is made server-side against the
--    database clock (timezone('utc', now())) inside SECURITY DEFINER RPCs.
--  * Anonymous clients can call the redeem/check RPCs only; they receive no
--    direct table access. Administrative management stays RLS-protected.

create extension if not exists pgcrypto;

create table public.game_access_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  duration_minutes integer not null,
  active boolean not null default true,
  -- Computed server-side at creation time (see create_game_access_code).
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  created_by uuid references public.admin_users(id) on delete set null,
  revoked_at timestamptz,
  uses_count integer not null default 0,
  -- Last Account ID that redeemed this code (operational visibility only;
  -- the Account ID is an identifier, never a credential).
  account_id text,
  redeemed_at timestamptz,
  constraint game_access_codes_hash_length check (char_length(code_hash) = 64),
  constraint game_access_codes_duration check (duration_minutes between 1 and 10080),
  constraint game_access_codes_uses_count check (uses_count >= 0 and uses_count <= 1000000),
  constraint game_access_codes_account_id check (account_id is null or account_id ~ '^[0-9]{9,11}$'),
  constraint game_access_codes_revocation_consistency check (revoked_at is null or active = false)
);

create table public.game_access_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  code_id uuid not null references public.game_access_codes(id) on delete cascade,
  account_id text not null,
  created_at timestamptz not null default timezone('utc', now()),
  -- A session never outlives its access code.
  expires_at timestamptz not null,
  constraint game_access_sessions_token_length check (char_length(token_hash) = 64),
  constraint game_access_sessions_account_id check (account_id ~ '^[0-9]{9,11}$')
);

create index game_access_codes_status_idx on public.game_access_codes (active, expires_at);
create index game_access_codes_created_by_idx on public.game_access_codes (created_by);
create index game_access_sessions_code_id_idx on public.game_access_sessions (code_id);
create index game_access_sessions_expires_at_idx on public.game_access_sessions (expires_at);

-- Administrator-facing creation. The expiry timestamp is computed from the
-- DATABASE clock so client clock drift cannot shorten or extend validity.
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
  values (
    p_code_hash,
    p_duration_minutes,
    p_created_by,
    timezone('utc', now()) + make_interval(mins => p_duration_minutes)
  )
  returning
    game_access_codes.id,
    game_access_codes.expires_at,
    game_access_codes.created_at,
    game_access_codes.duration_minutes;
end;
$$;

-- End-user redemption. Anonymous-safe by design: it never exposes any row
-- directly, only a verdict plus a fresh bearer token when allowed.
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
  values (encode(digest(v_token, 'sha256'), 'hex'), v_code.id, p_account_id, v_code.expires_at);

  return query select v_token, v_code.expires_at, timezone('utc', now());
end;
$$;

-- End-user session revalidation (restore on refresh, heartbeat, focus).
-- A session is valid only while it has not expired AND its parent access
-- code is still active and unrevoked — revoking a code immediately kills
-- every session derived from it.
create or replace function public.check_game_access(p_token_hash text)
returns table (valid boolean, expires_at timestamptz, server_now timestamptz, account_id text)
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
    timezone('utc', now()),
    s.account_id
  from public.game_access_sessions s
  join public.game_access_codes c on c.id = s.code_id
  where s.token_hash = p_token_hash
  limit 1;
$$;

revoke all on function public.create_game_access_code(text, integer, uuid) from public;
revoke all on function public.redeem_game_access(text, text) from public;
revoke all on function public.check_game_access(text) from public;
grant execute on function public.create_game_access_code(text, integer, uuid) to authenticated;
grant execute on function public.redeem_game_access(text, text) to anon, authenticated;
grant execute on function public.check_game_access(text) to anon, authenticated;

alter table public.game_access_codes enable row level security;
alter table public.game_access_sessions enable row level security;

-- No direct table access for anon. Authenticated administrators get only the
-- columns that never include the stored hash; inserts happen exclusively
-- through the SECURITY DEFINER functions above.
revoke all on table public.game_access_codes, public.game_access_sessions from public, anon, authenticated;

grant select (
  id, duration_minutes, active, expires_at, created_at, created_by,
  revoked_at, uses_count, account_id, redeemed_at
) on table public.game_access_codes to authenticated;
grant update (active, revoked_at) on table public.game_access_codes to authenticated;
grant select (id, code_id, account_id, created_at, expires_at)
  on table public.game_access_sessions to authenticated;
grant all on table public.game_access_codes, public.game_access_sessions to service_role;

create policy game_access_codes_select on public.game_access_codes
for select to authenticated
using (public.has_admin_role('admin'));

create policy game_access_codes_update on public.game_access_codes
for update to authenticated
using (public.has_admin_role('admin'))
with check (public.has_admin_role('admin'));

create policy game_access_sessions_select on public.game_access_sessions
for select to authenticated
using (public.has_admin_role('admin'));

comment on table public.game_access_codes is 'Time-bound Apple of Fortune access codes; only SHA-256 hashes are persisted.';
comment on table public.game_access_sessions is 'Opaque-token game sessions bound to an access code expiry; token hashes only.';
