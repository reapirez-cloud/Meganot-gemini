-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:druid,class:cleric
-- CLASS_PACKAGE_TEST: tests/postRestPreparationRuntime.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: druid:text=READY;mechanics=IN_PROGRESS; cleric:text=READY;mechanics=IN_PROGRESS
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
-- Generic rest-refresh choices plus concrete authored policies for the finished
-- Druid/Cleric packages. No source-specific CE branch is introduced.

begin;

-- Prepared casters opt in explicitly. A spellcasting subclass of Fighter does
-- not inherit this behavior merely because it happens to know spells.
update public.rule_templates
set rules_meta=coalesce(rules_meta,'{}'::jsonb) || jsonb_build_object('spell_preparation_refresh','long_rest'),
    updated_at=now()
where is_active=true and catalog_key in ('class:druid','class:cleric');

-- Circle of the Land already authored choice_refresh=long_rest in rules_meta.
-- Put the policy on the actual choice too so generic choice UI/runtime can use it.
update public.rule_templates t
set choices=coalesce((
      select jsonb_agg(
        case when choice->>'key'='druid-land-type'
          then choice || jsonb_build_object('selection_mode','player_once','refresh','long_rest')
          else choice end
        order by ordinal
      )
      from jsonb_array_elements(coalesce(t.choices,'[]'::jsonb)) with ordinality c(choice,ordinal)
    ),'[]'::jsonb),
    updated_at=now()
where t.is_active=true and t.catalog_key='subclass:druid:land';

-- Cosmic Omen now declares the daily preparation independently from its prose.
-- actionMechanics is for server authorization; actionSourceKeys is for CE/read-model
-- suppression so the revolver never presents both daily modes at once.
update public.rule_templates t
set rules_meta=coalesce(t.rules_meta,'{}'::jsonb) || jsonb_build_object(
      'post_rest_preparations',jsonb_build_array(jsonb_build_object(
        'key','cosmic-omen-sign',
        'label','Космическое знамение',
        'trigger','long_rest',
        'unlockLevel',6,
        'input',jsonb_build_object('kind','roll','count',1,'sides',6),
        'mapping',jsonb_build_object('kind','parity','odd','woe','even','weal'),
        'output',jsonb_build_object('kind','stored_value'),
        'actionMechanics',jsonb_build_object('weal','stars-cosmic-weal','woe','stars-cosmic-woe'),
        'actionSourceKeys',jsonb_build_object('weal','cosmic-omen-weal','woe','cosmic-omen-woe')
      ))
    ),
    updated_at=now()
where t.is_active=true and t.catalog_key='subclass:druid:stars';

-- Give the two mutually exclusive actions distinct CE sources while keeping the
-- shared cosmic_omen resource on its own stable source.
update public.rule_template_levels l
set mechanics=coalesce((
      select jsonb_agg(
        case
          when mechanic->>'id'='stars-cosmic-weal' then mechanic || jsonb_build_object('sourceKey','cosmic-omen-weal')
          when mechanic->>'id'='stars-cosmic-woe' then mechanic || jsonb_build_object('sourceKey','cosmic-omen-woe')
          else mechanic
        end
        order by ordinal
      )
      from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality m(mechanic,ordinal)
    ),'[]'::jsonb)
from public.rule_templates t
where t.id=l.template_id
  and t.is_active=true
  and t.catalog_key='subclass:druid:stars'
  and l.level=6;

