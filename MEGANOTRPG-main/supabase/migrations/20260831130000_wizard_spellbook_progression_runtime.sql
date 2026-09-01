-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:wizard
-- CLASS_PACKAGE_TEST: tests/wizardSpellbookProgressionRuntime.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: wizard:text=READY;mechanics=IN_PROGRESS
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- Wizard spellbook progression is an entitlement ledger, not a page-count heuristic.
-- Level 1 grants six level-1 Wizard spells. Every later Wizard level grants two
-- additional Wizard spells whose maximum level is frozen to the source Wizard level.
-- Losing a physical book never refunds an already-consumed class entitlement.

begin;

create table if not exists public.wizard_spellbook_level_grants (
  character_id uuid not null references public.characters(id) on delete cascade,
  wizard_level integer not null check (wizard_level between 1 and 20),
  spell_catalog_id uuid not null references public.spell_catalog(id) on delete restrict,
  spellbook_item_id uuid references public.character_inventory_items(id) on delete set null,
  selected_by uuid references auth.users(id) on delete set null,
  selected_at timestamptz not null default now(),
  primary key (character_id,wizard_level,spell_catalog_id),
  unique (character_id,spell_catalog_id)
);

create index if not exists wizard_spellbook_level_grants_character_level_idx
  on public.wizard_spellbook_level_grants(character_id,wizard_level);

alter table public.wizard_spellbook_level_grants enable row level security;
grant select on public.wizard_spellbook_level_grants to authenticated;
revoke insert,update,delete on public.wizard_spellbook_level_grants from authenticated;

drop policy if exists wizard_spellbook_level_grants_read on public.wizard_spellbook_level_grants;
create policy wizard_spellbook_level_grants_read
on public.wizard_spellbook_level_grants
for select
to authenticated
using (private.can_view_character(character_id,auth.uid()));

create or replace function private.wizard_spellbook_grant_quota(p_wizard_level integer)
returns integer
language sql
immutable
set search_path = ''
as $function$
  select case when p_wizard_level=1 then 6 else 2 end
$function$;

create or replace function private.wizard_spellbook_grant_max_spell_level(p_wizard_level integer)
returns integer
language sql
immutable
set search_path = ''
as $function$
  select least(9,greatest(1,ceil(greatest(1,p_wizard_level)::numeric/2)::integer))
$function$;

create or replace function private.next_wizard_spellbook_grant_level(p_character_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $function$
  with wizard as (
    select private.character_wizard_level(p_character_id) as level
  ), progress as (
    select level,
      private.wizard_spellbook_grant_quota(level) as quota,
      (select count(*)::integer
       from public.wizard_spellbook_level_grants grant_row
       where grant_row.character_id=p_character_id and grant_row.wizard_level=level) as used
    from wizard, lateral generate_series(1,coalesce(wizard.level,0)) level
  )
  select min(level) from progress where used<quota
$function$;

revoke all on function private.wizard_spellbook_grant_quota(integer) from public,anon,authenticated;
revoke all on function private.wizard_spellbook_grant_max_spell_level(integer) from public,anon,authenticated;
revoke all on function private.next_wizard_spellbook_grant_level(uuid) from public,anon,authenticated;
grant execute on function private.wizard_spellbook_grant_quota(integer) to service_role;
grant execute on function private.wizard_spellbook_grant_max_spell_level(integer) to service_role;
grant execute on function private.next_wizard_spellbook_grant_level(uuid) to service_role;

create or replace function public.get_character_wizard_spellbook_progression_v1(p_character_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_level integer;
  v_next integer;
  v_levels jsonb;
  v_total_remaining integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_view_character(p_character_id,auth.uid()) then raise exception 'Not allowed'; end if;

  v_level:=private.character_wizard_level(p_character_id);
  if v_level is null then
    return jsonb_build_object('wizardLevel',null,'nextSourceLevel',null,'totalRemaining',0,'levels','[]'::jsonb);
  end if;

  v_next:=private.next_wizard_spellbook_grant_level(p_character_id);

  with progress as (
    select level,
      private.wizard_spellbook_grant_quota(level) as quota,
      private.wizard_spellbook_grant_max_spell_level(level) as max_spell_level,
      (select count(*)::integer
       from public.wizard_spellbook_level_grants grant_row
       where grant_row.character_id=p_character_id and grant_row.wizard_level=level) as used
    from generate_series(1,v_level) level
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'sourceLevel',level,
      'quota',quota,
      'used',used,
      'remaining',greatest(0,quota-used),
      'maxSpellLevel',max_spell_level
    ) order by level),'[]'::jsonb),
    coalesce(sum(greatest(0,quota-used)),0)::integer
  into v_levels,v_total_remaining
  from progress;

  return jsonb_build_object(
    'wizardLevel',v_level,
    'nextSourceLevel',v_next,
    'totalRemaining',v_total_remaining,
    'levels',v_levels
  );
end;
$function$;

revoke all on function public.get_character_wizard_spellbook_progression_v1(uuid) from public,anon;
grant execute on function public.get_character_wizard_spellbook_progression_v1(uuid) to authenticated;

