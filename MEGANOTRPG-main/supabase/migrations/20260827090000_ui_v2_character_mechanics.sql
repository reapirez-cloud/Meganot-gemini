-- UI v2: native mechanics attached to inventory items and character features.
-- Existing rows remain valid and acquire an empty mechanics list.

alter table public.character_inventory_items
  add column if not exists mechanics jsonb not null default '[]'::jsonb;

alter table public.character_features
  add column if not exists mechanics jsonb not null default '[]'::jsonb;

update public.character_inventory_items
set mechanics = '[]'::jsonb
where mechanics is null;

update public.character_features
set mechanics = '[]'::jsonb
where mechanics is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'character_inventory_items_mechanics_array'
  ) then
    alter table public.character_inventory_items
      add constraint character_inventory_items_mechanics_array
      check (jsonb_typeof(mechanics) = 'array');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'character_features_mechanics_array'
  ) then
    alter table public.character_features
      add constraint character_features_mechanics_array
      check (jsonb_typeof(mechanics) = 'array');
  end if;
end
$$;
