begin;

-- Resource runtime is the one mutable ledger for CE resources. Definitions stay
-- in class/item/feature contributions; only current values are persisted here.
create or replace function public.sync_character_resource_states(
  p_character_id uuid,
  p_resources jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_state_key text;
  v_current integer;
  v_max integer;
  v_label text;
  v_recharge jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_operate_character_resources(p_character_id,auth.uid()) then raise exception 'Not allowed'; end if;
  if p_resources is null then return; end if;
  if jsonb_typeof(p_resources)<>'array' then raise exception 'Resources must be an array'; end if;

  for v_item in select value from jsonb_array_elements(p_resources) loop
    v_state_key := trim(coalesce(v_item->>'stateKey',''));
    v_max := greatest(0,least(100000,coalesce((v_item->>'max')::integer,0)));
    v_current := greatest(0,least(v_max,coalesce((v_item->>'current')::integer,v_max)));
    v_label := left(trim(coalesce(v_item->>'label',v_state_key)),160);
    v_recharge := coalesce(v_item->'recharge','{"triggers":["never"],"restore":"full"}'::jsonb);
    if v_state_key='' then continue; end if;

    insert into public.character_resource_states(character_id,state_key,current,max_snapshot,label,recharge,updated_by)
    values(p_character_id,v_state_key,v_current,v_max,v_label,v_recharge,auth.uid())
    on conflict(character_id,state_key) do update set
      -- Preserve the amount already spent when a class level changes the maximum.
      current=greatest(0,excluded.max_snapshot-greatest(0,public.character_resource_states.max_snapshot-public.character_resource_states.current)),
      max_snapshot=excluded.max_snapshot,
      label=excluded.label,
      recharge=excluded.recharge,
      updated_by=auth.uid(),
      updated_at=now();
  end loop;
end;
$$;

-- Costs no longer special-case character_sheets.spell_slots. Spell slots and
-- class pools are the same CE runtime primitive and therefore mutate atomically
-- in character_resource_states.
create or replace function private.consume_character_resource_costs(
  p_character_id uuid,
  p_costs jsonb,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cost jsonb;
  v_state_key text;
  v_amount integer;
  v_current integer;
  v_max integer;
  v_label text;
  v_recharge jsonb;
begin
  if p_costs is null or p_costs='[]'::jsonb then return; end if;
  if p_character_id is null then raise exception 'Character is required for resource costs'; end if;
  if not private.can_operate_character_resources(p_character_id,p_user_id) then raise exception 'Not allowed'; end if;
  if jsonb_typeof(p_costs)<>'array' then raise exception 'Resource costs must be an array'; end if;

  for v_cost in select value from jsonb_array_elements(p_costs) loop
    v_state_key := trim(coalesce(v_cost->>'stateKey',''));
    v_amount := coalesce((v_cost->>'amount')::integer,0);
    if v_state_key='' or v_amount<1 or v_amount>10000 then raise exception 'Invalid resource cost'; end if;

    select current,max_snapshot,label,recharge
      into v_current,v_max,v_label,v_recharge
    from public.character_resource_states
    where character_id=p_character_id and state_key=v_state_key
    for update;

    if v_max is null then
      v_max := greatest(0,least(100000,coalesce((v_cost->>'max')::integer,0)));
      v_current := greatest(0,least(v_max,coalesce((v_cost->>'current')::integer,v_max)));
      v_label := left(trim(coalesce(v_cost->>'label',v_state_key)),160);
      v_recharge := coalesce(v_cost->'recharge','{"triggers":["never"],"restore":"full"}'::jsonb);
      insert into public.character_resource_states(character_id,state_key,current,max_snapshot,label,recharge,updated_by)
      values(p_character_id,v_state_key,v_current,v_max,v_label,v_recharge,p_user_id)
      on conflict(character_id,state_key) do nothing;
      select current,max_snapshot,label,recharge
        into v_current,v_max,v_label,v_recharge
      from public.character_resource_states
      where character_id=p_character_id and state_key=v_state_key
      for update;
    end if;

    if v_current < v_amount then raise exception 'Недостаточно ресурса: %',coalesce(nullif(v_label,''),v_state_key); end if;
    update public.character_resource_states
    set current=current-v_amount,updated_by=p_user_id,updated_at=now()
    where character_id=p_character_id and state_key=v_state_key;
  end loop;
end;
$$;

-- Public cost-only path for sheet spell casting. It cannot restore or create a
-- resource; it only delegates to the same atomic ledger used by chat.
create or replace function public.spend_character_resources(
  p_character_id uuid,
  p_costs jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform private.consume_character_resource_costs(p_character_id,coalesce(p_costs,'[]'::jsonb),auth.uid());
end;
$$;

revoke all on function public.spend_character_resources(uuid,jsonb) from public,anon;
grant execute on function public.spend_character_resources(uuid,jsonb) to authenticated;

-- Server-authoritative resource side of an assigned template action. The server
-- looks the mechanic up from the assigned class/subclass instead of trusting the
-- client to submit arbitrary restore effects. Scene consequences are deliberately
-- not executed here: this function is a resource ledger, not a virtual GM.
create or replace function public.use_character_template_resource_action(
  p_character_id uuid,
  p_mechanic_id text,
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
  v_option jsonb;
  v_cost jsonb;
  v_costs jsonb := '[]'::jsonb;
  v_requirement jsonb;
  v_effect jsonb;
  v_key text;
  v_variant text;
  v_state_key text;
  v_amount integer;
  v_current integer;
  v_max integer;
  v_label text;
  v_recharge jsonb;
  v_minimum integer;
  v_maximum integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_operate_character_resources(p_character_id,auth.uid()) then raise exception 'Not allowed'; end if;
  if nullif(trim(coalesce(p_mechanic_id,'')),'') is null then raise exception 'Mechanic is required'; end if;

  with assigned as (
    select
      a.template_id,
      a.template_level,
      t.kind,
      t.version,
      t.parent_template_id,
      t.mechanics,
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
  ), candidates as (
    select a.template_id,a.kind,a.version,0 as unlock_level,m.value as mechanic
    from assigned a
    cross join lateral jsonb_array_elements(coalesce(a.mechanics,'[]'::jsonb)) m(value)
    where m.value->>'id'=trim(p_mechanic_id)
    union all
    select a.template_id,a.kind,a.version,l.level as unlock_level,m.value as mechanic
    from assigned a
    join public.rule_template_levels l on l.template_id=a.template_id and l.level<=a.effective_level
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m(value)
    where m.value->>'id'=trim(p_mechanic_id)
  )
  select template_id,kind,version,mechanic
    into v_template_id,v_template_kind,v_template_version,v_mechanic
  from candidates
  order by unlock_level desc
  limit 1;

  if v_template_id is null or v_mechanic is null then raise exception 'Class action is unavailable'; end if;
  if coalesce(v_mechanic->>'type','')<>'action' then raise exception 'Mechanic is not an action'; end if;

  v_root_source_id := 'template:'||v_template_kind||':'||v_template_id::text||':v'||v_template_version::text;
  v_source_key := coalesce(nullif(trim(v_mechanic->>'sourceKey'),''),'mechanic:'||trim(p_mechanic_id));
  v_source_id := v_root_source_id||':source:'||v_source_key;
  if exists(
    select 1 from public.character_source_suppressions s
    where s.character_id=p_character_id and s.source_id in (v_root_source_id,v_source_id)
  ) then
    raise exception 'Class action is disabled';
  end if;

  -- Resource requirements are the only requirements persisted here. Optional
  -- maximum lets a rule express an exact zero check without fake scene state.
  for v_requirement in select value from jsonb_array_elements(coalesce(v_mechanic->'requirements','[]'::jsonb)) loop
    if coalesce(v_requirement->>'kind','')<>'resource' then continue; end if;
    v_key := trim(coalesce(v_requirement->>'key',''));
    v_variant := coalesce(nullif(trim(v_requirement->>'variantKey'),''),'default');
    v_state_key := case when v_variant='default' then v_key else v_key||'::'||v_variant end;
    select current,max_snapshot,label,recharge into v_current,v_max,v_label,v_recharge
    from public.character_resource_states
    where character_id=p_character_id and state_key=v_state_key
    for update;
    if v_max is null then raise exception 'Ресурс не синхронизирован: %',v_state_key; end if;
    v_minimum := greatest(0,coalesce((v_requirement->>'minimum')::integer,0));
    v_maximum := case when v_requirement ? 'maximum' then greatest(0,(v_requirement->>'maximum')::integer) else null end;
    if v_current<v_minimum or (v_maximum is not null and v_current>v_maximum) then
      raise exception '%',coalesce(nullif(v_requirement->>'label',''),'Условие ресурса не выполнено');
    end if;
  end loop;

  -- Mandatory costs.
  for v_cost in select value from jsonb_array_elements(coalesce(v_mechanic->'resourceCosts','[]'::jsonb)) loop
    v_key := trim(coalesce(v_cost->>'key',''));
    v_variant := coalesce(nullif(trim(v_cost->>'variantKey'),''),'default');
    v_state_key := case when v_variant='default' then v_key else v_key||'::'||v_variant end;
    v_amount := greatest(1,coalesce((v_cost->>'amount')::integer,0));
    select current,max_snapshot,label,recharge into v_current,v_max,v_label,v_recharge
    from public.character_resource_states where character_id=p_character_id and state_key=v_state_key;
    if v_max is null then raise exception 'Ресурс не синхронизирован: %',v_state_key; end if;
    v_costs := v_costs || jsonb_build_array(jsonb_build_object(
      'stateKey',v_state_key,'amount',v_amount,'current',v_current,'max',v_max,
      'label',coalesce(nullif(v_label,''),v_state_key),'recharge',v_recharge
    ));
  end loop;

  -- One alternative payment option, if the mechanic defines alternatives.
  if jsonb_array_length(coalesce(v_mechanic->'costOptions','[]'::jsonb))>0 then
    select value into v_option
    from jsonb_array_elements(v_mechanic->'costOptions')
    where value->>'key'=coalesce(p_option_key,'')
    limit 1;
    if v_option is null then raise exception 'Выбери способ оплаты'; end if;
    for v_cost in select value from jsonb_array_elements(coalesce(v_option->'costs','[]'::jsonb)) loop
      v_key := trim(coalesce(v_cost->>'key',''));
      v_variant := coalesce(nullif(trim(v_cost->>'variantKey'),''),'default');
      v_state_key := case when v_variant='default' then v_key else v_key||'::'||v_variant end;
      v_amount := greatest(1,coalesce((v_cost->>'amount')::integer,0));
      select current,max_snapshot,label,recharge into v_current,v_max,v_label,v_recharge
      from public.character_resource_states where character_id=p_character_id and state_key=v_state_key;
      if v_max is null then raise exception 'Ресурс не синхронизирован: %',v_state_key; end if;
      v_costs := v_costs || jsonb_build_array(jsonb_build_object(
        'stateKey',v_state_key,'amount',v_amount,'current',v_current,'max',v_max,
        'label',coalesce(nullif(v_label,''),v_state_key),'recharge',v_recharge
      ));
    end loop;
  end if;

  perform private.consume_character_resource_costs(p_character_id,v_costs,auth.uid());

  -- Persist only resource effects. State/semantic effects describe game execution
  -- and are intentionally ignored by this ledger.
  for v_effect in select value from jsonb_array_elements(coalesce(v_mechanic->'effects','[]'::jsonb)) loop
    if coalesce(v_effect->>'kind','')<>'resource' then continue; end if;
    v_key := trim(coalesce(v_effect->>'key',''));
    v_variant := coalesce(nullif(trim(v_effect->>'variantKey'),''),'default');
    v_state_key := case when v_variant='default' then v_key else v_key||'::'||v_variant end;
    if jsonb_typeof(v_effect->'amount')<>'number' then raise exception 'Resource effect amount must be numeric'; end if;
    v_amount := greatest(0,(v_effect->>'amount')::integer);

    select current,max_snapshot,label,recharge into v_current,v_max,v_label,v_recharge
    from public.character_resource_states
    where character_id=p_character_id and state_key=v_state_key
    for update;
    if v_max is null then raise exception 'Ресурс не синхронизирован: %',v_state_key; end if;

    if coalesce(v_effect->>'operation','')='RESTORE' then
      if v_current>=v_max and v_amount>0 then raise exception 'Ресурс уже заполнен: %',coalesce(nullif(v_label,''),v_state_key); end if;
      update public.character_resource_states
      set current=least(max_snapshot,current+v_amount),updated_by=auth.uid(),updated_at=now()
      where character_id=p_character_id and state_key=v_state_key;
    elsif coalesce(v_effect->>'operation','')='SPEND' then
      if v_current<v_amount then raise exception 'Недостаточно ресурса: %',coalesce(nullif(v_label,''),v_state_key); end if;
      update public.character_resource_states
      set current=current-v_amount,updated_by=auth.uid(),updated_at=now()
      where character_id=p_character_id and state_key=v_state_key;
    elsif coalesce(v_effect->>'operation','')='SET' then
      update public.character_resource_states
      set current=greatest(0,least(max_snapshot,v_amount)),updated_by=auth.uid(),updated_at=now()
      where character_id=p_character_id and state_key=v_state_key;
    end if;
  end loop;
end;
$$;

revoke all on function public.use_character_template_resource_action(uuid,text,text) from public,anon;
grant execute on function public.use_character_template_resource_action(uuid,text,text) to authenticated;

-- Final Druid normalization: CE accounts only for resources. Fictional execution
-- remains precise feature text; there are no fake GM-confirmed runtime flags.
create or replace function private.finalize_builtin_druid_resource_runtime(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_druid uuid;
begin
  select id into v_druid
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:druid'
    and is_builtin
    and is_active
  order by version desc
  limit 1;
  if v_druid is null then return; end if;

  update public.rule_templates
  set catalog_revision='2024-base+2014-wild-shape@4-resource-ledger',
      mechanical_summary='К8, Мудрость, полный заклинатель. Класс выдаёт ячейки, классовые заклинания и ресурсы по уровню; CE ведёт их расход и восстановление, а исполнение сценических правил остаётся в точном описании способности.',
      rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
        'mechanics_version',4,
        'resource_ledger_runtime',true,
        'class_spell_access_by_source',true,
        'class_spells_use_shared_slots',true,
        'no_fake_gm_runtime_flags',true
      ),
      updated_at=now()
  where id=v_druid;

  -- Level 2: spending Wild Shape is automatic; choosing/playing the beast form is
  -- the game rule. Wild Companion similarly accounts for its alternative payment.
  update public.rule_template_levels l
  set mechanics=coalesce((
    select jsonb_agg(m order by ord)
    from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality a(m,ord)
    where coalesce(m->>'id','') not in (
      'druid-wild-shape-action','druid-wild-shape-end','druid-wild-companion-action'
    )
  ),'[]'::jsonb)||$l2$[
    {
      "id":"druid-wild-shape-action",
      "type":"action",
      "sourceKey":"wild-shape",
      "key":"wild_shape",
      "label":"Дикая форма",
      "economy":"action",
      "resourceCosts":[{"key":"wild_shape","amount":1}],
      "tags":["class","wild_shape","resource_spend"],
      "presentation":{"tone":"green","icon":"🐾","display":"counter","priority":100}
    },
    {
      "id":"druid-wild-companion-action",
      "type":"action",
      "sourceKey":"wild-companion",
      "key":"wild_companion",
      "label":"Дикий спутник",
      "economy":"magic_action",
      "costOptions":[
        {"key":"wild-shape","label":"1 Дикая форма","costs":[{"key":"wild_shape","amount":1}]},
        {"key":"slot-1","label":"Ячейка 1 уровня","costs":[{"key":"spell_slot_1","amount":1}]},
        {"key":"slot-2","label":"Ячейка 2 уровня","costs":[{"key":"spell_slot_2","amount":1}]},
        {"key":"slot-3","label":"Ячейка 3 уровня","costs":[{"key":"spell_slot_3","amount":1}]},
        {"key":"slot-4","label":"Ячейка 4 уровня","costs":[{"key":"spell_slot_4","amount":1}]},
        {"key":"slot-5","label":"Ячейка 5 уровня","costs":[{"key":"spell_slot_5","amount":1}]},
        {"key":"slot-6","label":"Ячейка 6 уровня","costs":[{"key":"spell_slot_6","amount":1}]},
        {"key":"slot-7","label":"Ячейка 7 уровня","costs":[{"key":"spell_slot_7","amount":1}]},
        {"key":"slot-8","label":"Ячейка 8 уровня","costs":[{"key":"spell_slot_8","amount":1}]},
        {"key":"slot-9","label":"Ячейка 9 уровня","costs":[{"key":"spell_slot_9","amount":1}]}
      ],
      "tags":["class","wild_companion","alternate_payment"],
      "presentation":{"tone":"green","icon":"◇","display":"counter","priority":90}
    }
  ]$l2$::jsonb
  where l.template_id=v_druid and l.level=2;

  -- Level 5: both sides are true resource conversions. The reverse side gets a
  -- real 1/Long Rest counter. The once-per-turn clause is prose until turns exist.
  update public.rule_template_levels l
  set mechanics=coalesce((
    select jsonb_agg(m order by ord)
    from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality a(m,ord)
    where coalesce(m->>'id','') not in (
      'druid-wild-resurgence-refill','druid-wild-resurgence-slot','druid-wild-resurgence-slot-exchange-resource'
    )
  ),'[]'::jsonb)||$l5$[
    {
      "id":"druid-wild-resurgence-slot-exchange-resource",
      "type":"resource",
      "sourceKey":"wild-resurgence",
      "key":"wild_resurgence_slot_exchange",
      "label":"Дикое возрождение · ячейка",
      "max":1,
      "recharge":["long_rest"],
      "restore":"full",
      "initial":"full",
      "presentation":{"tone":"violet","icon":"✦","display":"pips","priority":80}
    },
    {
      "id":"druid-wild-resurgence-refill",
      "type":"action",
      "sourceKey":"wild-resurgence",
      "key":"wild_resurgence_refill",
      "label":"Дикое возрождение · вернуть Дикую форму",
      "economy":"none",
      "requirements":[{"kind":"resource","key":"wild_shape","minimum":0,"maximum":0,"label":"Использования Дикой формы должны закончиться"}],
      "costOptions":[
        {"key":"slot-1","label":"Ячейка 1 уровня","costs":[{"key":"spell_slot_1","amount":1}]},
        {"key":"slot-2","label":"Ячейка 2 уровня","costs":[{"key":"spell_slot_2","amount":1}]},
        {"key":"slot-3","label":"Ячейка 3 уровня","costs":[{"key":"spell_slot_3","amount":1}]},
        {"key":"slot-4","label":"Ячейка 4 уровня","costs":[{"key":"spell_slot_4","amount":1}]},
        {"key":"slot-5","label":"Ячейка 5 уровня","costs":[{"key":"spell_slot_5","amount":1}]},
        {"key":"slot-6","label":"Ячейка 6 уровня","costs":[{"key":"spell_slot_6","amount":1}]},
        {"key":"slot-7","label":"Ячейка 7 уровня","costs":[{"key":"spell_slot_7","amount":1}]},
        {"key":"slot-8","label":"Ячейка 8 уровня","costs":[{"key":"spell_slot_8","amount":1}]},
        {"key":"slot-9","label":"Ячейка 9 уровня","costs":[{"key":"spell_slot_9","amount":1}]}
      ],
      "effects":[{"kind":"resource","key":"wild_shape","operation":"RESTORE","amount":1}],
      "tags":["class","resource_conversion","wild_resurgence"],
      "presentation":{"tone":"green","icon":"↻","display":"counter","priority":80}
    },
    {
      "id":"druid-wild-resurgence-slot",
      "type":"action",
      "sourceKey":"wild-resurgence",
      "key":"wild_resurgence_slot",
      "label":"Дикое возрождение · вернуть ячейку 1 уровня",
      "economy":"none",
      "resourceCosts":[
        {"key":"wild_shape","amount":1},
        {"key":"wild_resurgence_slot_exchange","amount":1}
      ],
      "effects":[{"kind":"resource","key":"spell_slot_1","operation":"RESTORE","amount":1}],
      "tags":["class","resource_conversion","wild_resurgence"],
      "presentation":{"tone":"violet","icon":"✦","display":"counter","priority":80}
    }
  ]$l5$::jsonb
  where l.template_id=v_druid and l.level=5;

  -- Beast Spells is a precise rule about what the player may cast while actually
  -- transformed. We do not invent wild_shape_active just to make CE police it.
  update public.rule_template_levels l
  set mechanics=coalesce((
    select jsonb_agg(m order by ord)
    from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality a(m,ord)
    where coalesce(m->>'id','')<>'druid-beast-spells-permission'
  ),'[]'::jsonb)
  where l.template_id=v_druid and l.level=18;
end;
$$;

create or replace function private.finalize_builtin_druid_resource_runtime_after_campaign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.finalize_builtin_druid_resource_runtime(new.id);
  return new;
end;
$$;

drop trigger if exists zzzzz_campaigns_druid_resource_runtime on public.campaigns;
create trigger zzzzz_campaigns_druid_resource_runtime
after insert on public.campaigns
for each row execute function private.finalize_builtin_druid_resource_runtime_after_campaign();

do $$
declare v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.finalize_builtin_druid_resource_runtime(v_campaign.id);
  end loop;
end;
$$;

commit;
