-- CLASS_MIGRATION_SCOPE: infrastructure
-- GENA receipt rows already carry the acting character in every v2 template command.
-- Production missed this nullable column while the live functions started writing it.

alter table public.engine_command_receipts
  add column if not exists actor_character_id uuid
  references public.characters(id) on delete set null;

create index if not exists engine_command_receipts_actor_character_idx
  on public.engine_command_receipts(actor_character_id, created_at desc)
  where actor_character_id is not null;
