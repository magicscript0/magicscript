-- MAGIC SCRIPT control plane
-- Firebase /m11 is intentionally not represented here. It remains the
-- existing realtime bridge consumed by APP 2.

create extension if not exists pgcrypto;

create type public.admin_role as enum ('super_admin', 'admin', 'operator');
create type public.setting_value_type as enum ('string', 'number', 'boolean', 'json');
create type public.online_counter_mode as enum ('random', 'fixed');
create type public.round_history_source as enum ('live', 'published', 'local');
create type public.round_history_status as enum ('ready', 'revealed', 'failed');

create table public.admin_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  username text,
  role public.admin_role not null default 'operator',
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint admin_users_email_length check (char_length(email) between 3 and 320),
  constraint admin_users_username_length check (username is null or char_length(username) between 1 and 80)
);

create table public.admin_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  role public.admin_role not null default 'operator',
  active boolean not null default true,
  expires_at timestamptz,
  max_uses integer not null default 1,
  uses_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  created_by uuid references public.admin_users(id) on delete set null,
  revoked_at timestamptz,
  constraint admin_codes_hash_length check (char_length(code_hash) = 64),
  constraint admin_codes_max_uses check (max_uses between 1 and 1000),
  constraint admin_codes_uses_count check (uses_count >= 0 and uses_count <= max_uses),
  constraint admin_codes_revocation_consistency check (revoked_at is null or active = false)
);

create table public.site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  type public.setting_value_type not null,
  is_public boolean not null default false,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references public.admin_users(id) on delete set null,
  constraint site_settings_key_length check (char_length(key) between 1 and 120)
);

create table public.social_links (
  id text primary key default 'primary',
  telegram_url text,
  youtube_url text,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references public.admin_users(id) on delete set null,
  constraint social_links_singleton check (id = 'primary')
);

create table public.display_settings (
  id text primary key default 'primary',
  online_count_enabled boolean not null default true,
  online_count_min integer not null default 120,
  online_count_max integer not null default 450,
  online_count_mode public.online_counter_mode not null default 'random',
  online_count_fixed integer,
  online_count_refresh_ms integer not null default 3000,
  brand_accent text not null default 'emerald',
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references public.admin_users(id) on delete set null,
  constraint display_settings_singleton check (id = 'primary'),
  constraint display_settings_range check (online_count_min >= 0 and online_count_max >= online_count_min),
  constraint display_settings_fixed check (online_count_fixed is null or online_count_fixed >= 0),
  constraint display_settings_refresh check (online_count_refresh_ms between 1000 and 3600000)
);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.admin_users(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint activity_logs_action_length check (char_length(action) between 1 and 120)
);

create table public.round_history (
  id uuid primary key default gen_random_uuid(),
  round_identifier text not null,
  source public.round_history_source not null,
  created_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  status public.round_history_status not null,
  metadata jsonb not null default '{}'::jsonb,
  constraint round_history_identifier_length check (char_length(round_identifier) between 1 and 160)
);

create index admin_users_role_active_idx on public.admin_users (role, active);
create index admin_codes_status_idx on public.admin_codes (active, expires_at);
create index admin_codes_created_by_idx on public.admin_codes (created_by);
create index activity_logs_created_at_idx on public.activity_logs (created_at desc);
create index activity_logs_admin_id_idx on public.activity_logs (admin_id);
create index round_history_created_at_idx on public.round_history (created_at desc);
create index round_history_created_by_idx on public.round_history (created_by);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create trigger admin_users_set_updated_at
before update on public.admin_users
for each row execute function public.set_updated_at();

create trigger site_settings_set_updated_at
before update on public.site_settings
for each row execute function public.set_updated_at();

create trigger social_links_set_updated_at
before update on public.social_links
for each row execute function public.set_updated_at();

create trigger display_settings_set_updated_at
before update on public.display_settings
for each row execute function public.set_updated_at();

-- Security-definer helpers avoid policy recursion while still checking the
-- active profile on every request. They return no role for anonymous users.
create or replace function public.current_admin_role()
returns public.admin_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.admin_users
  where id = (select auth.uid())
    and active = true
  limit 1;
$$;

create or replace function public.has_admin_role(required_role public.admin_role)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  current_role public.admin_role := public.current_admin_role();
begin
  if current_role is null then return false; end if;
  if current_role = 'super_admin' then return true; end if;
  if required_role = 'operator' then return true; end if;
  return current_role = required_role;
end;
$$;

-- Atomic server-side redemption primitive used only by the optional Edge
-- Function. The browser never calls this function and never receives a
-- service-role credential.
create or replace function public.consume_admin_code(p_code_hash text)
returns table (id uuid, role public.admin_role)
language sql
security definer
set search_path = public
as $$
  update public.admin_codes
  set uses_count = uses_count + 1
  where code_hash = p_code_hash
    and active = true
    and (expires_at is null or expires_at > timezone('utc', now()))
    and uses_count < max_uses
    and revoked_at is null
  returning admin_codes.id, admin_codes.role;
$$;

revoke all on function public.set_updated_at() from public;
revoke all on function public.current_admin_role() from public;
revoke all on function public.has_admin_role(public.admin_role) from public;
revoke all on function public.consume_admin_code(text) from public;
grant execute on function public.current_admin_role() to authenticated;
grant execute on function public.has_admin_role(public.admin_role) to authenticated;
grant execute on function public.consume_admin_code(text) to service_role;

alter table public.admin_users enable row level security;
alter table public.admin_codes enable row level security;
alter table public.site_settings enable row level security;
alter table public.social_links enable row level security;
alter table public.display_settings enable row level security;
alter table public.activity_logs enable row level security;
alter table public.round_history enable row level security;

