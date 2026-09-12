-- Visitor & Security Monitoring Center.
--
-- Adds a dedicated, privacy-minimized monitoring plane NEXT TO the existing
-- systems (never inside them):
--
--   * public.visitor_sessions — one row per pseudonymous visitor key (a
--     random UUID generated in the browser). Technical environment metadata
--     only: approximate country, device class, browser, OS, last visited
--     app path, referrer HOST (never a full referrer URL), plus aggregate
--     counters (sessions, successful logins, failed login attempts).
--   * public.security_events — append-only security/audit event log:
--     authentication results, access attempts, and session milestones with
--     a SERVER-computed severity (normal / warning / suspicious /
--     high_risk) and the count of recent failures for context.
--
-- Privacy & security model (mirrors the existing game_access design):
--   * NO column and NO RPC parameter exists for a password, access code,
--     session token, cookie, authorization header, or raw IP address —
--     there is nowhere for a secret to be written, by construction.
--   * Failure detail is a whitelisted CATEGORY (e.g. 'invalid_code'),
--     never user-submitted input.
--   * Anonymous browsers can only call the SECURITY DEFINER RPCs below;
--     every value they send is re-validated server-side (path whitelist,
--     reason whitelist, enum casts, length caps, Account ID format) and a
--     claimed Supabase user id is accepted ONLY when it matches auth.uid().
--   * Direct table reads require an active admin profile via the existing
--     public.has_admin_role() helper (RLS + narrow column grants). No anon
--     policy exists; no browser INSERT/UPDATE/DELETE policy exists.
--   * Severity is computed in SQL from failure windows — a single failed
--     login is always 'normal'; repeated failures escalate.
--   * Retention: public.prune_security_monitoring() lets administrators
--     delete data older than a bounded retention window (7–365 days).
--
-- Firebase /m11, the game access lifecycle, Supabase Auth, and every
-- existing table/policy are intentionally untouched.

-- ------------------------------------------------------------------
-- 1) Types
-- ------------------------------------------------------------------
create type public.visitor_device_type as enum ('mobile', 'desktop', 'tablet', 'unknown');

create type public.security_event_type as enum (
  'session_start',
  'page_view',
  'game_login_success',
  'game_login_failure',
  'game_access_expired',
  'game_access_revoked',
  'game_logout',
  'admin_login_success',
  'admin_login_failure',
  'admin_logout'
);

create type public.security_event_result as enum ('success', 'failure', 'info');

create type public.security_severity as enum ('normal', 'warning', 'suspicious', 'high_risk');

-- ------------------------------------------------------------------
-- 2) Tables
-- ------------------------------------------------------------------
create table public.visitor_sessions (
  id uuid primary key default gen_random_uuid(),
  -- Pseudonymous browser-generated UUID. Not derived from any personal or
  -- network identifier.
  visitor_key uuid not null unique,
  -- Supabase Auth user id, linked ONLY when the visitor actually
  -- authenticates (verified against auth.uid() server-side).
  user_id uuid references auth.users(id) on delete set null,
  -- Game Account ID (a plain identifier, never a credential), linked when
  -- the visitor redeems game access. Same format as game_access_codes.
  game_account_id text,
  first_seen_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  session_count integer not null default 1,
  login_success_count integer not null default 0,
  login_failure_count integer not null default 0,
  -- Approximate country only (ISO 3166-1 alpha-2). No city, no coordinates,
  -- no raw IP address is ever stored.
  country_code text,
  device_type public.visitor_device_type not null default 'unknown',
  browser text,
  os text,
  -- One of the four app paths ('/', '/play', '/admin', '/login/admin'),
  -- validated server-side. Query strings and hashes are never stored.
  last_path text,
  -- Referrer HOSTNAME only, and only when it differs from this site.
  referrer_host text,
  constraint visitor_sessions_account_id check (game_account_id is null or game_account_id ~ '^[0-9]{9,11}$'),
  constraint visitor_sessions_country check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  constraint visitor_sessions_session_count check (session_count between 1 and 100000000),
  constraint visitor_sessions_success_count check (login_success_count between 0 and 100000000),
  constraint visitor_sessions_failure_count check (login_failure_count between 0 and 100000000),
  constraint visitor_sessions_browser_length check (browser is null or char_length(browser) between 1 and 64),
  constraint visitor_sessions_os_length check (os is null or char_length(os) between 1 and 64),
  constraint visitor_sessions_path_length check (last_path is null or char_length(last_path) between 1 and 64),
  constraint visitor_sessions_referrer_length check (referrer_host is null or char_length(referrer_host) between 1 and 253)
);

