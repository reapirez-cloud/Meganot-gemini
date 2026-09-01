-- Compatibility bridge for databases where the legacy RPC has parameter defaults.
-- The following lifecycle migration recreates the same signature without them.
drop function if exists public.set_campaign_active_character(uuid, uuid, uuid);
