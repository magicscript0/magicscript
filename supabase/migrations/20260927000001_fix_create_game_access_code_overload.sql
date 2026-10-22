-- ==============================================================================
-- FIX: DROP LEGACY OVERLOAD OF create_game_access_code
-- Resolves PGRST203: "Could not choose the best candidate function"
-- ==============================================================================

-- Drop the obsolete 3-argument version from migration 20260902000002
-- The 5-argument version in v3 has default arguments for p_max_uses (1) and p_single_session (true),
-- so dropping the 3-arg version allows PostgREST to unambiguously invoke the v3 function.
drop function if exists public.create_game_access_code(text, integer, uuid);

-- Ensure explicit permissions on the canonical 5-parameter function
revoke all on function public.create_game_access_code(text, integer, uuid, integer, boolean) from public, anon;
grant execute on function public.create_game_access_code(text, integer, uuid, integer, boolean) to authenticated, service_role;
