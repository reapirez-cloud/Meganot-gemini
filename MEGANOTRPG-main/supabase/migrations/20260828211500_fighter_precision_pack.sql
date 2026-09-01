begin;

-- Fighter precision pack follows the resource-ledger boundary: CE owns finite
-- pools and character-side values; hit/target/initiative/position consequences
-- stay in exact rule explanations until those events are authoritative runtime.

create or replace function private.fighter_feature(
  p_id text,p_source_key text,p_key text,p_label text,p_description text,p_mechanic jsonb default '{}'::jsonb
) returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object(
    'id',p_id,'type','grant','target','feature','key',p_key,'sourceKey',p_source_key,
    'payload',jsonb_build_object('label',p_label,'description',p_description,'mechanic',coalesce(p_mechanic,'{}'::jsonb))
  );
$$;

create or replace function private.fighter_resource(
  p_id text,p_source_key text,p_key text,p_label text,p_max jsonb,p_recharge jsonb,
  p_priority integer default 0,p_operation text default 'GRANT',p_recovery_rules jsonb default null
) returns jsonb language sql immutable set search_path='' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id',p_id,'type','grant','target','resource','key',p_key,'sourceKey',p_source_key,
    'grantOperation',p_operation,'priority',p_priority,
    'payload',jsonb_strip_nulls(jsonb_build_object(
      'max',p_max,'label',p_label,'initial','full','recharge',p_recharge,'recoveryRules',p_recovery_rules
    ))
  ));
$$;

create or replace function private.fighter_value(
  p_id text,p_source_key text,p_key text,p_label text,p_value jsonb,p_priority integer default 0,p_operation text default 'GRANT'
) returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object(
    'id',p_id,'type','grant','target','value','key',p_key,'sourceKey',p_source_key,
    'grantOperation',p_operation,'priority',p_priority,
    'payload',jsonb_build_object('label',p_label,'value',p_value)
  );
$$;

create or replace function private.fighter_action(
  p_id text,p_source_key text,p_key text,p_label text,p_economy text,p_costs jsonb default '[]'::jsonb,
  p_effects jsonb default '[]'::jsonb,p_tags jsonb default '[]'::jsonb
) returns jsonb language sql immutable set search_path='' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id',p_id,'type','action','sourceKey',p_source_key,'key',p_key,'label',p_label,'economy',p_economy,
    'range',jsonb_build_object('kind','self'),
    'resourceCosts',case when jsonb_array_length(coalesce(p_costs,'[]'::jsonb))>0 then p_costs else null end,
    'effects',case when jsonb_array_length(coalesce(p_effects,'[]'::jsonb))>0 then p_effects else null end,
    'tags',coalesce(p_tags,'[]'::jsonb),
    'presentation',jsonb_build_object('tone','amber','icon','◆','display','counter','priority',85)
  ));
$$;

create or replace function private.fighter_set_subclass_level(
  p_template_id uuid,p_level integer,p_mechanics jsonb
) returns void language plpgsql security definer set search_path='' as $$
declare v_spells jsonb;
begin
  select coalesce(jsonb_agg(m order by ord) filter(where m->>'type'='spell'),'[]'::jsonb)
    into v_spells
  from public.rule_template_levels l
  cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality q(m,ord)
  where l.template_id=p_template_id and l.level=p_level;

  update public.rule_template_levels
  set mechanics=coalesce(v_spells,'[]'::jsonb)||coalesce(p_mechanics,'[]'::jsonb)
  where template_id=p_template_id and level=p_level;

  if not found then
    insert into public.rule_template_levels(template_id,level,mechanics,choices)
    values(p_template_id,p_level,coalesce(p_mechanics,'[]'::jsonb),'[]'::jsonb);
  end if;
end;
$$;

create or replace function private.fighter_patch_base_source(
  p_template_id uuid,p_level integer,p_source_key text,p_description text,p_runtime jsonb default '[]'::jsonb
) returns void language plpgsql security definer set search_path='' as $$
begin
  update public.rule_template_levels l
  set mechanics=coalesce((
    select jsonb_agg(
      case
        when m->>'sourceKey'=p_source_key and m->>'type'='grant' and m->>'target'='feature'
          then jsonb_set(m,'{payload,description}',to_jsonb(p_description),true)
        else m
      end order by ord
    ) filter(where not (m->>'sourceKey'=p_source_key and not (m->>'type'='grant' and m->>'target'='feature')))
    from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality q(m,ord)
  ),'[]'::jsonb)||coalesce(p_runtime,'[]'::jsonb)
  where l.template_id=p_template_id and l.level=p_level;
end;
$$;