-- Player-once choices stay append-only. A choice that explicitly declares
-- refresh=long_rest may be fully replaced, but only during the current rest window.
create or replace function public.commit_character_template_choice_v1(
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
  v_character public.characters%rowtype;
  v_source_level integer;
  v_choice jsonb;
  v_requirement jsonb;
  v_existing_json jsonb;
  v_existing text[] := array[]::text[];
  v_parent_selected text[] := array[]::text[];
  v_requested text[] := array[]::text[];
  v_required integer := 1;
  v_option text;
  v_unlock integer;
  v_pair record;
  v_value jsonb;
  v_next jsonb;
  v_updated_at timestamptz;
  v_refresh text;
  v_can_replace boolean := false;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(btrim(p_choice_key),'') is null then raise exception 'Choice key is required'; end if;

  select * into v_assignment
  from public.character_template_assignments
  where id=p_assignment_id
  for update;
  if v_assignment.id is null then raise exception 'Template assignment not found'; end if;

  select * into v_template from public.rule_templates
  where id=v_assignment.template_id and is_active=true;
  if v_template.id is null then raise exception 'Active template not found'; end if;
  select * into v_character from public.characters where id=v_assignment.character_id;
  if v_character.id is null then raise exception 'Character not found'; end if;

  if coalesce(v_character.assigned_user_id,'00000000-0000-0000-0000-000000000000'::uuid)<>auth.uid()
     and not private.can_manage_character(v_character.id,auth.uid()) then
    raise exception 'Only the assigned player or campaign manager can resolve this choice';
  end if;

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
  where q.choice->>'key'=p_choice_key
  order by q.level desc
  limit 1;

  if v_choice is null then raise exception 'Choice is not unlocked for this source level'; end if;
  if coalesce(v_choice->>'selection_mode','manager')<>'player_once' then
    raise exception 'Choice is not player-resolvable';
  end if;
  v_refresh:=coalesce(v_choice->>'refresh','');
  if v_refresh<>'' and v_refresh<>'long_rest' then raise exception 'Unsupported choice refresh policy'; end if;

  v_requirement:=v_choice->'requires_choice';
  if v_requirement is not null then
    v_existing_json:=coalesce(v_assignment.selected_choices,'{}'::jsonb)->(v_requirement->>'key');
    if jsonb_typeof(v_existing_json)='string' then
      v_parent_selected:=array[v_existing_json #>> '{}'];
    elsif jsonb_typeof(v_existing_json)='array' then
      select coalesce(array_agg(value),array[]::text[]) into v_parent_selected
      from jsonb_array_elements_text(v_existing_json);
    else
      v_parent_selected:=array[]::text[];
    end if;
    if not ((v_requirement->>'option')=any(v_parent_selected)) then
      raise exception 'Choice dependency is not satisfied';
    end if;
  end if;

  v_required:=greatest(1,coalesce((v_choice->>'count')::integer,1));
  for v_pair in select key,value from jsonb_each_text(coalesce(v_choice->'count_by_level','{}'::jsonb)) loop
    if v_pair.key::integer<=v_source_level then
      v_required:=greatest(v_required,greatest(1,v_pair.value::integer));
    end if;
  end loop;

  v_existing_json:=coalesce(v_assignment.selected_choices,'{}'::jsonb)->p_choice_key;
  if jsonb_typeof(v_existing_json)='string' then
    v_existing:=array[v_existing_json #>> '{}'];
  elsif jsonb_typeof(v_existing_json)='array' then
    select coalesce(array_agg(value),array[]::text[]) into v_existing
    from jsonb_array_elements_text(v_existing_json);
  else
    v_existing:=array[]::text[];
  end if;
  v_existing:=array(select distinct btrim(value) from unnest(v_existing) value where btrim(value)<>'' order by btrim(value));

  v_requested:=array(
    select btrim(value)
    from unnest(coalesce(p_selected_options,array[]::text[])) value
    where btrim(value)<>''
  );
  if cardinality(v_requested)<>cardinality(array(select distinct value from unnest(v_requested) value)) then
    raise exception 'Choice contains duplicate options';
  end if;
  if cardinality(v_requested)<>v_required then
    raise exception 'Choice requires exactly % option(s)',v_required;
  end if;

  v_can_replace:=v_refresh='long_rest' and private.is_character_preparation_open(v_character.id);
  if cardinality(v_existing)>=v_required and not v_can_replace then
    raise exception 'Choice is already locked';
  end if;
  if cardinality(v_existing)>0 and cardinality(v_existing)<v_required and not v_can_replace then
    foreach v_option in array v_existing loop
      if not (v_option=any(v_requested)) then
        raise exception 'Already confirmed options cannot be removed or replaced';
      end if;
    end loop;
  end if;

  foreach v_option in array v_requested loop
    if not exists(
      select 1 from jsonb_array_elements_text(coalesce(v_choice->'options','[]'::jsonb)) o(value)
      where o.value=v_option
    ) then
      raise exception 'Option % does not belong to this choice',v_option;
    end if;
    v_unlock:=greatest(1,coalesce((v_choice->'option_unlock_level'->>v_option)::integer,1));
    if v_source_level<v_unlock then raise exception 'Option % is not unlocked yet',v_option; end if;
  end loop;

  v_value:=case when v_required=1 then to_jsonb(v_requested[1]) else to_jsonb(v_requested) end;
  v_next:=jsonb_set(coalesce(v_assignment.selected_choices,'{}'::jsonb),array[p_choice_key],v_value,true);
  update public.character_template_assignments
  set selected_choices=v_next,updated_at=now()
  where id=v_assignment.id
  returning updated_at into v_updated_at;

  return jsonb_build_object('assignment_id',v_assignment.id,'selected_choices',v_next,'updated_at',v_updated_at);
end;
$function$;

-- Generic action gate for daily preparation tasks. If a task declares that its
-- resolved value selects one authored mechanic, all sibling mechanics are rejected.
create or replace function private.assert_character_template_preparation_action(
  p_character_id uuid,
  p_mechanic_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_assignment_id uuid;
  v_task jsonb;
  v_generation bigint;
  v_resolved text;
  v_expected text;
begin
  select a.id,task into v_assignment_id,v_task
  from public.character_template_assignments a
  join public.rule_templates t on t.id=a.template_id and t.is_active=true
  cross join lateral jsonb_array_elements(coalesce(t.rules_meta->'post_rest_preparations','[]'::jsonb)) task
  where a.character_id=p_character_id
    and coalesce(task->>'trigger','long_rest')='long_rest'
    and private.character_template_source_level(a.id)>=greatest(1,coalesce((task->>'unlockLevel')::integer,1))
    and exists(
      select 1 from jsonb_each_text(coalesce(task->'actionMechanics','{}'::jsonb)) gated(mode,mechanic)
      where gated.mechanic=p_mechanic_id
    )
  limit 1;

  if v_assignment_id is null then return; end if;
  select s.generation into v_generation
  from public.character_preparation_sessions s
  where s.character_id=p_character_id;
  if v_generation is null then raise exception 'Daily preparation has not been resolved yet'; end if;

  select r.resolved_value #>> '{}' into v_resolved
  from public.character_preparation_records r
  where r.character_id=p_character_id
    and r.generation=v_generation
    and r.assignment_id=v_assignment_id
    and r.task_key=v_task->>'key';
  if nullif(v_resolved,'') is null then raise exception 'Daily preparation has not been resolved yet'; end if;
  v_expected:=v_task->'actionMechanics'->>v_resolved;
  if nullif(v_expected,'') is null or v_expected<>p_mechanic_id then
    raise exception 'This action is not available for the current daily preparation';
  end if;
end;
$function$;

create or replace function public.send_chat_template_action_v1(
  p_room_id uuid,
  p_character_id uuid,
  p_mechanic_id text,
  p_option_key text default null,
  p_label text default null,
  p_payload jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare v_message_id bigint; v_payload jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(btrim(coalesce(p_mechanic_id,'')),'') is null then raise exception 'Mechanic is required'; end if;
  perform private.assert_character_template_preparation_action(p_character_id,btrim(p_mechanic_id));
  perform public.use_character_template_resource_action(p_character_id,btrim(p_mechanic_id),nullif(btrim(coalesce(p_option_key,'')),''));
  v_payload:=coalesce(p_payload,'{}'::jsonb) || jsonb_build_object(
    'templateMechanicId',btrim(p_mechanic_id),'templateOptionKey',nullif(btrim(coalesce(p_option_key,'')),'')
  );
  v_message_id:=public.send_chat_event_v3(
    p_room_id,p_character_id,'action',coalesce(nullif(btrim(coalesce(p_label,'')),''),btrim(p_mechanic_id)),v_payload,'[]'::jsonb
  );
  return v_message_id;
end;
$function$;

create or replace function public.send_chat_template_roll_v1(
  p_room_id uuid,
  p_character_id uuid,
  p_mechanic_id text,
  p_option_key text default null,
  p_label text default null,
  p_kind text default 'action',
  p_modifier integer default 0,
  p_roll_d20 boolean default false,
  p_dice_count integer default 0,
  p_dice_sides integer default 0,
  p_dice_modifier integer default 0
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare v_message_id bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(btrim(coalesce(p_mechanic_id,'')),'') is null then raise exception 'Mechanic is required'; end if;
  perform private.assert_character_template_preparation_action(p_character_id,btrim(p_mechanic_id));
  perform public.use_character_template_resource_action(p_character_id,btrim(p_mechanic_id),nullif(btrim(coalesce(p_option_key,'')),''));
  v_message_id:=public.send_chat_roll_v3(
    p_room_id,p_character_id,
    coalesce(nullif(btrim(coalesce(p_label,'')),''),btrim(p_mechanic_id)),
    coalesce(nullif(btrim(coalesce(p_kind,'')),''),'action'),coalesce(p_modifier,0),coalesce(p_roll_d20,false),
    greatest(0,coalesce(p_dice_count,0)),greatest(0,coalesce(p_dice_sides,0)),coalesce(p_dice_modifier,0),'[]'::jsonb
  );
  return v_message_id;
end;
$function$;

commit;
