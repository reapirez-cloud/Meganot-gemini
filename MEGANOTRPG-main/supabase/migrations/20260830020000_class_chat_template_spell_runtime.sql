-- CLASS_MIGRATION_SCOPE: infrastructure
-- Class/subclass spell grants use the same assignment/level/choice/suppression
-- gates as template actions. The client selects one resolved CE access/method/
-- resource option; the server re-resolves that authored spell mechanic and
-- spends only the costs stored in the template mechanic.

begin;

create or replace function public.use_character_template_spell_v1(
  p_character_id uuid,
  p_mechanic_id text,
  p_method_key text,
  p_option_key text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_template_id uuid;
  v_template_kind text;
  v_template_version integer;
  v_mechanic jsonb;
  v_source_key text;
  v_root_source_id text;
  v_source_id text;
  v_choice_key text;
  v_choice_option text;
  v_payload jsonb;
  v_method jsonb;
  v_option jsonb;
  v_cost jsonb;
  v_costs jsonb := '[]'::jsonb;
  v_key text;
  v_variant text;
  v_state_key text;
  v_amount integer;
  v_current integer;
  v_max integer;
  v_label text;
  v_recharge jsonb;
  v_preparation_mode text;
  v_requires_prepared boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_operate_character_resources(p_character_id,auth.uid()) then raise exception 'Not allowed'; end if;
  if nullif(trim(coalesce(p_mechanic_id,'')),'') is null then raise exception 'Mechanic is required'; end if;
  if nullif(trim(coalesce(p_method_key,'')),'') is null then raise exception 'Spell method is required'; end if;

  with assigned_raw as (
    select
      a.template_id,
      a.template_level,
      a.selected_choices,
      t.kind,
      t.version,
      t.unlock_level as template_unlock_level,
      t.parent_template_id,
      t.mechanics,
      t.choices,
      case
        when t.kind='subclass' then greatest(1,coalesce(parent.template_level,1))
        when t.kind='class' then greatest(1,coalesce(a.template_level,1))
        else greatest(1,coalesce(c.level,1))
      end as effective_level
    from public.character_template_assignments a
    join public.rule_templates t on t.id=a.template_id and t.is_active
    join public.characters c on c.id=a.character_id
    left join public.character_template_assignments parent
      on parent.character_id=a.character_id and parent.template_id=t.parent_template_id
    where a.character_id=p_character_id
      and t.kind in ('class','subclass')
  ), assigned as (
    select * from assigned_raw
    where kind<>'subclass' or effective_level>=greatest(1,coalesce(template_unlock_level,1))
  ), choice_defs as (
    select a.*,0 as choice_unlock_level,d.value as definition
    from assigned a
    cross join lateral jsonb_array_elements(coalesce(a.choices,'[]'::jsonb)) d(value)
    union all
    select a.*,l.level as choice_unlock_level,d.value as definition
    from assigned a
    join public.rule_template_levels l on l.template_id=a.template_id and l.level<=a.effective_level
    cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) d(value)
  ), selected_options as (
    select
      d.*,
      s.option_key,
      s.ord,
      greatest(1,coalesce(
        (
          select e.value::integer
          from jsonb_each_text(coalesce(d.definition->'count_by_level','{}'::jsonb)) e(key,value)
          where e.key ~ '^[0-9]+$' and e.key::integer<=d.effective_level
          order by e.key::integer desc
          limit 1
        ),
        case when coalesce(d.definition->>'count','') ~ '^[0-9]+$' then (d.definition->>'count')::integer else null end,
        1
      )) as allowed_count
    from choice_defs d
    cross join lateral jsonb_array_elements_text(
      case jsonb_typeof(d.selected_choices->(d.definition->>'key'))
        when 'array' then d.selected_choices->(d.definition->>'key')
        when 'string' then jsonb_build_array(d.selected_choices->>(d.definition->>'key'))
        else '[]'::jsonb
      end
    ) with ordinality s(option_key,ord)
    where nullif(trim(coalesce(d.definition->>'key','')),'') is not null
  ), active_options as (
    select s.*
    from selected_options s
    where s.ord<=s.allowed_count
      and exists(
        select 1
        from jsonb_array_elements_text(coalesce(s.definition->'options','[]'::jsonb)) o(value)
        where o.value=s.option_key
      )
      and s.effective_level>=greatest(1,coalesce(
        case
          when coalesce(s.definition->'option_unlock_level'->>s.option_key,'') ~ '^[0-9]+$'
            then (s.definition->'option_unlock_level'->>s.option_key)::integer
          else null
        end,
        1
      ))
  ), candidates as (
    select a.template_id,a.kind,a.version,0 as unlock_level,m.value as mechanic,null::text as choice_key,null::text as choice_option
    from assigned a
    cross join lateral jsonb_array_elements(coalesce(a.mechanics,'[]'::jsonb)) m(value)
    where m.value->>'id'=trim(p_mechanic_id)

    union all

    select a.template_id,a.kind,a.version,l.level as unlock_level,m.value as mechanic,null::text as choice_key,null::text as choice_option
    from assigned a
    join public.rule_template_levels l on l.template_id=a.template_id and l.level<=a.effective_level
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where m.value->>'id'=trim(p_mechanic_id)

    union all

    select o.template_id,o.kind,o.version,o.choice_unlock_level as unlock_level,m.value as mechanic,o.definition->>'key' as choice_key,o.option_key as choice_option
    from active_options o
    cross join lateral jsonb_array_elements(coalesce(o.definition->'option_mechanics'->o.option_key,'[]'::jsonb)) m(value)
    where m.value->>'id'=trim(p_mechanic_id)

    union all

    select o.template_id,o.kind,o.version,g.level_key::integer as unlock_level,m.value as mechanic,o.definition->>'key' as choice_key,o.option_key as choice_option
    from active_options o
    cross join lateral jsonb_each(coalesce(o.definition->'option_mechanics_by_level'->o.option_key,'{}'::jsonb)) g(level_key,mechanics)
    cross join lateral jsonb_array_elements(case when jsonb_typeof(g.mechanics)='array' then g.mechanics else '[]'::jsonb end) m(value)
    where g.level_key ~ '^[0-9]+$'
      and g.level_key::integer<=o.effective_level
      and m.value->>'id'=trim(p_mechanic_id)
  )
  select template_id,kind,version,mechanic,choice_key,choice_option
    into v_template_id,v_template_kind,v_template_version,v_mechanic,v_choice_key,v_choice_option
  from candidates
  order by unlock_level desc
  limit 1;

  if v_template_id is null or v_mechanic is null then raise exception 'Class spell is unavailable'; end if;
  if coalesce(v_mechanic->>'type','')<>'spell' then raise exception 'Mechanic is not a spell'; end if;

  v_root_source_id := 'template:'||v_template_kind||':'||v_template_id::text||':v'||v_template_version::text;
  if v_choice_key is not null and v_choice_option is not null then
    v_source_id := v_root_source_id||':choice:'||v_choice_key||':'||v_choice_option;
  else
    v_source_key := coalesce(nullif(trim(v_mechanic->>'sourceKey'),''),'mechanic:'||trim(p_mechanic_id));
    v_source_id := v_root_source_id||':source:'||v_source_key;
  end if;

  if exists(
    select 1 from public.character_source_suppressions s
    where s.character_id=p_character_id and s.source_id in (v_root_source_id,v_source_id)
  ) then
    raise exception 'Class spell is disabled';
  end if;

  v_payload := coalesce(v_mechanic->'payload','{}'::jsonb);
  v_preparation_mode := coalesce(v_payload->'preparation'->>'mode','');

  select value into v_method
  from jsonb_array_elements(coalesce(v_payload->'methods','[]'::jsonb))
  where value->>'key'=trim(p_method_key)
  limit 1;
  if v_method is null then raise exception 'Spell method is unavailable'; end if;

  v_requires_prepared := coalesce((v_method->>'requiresPrepared')::boolean,true);
  if v_requires_prepared and v_preparation_mode='prepared' then
    raise exception 'Prepared class-spell access requires resolved preparation state';
  end if;

  if jsonb_array_length(coalesce(v_method->'resourceOptions','[]'::jsonb))>0 then
    select value into v_option
    from jsonb_array_elements(v_method->'resourceOptions')
    where value->>'key'=coalesce(p_option_key,'')
    limit 1;
    if v_option is null then raise exception 'Выбери ячейку или способ оплаты'; end if;

    for v_cost in select value from jsonb_array_elements(coalesce(v_option->'costs','[]'::jsonb)) loop
      v_key := trim(coalesce(v_cost->>'key',''));
      v_variant := coalesce(nullif(trim(v_cost->>'variantKey'),''),'default');
      v_state_key := case when v_variant='default' then v_key else v_key||'::'||v_variant end;
      v_amount := greatest(1,coalesce((v_cost->>'amount')::integer,0));
      select current,max_snapshot,label,recharge into v_current,v_max,v_label,v_recharge
      from public.character_resource_states
      where character_id=p_character_id and state_key=v_state_key;
      if v_max is null then raise exception 'Ресурс не синхронизирован: %',v_state_key; end if;
      v_costs := v_costs || jsonb_build_array(jsonb_build_object(
        'stateKey',v_state_key,'amount',v_amount,'current',v_current,'max',v_max,
        'label',coalesce(nullif(v_label,''),v_state_key),'recharge',v_recharge
      ));
    end loop;
  elsif p_option_key is not null and nullif(trim(p_option_key),'') is not null then
    raise exception 'This spell method has no payment option';
  end if;

  perform private.consume_character_resource_costs(p_character_id,v_costs,auth.uid());