create table public.security_events (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references public.visitor_sessions(id) on delete cascade,
  -- Denormalized for indexed timeline lookups without a join.
  visitor_key uuid not null,
  event_type public.security_event_type not null,
  -- Derived from event_type SERVER-side; clients never choose the result.
  result public.security_event_result not null,
  -- Whitelisted failure category. Never free text, never user input.
  reason text,
  -- Computed SERVER-side from failure/activity windows (see the RPC).
  severity public.security_severity not null default 'normal',
  -- Failed events for this visitor inside the recent window, including
  -- this one (context for "repeated attempts").
  recent_failure_count integer not null default 0,
  user_id uuid,
  game_account_id text,
  country_code text,
  device_type public.visitor_device_type,
  browser text,
  os text,
  path text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint security_events_reason_whitelist check (reason is null or reason in (
    'invalid_account', 'invalid_code', 'unavailable', 'network', 'unknown',
    'access_expired', 'access_revoked',
    'invalid_credentials', 'rate_limited', 'email_not_confirmed',
    'profile_missing', 'profile_inactive', 'insufficient_role',
    'configuration', 'session', 'database'
  )),
  constraint security_events_account_id check (game_account_id is null or game_account_id ~ '^[0-9]{9,11}$'),
  constraint security_events_country check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  constraint security_events_recent_failures check (recent_failure_count between 0 and 100000000),
  constraint security_events_browser_length check (browser is null or char_length(browser) between 1 and 64),
  constraint security_events_os_length check (os is null or char_length(os) between 1 and 64),
  constraint security_events_path_length check (path is null or char_length(path) between 1 and 64)
);

create index visitor_sessions_last_seen_idx on public.visitor_sessions (last_seen_at desc);
create index visitor_sessions_first_seen_idx on public.visitor_sessions (first_seen_at desc);
create index visitor_sessions_user_id_idx on public.visitor_sessions (user_id);
create index visitor_sessions_account_id_idx on public.visitor_sessions (game_account_id);
create index visitor_sessions_country_idx on public.visitor_sessions (country_code);
create index security_events_created_at_idx on public.security_events (created_at desc);
create index security_events_visitor_key_idx on public.security_events (visitor_key, created_at desc);
create index security_events_type_idx on public.security_events (event_type, created_at desc);
create index security_events_result_idx on public.security_events (result, created_at desc);
create index security_events_severity_idx on public.security_events (severity, created_at desc);
create index security_events_account_idx on public.security_events (game_account_id, created_at desc);

