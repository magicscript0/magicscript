-- Public Game Control Center.
--
-- 1) ACCESS-CODE TIMING — the session countdown starts at ACTIVATION, not
--    creation. `game_access_codes.expires_at` becomes an OPTIONAL "redeem-by"
--    deadline (NULL = redeemable until revoked); the session expiry is always
--    computed server-side at redemption as `now() + duration_minutes`.
-- 2) LOCAL-TIME DISPLAY — new presentation columns on the existing
--    display_settings singleton.
-- 3) PUBLIC LOGIN PRESENTATION — seeded in the existing site_settings store.
--
-- Firebase /m11 is intentionally untouched here; it remains the game-state
-- source. Supabase remains the settings/auth/access system.

-- ------------------------------------------------------------------
-- 1) Access-code timing lifecycle
-- ------------------------------------------------------------------
alter table public.game_access_codes alter column expires_at drop not null;

-- Creation no longer starts the timer: the code waits, inactive, until it is
-- activated. The returned expires_at (redeem-by) is NULL by default.
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

-- Redemption is the reference point for the session expiration. The session
-- now expires at `now() + duration_minutes`, regardless of when the code was
-- created. A redeem-by deadline (when set) still gates redemption.
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
    and (expires_at is null or expires_at > timezone('utc', now()))
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

  -- The activation timestamp (server clock) starts the session timer.
  insert into public.game_access_sessions (token_hash, code_id, account_id, expires_at)
  values (
    encode(digest(v_token, 'sha256'), 'hex'),
    v_code.id,
    p_account_id,
    timezone('utc', now()) + make_interval(mins => v_code.duration_minutes)
  );

  return query
    select
      v_token,
      timezone('utc', now()) + make_interval(mins => v_code.duration_minutes),
      timezone('utc', now());
end;
$$;

-- check_game_access is unchanged: it already evaluates validity against the
-- session expiry plus the parent code's active/revoked state.

comment on table public.game_access_codes is 'Apple of Fortune access codes; the session timer starts on activation. Only SHA-256 hashes are persisted.';

-- ------------------------------------------------------------------
-- 2) Local-time display (existing display_settings singleton)
-- ------------------------------------------------------------------
alter table public.display_settings
  add column if not exists local_time_enabled boolean not null default true,
  add column if not exists local_time_clock text not null default '12h';

alter table public.display_settings
  add constraint display_settings_local_time_clock check (local_time_clock in ('12h', '24h'));

-- Anonymous readers may select the two new presentation columns only.
grant select (local_time_enabled, local_time_clock)
  on table public.display_settings to anon;

-- ------------------------------------------------------------------
-- 3) Public login presentation settings (existing site_settings store)
-- ------------------------------------------------------------------
insert into public.site_settings (key, value, type, is_public)
values
  ('login_title', '"Apple of Fortune"'::jsonb, 'string', true),
  ('login_caption', '"Enter your details to open the game."'::jsonb, 'string', true),
  ('login_status_label', '"Ready"'::jsonb, 'string', true),
  ('login_status_enabled', 'true'::jsonb, 'boolean', true)
on conflict (key) do nothing;

-- Parity with the public YouTube link the login screen already displayed.
update public.social_links
set youtube_url = 'https://youtube.com/@nano_scriptt'
where id = 'primary' and youtube_url is null;
