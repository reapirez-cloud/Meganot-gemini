-- CLASS_MIGRATION_SCOPE: infrastructure
-- Roll Engine compiles formulas/scaling in TypeScript. PostgreSQL owns only
-- randomness, resource mutation and durable chat output for the resolved plan.

begin;

create or replace function private.execute_chat_roll_plan_v1(p_plan jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_sequence jsonb;
  v_instance jsonb;
  v_effect jsonb;
  v_resolution jsonb;
  v_sequence_result jsonb;
  v_instance_result jsonb;
  v_effect_result jsonb;
  v_resolution_result jsonb;
  v_resolution_roll jsonb;
  v_sequences jsonb := '[]'::jsonb;
  v_instances jsonb;
  v_effects jsonb;
  v_rolls jsonb;
  v_kind text;
  v_effect_kind text;
  v_key text;
  v_bonus integer;
  v_dc integer;
  v_count integer;
  v_sides integer;
  v_modifier integer;
  v_roll integer;
  v_dice_total integer;
  v_d20 integer;
  v_total_dice integer := 0;
  i integer;
begin
  if p_plan is null or jsonb_typeof(p_plan)<>'object' then raise exception 'Roll plan must be an object'; end if;
  if coalesce(p_plan->>'kind','')<>'roll' then raise exception 'Structured chat runtime accepts roll plans only'; end if;
  if nullif(trim(coalesce(p_plan->>'recipeKey','')),'') is null then raise exception 'Roll recipe key is required'; end if;
  if nullif(trim(coalesce(p_plan->>'name','')),'') is null then raise exception 'Roll name is required'; end if;
  if jsonb_typeof(p_plan->'sequences')<>'array' or jsonb_array_length(p_plan->'sequences')<1 or jsonb_array_length(p_plan->'sequences')>20 then
    raise exception 'Roll plan must contain 1..20 sequences';
  end if;

  for v_sequence in select value from jsonb_array_elements(p_plan->'sequences') loop
    v_key := left(trim(coalesce(v_sequence->>'key','')),160);
    if v_key='' then raise exception 'Sequence key is required'; end if;
    if jsonb_typeof(v_sequence->'instances')<>'array' or jsonb_array_length(v_sequence->'instances')<1 or jsonb_array_length(v_sequence->'instances')>40 then
      raise exception 'Sequence must contain 1..40 instances';
    end if;
    v_instances := '[]'::jsonb;

    for v_instance in select value from jsonb_array_elements(v_sequence->'instances') loop
      v_resolution := v_instance->'resolution';
      if jsonb_typeof(v_resolution)<>'object' then raise exception 'Instance resolution is required'; end if;
      v_kind := coalesce(v_resolution->>'kind','');
      v_resolution_roll := null;

      if v_kind='attack' then
        if coalesce(v_resolution->>'bonus','') !~ '^-?[0-9]+$' then raise exception 'Attack bonus must be an integer'; end if;
        v_bonus := (v_resolution->>'bonus')::integer;
        if v_bonus < -500 or v_bonus > 500 then raise exception 'Attack bonus is out of range'; end if;
        v_d20 := floor(random()*20+1)::integer;
        v_resolution_result := jsonb_build_object(
          'kind','attack','d20',v_d20,'bonus',v_bonus,'total',v_d20+v_bonus
        ) || case when nullif(trim(coalesce(v_resolution->>'target','')),'') is not null
          then jsonb_build_object('target',left(trim(v_resolution->>'target'),120)) else '{}'::jsonb end;
        v_resolution_roll := jsonb_build_object(
          'dice',jsonb_build_object('count',1,'sides',20),
          'rolls',jsonb_build_array(v_d20),
          'diceTotal',v_d20,
          'modifier',v_bonus,
          'total',v_d20+v_bonus
        );
      elsif v_kind='save' then
        if coalesce(v_resolution->>'dc','') !~ '^[0-9]+$' then raise exception 'Save DC must be an integer'; end if;
        v_dc := (v_resolution->>'dc')::integer;
        if v_dc < 1 or v_dc > 1000 then raise exception 'Save DC is out of range'; end if;
        if coalesce(v_resolution->>'ability','') not in ('strength','dexterity','constitution','intelligence','wisdom','charisma') then raise exception 'Unsupported save ability'; end if;
        if coalesce(v_resolution->>'onSuccess','') not in ('none','half','full','custom') then raise exception 'Unsupported save success rule'; end if;
        v_resolution_result := jsonb_build_object(
          'kind','save','ability',v_resolution->>'ability','dc',v_dc,'onSuccess',v_resolution->>'onSuccess'
        );
      elsif v_kind in ('automatic','none') then
        v_resolution_result := jsonb_build_object('kind',v_kind);
      else
        raise exception 'Unsupported roll resolution';
      end if;

      if jsonb_typeof(v_instance->'effects')<>'array' or jsonb_array_length(v_instance->'effects')>10 then
        raise exception 'Instance effects must be an array with at most 10 entries';
      end if;
      if v_kind='none' and jsonb_array_length(v_instance->'effects')=0 then raise exception 'Empty roll instance is not allowed'; end if;
      v_effects := '[]'::jsonb;

      for v_effect in select value from jsonb_array_elements(v_instance->'effects') loop
        v_key := left(trim(coalesce(v_effect->>'key','')),160);
        v_effect_kind := coalesce(v_effect->>'kind','');
        if v_key='' then raise exception 'Effect key is required'; end if;
        if v_effect_kind not in ('damage','healing','roll') then raise exception 'Unsupported roll effect kind'; end if;
        if jsonb_typeof(v_effect->'dice')<>'object' then raise exception 'Effect dice are required'; end if;
        if coalesce(v_effect->'dice'->>'count','') !~ '^[0-9]+$' then raise exception 'Dice count must be an integer'; end if;
        if coalesce(v_effect->'dice'->>'sides','') !~ '^[0-9]+$' then raise exception 'Dice sides must be an integer'; end if;
        if coalesce(v_effect->>'modifier','') !~ '^-?[0-9]+$' then raise exception 'Effect modifier must be an integer'; end if;
        v_count := (v_effect->'dice'->>'count')::integer;
        v_sides := (v_effect->'dice'->>'sides')::integer;
        v_modifier := (v_effect->>'modifier')::integer;
        if v_count < 0 or v_count > 40 then raise exception 'Dice count is out of range'; end if;
        if v_sides < 2 or v_sides > 1000 then raise exception 'Dice sides are out of range'; end if;
        if v_modifier < -500 or v_modifier > 500 then raise exception 'Effect modifier is out of range'; end if;
        v_total_dice := v_total_dice + v_count;
        if v_total_dice > 400 then raise exception 'Structured roll exceeds total dice limit'; end if;

        v_rolls := '[]'::jsonb;
        v_dice_total := 0;
        if v_count>0 then
          for i in 1..v_count loop
            v_roll := floor(random()*v_sides+1)::integer;
            v_rolls := v_rolls || jsonb_build_array(v_roll);
            v_dice_total := v_dice_total + v_roll;
          end loop;
        end if;

        v_effect_result := jsonb_build_object(
          'key',v_key,
          'kind',v_effect_kind,
          'roll',jsonb_build_object(
            'dice',jsonb_build_object('count',v_count,'sides',v_sides),
            'rolls',v_rolls,
            'diceTotal',v_dice_total,
            'modifier',v_modifier,
            'total',v_dice_total+v_modifier
          )
        )
        || case when nullif(trim(coalesce(v_effect->>'damageType','')),'') is not null
          then jsonb_build_object('damageType',left(trim(v_effect->>'damageType'),80)) else '{}'::jsonb end
        || case when nullif(trim(coalesce(v_effect->>'label','')),'') is not null
          then jsonb_build_object('label',left(trim(v_effect->>'label'),160)) else '{}'::jsonb end;
        v_effects := v_effects || jsonb_build_array(v_effect_result);
      end loop;

      v_instance_result := jsonb_build_object(
        'index',greatest(0,coalesce((v_instance->>'index')::integer,0)),
        'resolution',v_resolution_result,
        'effects',v_effects
      ) || case when v_resolution_roll is not null then jsonb_build_object('resolutionRoll',v_resolution_roll) else '{}'::jsonb end;
      v_instances := v_instances || jsonb_build_array(v_instance_result);
    end loop;

    v_sequence_result := jsonb_build_object('key',left(trim(v_sequence->>'key'),160),'instances',v_instances);
    v_sequences := v_sequences || jsonb_build_array(v_sequence_result);
  end loop;

  return jsonb_build_object(
    'kind','roll',
    'recipeKey',left(trim(p_plan->>'recipeKey'),160),
    'name',left(trim(p_plan->>'name'),240),
    'sequences',v_sequences
  )
  || case when coalesce(p_plan->>'spellLevel','') ~ '^[0-9]+$' then jsonb_build_object('spellLevel',(p_plan->>'spellLevel')::integer) else '{}'::jsonb end
  || case when coalesce(p_plan->>'castLevel','') ~ '^[0-9]+$' then jsonb_build_object('castLevel',(p_plan->>'castLevel')::integer) else '{}'::jsonb end;
end;
$$;

create or replace function public.send_chat_structured_roll_v1(
  p_room_id uuid,
  p_character_id uuid,
  p_label text,
  p_kind text,
  p_plan jsonb,
  p_resource_costs jsonb default '[]'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
  v_result jsonb;
  v_payload jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_write_chat_room(p_room_id,auth.uid()) then raise exception 'Нет права писать в этот чат'; end if;
  if nullif(trim(coalesce(p_label,'')),'') is null then raise exception 'Roll label is required'; end if;

  perform private.consume_character_resource_costs(p_character_id,coalesce(p_resource_costs,'[]'::jsonb),auth.uid());
  v_result := private.execute_chat_roll_plan_v1(p_plan);
  v_payload := jsonb_build_object(
    'label',left(trim(p_label),240),
    'kind',coalesce(nullif(trim(p_kind),''),'spell'),
    'structuredRoll',v_result
  ) || case when jsonb_array_length(coalesce(p_resource_costs,'[]'::jsonb))>0
    then jsonb_build_object('resourceCosts',p_resource_costs) else '{}'::jsonb end;

  insert into public.chat_messages(room_id,character_id,body,event_kind,event_payload)
  values(p_room_id,p_character_id,'','roll',v_payload)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.send_chat_template_spell_roll_v1(
  p_room_id uuid,
  p_character_id uuid,
  p_mechanic_id text,
  p_method_key text,
  p_option_key text,
  p_label text,
  p_plan jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
  v_result jsonb;
  v_payload jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_write_chat_room(p_room_id,auth.uid()) then raise exception 'Нет права писать в этот чат'; end if;
  if nullif(trim(coalesce(p_label,'')),'') is null then raise exception 'Roll label is required'; end if;

  perform public.use_character_template_spell_v1(
    p_character_id,
    trim(p_mechanic_id),
    trim(p_method_key),
    nullif(trim(coalesce(p_option_key,'')),'')
  );
  v_result := private.execute_chat_roll_plan_v1(p_plan);
  v_payload := jsonb_build_object(
    'label',left(trim(p_label),240),
    'kind','spell',
    'structuredRoll',v_result,
    'templateMechanicId',trim(p_mechanic_id),
    'templateMethodKey',trim(p_method_key),
    'templateOptionKey',nullif(trim(coalesce(p_option_key,'')),'')
  );

  insert into public.chat_messages(room_id,character_id,body,event_kind,event_payload)
  values(p_room_id,p_character_id,'','roll',v_payload)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.send_chat_structured_roll_v1(uuid,uuid,text,text,jsonb,jsonb) from public,anon;
revoke all on function public.send_chat_template_spell_roll_v1(uuid,uuid,text,text,text,text,jsonb) from public,anon;
grant execute on function public.send_chat_structured_roll_v1(uuid,uuid,text,text,jsonb,jsonb) to authenticated;
grant execute on function public.send_chat_template_spell_roll_v1(uuid,uuid,text,text,text,text,jsonb) to authenticated;

commit;
