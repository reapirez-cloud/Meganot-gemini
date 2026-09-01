-- CLASS_MIGRATION_SCOPE: infrastructure
-- GENA preparation is a player-owned rules path. Campaign managers may still
-- correct character state through administrative/Oracle surfaces, but they do
-- not inherit authority inside GENA's post-rest interaction.

begin;

-- The current Druid and Cleric packages use the 2024 prepared-spell progression.
-- Keep the selectable quota explicit in template metadata. Always-prepared
-- class/subclass spells are separate CE grants and never consume this quota.
do $block$
declare
  v_prepared_by_level jsonb := '{
    "1":4,"2":5,"3":6,"4":7,"5":9,"6":10,"7":11,"8":12,"9":14,"10":15,
    "11":16,"12":16,"13":17,"14":17,"15":18,"16":18,"17":19,"18":20,"19":21,"20":22
  }'::jsonb;
begin
  update public.rule_templates t
  set rules_meta=coalesce(t.rules_meta,'{}'::jsonb)
      || jsonb_build_object(
        'sheet_profile',
        coalesce(t.rules_meta->'sheet_profile','{}'::jsonb)
        || jsonb_build_object('prepared_spells_by_level',v_prepared_by_level)
      ),
      updated_at=now()
  where t.is_active=true
    and t.catalog_key in ('class:druid','class:cleric');
end;
$block$;

