begin;

-- Shared helper for built-in class/subclass spell access. The rule catalog stores
-- canonical spell identity + CE casting methods; prose stays in author fields.
create or replace function private.builtin_class_spell_mechanic(
  p_id text,
  p_source_key text,
  p_slug text,
  p_name text,
  p_level integer,
  p_variant text,
  p_kind text default 'class_feature',
  p_cast_in_wild_shape boolean default false
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_method jsonb;
  v_options jsonb;
begin
  if p_level < 0 or p_level > 9 then raise exception 'Unsupported spell level'; end if;

  if p_level = 0 then
    v_method := jsonb_build_object(
      'key', p_variant,
      'kind', p_kind,
      'ability', 'wisdom',
      'requiresPrepared', false
    );
  else
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'key', 'slot-' || s::text,
        'castLevel', s,
        'costs', jsonb_build_array(jsonb_build_object('key','spell_slot_' || s::text,'amount',1))
      ) order by s
    ), '[]'::jsonb)
    into v_options
    from generate_series(p_level, 9) s;

    v_method := jsonb_build_object(
      'key', p_variant,
      'kind', p_kind,
      'ability', 'wisdom',
      'requiresPrepared', false,
      'resourceOptions', v_options
    );
  end if;

  return jsonb_build_object(
    'id', p_id,
    'type', 'spell',
    'sourceKey', p_source_key,
    'variantKey', p_variant,
    'key', 'spell:' || p_slug,
    'payload', jsonb_build_object(
      'spell', jsonb_build_object('name',p_name,'level',p_level),
      'preparation', jsonb_build_object('mode','always_prepared'),
      'methods', jsonb_build_array(v_method),
      'rules', jsonb_build_object('castInWildShape',p_cast_in_wild_shape)
    )
  );
end;
$$;

-- 2024 full-caster slot table emitted as native CE resources. Mutable used/current
-- state still lives in character runtime; the class parser owns capacity.
create or replace function private.druid_slot_mechanics(p_level integer)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_slots jsonb;
begin
  v_slots := case greatest(1,least(20,p_level))
    when 1 then '{"1":2}'::jsonb
    when 2 then '{"1":3}'::jsonb
    when 3 then '{"1":4,"2":2}'::jsonb
    when 4 then '{"1":4,"2":3}'::jsonb
    when 5 then '{"1":4,"2":3,"3":2}'::jsonb
    when 6 then '{"1":4,"2":3,"3":3}'::jsonb
    when 7 then '{"1":4,"2":3,"3":3,"4":1}'::jsonb
    when 8 then '{"1":4,"2":3,"3":3,"4":2}'::jsonb
    when 9 then '{"1":4,"2":3,"3":3,"4":3,"5":1}'::jsonb
    when 10 then '{"1":4,"2":3,"3":3,"4":3,"5":2}'::jsonb
    when 11 then '{"1":4,"2":3,"3":3,"4":3,"5":2,"6":1}'::jsonb
    when 12 then '{"1":4,"2":3,"3":3,"4":3,"5":2,"6":1}'::jsonb
    when 13 then '{"1":4,"2":3,"3":3,"4":3,"5":2,"6":1,"7":1}'::jsonb
    when 14 then '{"1":4,"2":3,"3":3,"4":3,"5":2,"6":1,"7":1}'::jsonb
    when 15 then '{"1":4,"2":3,"3":3,"4":3,"5":2,"6":1,"7":1,"8":1}'::jsonb
    when 16 then '{"1":4,"2":3,"3":3,"4":3,"5":2,"6":1,"7":1,"8":1}'::jsonb
    when 17 then '{"1":4,"2":3,"3":3,"4":3,"5":2,"6":1,"7":1,"8":1,"9":1}'::jsonb
    when 18 then '{"1":4,"2":3,"3":3,"4":3,"5":3,"6":1,"7":1,"8":1,"9":1}'::jsonb
    when 19 then '{"1":4,"2":3,"3":3,"4":3,"5":3,"6":2,"7":1,"8":1,"9":1}'::jsonb
    else '{"1":4,"2":3,"3":3,"4":3,"5":3,"6":2,"7":2,"8":1,"9":1}'::jsonb
  end;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id','druid-slot-' || e.key || '-l' || p_level::text,
      'type','resource',
      'sourceKey','spellcasting',
      'grantOperation','REPLACE',
      'priority',p_level,
      'key','spell_slot_' || e.key,
      'label','Ячейки ' || e.key || ' уровня',
      'max',(e.value #>> '{}')::integer,
      'recharge',jsonb_build_array('long_rest'),
      'restore','full',
      'initial','full',
      'presentation',jsonb_build_object('tone','violet','icon','✦','display','pips','priority',80)
    ) order by (e.key)::integer)
    from jsonb_each(v_slots) e
  ), '[]'::jsonb);
