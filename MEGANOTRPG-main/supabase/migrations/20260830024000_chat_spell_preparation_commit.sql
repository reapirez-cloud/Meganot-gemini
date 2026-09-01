-- CLASS_MIGRATION_SCOPE: infrastructure
-- Chat owns the post-rest preparation interaction. The character spellbook remains
-- persistence/read UI; Character Engine receives the refreshed external snapshot.

begin;

create or replace function public.commit_character_spell_preparation_v1(
  p_character_id uuid,
  p_assignment_id uuid,
  p_prepared_spell_ids uuid[] default array[]::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_character public.characters%rowtype;
  v_assignment public.character_template_assignments%rowtype;
  v_template public.rule_templates%rowtype;
  v_session public.character_preparation_sessions%rowtype;
  v_ids uuid[] := array[]::uuid[];
  v_task_key text;
  v_invalid integer;
  v_prepared jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_character
  from public.characters
  where id=p_character_id;
  if v_character.id is null then raise exception 'Character not found'; end if;

  if coalesce(v_character.assigned_user_id,'00000000-0000-0000-0000-000000000000'::uuid)<>auth.uid()
     and not private.can_manage_character(v_character.id,auth.uid()) then
    raise exception 'Only the assigned player or campaign manager can prepare spells';
  end if;

  select * into v_assignment
  from public.character_template_assignments
  where id=p_assignment_id and character_id=p_character_id;
  if v_assignment.id is null then raise exception 'Spell preparation source is not assigned to this character'; end if;

  select * into v_template
  from public.rule_templates
  where id=v_assignment.template_id and is_active=true;
  if v_template.id is null
     or coalesce(v_template.rules_meta->>'spell_preparation_refresh','')<>'long_rest'
     or private.character_template_source_level(v_assignment.id) is null then
    raise exception 'This source does not allow long-rest spell preparation';
  end if;

  select * into v_session
  from public.character_preparation_sessions
  where character_id=p_character_id
  for update;
  if v_session.character_id is null or not v_session.is_open then
    raise exception 'Preparation window is closed until the next long rest';
  end if;

  select coalesce(array_agg(id order by id),array[]::uuid[])
  into v_ids
  from (
    select distinct value as id
    from unnest(coalesce(p_prepared_spell_ids,array[]::uuid[])) value
  ) selected;

  select count(*) into v_invalid
  from unnest(v_ids) selected(id)
  where not exists(
    select 1
    from public.character_spells s
    where s.id=selected.id
      and s.character_id=p_character_id
      and s.spell_level>0
      and s.cast_mode='slot'
  );
  if v_invalid>0 then
    raise exception 'Prepared spell selection contains a spell that cannot be prepared for this character';
  end if;

  -- Daily preparation only replaces slotted personal spells. Cantrips and
  -- class/subclass always-prepared accesses are separate mechanics and untouched.
  update public.character_spells s
  set prepared=(s.id=any(v_ids)),
      updated_at=now()
  where s.character_id=p_character_id
    and s.spell_level>0
    and s.cast_mode='slot'
    and s.prepared is distinct from (s.id=any(v_ids));

  v_task_key:='spells:' || v_template.id::text;
  v_prepared:=to_jsonb(v_ids);

  -- Unlike dice-record tasks, spell preparation can be revised while the same
  -- rest window is still open. The latest chat confirmation is canonical.
  insert into public.character_preparation_records(
    character_id,generation,assignment_id,task_key,input_value,resolved_value,created_by,created_at
  ) values (
    p_character_id,v_session.generation,v_assignment.id,v_task_key,cardinality(v_ids),v_prepared,auth.uid(),now()
  )
  on conflict (character_id,generation,assignment_id,task_key) do update
  set input_value=excluded.input_value,
      resolved_value=excluded.resolved_value,
      created_by=excluded.created_by,
      created_at=now();

  return jsonb_build_object(
    'character_id',p_character_id,
    'generation',v_session.generation,
    'assignment_id',v_assignment.id,
    'task_key',v_task_key,
    'prepared_spell_ids',v_prepared
  );
end;
$function$;

revoke all on function public.commit_character_spell_preparation_v1(uuid,uuid,uuid[]) from public,anon;
grant execute on function public.commit_character_spell_preparation_v1(uuid,uuid,uuid[]) to authenticated;

commit;