-- Keep PostgREST table privileges narrow as well as policy-protected. RLS
-- decides which rows are visible; these grants decide which operations are
-- available to each API role at all.
revoke all on table public.admin_users, public.admin_codes, public.site_settings,
  public.social_links, public.display_settings, public.activity_logs,
  public.round_history from public, anon, authenticated;

grant select, insert, update, delete on table public.admin_users to authenticated;
grant select (id, role, active, expires_at, max_uses, uses_count, created_at, created_by, revoked_at)
  on table public.admin_codes to authenticated;
grant insert (code_hash, role, expires_at, max_uses, created_by)
  on table public.admin_codes to authenticated;
grant update (active, revoked_at)
  on table public.admin_codes to authenticated;
grant delete on table public.admin_codes to authenticated;
grant select, insert, update on table public.site_settings to authenticated;
grant select on table public.site_settings to anon;
grant select, insert, update, delete on table public.social_links to authenticated;
grant select on table public.social_links to anon;
grant select, insert, update, delete on table public.display_settings to authenticated;
grant select on table public.display_settings to anon;
grant select, insert on table public.activity_logs to authenticated;
grant select, insert on table public.round_history to authenticated;
grant all on table public.admin_users, public.admin_codes, public.site_settings,
  public.social_links, public.display_settings, public.activity_logs,
  public.round_history to service_role;

-- A signed-in user may read only their own profile. A super administrator
-- can manage the profile roster; no anonymous profile access exists.
create policy admin_users_select on public.admin_users
for select to authenticated
using (id = (select auth.uid()) or public.has_admin_role('super_admin'));

create policy admin_users_insert on public.admin_users
for insert to authenticated
with check (public.has_admin_role('super_admin'));

create policy admin_users_update on public.admin_users
for update to authenticated
using (public.has_admin_role('super_admin'))
with check (public.has_admin_role('super_admin'));

create policy admin_users_delete on public.admin_users
for delete to authenticated
using (public.has_admin_role('super_admin'));

-- Codes are visible only to active administrators. The code_hash is never
-- plaintext; code creation in the UI uses Web Crypto and retains the raw code
-- in memory for one copy action only.
create policy admin_codes_select on public.admin_codes
for select to authenticated
using (public.has_admin_role('admin'));

create policy admin_codes_insert on public.admin_codes
for insert to authenticated
with check (
  public.has_admin_role('admin')
  and created_by = (select auth.uid())
  and (role <> 'super_admin' or public.has_admin_role('super_admin'))
);

create policy admin_codes_update on public.admin_codes
for update to authenticated
using (public.has_admin_role('admin'))
with check (
  public.has_admin_role('admin')
  and (role <> 'super_admin' or public.has_admin_role('super_admin'))
);

create policy admin_codes_delete on public.admin_codes
for delete to authenticated
using (public.has_admin_role('super_admin'));

-- Only settings marked public are readable without a session. Public rows are
-- intentionally limited to presentation data; no anonymous write policy exists.
create policy site_settings_public_select on public.site_settings
for select to anon, authenticated
using (is_public = true);

create policy site_settings_admin_select on public.site_settings
for select to authenticated
using (public.has_admin_role('admin'));

create policy site_settings_admin_insert on public.site_settings
for insert to authenticated
with check (public.has_admin_role('admin') and updated_by = (select auth.uid()));

create policy site_settings_admin_update on public.site_settings
for update to authenticated
using (public.has_admin_role('admin'))
with check (public.has_admin_role('admin') and updated_by = (select auth.uid()));

create policy social_links_public_select on public.social_links
for select to anon, authenticated
using (true);

create policy social_links_admin_write on public.social_links
for all to authenticated
using (public.has_admin_role('admin'))
with check (public.has_admin_role('admin') and updated_by = (select auth.uid()));

create policy display_settings_public_select on public.display_settings
for select to anon, authenticated
using (true);

create policy display_settings_admin_write on public.display_settings
for all to authenticated
using (public.has_admin_role('admin'))
with check (public.has_admin_role('admin') and updated_by = (select auth.uid()));

-- Audit data is append-only from the browser: active admins may add their own
-- event, all active admins may read, and nobody can edit or delete history.
create policy activity_logs_admin_select on public.activity_logs
for select to authenticated
using (public.has_admin_role('operator'));

create policy activity_logs_admin_insert on public.activity_logs
for insert to authenticated
with check (
  public.has_admin_role('operator')
  and admin_id = (select auth.uid())
);

create policy round_history_admin_select on public.round_history
for select to authenticated
using (public.has_admin_role('operator'));

create policy round_history_admin_insert on public.round_history
for insert to authenticated
with check (
  public.has_admin_role('operator')
  and (created_by is null or created_by = (select auth.uid()))
);

-- Safe public defaults. They may be edited by an administrator later.
insert into public.site_settings (key, value, type, is_public)
values
  ('site_name', '"MAGIC SCRIPT"'::jsonb, 'string', true),
  ('site_description', '"Operations command center"'::jsonb, 'string', true),
  ('browser_title', '"MAGIC SCRIPT Admin Console"'::jsonb, 'string', true),
  ('announcement', '""'::jsonb, 'string', true),
  ('maintenance_mode', 'false'::jsonb, 'boolean', true)
on conflict (key) do nothing;

insert into public.social_links (id, telegram_url) values ('primary', 'https://t.me/fox_script_vip') on conflict (id) do nothing;
insert into public.display_settings (id) values ('primary') on conflict (id) do nothing;

comment on table public.admin_users is 'Supabase Auth-linked MAGIC SCRIPT administrators.';
comment on table public.admin_codes is 'Hashed, expiring access-code records; plaintext is never persisted.';
comment on table public.round_history is 'Non-sensitive operational metadata only; never a betting ledger.';