create or replace function private.gena_assert_assigned_player(p_character_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not exists(
    select 1
    from public.characters c
    where c.id=p_character_id
      and c.character_type='pc'
      and c.assigned_user_id=auth.uid()
  ) then
    raise exception 'GENA preparation belongs only to the assigned player';
  end if;
end;
$function$;

revoke all on function private.gena_assert_assigned_player(uuid) from public,anon,authenticated;
grant execute on function private.gena_assert_assigned_player(uuid) to service_role;

create or replace function private.character_prepared_spell_limit(p_assignment_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_assignment public.character_template_assignments%rowtype;
  v_template public.rule_templates%rowtype;
  v_source_level integer;
  v_limit_text text;
  v_limit integer;
begin
  select * into v_assignment
  from public.character_template_assignments
  where id=p_assignment_id;
  if v_assignment.id is null then raise exception 'Template assignment not found'; end if;

  select * into v_template
  from public.rule_templates
  where id=v_assignment.template_id and is_active=true;
  if v_template.id is null then raise exception 'Active template not found'; end if;
  if coalesce(v_template.rules_meta->>'spell_preparation_refresh','')<>'long_rest' then
    raise exception 'This source does not use long-rest spell preparation';
  end if;

  v_source_level:=private.character_template_source_level(v_assignment.id);
  if v_source_level is null then raise exception 'Spell preparation source is not unlocked yet'; end if;

  v_limit_text:=v_template.rules_meta->'sheet_profile'->'prepared_spells_by_level'->>v_source_level::text;
  if nullif(btrim(coalesce(v_limit_text,'')),'') is null then
    raise exception 'Prepared spell limit is not authored for source level %',v_source_level;
  end if;
  v_limit:=v_limit_text::integer;
  if v_limit<0 or v_limit>100 then raise exception 'Prepared spell limit is out of range'; end if;
  return v_limit;
end;
$function$;

revoke all on function private.character_prepared_spell_limit(uuid) from public,anon,authenticated;
grant execute on function private.character_prepared_spell_limit(uuid) to service_role;

create or replace function public.gena_commit_character_spell_preparation_v1(
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
  v_assignment public.character_template_assignments%rowtype;
  v_session public.character_preparation_sessions%rowtype;
  v_ids uuid[] := array[]::uuid[];
  v_required integer;
  v_task_key text;
  v_result jsonb;
begin
  perform private.gena_assert_assigned_player(p_character_id);

  select * into v_assignment
  from public.character_template_assignments
  where id=p_assignment_id and character_id=p_character_id;
  if v_assignment.id is null then
    raise exception 'Spell preparation source is not assigned to this character';
  end if;

  select * into v_session
  from public.character_preparation_sessions
  where character_id=p_character_id
  for update;
  if v_session.character_id is null or not v_session.is_open then
    raise exception 'Preparation window is closed until the next long rest';
  end if;

  v_task_key:='spells:' || v_assignment.template_id::text;
  if exists(
    select 1 from public.character_preparation_records r
    where r.character_id=p_character_id
      and r.generation=v_session.generation
      and r.assignment_id=v_assignment.id
      and r.task_key=v_task_key
  ) then
    raise exception 'Spell preparation is already fixed for this long rest';
  end if;

  select coalesce(array_agg(id order by id),array[]::uuid[])
  into v_ids
  from (
    select distinct value as id
    from unnest(coalesce(p_prepared_spell_ids,array[]::uuid[])) value
  ) selected;

  if cardinality(v_ids)<>cardinality(coalesce(p_prepared_spell_ids,array[]::uuid[])) then
    raise exception 'Prepared spell selection contains duplicate spells';
  end if;

  v_required:=private.character_prepared_spell_limit(v_assignment.id);
  if cardinality(v_ids)<>v_required then
    raise exception 'Prepare exactly % spell(s); always-prepared spells do not count toward this quota',v_required;
  end if;

  -- The legacy commit remains the persistence primitive used by sheet/admin
  -- surfaces. GENA adds stricter player ownership, exact quota and one-shot
  -- generation locking before delegating to it.
  v_result:=public.commit_character_spell_preparation_v1(
    p_character_id,
    p_assignment_id,
    v_ids
  );

  return v_result || jsonb_build_object('required',v_required,'fixed',true);
end;
$function$;

revoke all on function public.gena_commit_character_spell_preparation_v1(uuid,uuid,uuid[]) from public,anon;
grant execute on function public.gena_commit_character_spell_preparation_v1(uuid,uuid,uuid[]) to authenticated;

create or replace function public.gena_commit_character_template_choice_v1(
  p_character_id uuid,
  p_assignment_id uuid,
  p_choice_key text,
  p_selected_options text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_assignment public.character_template_assignments%rowtype;
  v_template public.rule_templates%rowtype;
  v_session public.character_preparation_sessions%rowtype;
  v_source_level integer;
  v_choice jsonb;
  v_fallback_refresh boolean;
  v_requested text[] := array[]::text[];
  v_task_key text;
  v_result jsonb;
  v_resolved jsonb;
begin
  perform private.gena_assert_assigned_player(p_character_id);
  if nullif(btrim(coalesce(p_choice_key,'')),'') is null then raise exception 'Choice key is required'; end if;

  select * into v_assignment
  from public.character_template_assignments
  where id=p_assignment_id and character_id=p_character_id
  for update;
  if v_assignment.id is null then raise exception 'Template assignment not found'; end if;

  select * into v_template
  from public.rule_templates
  where id=v_assignment.template_id and is_active=true;
  if v_template.id is null then raise exception 'Active template not found'; end if;

  v_source_level:=private.character_template_source_level(v_assignment.id);
  if v_source_level is null then raise exception 'Choice source is not unlocked yet'; end if;

  select q.choice into v_choice
  from (
    select 0 as level,c.choice
    from jsonb_array_elements(coalesce(v_template.choices,'[]'::jsonb)) c(choice)
    union all
    select l.level,c.choice
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) c(choice)
    where l.template_id=v_template.id and l.level<=v_source_level
  ) q
  where q.choice->>'key'=btrim(p_choice_key)
  order by q.level desc
  limit 1;
  if v_choice is null then raise exception 'Choice is not unlocked for this source level'; end if;

  v_fallback_refresh:=coalesce(v_template.rules_meta->>'choice_refresh','')='long_rest'
    and coalesce(v_template.rules_meta->>'persistent_choice','')=btrim(p_choice_key);
  if coalesce(v_choice->>'refresh','')<>'long_rest' and not v_fallback_refresh then
    raise exception 'This choice is not part of long-rest GENA preparation';
  end if;

  select * into v_session
  from public.character_preparation_sessions
  where character_id=p_character_id
  for update;
  if v_session.character_id is null or not v_session.is_open then
    raise exception 'Preparation window is closed until the next long rest';
  end if;

  v_task_key:='choice:' || btrim(p_choice_key);
  if exists(
    select 1 from public.character_preparation_records r
    where r.character_id=p_character_id
      and r.generation=v_session.generation
      and r.assignment_id=v_assignment.id
      and r.task_key=v_task_key
  ) then
    raise exception 'This choice is already fixed for this long rest';
  end if;

  v_requested:=array(
    select btrim(value)
    from unnest(coalesce(p_selected_options,array[]::text[])) value
    where btrim(value)<>''
  );
  if cardinality(v_requested)=0 then raise exception 'GENA cannot confirm an empty choice'; end if;
  if cardinality(v_requested)<>cardinality(array(select distinct value from unnest(v_requested) value)) then
    raise exception 'Choice contains duplicate options';
  end if;

  v_result:=public.commit_character_template_choice_v1(
    p_assignment_id,
    btrim(p_choice_key),
    v_requested
  );
  v_resolved:=coalesce(v_result->'selected_choices'->btrim(p_choice_key),'null'::jsonb);

  insert into public.character_preparation_records(
    character_id,generation,assignment_id,task_key,input_value,resolved_value,created_by,created_at
  ) values (
    p_character_id,v_session.generation,v_assignment.id,v_task_key,cardinality(v_requested),v_resolved,auth.uid(),now()
  );

  return v_result || jsonb_build_object(
    'generation',v_session.generation,
    'task_key',v_task_key,
    'fixed',true
  );
end;
$function$;

revoke all on function public.gena_commit_character_template_choice_v1(uuid,uuid,text,text[]) from public,anon;
grant execute on function public.gena_commit_character_template_choice_v1(uuid,uuid,text,text[]) to authenticated;

create or replace function public.gena_send_chat_preparation_roll_v1(
  p_room_id uuid,
  p_character_id uuid,
  p_assignment_id uuid,
  p_task_key text,
  p_label text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_assignment public.character_template_assignments%rowtype;
  v_session public.character_preparation_sessions%rowtype;
  v_message_id bigint;
begin
  perform private.gena_assert_assigned_player(p_character_id);

  select * into v_assignment
  from public.character_template_assignments
  where id=p_assignment_id and character_id=p_character_id;
  if v_assignment.id is null then raise exception 'Preparation task belongs to another character'; end if;

  select * into v_session
  from public.character_preparation_sessions
  where character_id=p_character_id
  for update;
  if v_session.character_id is null or not v_session.is_open then
    raise exception 'Preparation window is closed until the next long rest';
  end if;

  if private.character_post_rest_task(p_assignment_id,btrim(p_task_key)) is null then
    raise exception 'Preparation task is unavailable';
  end if;
  if exists(
    select 1 from public.character_preparation_records r
    where r.character_id=p_character_id
      and r.generation=v_session.generation
      and r.assignment_id=v_assignment.id
      and r.task_key=btrim(p_task_key)
  ) then
    raise exception 'Preparation result is already fixed for this long rest';
  end if;

  v_message_id:=public.send_chat_preparation_roll_v1(
    p_room_id,p_character_id,p_assignment_id,btrim(p_task_key),p_label
  );
  return v_message_id;
end;
$function$;

revoke all on function public.gena_send_chat_preparation_roll_v1(uuid,uuid,uuid,text,text) from public,anon;
grant execute on function public.gena_send_chat_preparation_roll_v1(uuid,uuid,uuid,text,text) to authenticated;

-- If the player starts speaking without resolving an inherently random daily
-- task, GENA supplies the random default. Persistent choices and prepared spells
-- need no write here: their previous persisted state is already the default.
create or replace function private.gena_resolve_missing_random_preparations(
  p_character_id uuid,
  p_created_by uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_row record;
  v_input jsonb;
  v_mapping jsonb;
  v_output jsonb;
  v_count integer;
  v_sides integer;
  v_total integer;
  v_index integer;
  v_resolved jsonb;
begin
  for v_row in
    select a.id as assignment_id,s.generation,task
    from public.character_preparation_sessions s
    join public.character_template_assignments a on a.character_id=s.character_id
    join public.rule_templates t on t.id=a.template_id and t.is_active=true
    cross join lateral jsonb_array_elements(coalesce(t.rules_meta->'post_rest_preparations','[]'::jsonb)) task
    where s.character_id=p_character_id
      and s.is_open=true
      and coalesce(task->>'trigger','long_rest')='long_rest'
      and coalesce(task->'input'->>'kind','')='roll'
      and private.character_template_source_level(a.id)>=greatest(1,coalesce((task->>'unlockLevel')::integer,1))
      and not exists(
        select 1 from public.character_preparation_records r
        where r.character_id=p_character_id
          and r.generation=s.generation
          and r.assignment_id=a.id
          and r.task_key=task->>'key'
      )
  loop
    v_input:=coalesce(v_row.task->'input','{}'::jsonb);
    v_output:=coalesce(v_row.task->'output','{}'::jsonb);
    -- Automatic defaults are intentionally conservative. Stored random outcomes
    -- (such as Cosmic Omen) are safe; resource-writing tasks still demand an
    -- explicit player interaction so no hidden resource mutation is invented.
    if coalesce(v_output->>'kind','stored_value')<>'stored_value' then continue; end if;

    v_count:=greatest(1,coalesce((v_input->>'count')::integer,1));
    v_sides:=greatest(2,coalesce((v_input->>'sides')::integer,0));
    if v_count>40 or v_sides>1000 then continue; end if;

    v_total:=0;
    for v_index in 1..v_count loop
      v_total:=v_total + floor(random()*v_sides)::integer + 1;
    end loop;

    v_mapping:=coalesce(v_row.task->'mapping','{}'::jsonb);
    if coalesce(v_mapping->>'kind','identity')='parity' then
      v_resolved:=to_jsonb(case when mod(abs(v_total),2)=0 then v_mapping->>'even' else v_mapping->>'odd' end);
      if (v_resolved #>> '{}') is null then continue; end if;
    elsif coalesce(v_mapping->>'kind','identity')='identity' then
      v_resolved:=to_jsonb(v_total);
    else
      continue;
    end if;

    insert into public.character_preparation_records(
      character_id,generation,assignment_id,task_key,input_value,resolved_value,created_by,created_at
    ) values (
      p_character_id,v_row.generation,v_row.assignment_id,v_row.task->>'key',v_total,v_resolved,p_created_by,now()
    )
    on conflict (character_id,generation,assignment_id,task_key) do nothing;
  end loop;
end;
$function$;

revoke all on function private.gena_resolve_missing_random_preparations(uuid,uuid) from public,anon,authenticated;
grant execute on function private.gena_resolve_missing_random_preparations(uuid,uuid) to service_role;

create or replace function private.close_character_preparation_from_chat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  -- Only ordinary authored speech starts the adventuring day. Dice, spells,
  -- actions, system events and attachment-only posts intentionally do not close it.
  if new.character_id is null
     or new.user_id is null
     or new.event_kind is not null
     or nullif(btrim(coalesce(new.body,'')),'') is null then
    return new;
  end if;
  if not exists(
    select 1 from public.characters c
    where c.id=new.character_id
      and c.character_type='pc'
      and c.assigned_user_id=new.user_id
  ) then
    return new;
  end if;

  -- Forgotten random preparation gets a rules-valid server roll before the
  -- window closes. Unconfirmed spell/choice tasks simply retain prior state.
  perform private.gena_resolve_missing_random_preparations(new.character_id,new.user_id);

  update public.character_preparation_sessions s
  set is_open=false,
      closed_at=now(),
      closed_by_message_id=new.id,
      updated_at=now()
  where s.character_id=new.character_id and s.is_open=true;

  if found then
    update public.character_sheets
    set spell_change_unlocked=false,updated_at=now()
    where character_id=new.character_id;
  end if;
  return new;
end;
$function$;

commit;
