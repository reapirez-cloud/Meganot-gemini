-- CLASS_MIGRATION_SCOPE: infrastructure
-- Generic player-facing persistent choice runtime.
-- Definitions opt in with: "selection_mode": "player_once".
-- Existing manager-owned choices remain unchanged.

begin;

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
  v_parent_level integer;
  v_source_level integer;
  v_choice jsonb;
  v_requirement jsonb;
  v_existing_json jsonb;
  v_existing text[] := array[]::text[];
  v_requested text[] := array[]::text[];
  v_required integer := 1;
  v_option text;
  v_unlock integer;
  v_pair record;
  v_value jsonb;
  v_next jsonb;
  v_updated_at timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(btrim(p_choice_key),'') is null then raise exception 'Choice key is required'; end if;

  select * into v_assignment
  from public.character_template_assignments
  where id=p_assignment_id
  for update;
  if v_assignment.id is null then raise exception 'Template assignment not found'; end if;

  select * into v_template
  from public.rule_templates
  where id=v_assignment.template_id and is_active=true;
  if v_template.id is null then raise exception 'Active template not found'; end if;

  select * into v_character
  from public.characters
  where id=v_assignment.character_id;
  if v_character.id is null then raise exception 'Character not found'; end if;

  if coalesce(v_character.assigned_user_id,'00000000-0000-0000-0000-000000000000'::uuid)<>auth.uid()
     and not private.can_manage_character(v_character.id,auth.uid()) then
    raise exception 'Only the assigned player or campaign manager can resolve this choice';
  end if;

  if v_template.kind='class' then
    v_source_level:=greatest(1,coalesce(v_assignment.template_level,1));
  elsif v_template.kind='subclass' and v_template.parent_template_id is not null then
    select greatest(1,coalesce(a.template_level,1)) into v_parent_level
    from public.character_template_assignments a
    where a.character_id=v_assignment.character_id
      and a.template_id=v_template.parent_template_id;
    if v_parent_level is null then raise exception 'Parent class assignment is missing'; end if;
    v_source_level:=v_parent_level;
    if v_source_level<greatest(1,coalesce(v_template.unlock_level,1)) then
      raise exception 'Choice source is not unlocked yet';
    end if;
  else
    v_source_level:=greatest(1,coalesce(v_assignment.template_level,v_character.level,1));
  end if;

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

  v_requirement:=v_choice->'requires_choice';
  if v_requirement is not null then
    v_existing_json:=coalesce(v_assignment.selected_choices,'{}'::jsonb)->(v_requirement->>'key');
    if jsonb_typeof(v_existing_json)='string' then
      v_existing:=array[v_existing_json #>> '{}'];
    elsif jsonb_typeof(v_existing_json)='array' then
      select coalesce(array_agg(value),array[]::text[]) into v_existing
      from jsonb_array_elements_text(v_existing_json);
    else
      v_existing:=array[]::text[];
    end if;
    if not ((v_requirement->>'option')=any(v_existing)) then
      raise exception 'Choice dependency is not satisfied';
    end if;
  end if;

  v_required:=greatest(1,coalesce((v_choice->>'count')::integer,1));
  for v_pair in select key,value from jsonb_each_text(coalesce(v_choice->'count_by_level','{}'::jsonb))
  loop
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
  if cardinality(v_existing)>=v_required then
    raise exception 'Choice is already locked';
  end if;

  foreach v_option in array v_existing loop
    if not (v_option=any(v_requested)) then
      raise exception 'Already confirmed options cannot be removed or replaced';
    end if;
  end loop;

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

  v_value:=case
    when v_required=1 then to_jsonb(v_requested[1])
    else to_jsonb(v_requested)
  end;
  v_next:=jsonb_set(coalesce(v_assignment.selected_choices,'{}'::jsonb),array[p_choice_key],v_value,true);

  update public.character_template_assignments
  set selected_choices=v_next,
      updated_at=now()
  where id=v_assignment.id
  returning updated_at into v_updated_at;

  return jsonb_build_object(
    'assignment_id',v_assignment.id,
    'selected_choices',v_next,
    'updated_at',v_updated_at
  );
end;
$function$;

revoke all on function public.commit_character_template_choice_v1(uuid,text,text[]) from public;
grant execute on function public.commit_character_template_choice_v1(uuid,text,text[]) to authenticated;

commit;