-- Per-trigger recovery is persisted in resource state JSON and interpreted
-- generically. Legacy single-rule recharge remains fully supported.
create or replace function public.recover_character_resources(
  p_character_id uuid,
  p_trigger text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_rule jsonb;
  v_restore text;
  v_amount integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_manage_character(p_character_id,auth.uid()) then raise exception 'Only GM or owner can restore resources'; end if;
  if p_trigger not in ('short_rest','long_rest','dawn','manual') then raise exception 'Unsupported recovery trigger'; end if;

  for v_row in
    select character_id,state_key,current,max_snapshot,recharge
    from public.character_resource_states
    where character_id=p_character_id
    for update
  loop
    v_rule:=null;
    if jsonb_typeof(v_row.recharge->'rules')='array' then
      select value into v_rule
      from jsonb_array_elements(v_row.recharge->'rules')
      where value->>'trigger'=p_trigger
      limit 1;
    elsif exists(
      select 1 from jsonb_array_elements_text(coalesce(v_row.recharge->'triggers','[]'::jsonb)) t(value)
      where t.value=p_trigger
    ) then
      v_rule:=v_row.recharge;
    end if;
    if v_rule is null then continue; end if;

    v_restore:=coalesce(v_rule->>'restore','full');
    if v_restore='amount' then
      v_amount:=greatest(0,coalesce((v_rule->>'amount')::integer,0));
      update public.character_resource_states
      set current=least(max_snapshot,current+v_amount),updated_by=auth.uid(),updated_at=now()
      where character_id=p_character_id and state_key=v_row.state_key;
    else
      update public.character_resource_states
      set current=max_snapshot,updated_by=auth.uid(),updated_at=now()
      where character_id=p_character_id and state_key=v_row.state_key;
    end if;
  end loop;
end;
$$;

create or replace function private.apply_fighter_precision_pack(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_fighter uuid;
  v_arcane_archer uuid;
  v_battle_master uuid;
  v_cavalier uuid;
  v_champion uuid;
  v_echo uuid;
  v_eldritch uuid;
  v_psi uuid;
  v_banneret uuid;
  v_rune uuid;
  v_samurai uuid;
  v_con_formula jsonb := '{"kind":"max","values":[{"kind":"literal","value":1},{"kind":"reference","key":"abilities.constitution.modifier"}]}'::jsonb;
  v_str_formula jsonb := '{"kind":"max","values":[{"kind":"literal","value":1},{"kind":"reference","key":"abilities.strength.modifier"}]}'::jsonb;
  v_pb_formula jsonb := '{"kind":"reference","key":"core.proficiencyBonus"}'::jsonb;
  v_two_pb_formula jsonb := '{"kind":"multiply","factors":[{"kind":"literal","value":2},{"kind":"reference","key":"core.proficiencyBonus"}]}'::jsonb;
begin
  select id into v_fighter from public.rule_templates
  where campaign_id=p_campaign_id and catalog_key='class:fighter' and kind='class' and is_active
  order by version desc limit 1;
  if v_fighter is null then return; end if;

  update public.rule_templates set
    catalog_revision='xphb-2024-fighter-precision-v1',
    mechanical_summary='Воин: Второе дыхание, Всплеск действий и Неукротимый ведутся как реальные ресурсы; число мастерств оружия и атак хранится как масштабируемые значения. Тактические триггеры объясняются, но не симулируются.',
    rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
      'fighter_precision_pack',true,'resource_ledger_runtime',true,'no_fake_scene_state',true,
      'source_book','XPHB','rules_revision','2024'
    ),updated_at=now()
  where id=v_fighter;

  perform private.fighter_patch_base_source(v_fighter,1,'fighting-style',
    'Выберите один талант Боевого стиля, требованиям которого воин соответствует. Стиль является постоянной частью классовой подготовки и меняется только когда правило явно позволяет заменить его.');

  perform private.fighter_patch_base_source(v_fighter,1,'second-wind',
    'Бонусным действием потратьте 1 использование Второго дыхания и восстановите 1к10 + уровень Воина HP. На 1 уровне есть 2 использования, на 4 — 3, на 10 — 4. После короткого отдыха возвращается 1 потраченное использование; после долгого — весь запас.',
    jsonb_build_array(
      private.fighter_resource('fighter-second-wind-l1','second-wind','second_wind','Второе дыхание','2'::jsonb,
        '{"triggers":["long_rest"],"restore":"full"}'::jsonb,1,'REPLACE',
        '[{"trigger":"short_rest","restore":"amount","amount":1},{"trigger":"long_rest","restore":"full"}]'::jsonb),
      private.fighter_action('fighter-second-wind-action','second-wind','second_wind','Второе дыхание','bonus_action',
        '[{"key":"second_wind","amount":1}]'::jsonb,'[]'::jsonb,'["class","healing:1d10+fighter-level"]'::jsonb)
    ));

  perform private.fighter_patch_base_source(v_fighter,1,'weapon-mastery',
    'После долгого отдыха выберите оружие, чьи свойства Мастерства вы можете применять: 3 вида на 1 уровне, 4 на 4, 5 на 10 и 6 на 16. После каждого долгого отдыха один выбранный вид оружия можно заменить.',
    jsonb_build_array(private.fighter_value('fighter-weapon-mastery-l1','weapon-mastery','weapon_mastery_count','Мастерства оружия','3'::jsonb,1,'REPLACE')));

  perform private.fighter_patch_base_source(v_fighter,2,'action-surge',
    'На своём ходу можно потратить 1 Всплеск действий и получить ещё одно действие, но это дополнительное действие нельзя использовать как Магическое действие. Запас восстанавливается после короткого или долгого отдыха; на 17 уровне запас увеличивается до 2, но не более одного Всплеска за ход.',
    jsonb_build_array(
      private.fighter_resource('fighter-action-surge-l2','action-surge','action_surge','Всплеск действий','1'::jsonb,'{"triggers":["short_rest","long_rest"],"restore":"full"}'::jsonb,2,'REPLACE'),
      private.fighter_action('fighter-action-surge-action','action-surge','action_surge','Всплеск действий','free','[{"key":"action_surge","amount":1}]'::jsonb)
    ));

  perform private.fighter_patch_base_source(v_fighter,2,'tactical-mind',
    'После проваленной проверки характеристики можно направить Второе дыхание на Тактический ум: бросить 1к10 и добавить результат к проверке. Если проверка всё равно провалена, использование Второго дыхания не расходуется. MEGANOT не списывает ресурс заранее, потому что итог проверки определяется за столом.');

  perform private.fighter_patch_base_source(v_fighter,5,'extra-attack',
    'Действием Атака воин атакует дважды вместо одного раза.',
    jsonb_build_array(private.fighter_value('fighter-attacks-l5','extra-attack','attacks_per_attack_action','Атак за действие Атака','2'::jsonb,5,'REPLACE')));
  perform private.fighter_patch_base_source(v_fighter,5,'tactical-shift',
    'Когда Второе дыхание используется бонусным действием, воин может в рамках этого же бонусного действия переместиться на расстояние до половины своей Скорости, не провоцируя атаки по возможности.');

  perform private.fighter_patch_base_source(v_fighter,9,'indomitable',
    'После проваленного спасброска потратьте 1 Неукротимый, перебросьте спасбросок и добавьте к новому результату уровень Воина; новый результат обязателен. Запас: 1 использование на 9 уровне, 2 на 13 и 3 на 17; восстанавливается после долгого отдыха.',
    jsonb_build_array(
      private.fighter_resource('fighter-indomitable-l9','indomitable','indomitable','Неукротимый','1'::jsonb,'{"triggers":["long_rest"],"restore":"full"}'::jsonb,9,'REPLACE'),
      private.fighter_action('fighter-indomitable-action','indomitable','indomitable','Неукротимый','reaction','[{"key":"indomitable","amount":1}]'::jsonb)
    ));
  perform private.fighter_patch_base_source(v_fighter,9,'tactical-master',
    'Для каждой атаки оружием, Мастерство которого воин умеет использовать, можно вместо обычного свойства этого оружия применить Push, Sap или Slow. Выбор делается для конкретной атаки.');

  perform private.fighter_patch_base_source(v_fighter,11,'two-extra-attacks',
    'Действием Атака воин атакует трижды вместо одного раза.',
    jsonb_build_array(private.fighter_value('fighter-attacks-l11','extra-attack','attacks_per_attack_action','Атак за действие Атака','3'::jsonb,11,'REPLACE')));
  perform private.fighter_patch_base_source(v_fighter,13,'studied-attacks',
    'Если атака по существу промахнулась, следующая атака по этому же существу до конца следующего хода Воина совершается с преимуществом. Цель и попадание определяются в сцене, поэтому движок не создаёт фиктивную метку цели.');
  perform private.fighter_patch_base_source(v_fighter,20,'three-extra-attacks',
    'Действием Атака воин атакует четыре раза вместо одного.',
    jsonb_build_array(private.fighter_value('fighter-attacks-l20','extra-attack','attacks_per_attack_action','Атак за действие Атака','4'::jsonb,20,'REPLACE')));

  -- Progression-only replacements live on their real Fighter levels.
  update public.rule_template_levels set mechanics=mechanics||jsonb_build_array(
    private.fighter_resource('fighter-second-wind-l4','second-wind','second_wind','Второе дыхание','3'::jsonb,'{"triggers":["long_rest"],"restore":"full"}'::jsonb,4,'REPLACE','[{"trigger":"short_rest","restore":"amount","amount":1},{"trigger":"long_rest","restore":"full"}]'::jsonb),
    private.fighter_value('fighter-weapon-mastery-l4','weapon-mastery','weapon_mastery_count','Мастерства оружия','4'::jsonb,4,'REPLACE')
  ) where template_id=v_fighter and level=4;
  update public.rule_template_levels set mechanics=mechanics||jsonb_build_array(
    private.fighter_resource('fighter-second-wind-l10','second-wind','second_wind','Второе дыхание','4'::jsonb,'{"triggers":["long_rest"],"restore":"full"}'::jsonb,10,'REPLACE','[{"trigger":"short_rest","restore":"amount","amount":1},{"trigger":"long_rest","restore":"full"}]'::jsonb),
    private.fighter_value('fighter-weapon-mastery-l10','weapon-mastery','weapon_mastery_count','Мастерства оружия','5'::jsonb,10,'REPLACE')
  ) where template_id=v_fighter and level=10;
  update public.rule_template_levels set mechanics=mechanics||jsonb_build_array(
    private.fighter_value('fighter-weapon-mastery-l16','weapon-mastery','weapon_mastery_count','Мастерства оружия','6'::jsonb,16,'REPLACE')
  ) where template_id=v_fighter and level=16;
  update public.rule_template_levels set mechanics=mechanics||jsonb_build_array(
    private.fighter_resource('fighter-action-surge-l17','action-surge','action_surge','Всплеск действий','2'::jsonb,'{"triggers":["short_rest","long_rest"],"restore":"full"}'::jsonb,17,'REPLACE'),
    private.fighter_resource('fighter-indomitable-l17','indomitable','indomitable','Неукротимый','3'::jsonb,'{"triggers":["long_rest"],"restore":"full"}'::jsonb,17,'REPLACE')
  ) where template_id=v_fighter and level=17;
  update public.rule_template_levels set mechanics=mechanics||jsonb_build_array(
    private.fighter_resource('fighter-indomitable-l13','indomitable','indomitable','Неукротимый','2'::jsonb,'{"triggers":["long_rest"],"restore":"full"}'::jsonb,13,'REPLACE')
  ) where template_id=v_fighter and level=13;

  select id into v_arcane_archer from public.rule_templates where campaign_id=p_campaign_id and catalog_key='subclass:fighter:arcane-archer' and is_active order by version desc limit 1;
  select id into v_battle_master from public.rule_templates where campaign_id=p_campaign_id and catalog_key='subclass:fighter:battle-master' and is_active order by version desc limit 1;
  select id into v_cavalier from public.rule_templates where campaign_id=p_campaign_id and catalog_key='subclass:fighter:cavalier' and is_active order by version desc limit 1;
  select id into v_champion from public.rule_templates where campaign_id=p_campaign_id and catalog_key='subclass:fighter:champion' and is_active order by version desc limit 1;
  select id into v_echo from public.rule_templates where campaign_id=p_campaign_id and catalog_key='subclass:fighter:echo-knight' and is_active order by version desc limit 1;
  select id into v_eldritch from public.rule_templates where campaign_id=p_campaign_id and catalog_key='subclass:fighter:eldritch-knight' and is_active order by version desc limit 1;
  select id into v_psi from public.rule_templates where campaign_id=p_campaign_id and catalog_key='subclass:fighter:psi-warrior' and is_active order by version desc limit 1;
  select id into v_banneret from public.rule_templates where campaign_id=p_campaign_id and catalog_key='subclass:fighter:banneret' and is_active order by version desc limit 1;
  select id into v_rune from public.rule_templates where campaign_id=p_campaign_id and catalog_key='subclass:fighter:rune-knight' and is_active order by version desc limit 1;
  select id into v_samurai from public.rule_templates where campaign_id=p_campaign_id and catalog_key='subclass:fighter:samurai' and is_active order by version desc limit 1;

  -- Arcane Archer (Xanathar): two Arcane Shot uses always; new levels add options, not charges.
  if v_arcane_archer is not null then
    perform private.fighter_set_subclass_level(v_arcane_archer,3,jsonb_build_array(
      private.fighter_feature('fighter-aa-l3','arcane-shot','subclass:fighter:arcane-archer:arcane-shot','Мистический выстрел',
        'На 3 уровне выберите 2 варианта Мистического выстрела. Один раз за ход, когда стрела из короткого или длинного лука соответствует условию выбранного варианта, можно потратить 1 использование и применить этот вариант. Всего 2 использования; они полностью возвращаются после короткого или долгого отдыха. Варианты: Banishing, Beguiling, Bursting, Enfeebling, Grasping, Piercing, Seeking и Shadow Arrow.',
        jsonb_build_object('kind','resource_options','optionsKnown',2,'additionalOptionLevels',jsonb_build_array(7,10,15,18),'sceneTrigger','arcane_shot_option')),
      private.fighter_resource('fighter-aa-resource','arcane-shot','arcane_shot','Мистические выстрелы','2'::jsonb,'{"triggers":["short_rest","long_rest"],"restore":"full"}'::jsonb,3,'REPLACE'),
      private.fighter_action('fighter-aa-use','arcane-shot','arcane_shot','Мистический выстрел','attack_modifier','[{"key":"arcane_shot","amount":1}]'::jsonb)
    ));
    perform private.fighter_set_subclass_level(v_arcane_archer,7,jsonb_build_array(
      private.fighter_feature('fighter-aa-magic-arrow','magic-arrow','subclass:fighter:arcane-archer:magic-arrow','Магическая стрела','Немагическая стрела, выпущенная из короткого или длинного лука, считается магической для преодоления сопротивления и иммунитета к немагическим атакам.'),
      private.fighter_feature('fighter-aa-curving','curving-shot','subclass:fighter:arcane-archer:curving-shot','Изгибающийся выстрел','Если магическая стрела промахнулась, бонусным действием можно перенаправить её в другую цель в пределах 60 футов от первоначальной цели и повторить атаку. Это не расходует отдельный ресурс.'),
      private.fighter_feature('fighter-aa-option7','arcane-shot-options','subclass:fighter:arcane-archer:option','Дополнительный Мистический выстрел','Изучите ещё один вариант Мистического выстрела; общий запас применений остаётся 2.')
    ));
    perform private.fighter_set_subclass_level(v_arcane_archer,10,jsonb_build_array(private.fighter_feature('fighter-aa-option10','arcane-shot-options','subclass:fighter:arcane-archer:option','Дополнительный Мистический выстрел','Изучите ещё один вариант Мистического выстрела; общий запас применений остаётся 2.')));
    perform private.fighter_set_subclass_level(v_arcane_archer,15,jsonb_build_array(
      private.fighter_feature('fighter-aa-ready','ever-ready-shot','subclass:fighter:arcane-archer:ever-ready','Всегда готовый выстрел','Если при броске инициативы не осталось использований Мистического выстрела, восстановите 1. Инициатива пока не является авторитетным событием MEGANOT, поэтому это правило не создаёт автоматический ресурсный триггер.'),
      private.fighter_feature('fighter-aa-option15','arcane-shot-options','subclass:fighter:arcane-archer:option','Дополнительный Мистический выстрел','Изучите ещё один вариант Мистического выстрела; общий запас применений остаётся 2.')
    ));
    perform private.fighter_set_subclass_level(v_arcane_archer,18,jsonb_build_array(private.fighter_feature('fighter-aa-option18','arcane-shot-options','subclass:fighter:arcane-archer:option','Дополнительный Мистический выстрел','Изучите ещё один вариант Мистического выстрела; общий запас применений остаётся 2.')));
  end if;

  -- Battle Master 2024: pool count and die size are separate CE identities.
  if v_battle_master is not null then
    perform private.fighter_set_subclass_level(v_battle_master,3,jsonb_build_array(
      private.fighter_feature('fighter-bm-l3','combat-superiority','subclass:fighter:battle-master:combat-superiority','Боевое превосходство','Изучите 3 манёвра. Манёвр, который требует кость превосходства, расходует 1 кость; конкретный триггер, цель, спасбросок и результат берутся из текста выбранного манёвра. DC манёвра: 8 + бонус мастерства + модификатор Силы или Ловкости (на выбор).'),
      private.fighter_resource('fighter-bm-dice-l3','combat-superiority','superiority_dice','Кости превосходства','4'::jsonb,'{"triggers":["short_rest","long_rest"],"restore":"full"}'::jsonb,3,'REPLACE'),
      private.fighter_value('fighter-bm-die-l3','combat-superiority','superiority_die','Кость превосходства','8'::jsonb,3,'REPLACE'),
      private.fighter_action('fighter-bm-maneuver','combat-superiority','battle_master_maneuver','Манёвр','maneuver','[{"key":"superiority_dice","amount":1}]'::jsonb)
    ));
    perform private.fighter_set_subclass_level(v_battle_master,7,jsonb_build_array(
      private.fighter_feature('fighter-bm-know','know-your-enemy','subclass:fighter:battle-master:know-your-enemy','Знай своего врага','Бонусным действием изучите видимое существо: мастер сообщает его иммунитеты, сопротивления и уязвимости. Использование не требует кости превосходства.'),
      private.fighter_feature('fighter-bm-more7','maneuvers','subclass:fighter:battle-master:maneuvers','Дополнительные манёвры','Изучите ещё 2 манёвра.'),
      private.fighter_resource('fighter-bm-dice-l7','combat-superiority','superiority_dice','Кости превосходства','5'::jsonb,'{"triggers":["short_rest","long_rest"],"restore":"full"}'::jsonb,7,'REPLACE')
    ));
    perform private.fighter_set_subclass_level(v_battle_master,10,jsonb_build_array(
      private.fighter_feature('fighter-bm-more10','maneuvers','subclass:fighter:battle-master:maneuvers','Дополнительные манёвры','Изучите ещё 2 манёвра.'),
      private.fighter_value('fighter-bm-die-l10','combat-superiority','superiority_die','Кость превосходства','10'::jsonb,10,'REPLACE')
    ));
    perform private.fighter_set_subclass_level(v_battle_master,15,jsonb_build_array(
      private.fighter_feature('fighter-bm-relentless','relentless','subclass:fighter:battle-master:relentless','Неутомимый','Один раз за ход, когда манёвр требует потратить кость превосходства, можно вместо расхода обычной кости использовать бесплатную к8. Ходы не отслеживаются движком, поэтому эта бесплатная к8 не превращена в бесконечно нажимаемый ресурс.'),
      private.fighter_feature('fighter-bm-more15','maneuvers','subclass:fighter:battle-master:maneuvers','Дополнительные манёвры','Изучите ещё 2 манёвра.'),
      private.fighter_resource('fighter-bm-dice-l15','combat-superiority','superiority_dice','Кости превосходства','6'::jsonb,'{"triggers":["short_rest","long_rest"],"restore":"full"}'::jsonb,15,'REPLACE')
    ));
    perform private.fighter_set_subclass_level(v_battle_master,18,jsonb_build_array(private.fighter_value('fighter-bm-die-l18','combat-superiority','superiority_die','Кость превосходства','12'::jsonb,18,'REPLACE')));
  end if;

  -- Cavalier (Xanathar).
  if v_cavalier is not null then
    perform private.fighter_set_subclass_level(v_cavalier,3,jsonb_build_array(
      private.fighter_feature('fighter-cav-mark','unwavering-mark','subclass:fighter:cavalier:unwavering-mark','Непоколебимая метка','Попаданием ближней атакой оружием можно пометить цель до конца следующего хода. Если помеченная цель причинит урон кому-то ещё, на следующем ходу может открыться специальная бонусная атака с преимуществом и дополнительным уроном, равным половине уровня Воина. Такие специальные атаки ограничены модификатором Силы (минимум 1) за долгий отдых.'),
      private.fighter_resource('fighter-cav-mark-pool','unwavering-mark','unwavering_mark_attack','Ответы Непоколебимой метки',v_str_formula,'{"triggers":["long_rest"],"restore":"full"}'::jsonb,3,'REPLACE'),
      private.fighter_action('fighter-cav-mark-use','unwavering-mark','unwavering_mark_attack','Ответ Непоколебимой метки','bonus_action','[{"key":"unwavering_mark_attack","amount":1}]'::jsonb),
      private.fighter_feature('fighter-cav-saddle','born-to-saddle','subclass:fighter:cavalier:born-to-saddle','Рождённый в седле','Преимущество на спасброски, чтобы не упасть с ездового животного; падение с высоты до 10 футов при сознании не сбивает с ног; садиться и спешиваться можно за 5 футов движения вместо половины скорости.')
    ));
    perform private.fighter_set_subclass_level(v_cavalier,7,jsonb_build_array(
      private.fighter_feature('fighter-cav-ward','warding-maneuver','subclass:fighter:cavalier:warding-maneuver','Защитный манёвр','Реакцией, когда вы или существо в 5 футах получает попадание атакой, бросьте 1к8 и добавьте результат к КД цели против этой атаки. Если атака всё равно попала, цель получает сопротивление её урону. Использований: модификатор Телосложения, минимум 1, за долгий отдых.'),
      private.fighter_resource('fighter-cav-ward-pool','warding-maneuver','warding_maneuver','Защитные манёвры',v_con_formula,'{"triggers":["long_rest"],"restore":"full"}'::jsonb,7,'REPLACE'),
      private.fighter_action('fighter-cav-ward-use','warding-maneuver','warding_maneuver','Защитный манёвр','reaction','[{"key":"warding_maneuver","amount":1}]'::jsonb)
    ));
    perform private.fighter_set_subclass_level(v_cavalier,10,jsonb_build_array(private.fighter_feature('fighter-cav-line','hold-the-line','subclass:fighter:cavalier:hold-the-line','Держать строй','Существа провоцируют вашу атаку по возможности, когда перемещаются на 5 футов или больше внутри вашей досягаемости; попадание такой атакой уменьшает их Скорость до 0 до конца текущего хода.')));
    perform private.fighter_set_subclass_level(v_cavalier,15,jsonb_build_array(private.fighter_feature('fighter-cav-charge','ferocious-charger','subclass:fighter:cavalier:ferocious-charger','Свирепый натиск','Если перед попаданием атакой оружием по прямой пройдено не менее 10 футов, цель может быть сбита с ног после спасброска Силы. Триггер попадания и путь определяются в сцене.')));
    perform private.fighter_set_subclass_level(v_cavalier,18,jsonb_build_array(private.fighter_feature('fighter-cav-defender','vigilant-defender','subclass:fighter:cavalier:vigilant-defender','Бдительный защитник','В бою вы получаете особую реакцию на каждом ходу другого существа; её можно использовать только для атаки по возможности. Движок не создаёт отдельный бесконечный счётчик реакций.')));
  end if;

  -- Champion 2024 is passive: no fake buttons/resources.
  if v_champion is not null then
    perform private.fighter_set_subclass_level(v_champion,3,jsonb_build_array(
      private.fighter_feature('fighter-champ-crit','improved-critical','subclass:fighter:champion:critical','Улучшенный критический','Атаки оружием и безоружные удары наносят критическое попадание при 19–20 на к20.',jsonb_build_object('kind','critical_threshold','threshold',19,'appliesTo',jsonb_build_array('weapon_attack','unarmed_strike'))),
      private.fighter_feature('fighter-champ-athlete','remarkable-athlete','subclass:fighter:champion:remarkable-athlete','Выдающийся атлет','Преимущество на инициативу и проверки Силы (Атлетика). Сразу после критического попадания можно переместиться на половину Скорости без провоцирования атак по возможности.')
    ));
    perform private.fighter_set_subclass_level(v_champion,7,jsonb_build_array(private.fighter_feature('fighter-champ-style','additional-fighting-style','subclass:fighter:champion:additional-style','Дополнительный Боевой стиль','Получите ещё один талант Боевого стиля, требованиям которого соответствуете.')));
    perform private.fighter_set_subclass_level(v_champion,10,jsonb_build_array(private.fighter_feature('fighter-champ-hero','heroic-warrior','subclass:fighter:champion:heroic-warrior','Героический воин','Во время боя в начале своего хода, если нет Героического вдохновения, можно получить его. Начало хода движок пока не отслеживает.')));
    perform private.fighter_set_subclass_level(v_champion,15,jsonb_build_array(private.fighter_feature('fighter-champ-supercrit','superior-critical','subclass:fighter:champion:critical','Превосходный критический','Атаки оружием и безоружные удары теперь наносят критическое попадание при 18–20 на к20.',jsonb_build_object('kind','critical_threshold','threshold',18,'appliesTo',jsonb_build_array('weapon_attack','unarmed_strike')))));
    perform private.fighter_set_subclass_level(v_champion,18,jsonb_build_array(private.fighter_feature('fighter-champ-survivor','survivor','subclass:fighter:champion:survivor','Выживший','Преимущество на спасброски от смерти; результат 18–20 даёт эффект натуральной 20. Кроме того, в начале хода при 1+ HP и состоянии Bloodied восстанавливается 5 + модификатор Телосложения HP. Эти триггеры остаются правилом, пока боевой трекер не станет авторитетным источником ходов и Bloodied.')));
  end if;

  -- Echo Knight (Explorer's Guide to Wildemount).
  if v_echo is not null then
    perform private.fighter_set_subclass_level(v_echo,3,jsonb_build_array(
      private.fighter_feature('fighter-echo-manifest','manifest-echo','subclass:fighter:echo-knight:manifest','Проявление эха','Бонусным действием создайте эхо в свободном месте в 15 футах. Атаки действия Атака могут исходить от вас или эха; можно меняться с эхом местами, тратя бонусное действие и 15 футов движения; эхо может совершать атаку по возможности по своим правилам. Позиция эха остаётся сценическим состоянием, а не фиктивным флагом CE.'),
      private.fighter_feature('fighter-echo-unleash','unleash-incarnation','subclass:fighter:echo-knight:unleash','Воплощение ярости','Когда совершаете действие Атака, можно потратить 1 использование и сделать одну дополнительную ближнюю атаку из позиции эха. Использований: модификатор Телосложения, минимум 1, за долгий отдых.'),
      private.fighter_resource('fighter-echo-unleash-pool','unleash-incarnation','unleash_incarnation','Воплощение ярости',v_con_formula,'{"triggers":["long_rest"],"restore":"full"}'::jsonb,3,'REPLACE'),
      private.fighter_action('fighter-echo-unleash-use','unleash-incarnation','unleash_incarnation','Воплощение ярости','attack_modifier','[{"key":"unleash_incarnation","amount":1}]'::jsonb)
    ));
    perform private.fighter_set_subclass_level(v_echo,7,jsonb_build_array(private.fighter_feature('fighter-echo-avatar','echo-avatar','subclass:fighter:echo-knight:avatar','Аватар эха','Действием перенесите чувства в эхо до 10 минут: вы слепы и глухи к собственным чувствам, видите и слышите через эхо; в этом режиме оно может удаляться до 1000 футов.')));
    perform private.fighter_set_subclass_level(v_echo,10,jsonb_build_array(
      private.fighter_feature('fighter-echo-martyr','shadow-martyr','subclass:fighter:echo-knight:martyr','Теневой мученик','Реакцией до броска атаки можно переместить эхо в 5 футов от атакуемого существа и перенаправить атаку в эхо. 1 использование, восстанавливается после короткого или долгого отдыха.'),
      private.fighter_resource('fighter-echo-martyr-pool','shadow-martyr','shadow_martyr','Теневой мученик','1'::jsonb,'{"triggers":["short_rest","long_rest"],"restore":"full"}'::jsonb,10,'REPLACE'),
      private.fighter_action('fighter-echo-martyr-use','shadow-martyr','shadow_martyr','Теневой мученик','reaction','[{"key":"shadow_martyr","amount":1}]'::jsonb)
    ));
    perform private.fighter_set_subclass_level(v_echo,15,jsonb_build_array(
      private.fighter_feature('fighter-echo-reclaim','reclaim-potential','subclass:fighter:echo-knight:reclaim','Возврат потенциала','Когда эхо уничтожено получением урона и у вас нет временных HP, можно получить 2к6 + модификатор Телосложения временных HP. Использований: модификатор Телосложения, минимум 1, за долгий отдых.'),
      private.fighter_resource('fighter-echo-reclaim-pool','reclaim-potential','reclaim_potential','Возврат потенциала',v_con_formula,'{"triggers":["long_rest"],"restore":"full"}'::jsonb,15,'REPLACE'),
      private.fighter_action('fighter-echo-reclaim-use','reclaim-potential','reclaim_potential','Возврат потенциала','triggered','[{"key":"reclaim_potential","amount":1}]'::jsonb)
    ));
    perform private.fighter_set_subclass_level(v_echo,18,jsonb_build_array(private.fighter_feature('fighter-echo-legion','legion-of-one','subclass:fighter:echo-knight:legion','Легион одного','Бонусным действием можно поддерживать одновременно два эха. Если при броске инициативы нет использований Воплощения ярости, восстанавливается 1; инициативный триггер выполняется по правилу, а не фиктивным состоянием движка.')));
  end if;

  -- Eldritch Knight 2024. Standard spell_slot_N identities are used so every cast
  -- still pays the same slot resource. The parser metadata records third-caster
  -- progression for the future multiclass slot aggregator.
  if v_eldritch is not null then
    update public.rule_templates set rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object('spellcasting_progression','one_third','spell_list','wizard','spellcasting_ability','intelligence') where id=v_eldritch;
    perform private.fighter_set_subclass_level(v_eldritch,3,jsonb_build_array(
      private.fighter_feature('fighter-ek-casting','eldritch-knight-spellcasting','subclass:fighter:eldritch-knight:spellcasting','Заклинания Мистического рыцаря','Интеллект — заклинательная характеристика. На 3 уровне подготовьте 3 заклинания Волшебника 1 уровня; при повышении уровня Воина, когда число подготовленных заклинаний растёт, выбирайте заклинания Волшебника доступного уровня. При каждом новом уровне Воина можно заменить одно подготовленное заклинание другим доступным заклинанием Волшебника. Подкласс использует обычные общие ячейки персонажа.'),
      private.fighter_resource('fighter-ek-slot1-l3','eldritch-knight-spellcasting','spell_slot_1','Ячейки 1 уровня','2'::jsonb,'{"triggers":["long_rest"],"restore":"full"}'::jsonb,3,'REPLACE')
    ));
    perform private.fighter_set_subclass_level(v_eldritch,4,jsonb_build_array(private.fighter_resource('fighter-ek-slot1-l4','eldritch-knight-spellcasting','spell_slot_1','Ячейки 1 уровня','3'::jsonb,'{"triggers":["long_rest"],"restore":"full"}'::jsonb,4,'REPLACE')));
    perform private.fighter_set_subclass_level(v_eldritch,7,jsonb_build_array(
      private.fighter_feature('fighter-ek-war-magic','war-magic','subclass:fighter:eldritch-knight:war-magic','Боевая магия','Во время действия Атака можно заменить одну из атак заговором с временем накладывания Действие. Это меняет состав действия Атака и не требует отдельного ресурса.'),
      private.fighter_resource('fighter-ek-slot1-l7','eldritch-knight-spellcasting','spell_slot_1','Ячейки 1 уровня','4'::jsonb,'{"triggers":["long_rest"],"restore":"full"}'::jsonb,7,'REPLACE'),
      private.fighter_resource('fighter-ek-slot2-l7','eldritch-knight-spellcasting','spell_slot_2','Ячейки 2 уровня','2'::jsonb,'{"triggers":["long_rest"],"restore":"full"}'::jsonb,7,'REPLACE')
    ));
    perform private.fighter_set_subclass_level(v_eldritch,10,jsonb_build_array(
      private.fighter_feature('fighter-ek-strike','eldritch-strike','subclass:fighter:eldritch-knight:eldritch-strike','Мистический удар','После попадания атакой оружием существо получает помеху на следующий спасбросок против вашего заклинания до конца следующего хода. Попадание и цель остаются сценическим правилом.'),
      private.fighter_resource('fighter-ek-slot2-l10','eldritch-knight-spellcasting','spell_slot_2','Ячейки 2 уровня','3'::jsonb,'{"triggers":["long_rest"],"restore":"full"}'::jsonb,10,'REPLACE')
    ));
    perform private.fighter_set_subclass_level(v_eldritch,13,jsonb_build_array(private.fighter_resource('fighter-ek-slot3-l13','eldritch-knight-spellcasting','spell_slot_3','Ячейки 3 уровня','2'::jsonb,'{"triggers":["long_rest"],"restore":"full"}'::jsonb,13,'REPLACE')));
    perform private.fighter_set_subclass_level(v_eldritch,15,jsonb_build_array(private.fighter_feature('fighter-ek-charge','arcane-charge','subclass:fighter:eldritch-knight:arcane-charge','Магический рывок','Когда используется Всплеск действий, можно телепортироваться на 30 футов в свободное видимое место до или после дополнительного действия. Отдельного заряда нет: ресурс уже списывается Всплеском действий.')));
    perform private.fighter_set_subclass_level(v_eldritch,16,jsonb_build_array(private.fighter_resource('fighter-ek-slot3-l16','eldritch-knight-spellcasting','spell_slot_3','Ячейки 3 уровня','3'::jsonb,'{"triggers":["long_rest"],"restore":"full"}'::jsonb,16,'REPLACE')));
    perform private.fighter_set_subclass_level(v_eldritch,18,jsonb_build_array(private.fighter_feature('fighter-ek-improved-war','improved-war-magic','subclass:fighter:eldritch-knight:improved-war-magic','Улучшенная боевая магия','Во время действия Атака можно заменить две атаки одним подготовленным заклинанием 1 или 2 уровня с временем накладывания Действие. Ячейка тратится обычным способом заклинания.')));
    perform private.fighter_set_subclass_level(v_eldritch,19,jsonb_build_array(private.fighter_resource('fighter-ek-slot4-l19','eldritch-knight-spellcasting','spell_slot_4','Ячейки 4 уровня','1'::jsonb,'{"triggers":["long_rest"],"restore":"full"}'::jsonb,19,'REPLACE')));
  end if;

  -- Psi Warrior: pool count and die size are distinct, just like Battle Master.
  if v_psi is not null then
    perform private.fighter_set_subclass_level(v_psi,3,jsonb_build_array(
      private.fighter_feature('fighter-psi-power','psionic-power','subclass:fighter:psi-warrior:power','Псионическая сила','Запас Псионических энергетических костей равен удвоенному бонусу мастерства. На 3 уровне кость — к6; её размер растёт с уровнями Воина. За долгий отдых возвращается весь запас. Один раз между короткими или долгими отдыхами бонусным действием можно восстановить 1 потраченную кость. Защитное поле, Псионический удар и Телекинетическое движение расходуют кость по своим триггерам.'),
      private.fighter_resource('fighter-psi-pool','psionic-power','psionic_energy','Псионические кости',v_two_pb_formula,'{"triggers":["long_rest"],"restore":"full"}'::jsonb,3,'REPLACE'),
      private.fighter_value('fighter-psi-die3','psionic-power','psionic_die','Псионическая кость','6'::jsonb,3,'REPLACE'),
      private.fighter_resource('fighter-psi-recovery','psionic-recovery','psionic_recovery','Восстановление пси-кости','1'::jsonb,'{"triggers":["short_rest","long_rest"],"restore":"full"}'::jsonb,3,'REPLACE'),
      private.fighter_action('fighter-psi-recover','psionic-recovery','psionic_recover','Восстановить пси-кость','bonus_action','[{"key":"psionic_recovery","amount":1}]'::jsonb,'[{"kind":"resource","key":"psionic_energy","operation":"RESTORE","amount":1}]'::jsonb),
      private.fighter_action('fighter-psi-spend','psionic-power','psionic_power','Использовать пси-кость','triggered','[{"key":"psionic_energy","amount":1}]'::jsonb)
    ));
    perform private.fighter_set_subclass_level(v_psi,5,jsonb_build_array(private.fighter_value('fighter-psi-die5','psionic-power','psionic_die','Псионическая кость','8'::jsonb,5,'REPLACE')));
    perform private.fighter_set_subclass_level(v_psi,7,jsonb_build_array(private.fighter_feature('fighter-psi-adept','telekinetic-adept','subclass:fighter:psi-warrior:adept','Телекинетический адепт','Псионический удар может дополнительно переместить цель после спасброска Силы; Пси-прыжок позволяет бонусным действием получить полёт на текущий ход. Сценические цели и перемещение не хранятся как флаги CE.')));
    perform private.fighter_set_subclass_level(v_psi,10,jsonb_build_array(private.fighter_feature('fighter-psi-mind','guarded-mind','subclass:fighter:psi-warrior:guarded-mind','Защищённый разум','Сопротивление психическому урону. Если в начале хода вы очарованы или напуганы, можно потратить Псионическую кость и завершить один из этих эффектов; начало хода и состояние эффекта проверяются за столом.')));
    perform private.fighter_set_subclass_level(v_psi,11,jsonb_build_array(private.fighter_value('fighter-psi-die11','psionic-power','psionic_die','Псионическая кость','10'::jsonb,11,'REPLACE')));
    perform private.fighter_set_subclass_level(v_psi,15,jsonb_build_array(private.fighter_feature('fighter-psi-bulwark','bulwark-of-force','subclass:fighter:psi-warrior:bulwark','Оплот силы','Бонусным действием можно укрыть себя и союзников телекинетической защитой по правилам способности. Ограничения бесплатного применения и повторного применения через Псионическую кость объясняются здесь, а не превращаются в фиктивный статус цели.')));
    perform private.fighter_set_subclass_level(v_psi,17,jsonb_build_array(private.fighter_value('fighter-psi-die17','psionic-power','psionic_die','Псионическая кость','12'::jsonb,17,'REPLACE')));
    perform private.fighter_set_subclass_level(v_psi,18,jsonb_build_array(private.fighter_feature('fighter-psi-master','telekinetic-master','subclass:fighter:psi-warrior:master','Мастер телекинеза','Получаете высшую телекинетическую технику подкласса, включая применение Telekinesis по правилам способности. Если повтор требует расхода Псионической кости, списывайте её из общего запаса; концентрацию и цели движок не симулирует.')));
  end if;

  -- Banneret (Forgotten Realms: Heroes of Faerûn). It extends Fighter resources;
  -- no duplicate pools are created.
  if v_banneret is not null then
    perform private.fighter_set_subclass_level(v_banneret,3,jsonb_build_array(
      private.fighter_feature('fighter-ban-envoy','knightly-envoy','subclass:fighter:banneret:envoy','Рыцарский посланник','Получаете социальные и языковые преимущества Баннерета по правилам подкласса.'),
      private.fighter_feature('fighter-ban-recovery','group-recovery','subclass:fighter:banneret:group-recovery','Групповое восстановление','Когда используете Второе дыхание, его лидерский эффект также помогает подходящим союзникам в пределах способности. Отдельный заряд не создаётся: расходуется то же Второе дыхание Воина.')
    ));
    perform private.fighter_set_subclass_level(v_banneret,7,jsonb_build_array(private.fighter_feature('fighter-ban-team','team-tactics','subclass:fighter:banneret:team-tactics','Командная тактика','Расширяет Групповое восстановление тактическим преимуществом для союзников. Условие конкретного союзника определяется сценой; дополнительного ресурса нет.')));
    perform private.fighter_set_subclass_level(v_banneret,10,jsonb_build_array(private.fighter_feature('fighter-ban-surge','rallying-surge','subclass:fighter:banneret:rallying-surge','Воодушевляющий всплеск','Когда тратите Всплеск действий, можете выбрать подходящих союзников в пределах способности; каждый из них может реакцией выполнить разрешённую атакующую или перемещающую опцию. Отдельный Всплеск не списывается — используется уже потраченный ресурс базового класса.')));
    perform private.fighter_set_subclass_level(v_banneret,15,jsonb_build_array(private.fighter_feature('fighter-ban-resilience','shared-resilience','subclass:fighter:banneret:shared-resilience','Общая стойкость','Позволяет расширить усиленное применение Неукротимого на союзника, провалившего спасбросок по правилам способности. Используется тот же ресурс Неукротимого; результат спасброска движок не угадывает.')));
    perform private.fighter_set_subclass_level(v_banneret,18,jsonb_build_array(private.fighter_feature('fighter-ban-command','inspiring-commander','subclass:fighter:banneret:commander','Вдохновляющий командир','Увеличивает охват Группового восстановления и Воодушевляющего всплеска и даёт Баннерету верхнюю защитную способность подкласса. Радиусы и квалификация союзников остаются правилами сцены, а базовые ресурсы продолжают считаться CE.')));
  end if;

  -- Rune Knight (Tasha). Independent runes are not collapsed into one fake pool.
  if v_rune is not null then
    perform private.fighter_set_subclass_level(v_rune,3,jsonb_build_array(
      private.fighter_feature('fighter-rune-might','giants-might','subclass:fighter:rune-knight:giants-might','Мощь великана','Бонусным действием на 1 минуту получите преимущества Мощи великана по правилам способности. Использований: бонус мастерства за долгий отдых. Размер, преимущество Силы и дополнительный урон — последствия формы, а не отдельный серверный режим.'),
      private.fighter_resource('fighter-rune-might-pool','giants-might','giants_might','Мощь великана',v_pb_formula,'{"triggers":["long_rest"],"restore":"full"}'::jsonb,3,'REPLACE'),
      private.fighter_action('fighter-rune-might-use','giants-might','giants_might','Мощь великана','bonus_action','[{"key":"giants_might","amount":1}]'::jsonb),
      private.fighter_feature('fighter-rune-carver','rune-carver','subclass:fighter:rune-knight:runes','Рунный резчик','Изучите руны из списка подкласса и наносите их на подходящее снаряжение после долгого отдыха. Активируемая сила каждой руны имеет собственное использование; MEGANOT не объединяет разные руны в один общий выдуманный запас.')
    ));
    perform private.fighter_set_subclass_level(v_rune,7,jsonb_build_array(
      private.fighter_feature('fighter-rune-shield','runic-shield','subclass:fighter:rune-knight:runic-shield','Рунный щит','Реакцией после попадания атакой по существу в пределах способности можно заставить атакующего перебросить к20 и использовать новый результат. Использований: бонус мастерства за долгий отдых.'),
      private.fighter_resource('fighter-rune-shield-pool','runic-shield','runic_shield','Рунный щит',v_pb_formula,'{"triggers":["long_rest"],"restore":"full"}'::jsonb,7,'REPLACE'),
      private.fighter_action('fighter-rune-shield-use','runic-shield','runic_shield','Рунный щит','reaction','[{"key":"runic_shield","amount":1}]'::jsonb),
      private.fighter_feature('fighter-rune-more7','rune-carver','subclass:fighter:rune-knight:runes','Дополнительная руна','Изучите ещё одну руну; открываются руны, требующие 7 уровня Воина.')
    ));
    perform private.fighter_set_subclass_level(v_rune,10,jsonb_build_array(private.fighter_feature('fighter-rune-stature','great-stature','subclass:fighter:rune-knight:stature','Великий рост','Рост увеличивается по правилу способности; дополнительный урон Мощи великана становится 1к8. Это изменение результата способности, не новый ресурс.')));
    perform private.fighter_set_subclass_level(v_rune,15,jsonb_build_array(private.fighter_feature('fighter-rune-master','master-of-runes','subclass:fighter:rune-knight:master','Мастер рун','Активируемые руны можно использовать чаще между отдыхами по правилу способности. Каждая руна остаётся отдельной механической идентичностью; не создаётся общий ресурс «руны».')));
    perform private.fighter_set_subclass_level(v_rune,18,jsonb_build_array(private.fighter_feature('fighter-rune-juggernaut','runic-juggernaut','subclass:fighter:rune-knight:juggernaut','Рунный исполин','Мощь великана усиливается: размер и досягаемость растут по правилу способности, а дополнительный урон становится 1к10. Запас Мощи великана остаётся тем же ресурсом.')));
  end if;

  -- Samurai (Xanathar).
  if v_samurai is not null then
    perform private.fighter_set_subclass_level(v_samurai,3,jsonb_build_array(
      private.fighter_feature('fighter-sam-spirit','fighting-spirit','subclass:fighter:samurai:fighting-spirit','Боевой дух','Бонусным действием получите преимущество на атаки оружием до конца текущего хода и временные HP по уровню способности. 3 использования за долгий отдых.'),
      private.fighter_resource('fighter-sam-spirit-pool','fighting-spirit','fighting_spirit','Боевой дух','3'::jsonb,'{"triggers":["long_rest"],"restore":"full"}'::jsonb,3,'REPLACE'),
      private.fighter_action('fighter-sam-spirit-use','fighting-spirit','fighting_spirit','Боевой дух','bonus_action','[{"key":"fighting_spirit","amount":1}]'::jsonb)
    ));
    perform private.fighter_set_subclass_level(v_samurai,7,jsonb_build_array(private.fighter_feature('fighter-sam-court','elegant-courtier','subclass:fighter:samurai:courtier','Элегантный придворный','К проверкам Харизмы (Убеждение) добавляется модификатор Мудрости. Также получаете владение спасбросками Мудрости; если оно уже есть, применяется замена по правилу способности.')));
    perform private.fighter_set_subclass_level(v_samurai,10,jsonb_build_array(private.fighter_feature('fighter-sam-tireless','tireless-spirit','subclass:fighter:samurai:tireless','Неутомимый дух','Если при броске инициативы не осталось использований Боевого духа, восстановите 1. Инициатива пока не является авторитетным событием CE, поэтому восстановление выполняется по правилу.')));
    perform private.fighter_set_subclass_level(v_samurai,15,jsonb_build_array(private.fighter_feature('fighter-sam-rapid','rapid-strike','subclass:fighter:samurai:rapid-strike','Стремительный удар','Один раз за свой ход, если атака оружием совершается с преимуществом, можно отказаться от преимущества одной атаки и вместо этого сделать дополнительную атаку тем же действием. Ходы и конкретные атаки движок не симулирует.')));
    perform private.fighter_set_subclass_level(v_samurai,18,jsonb_build_array(
      private.fighter_feature('fighter-sam-death','strength-before-death','subclass:fighter:samurai:strength-before-death','Сила перед смертью','Реакцией при падении до 0 HP можно прервать текущий ход и немедленно совершить полноценный дополнительный ход; после него персонаж снова получает последствия исходного урона. 1 использование за долгий отдых.'),
      private.fighter_resource('fighter-sam-death-pool','strength-before-death','strength_before_death','Сила перед смертью','1'::jsonb,'{"triggers":["long_rest"],"restore":"full"}'::jsonb,18,'REPLACE'),
      private.fighter_action('fighter-sam-death-use','strength-before-death','strength_before_death','Сила перед смертью','reaction','[{"key":"strength_before_death","amount":1}]'::jsonb)
    ));
  end if;

  update public.rule_templates set updated_at=now()
  where id in (v_arcane_archer,v_battle_master,v_cavalier,v_champion,v_echo,v_eldritch,v_psi,v_banneret,v_rune,v_samurai);
end;
$$;

create or replace function private.apply_fighter_precision_pack_after_campaign()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform private.apply_fighter_precision_pack(new.id);
  return new;
end;
$$;

drop trigger if exists zzzzzz_campaigns_fighter_precision_pack on public.campaigns;
create trigger zzzzzz_campaigns_fighter_precision_pack
after insert on public.campaigns
for each row execute function private.apply_fighter_precision_pack_after_campaign();

do $$ declare r record; begin
  for r in select id from public.campaigns loop
    perform private.apply_fighter_precision_pack(r.id);
  end loop;
end $$;

commit;
