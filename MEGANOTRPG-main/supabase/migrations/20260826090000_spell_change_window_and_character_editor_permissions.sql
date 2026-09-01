begin;

alter table public.character_sheets
  add column if not exists spell_change_unlocked boolean not null default false;

create or replace function private.can_change_character_spells(
  p_character_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.can_manage_character(p_character_id, p_user_id)
    or exists (
      select 1
      from public.characters c
      join public.character_sheets cs on cs.character_id = c.id
      where c.id = p_character_id
        and c.assigned_user_id = p_user_id
        and c.character_type = 'pc'
        and cs.spellcasting_enabled = true
        and cs.spell_change_unlocked = true
    );
$$;

revoke all on function private.can_change_character_spells(uuid, uuid)
  from public, anon;
grant execute on function private.can_change_character_spells(uuid, uuid)
  to authenticated, service_role;

create or replace function public.set_character_spell_change_access(
  p_character_id uuid,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not private.can_manage_character(p_character_id, auth.uid()) then
    raise exception 'Only GM or owner can change spell-change access';
  end if;

  insert into public.character_sheets (
    character_id,
    spell_change_unlocked
  ) values (
    p_character_id,
    coalesce(p_enabled, false)
  )
  on conflict (character_id) do update
  set spell_change_unlocked = excluded.spell_change_unlocked,
      updated_at = now();
end;
$$;

revoke all on function public.set_character_spell_change_access(uuid, boolean)
  from public, anon;
grant execute on function public.set_character_spell_change_access(uuid, boolean)
  to authenticated;

create or replace function public.set_character_spellcasting_enabled(
  p_character_id uuid,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not private.can_manage_character(p_character_id, auth.uid()) then
    raise exception 'Only GM or owner can change spell access';
  end if;

  insert into public.character_sheets (
    character_id,
    spellcasting_enabled,
    spell_change_unlocked
  ) values (
    p_character_id,
    coalesce(p_enabled, false),
    false
  )
  on conflict (character_id) do update
  set spellcasting_enabled = excluded.spellcasting_enabled,
      spell_change_unlocked = case
        when excluded.spellcasting_enabled then public.character_sheets.spell_change_unlocked
        else false
      end,
      updated_at = now();
end;
$$;

create or replace function public.learn_character_spell(p_option_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_option public.character_spell_options%rowtype;
  v_spell_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_option
  from public.character_spell_options
  where id = p_option_id;

  if v_option.id is null then
    raise exception 'Spell option not found';
  end if;

  if not private.can_change_character_spells(v_option.character_id, auth.uid()) then
    raise exception 'Spell changes are locked. GM must grant access after a long rest';
  end if;

  if exists (
    select 1 from public.character_spells s
    where s.character_id = v_option.character_id
      and lower(trim(s.name)) = lower(trim(v_option.name))
  ) then
    raise exception 'Spell is already learned';
  end if;

  insert into public.character_spells (
    character_id, name, spell_level, school, casting_time, spell_range,
    duration, components, concentration, ritual, prepared, description,
    source, sort_order, cast_mode, slot_level
  ) values (
    v_option.character_id, v_option.name, v_option.spell_level,
    v_option.school, v_option.casting_time, v_option.spell_range,
    v_option.duration, v_option.components, v_option.concentration,
    v_option.ritual, v_option.prepared, v_option.description,
    v_option.source, v_option.sort_order, v_option.cast_mode,
    v_option.slot_level
  )
  returning id into v_spell_id;

  return v_spell_id;
end;
$$;

create or replace function public.forget_character_spell(p_spell_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_character_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select character_id into v_character_id
  from public.character_spells
  where id = p_spell_id;

  if v_character_id is null then
    raise exception 'Spell not found';
  end if;

  if not private.can_change_character_spells(v_character_id, auth.uid()) then
    raise exception 'Spell changes are locked. GM must grant access after a long rest';
  end if;

  delete from public.character_spells where id = p_spell_id;
end;
$$;

create or replace function public.set_character_spell_prepared(
  p_spell_id uuid,
  p_prepared boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_character_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select character_id into v_character_id
  from public.character_spells
  where id = p_spell_id;

  if v_character_id is null then
    raise exception 'Spell not found';
  end if;

  if not private.can_change_character_spells(v_character_id, auth.uid()) then
    raise exception 'Spell changes are locked. GM must grant access after a long rest';
  end if;

  update public.character_spells
  set prepared = coalesce(p_prepared, false),
      updated_at = now()
  where id = p_spell_id;
end;
$$;

create or replace function public.learn_catalog_spell(
  p_character_id uuid,
  p_spell_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_spell public.spell_catalog%rowtype;
  v_character_class text;
  v_class_key text;
  v_spellcasting_enabled boolean;
  v_spell_slots jsonb;
  v_max_slot integer;
  v_spell_id uuid;
  v_is_manager boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select c.character_class
    into v_character_class
  from public.characters c
  where c.id = p_character_id;

  if not found then
    raise exception 'Character not found';
  end if;

  select * into v_spell
  from public.spell_catalog s
  where s.id = p_spell_id;

  if v_spell.id is null then
    raise exception 'Catalog spell not found';
  end if;

  v_is_manager := private.can_manage_character(p_character_id, auth.uid());

  if not private.can_change_character_spells(p_character_id, auth.uid()) then
    raise exception 'Spell changes are locked. GM must grant access after a long rest';
  end if;

  if not v_is_manager then
    select cs.spellcasting_enabled, cs.spell_slots
      into v_spellcasting_enabled, v_spell_slots
    from public.character_sheets cs
    where cs.character_id = p_character_id;

    if coalesce(v_spellcasting_enabled, false) is not true then
      raise exception 'Spellcasting is disabled for this character';
    end if;

    v_class_key := private.spell_class_key(v_character_class);
    if v_class_key is null then
      raise exception 'Character class is not supported by the spell catalog';
    end if;

    if not exists (
      select 1
      from public.spell_catalog_classes sc
      where sc.spell_id = p_spell_id
        and sc.class_key = v_class_key
    ) then
      raise exception 'Spell is not available to this class';
    end if;

    if v_spell.spell_level > 0 then
      select max(
        case
          when e.key ~ '^[1-9]$'
            and coalesce((e.value ->> 'max')::integer, 0) > 0
          then e.key::integer
          else null
        end
      )
      into v_max_slot
      from jsonb_each(coalesce(v_spell_slots, '{}'::jsonb)) e;

      if coalesce(v_max_slot, 0) < v_spell.spell_level then
        raise exception 'Spell level is not available to this character';
      end if;
    end if;
  end if;

  if exists (
    select 1
    from public.character_spells s
    where s.character_id = p_character_id
      and (
        s.catalog_spell_id = p_spell_id
        or lower(trim(s.name)) = lower(trim(coalesce(nullif(v_spell.name_ru, ''), v_spell.name_en)))
        or lower(trim(s.name)) = lower(trim(v_spell.name_en))
      )
  ) then
    raise exception 'Spell is already learned';
  end if;

  insert into public.character_spells (
    character_id,
    catalog_spell_id,
    name,
    spell_level,
    school,
    casting_time,
    spell_range,
    duration,
    components,
    concentration,
    ritual,
    prepared,
    description,
    source,
    sort_order,
    cast_mode,
    slot_level
  ) values (
    p_character_id,
    p_spell_id,
    coalesce(nullif(v_spell.name_ru, ''), v_spell.name_en),
    v_spell.spell_level,
    v_spell.school,
    v_spell.casting_time,
    v_spell.spell_range,
    v_spell.duration,
    array_to_string(v_spell.components, ', '),
    v_spell.concentration,
    v_spell.ritual,
    false,
    concat_ws(E'\n\n', nullif(v_spell.effect_summary, ''), nullif(v_spell.notes, ''), nullif(v_spell.upcast, '')),
    v_spell.source,
    v_spell.sort_order,
    case when v_spell.spell_level = 0 then 'cantrip' else 'slot' end,
    case when v_spell.spell_level = 0 then null else v_spell.spell_level end
  )
  returning id into v_spell_id;

  return v_spell_id;
end;
$$;

drop policy if exists campaign_art_items_member_insert on public.campaign_art_items;
create policy campaign_art_items_member_insert
on public.campaign_art_items for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and (
    (
      character_id is null
      and (select private.can_manage_campaign(campaign_id))
    )
    or (
      character_id is not null
      and (
        (select private.is_assigned_character(character_id))
        or (select private.can_manage_character(character_id))
      )
    )
  )
);

create or replace function public.update_campaign_character(
  p_character_id uuid,
  p_name text,
  p_character_class text,
  p_level integer,
  p_bio text,
  p_avatar_url text,
  p_assigned_user_id uuid,
  p_character_type text,
  p_visibility text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_character public.characters%rowtype;
  v_assigned_user_id uuid;
  v_character_type text := lower(trim(coalesce(p_character_type, 'pc')));
  v_visibility text := lower(trim(coalesce(p_visibility, 'campaign')));
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_character
  from public.characters
  where id = p_character_id
  for update;

  if v_character.id is null then
    raise exception 'Character not found';
  end if;

  if not private.can_manage_character(p_character_id, auth.uid()) then
    raise exception 'Only GM or owner can edit the character';
  end if;

  if nullif(trim(coalesce(p_name, '')), '') is null then
    raise exception 'Character name is required';
  end if;

  if v_character_type not in ('pc', 'npc') then
    raise exception 'Unsupported character type';
  end if;

  if v_visibility not in ('campaign', 'private') then
    raise exception 'Unsupported character visibility';
  end if;

  v_assigned_user_id := case
    when v_character_type = 'npc' then null
    else p_assigned_user_id
  end;

  if v_assigned_user_id is not null and not exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id = v_character.campaign_id
      and cm.user_id = v_assigned_user_id
  ) then
    raise exception 'Assigned user is not a campaign member';
  end if;

  update public.characters
  set assigned_user_id = v_assigned_user_id,
      name = trim(p_name),
      character_class = coalesce(nullif(trim(coalesce(p_character_class, '')), ''), 'Персонаж'),
      level = greatest(1, least(coalesce(p_level, 1), 30)),
      bio = trim(coalesce(p_bio, '')),
      avatar_url = nullif(trim(coalesce(p_avatar_url, '')), ''),
      character_type = v_character_type,
      visibility = v_visibility,
      updated_at = now()
  where id = p_character_id;

  if v_character.assigned_user_id is not null
     and v_character.assigned_user_id is distinct from v_assigned_user_id then
    update public.campaign_members
    set active_character_id = null
    where campaign_id = v_character.campaign_id
      and user_id = v_character.assigned_user_id
      and active_character_id = p_character_id;
  end if;

  if v_assigned_user_id is not null then
    update public.campaign_members
    set active_character_id = p_character_id
    where campaign_id = v_character.campaign_id
      and user_id = v_assigned_user_id
      and active_character_id is null;
  end if;
end;
$$;

create or replace function public.update_character_narrative(
  p_character_id uuid,
  p_race text,
  p_background text,
  p_alignment text,
  p_proficiencies text,
  p_languages text,
  p_senses text,
  p_personality_traits text,
  p_ideals text,
  p_bonds text,
  p_flaws text,
  p_backstory text,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not private.can_manage_character(p_character_id, auth.uid()) then
    raise exception 'Only GM or owner can edit the character sheet';
  end if;

  insert into public.character_sheets (
    character_id, race, background, alignment, proficiencies, languages,
    senses, personality_traits, ideals, bonds, flaws, backstory, notes
  ) values (
    p_character_id,
    trim(coalesce(p_race, '')),
    trim(coalesce(p_background, '')),
    trim(coalesce(p_alignment, '')),
    trim(coalesce(p_proficiencies, '')),
    trim(coalesce(p_languages, '')),
    trim(coalesce(p_senses, '')),
    trim(coalesce(p_personality_traits, '')),
    trim(coalesce(p_ideals, '')),
    trim(coalesce(p_bonds, '')),
    trim(coalesce(p_flaws, '')),
    trim(coalesce(p_backstory, '')),
    trim(coalesce(p_notes, ''))
  )
  on conflict (character_id) do update
  set race = excluded.race,
      background = excluded.background,
      alignment = excluded.alignment,
      proficiencies = excluded.proficiencies,
      languages = excluded.languages,
      senses = excluded.senses,
      personality_traits = excluded.personality_traits,
      ideals = excluded.ideals,
      bonds = excluded.bonds,
      flaws = excluded.flaws,
      backstory = excluded.backstory,
      notes = excluded.notes,
      updated_at = now();
end;
$$;

create or replace function public.set_my_character_avatar(
  p_character_id uuid,
  p_avatar_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not private.can_manage_character(p_character_id, auth.uid()) then
    raise exception 'Only GM or owner can edit the character avatar';
  end if;

  update public.characters
  set avatar_url = nullif(trim(coalesce(p_avatar_url, '')), ''),
      updated_at = now()
  where id = p_character_id;
end;
$$;

commit;
