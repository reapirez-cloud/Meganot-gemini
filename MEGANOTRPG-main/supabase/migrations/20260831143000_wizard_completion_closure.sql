-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:wizard
-- CLASS_PACKAGE_TEST: tests/wizardCompletionRuntime.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: wizard:text=READY;mechanics=IN_PROGRESS
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- Closure corrections for the 2024 base Wizard. Spell Mastery may replace only
-- one mastered spell after each Long Rest. Signature Spells have no player-side
-- replacement rule after the initial two selections.

begin;

create table if not exists public.wizard_spell_mastery_replacements (
  character_id uuid not null references public.characters(id) on delete cascade,
  long_rest_generation bigint not null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  primary key(character_id,long_rest_generation)
);

alter table public.wizard_spell_mastery_replacements enable row level security;
revoke all on public.wizard_spell_mastery_replacements from anon,authenticated;
grant select on public.wizard_spell_mastery_replacements to authenticated;

drop policy if exists wizard_spell_mastery_replacements_read on public.wizard_spell_mastery_replacements;
create policy wizard_spell_mastery_replacements_read
on public.wizard_spell_mastery_replacements
for select to authenticated
using (private.can_view_character(character_id,auth.uid()));

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
  v_previous uuid[] := array[]::uuid[];
  v_requested uuid[];
  v_overlap integer := 0;
  v_session public.character_preparation_sessions%rowtype;
begin
  perform private.gena_assert_assigned_player(p_character_id);
  v_level:=private.character_wizard_level(p_character_id);
  if coalesce(v_level,0)<18 then raise exception 'Spell Mastery requires Wizard level 18'; end if;
  if p_level1_character_spell_id=p_level2_character_spell_id then raise exception 'Choose two different spells'; end if;

  select * into v_one
  from public.character_spells
  where id=p_level1_character_spell_id and character_id=p_character_id;
  select * into v_two
  from public.character_spells
  where id=p_level2_character_spell_id and character_id=p_character_id;

  if v_one.id is null or v_two.id is null then raise exception 'Wizard spell not found'; end if;
  if v_one.spell_level<>1 or v_two.spell_level<>2 then
    raise exception 'Spell Mastery requires one level-1 and one level-2 spell';
  end if;
  if lower(btrim(v_one.casting_time)) not in ('action','1 action','действие','1 действие')
     or lower(btrim(v_two.casting_time)) not in ('action','1 action','действие','1 действие') then
    raise exception 'Spell Mastery requires spells with an Action casting time';
  end if;
  if not private.character_has_wizard_spell_in_held_book(p_character_id,v_one.id)
     or not private.character_has_wizard_spell_in_held_book(p_character_id,v_two.id) then
    raise exception 'Spell Mastery selections must be written in a held Wizard spellbook';
  end if;

  select coalesce(array_agg(id order by id),array[]::uuid[])
  into v_previous
  from public.character_spells
  where character_id=p_character_id and wizard_spell_mastery;

  select array_agg(id order by id)
  into v_requested
  from unnest(array[v_one.id,v_two.id]) selected(id);

  if cardinality(v_previous)>0 then
    if v_previous=v_requested then
      return jsonb_build_object(
        'characterId',p_character_id,
        'level1SpellId',v_one.id,
        'level2SpellId',v_two.id,
        'changed',false
      );
    end if;

    select * into v_session
    from public.character_preparation_sessions
    where character_id=p_character_id
    for update;
    if v_session.character_id is null or not v_session.is_open then
      raise exception 'Spell Mastery can replace one selection only after a Long Rest';
    end if;
    if exists(
      select 1
      from public.wizard_spell_mastery_replacements r
      where r.character_id=p_character_id
        and r.long_rest_generation=v_session.generation
    ) then
      raise exception 'Spell Mastery already replaced one spell after this Long Rest';
    end if;

    select count(*) into v_overlap
    from unnest(v_previous) old_id
    where old_id=any(v_requested);
    if v_overlap<>cardinality(v_previous)-1 then
      raise exception 'Spell Mastery can replace only one mastered spell after a Long Rest';
    end if;

    insert into public.wizard_spell_mastery_replacements(
      character_id,long_rest_generation,changed_by,changed_at
    ) values (
      p_character_id,v_session.generation,auth.uid(),now()
    );
  end if;

  update public.character_spells
  set wizard_spell_mastery=false,updated_at=now()
  where character_id=p_character_id and wizard_spell_mastery;
  update public.character_spells
  set wizard_spell_mastery=true,prepared=true,updated_at=now()
  where id in (v_one.id,v_two.id);

  return jsonb_build_object(
    'characterId',p_character_id,
    'level1SpellId',v_one.id,
    'level2SpellId',v_two.id,
    'changed',true
  );
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
  v_previous uuid[] := array[]::uuid[];
  v_requested uuid[];
begin
  perform private.gena_assert_assigned_player(p_character_id);
  v_level:=private.character_wizard_level(p_character_id);
  if coalesce(v_level,0)<20 then raise exception 'Signature Spells requires Wizard level 20'; end if;
  if p_first_character_spell_id=p_second_character_spell_id then raise exception 'Choose two different spells'; end if;

  select * into v_first
  from public.character_spells
  where id=p_first_character_spell_id and character_id=p_character_id;
  select * into v_second
  from public.character_spells
  where id=p_second_character_spell_id and character_id=p_character_id;
  if v_first.id is null or v_second.id is null then raise exception 'Wizard spell not found'; end if;
  if v_first.spell_level<>3 or v_second.spell_level<>3 then
    raise exception 'Signature Spells requires two level-3 spells';
  end if;
  if not private.character_has_wizard_spell_in_held_book(p_character_id,v_first.id)
     or not private.character_has_wizard_spell_in_held_book(p_character_id,v_second.id) then
    raise exception 'Signature Spells selections must be written in a held Wizard spellbook';
  end if;

  select coalesce(array_agg(id order by id),array[]::uuid[])
  into v_previous
  from public.character_spells
  where character_id=p_character_id and wizard_signature_spell;

  select array_agg(id order by id)
  into v_requested
  from unnest(array[v_first.id,v_second.id]) selected(id);

  if cardinality(v_previous)>0 then
    if v_previous=v_requested then
      return jsonb_build_object(
        'characterId',p_character_id,
        'firstSpellId',v_first.id,
        'secondSpellId',v_second.id,
        'changed',false
      );
    end if;
    raise exception 'Signature Spells has no player replacement rule after the initial selection';
  end if;

  update public.character_spells
  set wizard_signature_spell=false,updated_at=now()
  where character_id=p_character_id and wizard_signature_spell;
  update public.character_spells
  set wizard_signature_spell=true,prepared=true,updated_at=now()
  where id in (v_first.id,v_second.id);

  return jsonb_build_object(
    'characterId',p_character_id,
    'firstSpellId',v_first.id,
    'secondSpellId',v_second.id,
    'changed',true
  );
end;
$function$;

revoke all on function public.set_character_wizard_signature_spells_v1(uuid,uuid,uuid) from public,anon;
grant execute on function public.set_character_wizard_signature_spells_v1(uuid,uuid,uuid) to authenticated;

commit;