-- ------------------------------------------------------------------
-- 3) Anonymous-safe write path (SECURITY DEFINER, validated server-side)
-- ------------------------------------------------------------------
-- The signature is the privacy contract: there is no parameter that could
-- carry a password, access code, session token, cookie, or IP address.
create or replace function public.track_visitor_activity(
  p_visitor_key uuid,
  p_event_type public.security_event_type,
  p_path text default null,
  p_reason text default null,
  p_account_id text default null,
  p_user_id uuid default null,
  p_new_session boolean default false,
  p_country_code text default null,
  p_device_type public.visitor_device_type default 'unknown',
  p_browser text default null,
  p_os text default null,
  p_referrer_host text default null
)
returns table (event_id uuid, severity public.security_severity, recent_failure_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visitor_id uuid;
  v_result public.security_event_result;
  v_severity public.security_severity := 'normal';
  v_recent integer := 0;
  v_event_id uuid := null;
  v_path text;
  v_reason text;
  v_account text;
  v_country text;
  v_user uuid;
  v_browser text;
  v_os text;
  v_referrer text;
  v_fail_window integer := 0;
  v_account_fail_window integer := 0;
  v_auth_window integer := 0;
  v_flood_window integer := 0;
  v_duplicate boolean := false;
begin
  if p_visitor_key is null or p_event_type is null then
    raise exception using errcode = '22023', message = 'INVALID_TRACKING_PAYLOAD';
  end if;

  -- Server-side normalization. Nothing client-provided is trusted or stored
  -- verbatim: paths come from a fixed whitelist, reasons from a fixed
  -- category list, country must be a 2-letter code, identifiers must match
  -- the existing Account ID format, and free text is length-capped.
  v_path := case when p_path in ('/', '/play', '/admin', '/login/admin') then p_path else null end;
  v_reason := case
    when p_reason is null then null
    when p_reason in (
      'invalid_account', 'invalid_code', 'unavailable', 'network', 'unknown',
      'access_expired', 'access_revoked',
      'invalid_credentials', 'rate_limited', 'email_not_confirmed',
      'profile_missing', 'profile_inactive', 'insufficient_role',
      'configuration', 'session', 'database'
    ) then p_reason
    else 'unknown'
  end;
  v_account := case when p_account_id ~ '^[0-9]{9,11}$' then p_account_id else null end;
  v_country := case when p_country_code ~ '^[A-Za-z]{2}$' then upper(p_country_code) else null end;
  v_browser := left(nullif(btrim(coalesce(p_browser, '')), ''), 64);
  v_os := left(nullif(btrim(coalesce(p_os, '')), ''), 64);
  v_referrer := lower(left(nullif(btrim(coalesce(p_referrer_host, '')), ''), 253));
  -- A claimed Supabase user id counts ONLY when the request is actually
  -- authenticated as that user; anonymous claims are dropped.
  v_user := case
    when p_user_id is not null and p_user_id = (select auth.uid()) then p_user_id
    else null
  end;

  -- The result is derived from the event type, never sent by the client.
  v_result := case
    when p_event_type in ('game_login_success', 'admin_login_success')
      then 'success'::public.security_event_result
    when p_event_type in ('game_login_failure', 'admin_login_failure', 'game_access_expired', 'game_access_revoked')
      then 'failure'::public.security_event_result
    else 'info'::public.security_event_result
  end;

  -- Upsert the pseudonymous visitor profile (identity + counters + latest
  -- technical environment). first_seen_at is written once, on insert.
  insert into public.visitor_sessions as vs (
    visitor_key, user_id, game_account_id, session_count,
    login_success_count, login_failure_count,
    country_code, device_type, browser, os, last_path, referrer_host
  )
  values (
    p_visitor_key,
    v_user,
    v_account,
    1,
    case when v_result = 'success' then 1 else 0 end,
    case when p_event_type in ('game_login_failure', 'admin_login_failure') then 1 else 0 end,
    v_country,
    coalesce(p_device_type, 'unknown'::public.visitor_device_type),
    v_browser,
    v_os,
    v_path,
    case when p_new_session then v_referrer else null end
  )
  on conflict (visitor_key) do update set
    last_seen_at = timezone('utc', now()),
    session_count = vs.session_count + case when p_new_session then 1 else 0 end,
    login_success_count = vs.login_success_count + case when v_result = 'success' then 1 else 0 end,
    login_failure_count = vs.login_failure_count
      + case when p_event_type in ('game_login_failure', 'admin_login_failure') then 1 else 0 end,
    user_id = coalesce(v_user, vs.user_id),
    game_account_id = coalesce(v_account, vs.game_account_id),
    country_code = coalesce(v_country, vs.country_code),
    device_type = case
      when p_device_type is not null and p_device_type <> 'unknown'::public.visitor_device_type then p_device_type
      else vs.device_type
    end,
    browser = coalesce(v_browser, vs.browser),
    os = coalesce(v_os, vs.os),
    last_path = coalesce(v_path, vs.last_path),
    referrer_host = case when p_new_session then coalesce(v_referrer, vs.referrer_host) else vs.referrer_host end
  returning vs.id into v_visitor_id;

  -- Server-side dedupe for low-value repeating events: session_start and
  -- page_view form one "presence" family — an identical path within 15
  -- seconds updates presence only and writes no event row. This protects
  -- the table from rapid repeated requests and double-mounted frontends.
  if p_event_type in ('session_start', 'page_view') then
    select exists (
      select 1 from public.security_events e
      where e.visitor_key = p_visitor_key
        and e.event_type in ('session_start', 'page_view')
        and e.path is not distinct from v_path
        and e.created_at > timezone('utc', now()) - interval '15 seconds'
    ) into v_duplicate;
  end if;

  if not v_duplicate then
    insert into public.security_events (
      visitor_id, visitor_key, event_type, result, reason,
      user_id, game_account_id, country_code, device_type, browser, os, path
    )
    values (
      v_visitor_id, p_visitor_key, p_event_type, v_result,
      case when v_result = 'failure' then coalesce(v_reason, 'unknown') else v_reason end,
      v_user, v_account, v_country, p_device_type, v_browser, v_os, v_path
    )
    returning security_events.id into v_event_id;
  end if;

  -- Suspicious-activity detection (server-side, windowed):
  --   * repeated failures by the same visitor (15 min),
  --   * repeated failures against the same Account ID (15 min),
  --   * unusually high authentication activity (15 min),
  --   * rapid repeated requests of any kind (5 min).
  -- A single failed login stays 'normal' — escalation needs repetition.
  select count(*) into v_recent
  from public.security_events e
  where e.visitor_key = p_visitor_key
    and e.result = 'failure'
    and e.created_at > timezone('utc', now()) - interval '15 minutes';

  if public.security_event_is_auth_event(p_event_type) then
    v_severity := case
      when v_recent >= 10 then 'high_risk'::public.security_severity
      when v_recent >= 4 then 'suspicious'::public.security_severity
      when v_recent >= 2 then 'warning'::public.security_severity
      else 'normal'::public.security_severity
    end;
  end if;

  if v_account is not null then
    select count(*) into v_account_fail_window
    from public.security_events e
    where e.game_account_id = v_account
      and e.result = 'failure'
      and e.created_at > timezone('utc', now()) - interval '15 minutes';

    v_severity := greatest(v_severity, case
      when v_account_fail_window >= 10 then 'high_risk'::public.security_severity
      when v_account_fail_window >= 5 then 'suspicious'::public.security_severity
      when v_account_fail_window >= 3 then 'warning'::public.security_severity
      else 'normal'::public.security_severity
    end);
  end if;

  select count(*) into v_auth_window
  from public.security_events e
  where e.visitor_key = p_visitor_key
    and e.event_type in (
      'game_login_success', 'game_login_failure',
      'game_access_expired', 'game_access_revoked',
      'admin_login_success', 'admin_login_failure'
    )
    and e.created_at > timezone('utc', now()) - interval '15 minutes';

  v_severity := greatest(v_severity, case
    when v_auth_window >= 40 then 'high_risk'::public.security_severity
    when v_auth_window >= 20 then 'suspicious'::public.security_severity
    else 'normal'::public.security_severity
  end);

  select count(*) into v_flood_window
  from public.security_events e
  where e.visitor_key = p_visitor_key
    and e.created_at > timezone('utc', now()) - interval '5 minutes';

  v_severity := greatest(v_severity, case
    when v_flood_window >= 60 then 'high_risk'::public.security_severity
    when v_flood_window >= 30 then 'suspicious'::public.security_severity
    else 'normal'::public.security_severity
  end);

  if v_event_id is not null then
    update public.security_events
    set severity = v_severity,
        recent_failure_count = v_recent
    where security_events.id = v_event_id;
  end if;

  return query select v_event_id, v_severity, v_recent;
end;
$$;

-- Small predicate keeping the PL/pgSQL above readable: whether the event
-- participates in authentication-activity severity scoring.
create or replace function public.security_event_is_auth_event(p_event_type public.security_event_type)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_event_type in (
    'game_login_success', 'game_login_failure',
    'game_access_expired', 'game_access_revoked',
    'admin_login_success', 'admin_login_failure'
  );
$$;

-- Cheap presence ping. Server-side throttled: updates at most once per
-- 20 seconds per visitor and never writes an event row.
create or replace function public.visitor_heartbeat(p_visitor_key uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer := 0;
begin
  if p_visitor_key is null then
    return false;
  end if;
  update public.visitor_sessions
  set last_seen_at = timezone('utc', now())
  where visitor_key = p_visitor_key
    and last_seen_at < timezone('utc', now()) - interval '20 seconds';
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- ------------------------------------------------------------------
-- 4) Retention / cleanup (administrator only)
-- ------------------------------------------------------------------
create or replace function public.prune_security_monitoring(p_retention_days integer default 90)
returns table (events_deleted bigint, visitors_deleted bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz;
  v_events bigint := 0;
  v_visitors bigint := 0;
begin
  if not public.has_admin_role('admin') then
    raise exception using errcode = '42501', message = 'Only administrators can prune monitoring data.';
  end if;
  if p_retention_days is null or p_retention_days < 7 or p_retention_days > 365 then
    raise exception using errcode = '22023', message = 'INVALID_RETENTION';
  end if;

  v_cutoff := timezone('utc', now()) - make_interval(days => p_retention_days);

  delete from public.security_events where created_at < v_cutoff;
  get diagnostics v_events = row_count;

  delete from public.visitor_sessions where last_seen_at < v_cutoff;
  get diagnostics v_visitors = row_count;

  return query select v_events, v_visitors;
end;
$$;

-- ------------------------------------------------------------------
-- 5) Grants & RLS
-- ------------------------------------------------------------------
revoke all on function public.track_visitor_activity(uuid, public.security_event_type, text, text, text, uuid, boolean, text, public.visitor_device_type, text, text, text) from public;
revoke all on function public.security_event_is_auth_event(public.security_event_type) from public;
revoke all on function public.visitor_heartbeat(uuid) from public;
revoke all on function public.prune_security_monitoring(integer) from public;

grant execute on function public.track_visitor_activity(uuid, public.security_event_type, text, text, text, uuid, boolean, text, public.visitor_device_type, text, text, text) to anon, authenticated;
grant execute on function public.visitor_heartbeat(uuid) to anon, authenticated;
grant execute on function public.prune_security_monitoring(integer) to authenticated;

alter table public.visitor_sessions enable row level security;
alter table public.security_events enable row level security;

-- No PostgREST table access for anon at all. Authenticated administrators
-- get SELECT on the (already privacy-minimized) columns; every write path
-- for browsers is the SECURITY DEFINER RPC above.
revoke all on table public.visitor_sessions, public.security_events from public, anon, authenticated;

grant select (
  id, visitor_key, user_id, game_account_id, first_seen_at, last_seen_at,
  session_count, login_success_count, login_failure_count,
  country_code, device_type, browser, os, last_path, referrer_host
) on table public.visitor_sessions to authenticated;
grant select (
  id, visitor_id, visitor_key, event_type, result, reason, severity,
  recent_failure_count, user_id, game_account_id, country_code,
  device_type, browser, os, path, created_at
) on table public.security_events to authenticated;
grant all on table public.visitor_sessions, public.security_events to service_role;

-- Administrator-role readers only (admin and super_admin; the same bar as
-- the game access inventory). There are deliberately NO insert/update/
-- delete policies for any API role — the audit trail is append-only via
-- the RPC and prunable only through prune_security_monitoring().
create policy visitor_sessions_admin_select on public.visitor_sessions
for select to authenticated
using (public.has_admin_role('admin'));

create policy security_events_admin_select on public.security_events
for select to authenticated
using (public.has_admin_role('admin'));

-- ------------------------------------------------------------------
-- 6) Realtime (guarded: only where the publication exists)
-- ------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.security_events, public.visitor_sessions';
  end if;
exception when others then
  raise notice 'supabase_realtime publication left unchanged: %', sqlerrm;
end;
$$;

comment on table public.visitor_sessions is 'Pseudonymous visitor profiles for the monitoring center; technical environment metadata only, never credentials or raw IPs.';
comment on table public.security_events is 'Append-only security/audit event log; failure categories and server-computed severity only, never secrets.';
