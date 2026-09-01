-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:wizard
-- CLASS_PACKAGE_TEST: tests/wizardCompletionRuntime.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: wizard:text=READY;mechanics=IN_PROGRESS
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- Final durable-state slice for the 2024 base Wizard. Simple sheet edits such as
-- Scholar/ASI/Epic Boon and cantrip bookkeeping remain GM-adjudicated by design.

begin;

alter table public.character_spells
  add column if not exists wizard_spell_mastery boolean not null default false,
  add column if not exists wizard_signature_spell boolean not null default false;

create table if not exists public.wizard_memorize_spell_uses (
  character_id uuid not null references public.characters(id) on delete cascade,
  short_rest_generation bigint not null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  primary key(character_id,short_rest_generation)
);

alter table public.wizard_memorize_spell_uses enable row level security;
revoke all on public.wizard_memorize_spell_uses from anon,authenticated;
grant select on public.wizard_memorize_spell_uses to authenticated;

drop policy if exists wizard_memorize_spell_uses_read on public.wizard_memorize_spell_uses;
create policy wizard_memorize_spell_uses_read
on public.wizard_memorize_spell_uses
for select to authenticated
using (private.can_view_character(character_id,auth.uid()));

create or replace function private.character_has_wizard_spell_in_held_book(
  p_character_id uuid,
  p_character_spell_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists(
    select 1
    from public.character_spells character_spell
    join public.wizard_spellbook_entries entry
      on entry.spell_catalog_id=character_spell.catalog_spell_id
    join public.character_inventory_items item
      on item.id=entry.spellbook_item_id
    join public.spell_catalog_classes class_link
      on class_link.spell_id=character_spell.catalog_spell_id
     and class_link.class_key='wizard'
    where character_spell.id=p_character_spell_id
      and character_spell.character_id=p_character_id
      and character_spell.spell_level between 1 and private.character_wizard_max_spell_level(p_character_id)
      and item.character_id=p_character_id
      and private.is_wizard_spellbook_item(item.id,p_character_id)
  )
$function$;

revoke all on function private.character_has_wizard_spell_in_held_book(uuid,uuid) from public,anon,authenticated;
grant execute on function private.character_has_wizard_spell_in_held_book(uuid,uuid) to service_role;

-- Mastery and Signature Spells are always prepared and never become false merely
-- because the ordinary daily-preparation replacement updates the shared table.
create or replace function private.keep_wizard_always_prepared_spell()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if (new.wizard_spell_mastery or new.wizard_signature_spell) and not new.prepared then
    new.prepared:=true;
  end if;
  return new;
end;
$function$;

revoke all on function private.keep_wizard_always_prepared_spell() from public,anon,authenticated;

drop trigger if exists character_spells_keep_wizard_always_prepared on public.character_spells;
create trigger character_spells_keep_wizard_always_prepared
before insert or update of prepared,wizard_spell_mastery,wizard_signature_spell
on public.character_spells
for each row execute function private.keep_wizard_always_prepared_spell();

create or replace function public.memorize_character_wizard_spell_v1(
  p_character_id uuid,
  p_forget_character_spell_id uuid,
  p_prepare_character_spell_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_level integer;
  v_session public.character_short_rest_sessions%rowtype;
  v_forget public.character_spells%rowtype;
  v_prepare public.character_spells%rowtype;
begin
  perform private.gena_assert_assigned_player(p_character_id);
  v_level:=private.character_wizard_level(p_character_id);
  if coalesce(v_level,0)<5 then raise exception 'Memorize Spell requires Wizard level 5'; end if;
  if p_forget_character_spell_id=p_prepare_character_spell_id then raise exception 'Choose two different spells'; end if;

  select * into v_session
  from public.character_short_rest_sessions
  where character_id=p_character_id
  for update;
  if v_session.character_id is null or not v_session.is_open then
    raise exception 'Memorize Spell is available only immediately after a granted Short Rest';
  end if;
  if exists(
    select 1 from public.wizard_memorize_spell_uses use_row
    where use_row.character_id=p_character_id
      and use_row.short_rest_generation=v_session.generation
  ) then raise exception 'Memorize Spell was already used for this Short Rest'; end if;

  select * into v_forget from public.character_spells
  where id=p_forget_character_spell_id and character_id=p_character_id
  for update;
  select * into v_prepare from public.character_spells
  where id=p_prepare_character_spell_id and character_id=p_character_id
  for update;

  if v_forget.id is null or v_prepare.id is null then raise exception 'Wizard spell not found'; end if;
  if not private.character_has_wizard_spell_in_held_book(p_character_id,v_forget.id)
     or not private.character_has_wizard_spell_in_held_book(p_character_id,v_prepare.id) then
    raise exception 'Memorize Spell can use only Wizard spells from a held spellbook';
  end if;
  if not v_forget.prepared then raise exception 'The spell being replaced is not prepared'; end if;
  if v_forget.wizard_spell_mastery or v_forget.wizard_signature_spell then
    raise exception 'Always-prepared Wizard spells cannot be removed by Memorize Spell';
  end if;
  if v_prepare.prepared then raise exception 'The replacement spell is already prepared'; end if;

  update public.character_spells
  set prepared=false,updated_at=now()
  where id=v_forget.id;
  update public.character_spells
  set prepared=true,updated_at=now()
  where id=v_prepare.id;

  insert into public.wizard_memorize_spell_uses(character_id,short_rest_generation,changed_by,changed_at)
  values(p_character_id,v_session.generation,auth.uid(),now());

  return jsonb_build_object(
    'characterId',p_character_id,
    'shortRestGeneration',v_session.generation,
    'forgottenSpellId',v_forget.id,
    'preparedSpellId',v_prepare.id
  );
end;
$function$;

revoke all on function public.memorize_character_wizard_spell_v1(uuid,uuid,uuid) from public,anon;
grant execute on function public.memorize_character_wizard_spell_v1(uuid,uuid,uuid) to authenticated;

create or replace function private.wizard_long_rest_choice_window_or_initial(
  p_character_id uuid,
  p_flag text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_has_selection boolean;
  v_open boolean;
begin
  if p_flag='mastery' then
    select exists(select 1 from public.character_spells where character_id=p_character_id and wizard_spell_mastery) into v_has_selection;
  elsif p_flag='signature' then
    select exists(select 1 from public.character_spells where character_id=p_character_id and wizard_signature_spell) into v_has_selection;
  else
    raise exception 'Unknown Wizard choice flag';
  end if;
  if not v_has_selection then return true; end if;
  select coalesce(is_open,false) into v_open from public.character_preparation_sessions where character_id=p_character_id;
  return coalesce(v_open,false);
end;
$function$;

revoke all on function private.wizard_long_rest_choice_window_or_initial(uuid,text) from public,anon,authenticated;
grant execute on function private.wizard_long_rest_choice_window_or_initial(uuid,text) to service_role;

create or replace function public.set_character_wizard_spell_mastery_v1(
  p_character_id uuid,
  p_level1_character_spell_id uuid,
  p_level2_character_spell_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_level integer;
  v_one public.character_spells%rowtype;
  v_two public.character_spells%rowtype;
begin
  perform private.gena_assert_assigned_player(p_character_id);
  v_level:=private.character_wizard_level(p_character_id);
  if coalesce(v_level,0)<18 then raise exception 'Spell Mastery requires Wizard level 18'; end if;
  if p_level1_character_spell_id=p_level2_character_spell_id then raise exception 'Choose two different spells'; end if;
  if not private.wizard_long_rest_choice_window_or_initial(p_character_id,'mastery') then
    raise exception 'Spell Mastery selections can be replaced only after a Long Rest';
  end if;

  select * into v_one from public.character_spells where id=p_level1_character_spell_id and character_id=p_character_id;
  select * into v_two from public.character_spells where id=p_level2_character_spell_id and character_id=p_character_id;
  if v_one.id is null or v_two.id is null then raise exception 'Wizard spell not found'; end if;
  if v_one.spell_level<>1 or v_two.spell_level<>2 then raise exception 'Spell Mastery requires one level-1 and one level-2 spell'; end if;
  if lower(btrim(v_one.casting_time)) not in ('action','1 action','действие','1 действие')
     or lower(btrim(v_two.casting_time)) not in ('action','1 action','действие','1 действие') then
    raise exception 'Spell Mastery requires spells with an Action casting time';
  end if;
  if not private.character_has_wizard_spell_in_held_book(p_character_id,v_one.id)
     or not private.character_has_wizard_spell_in_held_book(p_character_id,v_two.id) then
    raise exception 'Spell Mastery selections must be written in a held Wizard spellbook';
  end if;

  update public.character_spells
  set wizard_spell_mastery=false,updated_at=now()
  where character_id=p_character_id and wizard_spell_mastery;
  update public.character_spells
  set wizard_spell_mastery=true,prepared=true,updated_at=now()
  where id in (v_one.id,v_two.id);

  return jsonb_build_object('characterId',p_character_id,'level1SpellId',v_one.id,'level2SpellId',v_two.id);
end;
$function$;

revoke all on function public.set_character_wizard_spell_mastery_v1(uuid,uuid,uuid) from public,anon;
grant execute on function public.set_character_wizard_spell_mastery_v1(uuid,uuid,uuid) to authenticated;

create or replace function public.set_character_wizard_signature_spells_v1(
  p_character_id uuid,
  p_first_character_spell_id uuid,
  p_second_character_spell_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_level integer;
  v_first public.character_spells%rowtype;
  v_second public.character_spells%rowtype;
begin
  perform private.gena_assert_assigned_player(p_character_id);
  v_level:=private.character_wizard_level(p_character_id);
  if coalesce(v_level,0)<20 then raise exception 'Signature Spells requires Wizard level 20'; end if;
  if p_first_character_spell_id=p_second_character_spell_id then raise exception 'Choose two different spells'; end if;
  if not private.wizard_long_rest_choice_window_or_initial(p_character_id,'signature') then
    raise exception 'Signature Spell selections can be replaced only after a Long Rest';
  end if;

  select * into v_first from public.character_spells where id=p_first_character_spell_id and character_id=p_character_id;
  select * into v_second from public.character_spells where id=p_second_character_spell_id and character_id=p_character_id;
  if v_first.id is null or v_second.id is null then raise exception 'Wizard spell not found'; end if;
  if v_first.spell_level<>3 or v_second.spell_level<>3 then raise exception 'Signature Spells requires two level-3 spells'; end if;
  if not private.character_has_wizard_spell_in_held_book(p_character_id,v_first.id)
     or not private.character_has_wizard_spell_in_held_book(p_character_id,v_second.id) then
    raise exception 'Signature Spells selections must be written in a held Wizard spellbook';
  end if;

  update public.character_spells
  set wizard_signature_spell=false,updated_at=now()
  where character_id=p_character_id and wizard_signature_spell;
  update public.character_spells
  set wizard_signature_spell=true,prepared=true,updated_at=now()
  where id in (v_first.id,v_second.id);

  return jsonb_build_object('characterId',p_character_id,'firstSpellId',v_first.id,'secondSpellId',v_second.id);
end;
$function$;

revoke all on function public.set_character_wizard_signature_spells_v1(uuid,uuid,uuid) from public,anon;
grant execute on function public.set_character_wizard_signature_spells_v1(uuid,uuid,uuid) to authenticated;

-- Extend the existing spellbook projection with durable Wizard selection state.
create or replace function public.get_character_wizard_spellbook_v1(p_character_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_level integer;
  v_max_spell_level integer;
  v_books jsonb;
  v_spells jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_view_character(p_character_id,auth.uid()) then raise exception 'Not allowed'; end if;

  v_level:=private.character_wizard_level(p_character_id);
  v_max_spell_level:=private.character_wizard_max_spell_level(p_character_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'itemId',item.id,
    'name',item.name,
    'definitionId',item.definition_id,
    'definitionRevision',item.definition_revision
  ) order by item.created_at,item.id),'[]'::jsonb)
  into v_books
  from public.character_inventory_items item
  where item.character_id=p_character_id
    and private.is_wizard_spellbook_item(item.id,p_character_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'bookItemId',item.id,
    'bookName',item.name,
    'spellCatalogId',spell.id,
    'characterSpellId',character_spell.id,
    'name',coalesce(nullif(spell.name_ru,''),spell.name_en),
    'nameEn',spell.name_en,
    'level',spell.spell_level,
    'school',spell.school,
    'ritual',spell.ritual,
    'castingTime',coalesce(character_spell.casting_time,''),
    'prepared',coalesce(character_spell.prepared,false),
    'spellMastery',coalesce(character_spell.wizard_spell_mastery,false),
    'signatureSpell',coalesce(character_spell.wizard_signature_spell,false)
  ) order by spell.spell_level,coalesce(nullif(spell.name_ru,''),spell.name_en),item.created_at,item.id),'[]'::jsonb)
  into v_spells
  from public.character_inventory_items item
  join public.wizard_spellbook_entries entry on entry.spellbook_item_id=item.id
  join public.spell_catalog spell on spell.id=entry.spell_catalog_id
  left join public.character_spells character_spell
    on character_spell.character_id=p_character_id and character_spell.catalog_spell_id=spell.id
  where item.character_id=p_character_id
    and private.is_wizard_spellbook_item(item.id,p_character_id);

  return jsonb_build_object(
    'hasBook',jsonb_array_length(v_books)>0,
    'wizardLevel',v_level,
    'maxSpellLevel',v_max_spell_level,
    'books',v_books,
    'spells',v_spells
  );
end;
$function$;

-- Ensure existing high-level selections, if any are backfilled manually, remain prepared.
update public.character_spells
set prepared=true,updated_at=now()
where (wizard_spell_mastery or wizard_signature_spell) and not prepared;

commit;