end;
$$;

revoke all on function public.use_character_template_spell_v1(uuid,text,text,text) from public,anon;
grant execute on function public.use_character_template_spell_v1(uuid,text,text,text) to authenticated;

create or replace function public.send_chat_template_spell_v1(
  p_room_id uuid,
  p_character_id uuid,
  p_mechanic_id text,
  p_method_key text,
  p_option_key text default null,
  p_label text default null,
  p_payload jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message_id bigint;
  v_payload jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  perform public.use_character_template_spell_v1(
    p_character_id,
    trim(p_mechanic_id),
    trim(p_method_key),
    nullif(trim(coalesce(p_option_key,'')),'')
  );

  v_payload := coalesce(p_payload,'{}'::jsonb)
    || jsonb_build_object(
      'templateMechanicId',trim(p_mechanic_id),
      'templateMethodKey',trim(p_method_key),
      'templateOptionKey',nullif(trim(coalesce(p_option_key,'')),'')
    );

  v_message_id := public.send_chat_event_v3(
    p_room_id,
    p_character_id,
    'spell',
    coalesce(nullif(trim(coalesce(p_label,'')),''),trim(p_mechanic_id)),
    v_payload,
    '[]'::jsonb
  );
  return v_message_id;
end;
$$;

revoke all on function public.send_chat_template_spell_v1(uuid,uuid,text,text,text,text,jsonb) from public,anon;
grant execute on function public.send_chat_template_spell_v1(uuid,uuid,text,text,text,text,jsonb) to authenticated;

commit;