create or replace function public.choose_character_wizard_spellbook_progression_v1(
  p_character_id uuid,
  p_wizard_level integer,
  p_spell_catalog_id uuid,
  p_spellbook_item_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_character public.characters%rowtype;
  v_assignment public.character_template_assignments%rowtype;
  v_current_level integer;
  v_next_level integer;
  v_quota integer;
  v_used integer;
  v_max_spell_level integer;
  v_book_id uuid;
  v_spell public.spell_catalog%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_character from public.characters where id=p_character_id;
  if v_character.id is null then raise exception 'Character not found'; end if;
  if coalesce(v_character.assigned_user_id,'00000000-0000-0000-0000-000000000000'::uuid)<>auth.uid()
     and not private.can_manage_character(p_character_id,auth.uid()) then
    raise exception 'Only the assigned player or campaign manager can choose Wizard progression spells';
  end if;

  select a.* into v_assignment
  from public.character_template_assignments a
  join public.rule_templates t on t.id=a.template_id
  where a.character_id=p_character_id
    and t.kind='class'
    and t.catalog_key='class:wizard'
    and t.is_active=true
  order by a.assigned_at,a.id
  limit 1
  for update of a;
  if v_assignment.id is null then raise exception 'Character has no active Wizard class assignment'; end if;

  v_current_level:=private.character_wizard_level(p_character_id);
  if p_wizard_level<1 or p_wizard_level>v_current_level then
    raise exception 'Wizard progression source level is outside the current class progression';
  end if;

  v_next_level:=private.next_wizard_spellbook_grant_level(p_character_id);
  if v_next_level is null then raise exception 'All Wizard spellbook progression choices are already complete'; end if;
  if p_wizard_level<>v_next_level then
    raise exception 'Complete Wizard spellbook choices for level % first',v_next_level;
  end if;

  v_quota:=private.wizard_spellbook_grant_quota(p_wizard_level);
  select count(*)::integer into v_used
  from public.wizard_spellbook_level_grants
  where character_id=p_character_id and wizard_level=p_wizard_level;
  if v_used>=v_quota then raise exception 'Wizard spellbook choices for this level are already complete'; end if;

  if p_spellbook_item_id is not null then
    if not private.is_wizard_spellbook_item(p_spellbook_item_id,p_character_id) then
      raise exception 'Selected Wizard spellbook is not present in this character inventory';
    end if;
    v_book_id:=p_spellbook_item_id;
  else
    select item.id into v_book_id
    from public.character_inventory_items item
    where item.character_id=p_character_id
      and private.is_wizard_spellbook_item(item.id,p_character_id)
    order by item.created_at,item.id
    limit 1;
    if v_book_id is null then raise exception 'Wizard spellbook is required before choosing progression spells'; end if;
  end if;

  select * into v_spell from public.spell_catalog where id=p_spell_catalog_id;
  if v_spell.id is null then raise exception 'Catalog spell not found'; end if;
  if v_spell.spell_level<1 then raise exception 'Wizard cantrips are learned separately and are not spellbook progression choices'; end if;

  v_max_spell_level:=private.wizard_spellbook_grant_max_spell_level(p_wizard_level);
  if p_wizard_level=1 and v_spell.spell_level<>1 then
    raise exception 'Starting Wizard spellbook choices must be level 1 spells';
  end if;
  if v_spell.spell_level>v_max_spell_level then
    raise exception 'This Wizard level can add spells only up to level %',v_max_spell_level;
  end if;
  if not exists(
    select 1 from public.spell_catalog_classes class_link
    where class_link.spell_id=v_spell.id and class_link.class_key='wizard'
  ) then
    raise exception 'Spell does not belong to the Wizard spell list';
  end if;
  if exists(
    select 1 from public.wizard_spellbook_level_grants grant_row
    where grant_row.character_id=p_character_id and grant_row.spell_catalog_id=v_spell.id
  ) then
    raise exception 'This spell was already chosen from Wizard level progression';
  end if;
  if exists(
    select 1
    from public.wizard_spellbook_entries entry
    join public.character_inventory_items item on item.id=entry.spellbook_item_id
    where item.character_id=p_character_id
      and private.is_wizard_spellbook_item(item.id,p_character_id)
      and entry.spell_catalog_id=v_spell.id
  ) then
    raise exception 'This spell is already written in a held Wizard spellbook';
  end if;

  insert into public.wizard_spellbook_level_grants(
    character_id,wizard_level,spell_catalog_id,spellbook_item_id,selected_by,selected_at
  ) values (
    p_character_id,p_wizard_level,v_spell.id,v_book_id,auth.uid(),now()
  );

  insert into public.wizard_spellbook_entries(spellbook_item_id,spell_catalog_id,added_by,added_at)
  values(v_book_id,v_spell.id,auth.uid(),now())
  on conflict (spellbook_item_id,spell_catalog_id) do nothing;

  insert into public.character_spells(character_id,catalog_spell_id,prepared)
  values(p_character_id,v_spell.id,false)
  on conflict (character_id,catalog_spell_id) do nothing;

  return jsonb_build_object(
    'characterId',p_character_id,
    'sourceLevel',p_wizard_level,
    'spellCatalogId',v_spell.id,
    'spellbookItemId',v_book_id,
    'remainingAtSourceLevel',greatest(0,v_quota-v_used-1),
    'nextSourceLevel',private.next_wizard_spellbook_grant_level(p_character_id)
  );
end;
$function$;

revoke all on function public.choose_character_wizard_spellbook_progression_v1(uuid,integer,uuid,uuid) from public,anon;
grant execute on function public.choose_character_wizard_spellbook_progression_v1(uuid,integer,uuid,uuid) to authenticated;

commit;
