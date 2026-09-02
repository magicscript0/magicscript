-- Tighten grants that are intentionally broader in the base control-plane
-- migration. The policies remain the source of row authorization; these
-- column/operation grants reduce what PostgREST can attempt in the first place.

revoke select on table public.site_settings, public.social_links, public.display_settings from anon;
grant select (key, value, type, is_public, updated_at)
  on table public.site_settings to anon;
grant select (id, telegram_url, youtube_url, updated_at)
  on table public.social_links to anon;
grant select (
  id,
  online_count_enabled,
  online_count_min,
  online_count_max,
  online_count_mode,
  online_count_fixed,
  online_count_refresh_ms,
  brand_accent,
  updated_at
) on table public.display_settings to anon;

revoke delete on table public.social_links, public.display_settings from authenticated;
drop policy if exists social_links_admin_write on public.social_links;
drop policy if exists display_settings_admin_write on public.display_settings;

create policy social_links_admin_insert on public.social_links
for insert to authenticated
with check (public.has_admin_role('admin') and updated_by = (select auth.uid()));

create policy social_links_admin_update on public.social_links
for update to authenticated
using (public.has_admin_role('admin'))
with check (public.has_admin_role('admin') and updated_by = (select auth.uid()));

create policy display_settings_admin_insert on public.display_settings
for insert to authenticated
with check (public.has_admin_role('admin') and updated_by = (select auth.uid()));

create policy display_settings_admin_update on public.display_settings
for update to authenticated
using (public.has_admin_role('admin'))
with check (public.has_admin_role('admin') and updated_by = (select auth.uid()));

revoke insert on table public.activity_logs, public.round_history from authenticated;
grant insert (admin_id, action, metadata)
  on table public.activity_logs to authenticated;
grant insert (round_identifier, source, created_by, status, metadata)
  on table public.round_history to authenticated;