end;
$$;

create or replace function private.install_builtin_druid_base_v2(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_druid uuid;
  v_level integer;
  v_clean jsonb;
begin
  select id into v_druid
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:druid'
    and is_builtin
  order by version desc
  limit 1;

  if v_druid is null then
    perform private.install_builtin_rule_catalog(p_campaign_id);
    select id into v_druid
    from public.rule_templates
    where campaign_id=p_campaign_id and kind='class' and catalog_key='class:druid' and is_builtin
    order by version desc limit 1;
  end if;
  if v_druid is null then raise exception 'Built-in Druid was not installed'; end if;

  update public.rule_templates t
  set mechanics = $base$[
    {"id":"druid-save-int","type":"grant","sourceKey":"saving-throw-intelligence","target":"proficiency","key":"savingThrow:intelligence","payload":{"rank":1,"label":"Спасбросок: Интеллект"}},
    {"id":"druid-save-wis","type":"grant","sourceKey":"saving-throw-wisdom","target":"proficiency","key":"savingThrow:wisdom","payload":{"rank":1,"label":"Спасбросок: Мудрость"}},
    {"id":"druid-simple-weapons","type":"grant","sourceKey":"simple-weapons","target":"proficiency","key":"weapon:simple","payload":{"rank":1,"label":"Простое оружие"}},
    {"id":"druid-herbalism","type":"grant","sourceKey":"herbalism-kit","target":"proficiency","key":"tool:herbalism-kit","payload":{"rank":1,"label":"Набор травника"}},
    {"id":"druid-light-armor","type":"grant","sourceKey":"light-armor","target":"proficiency","key":"armor:light","payload":{"rank":1,"label":"Лёгкая броня"}},
    {"id":"druid-shields","type":"grant","sourceKey":"shields","target":"proficiency","key":"armor:shield","payload":{"rank":1,"label":"Щиты"}},
    {"id":"druid-druidic","type":"grant","sourceKey":"druidic","target":"language","key":"druidic","payload":{"label":"Друидический"}},
    {"id":"druid-druidic-rules","type":"grant","sourceKey":"druidic","target":"feature","key":"class:druid:druidic","payload":{"label":"Друидический","description":"Тайный язык друидов. Вместе с ним друид постоянно держит готовым заклинание «Разговор с животными».","mechanic":{"alwaysPreparedSpell":"speak-with-animals"}}},
    {"id":"druid-spellcasting","type":"grant","sourceKey":"spellcasting","target":"feature","key":"class:druid:spellcasting","payload":{"label":"Заклинания друида","description":"Полный подготовленный заклинатель на Мудрости. Ячейки теперь создаёт сам парсер класса, а не запасная логика листа.","mechanic":{"ability":"wisdom","progression":"full","list":"druid"}}},
    {"id":"druid-primal-order","type":"grant","sourceKey":"primal-order","target":"feature","key":"class:druid:primal-order","payload":{"label":"Первобытный путь","description":"На 1 уровне выбирается направление подготовки: Маг или Страж."}}
  ]$base$::jsonb || jsonb_build_array(
    private.builtin_class_spell_mechanic('druid-druidic-speak-with-animals','druidic','speak-with-animals','Разговор с животными',1,'druidic-always','class_feature',false)
  ),
  choices = $choices$[
    {
      "key":"druid-skills","label":"Навыки друида","target":"proficiency","count":2,
      "options":["skill:arcana","skill:animal_handling","skill:insight","skill:medicine","skill:nature","skill:perception","skill:religion","skill:survival"],
      "option_labels":{"skill:arcana":"Магия","skill:animal_handling":"Уход за животными","skill:insight":"Проницательность","skill:medicine":"Медицина","skill:nature":"Природа","skill:perception":"Восприятие","skill:religion":"Религия","skill:survival":"Выживание"}
    },
    {
      "key":"druid-primal-order","label":"Первобытный путь","target":"trait","count":1,
      "options":["primal-order:magician","primal-order:warden"],
      "option_labels":{"primal-order:magician":"Маг","primal-order:warden":"Страж"},
      "option_mechanics":{
        "primal-order:magician":[
          {"id":"druid-order-magician-detail","type":"grant","target":"feature","key":"class:druid:primal-order:magician","payload":{"label":"Первобытный путь: Маг","description":"Дополнительный заговор друида и усиленная работа с Магией или Природой.","mechanic":{"extraDruidCantrips":1,"skillChoice":["arcana","nature"],"bonus":{"reference":"abilities.wisdom.modifier","minimum":1}}}}
        ],
        "primal-order:warden":[
          {"id":"druid-order-warden-detail","type":"grant","target":"feature","key":"class:druid:primal-order:warden","payload":{"label":"Первобытный путь: Страж","description":"Боевое направление друида: воинское оружие и средняя броня."}},
          {"id":"druid-order-warden-martial","type":"grant","target":"proficiency","key":"weapon:martial","payload":{"rank":1,"label":"Воинское оружие"}},
          {"id":"druid-order-warden-medium","type":"grant","target":"proficiency","key":"armor:medium","payload":{"rank":1,"label":"Средняя броня"}}
        ]
      }
    }
  ]$choices$::jsonb,
  catalog_revision='2024-base+2014-wild-shape@2',
  mechanical_summary='К8, Мудрость, полный заклинатель. База 2024; Дикая форма целиком 2014. Парсер выдаёт владения, спасброски, классовые ресурсы, ячейки и способности по уровню как CE contributions.',
  author_description=$voss$Друид — это полный заклинатель, который почему-то ещё и умеет решить, что человеческое тело сегодня ему мешает. В основе всё просто: Мудрость ведёт магию, природа даёт инструменты, а класс постепенно наращивает способы тратить одни ресурсы ради других. Сложность начинается там, где игрок забывает, какая именно часть его плана сейчас медведь.$voss$,
  author_comment=$voss$Я работал с друидами достаточно, чтобы уважать их универсальность и не спрашивать, откуда в кармане кора. Если способность расходует форму, ячейку или отдельный запас — считайте это вслух. Природа терпелива. Бухгалтерия нет.$voss$,
  rules_meta = t.rules_meta || jsonb_build_object(
    'mechanics_version',2,
    'parser_owns_spell_slots',true,
    'catalog_policy','latest_wins_with_feature_overrides',
    'base_revision','2024',
    'feature_overrides',jsonb_build_object('wild_shape','2014'),
    'excluded_features',jsonb_build_array('wild_shape@2024'),
    'wild_shape_policy',jsonb_build_object(
      'revision','2014','core_only',true,'uses',2,'economy','action',
      'recharge',jsonb_build_array('short_rest','long_rest'),
      'uses_scale_with_2024_levels',false,'beast_hit_points','beast_stat_block'
    )
  ),
  updated_at=now()
  where t.id=v_druid;

  -- Give every existing class feature a stable GM-switchable source.
  update public.rule_template_levels l
  set mechanics = coalesce((
    select jsonb_agg(
      m || jsonb_build_object('sourceKey', case
        when m->>'id' like 'druid-wild-shape-%' then 'wild-shape'
        when m->>'id'='druid-wild-companion' then 'wild-companion'
        when m->>'id'='druid-subclass-unlock' then 'subclass'
        when m->>'id' like 'druid-asi-%' then replace(m->>'id','druid-','')
        when m->>'id' in ('druid-elemental-fury','druid-improved-elemental-fury') then 'elemental-fury'
        when m->>'id'='druid-wild-resurgence' then 'wild-resurgence'
        when m->>'id'='druid-beast-spells' then 'beast-spells'
        when m->>'id'='druid-epic-boon' then 'epic-boon'
        when m->>'id'='druid-archdruid' then 'archdruid'
        else coalesce(m->>'sourceKey','mechanic:' || coalesce(m->>'id','unknown'))
      end)
      order by ord
    )
    from jsonb_array_elements(l.mechanics) with ordinality a(m,ord)
    where coalesce(m->>'id','') not like 'druid-slot-%'
  ), '[]'::jsonb)
  where l.template_id=v_druid;

  -- Make the complex upper-level rules structured data instead of prose-only flags.
  update public.rule_template_levels
  set mechanics = $l5$[
    {"id":"druid-wild-resurgence","type":"grant","sourceKey":"wild-resurgence","target":"feature","key":"class:druid:wild-resurgence","payload":{"label":"Дикое возрождение","description":"Когда Дикая форма закончилась, магическую энергию можно перевести обратно в форму; обратный обмен ограничен.","mechanic":{"slotToWildShape":{"whenWildShapeCurrent":0,"spendAnySpellSlot":1,"restoreWildShape":1,"frequency":"once_per_turn"},"wildShapeToSlot":{"spendWildShape":1,"restoreSpellSlotLevel":1,"usesPerLongRest":1}}}}
  ]$l5$::jsonb
  where template_id=v_druid and level=5;

  update public.rule_template_levels
  set mechanics = $l7$[
    {"id":"druid-elemental-fury","type":"grant","sourceKey":"elemental-fury","target":"feature","key":"class:druid:elemental-fury","payload":{"label":"Стихийная ярость","description":"Выбранное направление усиливает либо заговоры, либо собственные удары друида и его звериной формы."}}
  ]$l7$::jsonb,
  choices = $l7c$[
    {
      "key":"druid-elemental-fury","label":"Стихийная ярость","target":"trait","count":1,
      "options":["elemental-fury:potent-spellcasting","elemental-fury:primal-strike"],
      "option_labels":{"elemental-fury:potent-spellcasting":"Могущественные заговоры","elemental-fury:primal-strike":"Первобытный удар"},
      "option_mechanics":{
        "elemental-fury:potent-spellcasting":[{"id":"druid-potent-spellcasting","type":"grant","target":"feature","key":"class:druid:elemental-fury:potent-spellcasting","payload":{"label":"Могущественные заговоры","description":"К урону каждого друидского заговора добавляется модификатор Мудрости.","mechanic":{"spellFilter":{"class":"druid","level":0},"damageBonus":{"reference":"abilities.wisdom.modifier"}}}}],
        "elemental-fury:primal-strike":[{"id":"druid-primal-strike","type":"grant","target":"feature","key":"class:druid:elemental-fury:primal-strike","payload":{"label":"Первобытный удар","description":"Раз за ход попадание оружием или атакой звериной формы получает дополнительный стихийный урон.","mechanic":{"frequency":"once_per_turn","trigger":"weapon_or_beast_form_hit","damage":{"dice":"1d8","chooseType":["cold","fire","lightning","thunder"]}}}}]
      },
      "option_mechanics_by_level":{
        "elemental-fury:potent-spellcasting":{"15":[{"id":"druid-potent-spellcasting-improved","type":"grant","grantOperation":"REPLACE","priority":15,"target":"feature","key":"class:druid:elemental-fury:potent-spellcasting","payload":{"label":"Могущественные заговоры · улучшение","description":"Дальнобойные друидские заговоры получают ещё 300 футов дальности; бонус Мудрости к урону сохраняется.","mechanic":{"spellFilter":{"class":"druid","level":0,"minimumRangeFeet":10},"damageBonus":{"reference":"abilities.wisdom.modifier"},"rangeBonusFeet":300}}}]},
        "elemental-fury:primal-strike":{"15":[{"id":"druid-primal-strike-improved","type":"grant","grantOperation":"REPLACE","priority":15,"target":"feature","key":"class:druid:elemental-fury:primal-strike","payload":{"label":"Первобытный удар · улучшение","description":"Дополнительный стихийный урон становится 2к8.","mechanic":{"frequency":"once_per_turn","trigger":"weapon_or_beast_form_hit","damage":{"dice":"2d8","chooseType":["cold","fire","lightning","thunder"]}}}}]}
      }
    }
  ]$l7c$::jsonb
  where template_id=v_druid and level=7;

  update public.rule_template_levels
  set mechanics = $l15$[
    {"id":"druid-improved-elemental-fury","type":"grant","sourceKey":"elemental-fury","target":"feature","key":"class:druid:improved-elemental-fury","payload":{"label":"Улучшенная стихийная ярость","description":"На 15 уровне автоматически улучшается тот вариант Стихийной ярости, который был выбран на 7 уровне.","mechanic":{"usesPersistentChoice":"druid-elemental-fury"}}}
  ]$l15$::jsonb
  where template_id=v_druid and level=15;

  update public.rule_template_levels
  set mechanics = $l18$[
    {"id":"druid-beast-spells","type":"grant","sourceKey":"beast-spells","target":"feature","key":"class:druid:beast-spells","payload":{"label":"Заклинания зверя","description":"В Дикой форме можно творить заклинания; исключение — материальные компоненты с указанной стоимостью или расходуемые компоненты.","mechanic":{"while":"wild_shape","allowSpellcasting":true,"blockedMaterial":{"hasCost":true,"consumed":true}}}}
  ]$l18$::jsonb
  where template_id=v_druid and level=18;

  update public.rule_template_levels
  set mechanics = $l20$[
    {"id":"druid-archdruid","type":"grant","sourceKey":"archdruid","target":"feature","key":"class:druid:archdruid","payload":{"label":"Архидруид","description":"Верхняя способность базы 2024 работает поверх нашей Дикой формы 2014, не меняя её обычные два использования.","mechanic":{"initiativeRecovery":{"whenWildShapeCurrent":0,"restoreWildShape":1},"wildShapeToSpellSlot":{"spellLevelsPerUse":2,"usesPerLongRest":1},"longevity":{"calendarYearsPerAgingYear":10},"wildShapeBaseUsesRemain":2}}}
  ]$l20$::jsonb
  where template_id=v_druid and level=20;

  -- Ensure a row for every class level, then add parser-owned slot definitions.
  for v_level in 1..20 loop
    insert into public.rule_template_levels(template_id,level,mechanics,choices)
    values(v_druid,v_level,'[]'::jsonb,'[]'::jsonb)
    on conflict(template_id,level) do nothing;

    select coalesce(jsonb_agg(m order by ord),'[]'::jsonb) into v_clean
    from jsonb_array_elements((select mechanics from public.rule_template_levels where template_id=v_druid and level=v_level)) with ordinality a(m,ord)
    where coalesce(m->>'id','') not like 'druid-slot-%';

    update public.rule_template_levels
    set mechanics = coalesce(v_clean,'[]'::jsonb) || private.druid_slot_mechanics(v_level)
    where template_id=v_druid and level=v_level;
  end loop;
end;
$$;

create or replace function private.install_builtin_druid_base_v2_after_campaign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.install_builtin_druid_base_v2(new.id);
  return new;
end;
$$;

drop trigger if exists campaigns_install_druid_base_v2 on public.campaigns;
create trigger campaigns_install_druid_base_v2
after insert on public.campaigns
for each row execute function private.install_builtin_druid_base_v2_after_campaign();

do $$
declare v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.install_builtin_druid_base_v2(v_campaign.id);
  end loop;
end;
$$;

commit;
