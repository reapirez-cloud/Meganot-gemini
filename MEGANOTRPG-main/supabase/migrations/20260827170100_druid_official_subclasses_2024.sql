begin;

create or replace function private.builtin_spell_set(
  p_source_key text,
  p_variant_prefix text,
  p_specs jsonb,
  p_kind text default 'subclass_spell',
  p_cast_in_wild_shape boolean default false
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_result jsonb := '[]'::jsonb;
  v_spell jsonb;
  v_slug text;
  v_name text;
  v_level integer;
  v_ord integer := 0;
begin
  for v_spell in select value from jsonb_array_elements(coalesce(p_specs,'[]'::jsonb)) loop
    v_ord := v_ord + 1;
    v_slug := v_spell->>'slug';
    v_name := v_spell->>'name';
    v_level := coalesce((v_spell->>'level')::integer,0);
    v_result := v_result || jsonb_build_array(private.builtin_class_spell_mechanic(
      p_variant_prefix || '-' || v_ord::text,
      p_source_key,
      v_slug,
      v_name,
      v_level,
      p_variant_prefix || ':' || v_slug,
      p_kind,
      p_cast_in_wild_shape
    ));
  end loop;
  return v_result;
end;
$$;

create or replace function private.install_builtin_druid_subclasses_2024(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_druid uuid;
  v_land uuid;
  v_moon uuid;
  v_sea uuid;
  v_stars uuid;
  v_land_choices jsonb;
  v_star_guiding jsonb;
begin
  select id into v_druid
  from public.rule_templates
  where campaign_id=p_campaign_id and kind='class' and catalog_key='class:druid' and is_builtin
  order by version desc limit 1;
  if v_druid is null then
    perform private.install_builtin_druid_base_v2(p_campaign_id);
    select id into v_druid from public.rule_templates
    where campaign_id=p_campaign_id and kind='class' and catalog_key='class:druid' and is_builtin
    order by version desc limit 1;
  end if;
  if v_druid is null then raise exception 'Built-in Druid was not installed'; end if;

  -- LAND ---------------------------------------------------------------------
  v_land_choices := jsonb_build_array(jsonb_build_object(
    'key','druid-land-type',
    'label','Тип земли',
    'target','trait',
    'count',1,
    'options',jsonb_build_array('land:arid','land:polar','land:temperate','land:tropical'),
    'option_labels',jsonb_build_object(
      'land:arid','Засушливая','land:polar','Полярная','land:temperate','Умеренная','land:tropical','Тропическая'
    ),
    'option_mechanics',jsonb_build_object(
      'land:arid', private.builtin_spell_set('land-spells','land-arid-l3','[{"slug":"blur","name":"Размытие","level":2},{"slug":"burning-hands","name":"Огненные ладони","level":1},{"slug":"fire-bolt","name":"Огненный снаряд","level":0}]'::jsonb),
      'land:polar', private.builtin_spell_set('land-spells','land-polar-l3','[{"slug":"fog-cloud","name":"Облако тумана","level":1},{"slug":"hold-person","name":"Удержание личности","level":2},{"slug":"ray-of-frost","name":"Луч холода","level":0}]'::jsonb),
      'land:temperate', private.builtin_spell_set('land-spells','land-temperate-l3','[{"slug":"misty-step","name":"Туманный шаг","level":2},{"slug":"shocking-grasp","name":"Электрошок","level":0},{"slug":"sleep","name":"Сон","level":1}]'::jsonb),
      'land:tropical', private.builtin_spell_set('land-spells','land-tropical-l3','[{"slug":"acid-splash","name":"Брызги кислоты","level":0},{"slug":"ray-of-sickness","name":"Луч болезни","level":1},{"slug":"web","name":"Паутина","level":2}]'::jsonb)
    ),
    'option_mechanics_by_level',jsonb_build_object(
      'land:arid',jsonb_build_object(
        '5',private.builtin_spell_set('land-spells','land-arid-l5','[{"slug":"fireball","name":"Огненный шар","level":3}]'::jsonb),
        '7',private.builtin_spell_set('land-spells','land-arid-l7','[{"slug":"blight","name":"Усыхание","level":4}]'::jsonb),
        '9',private.builtin_spell_set('land-spells','land-arid-l9','[{"slug":"wall-of-stone","name":"Каменная стена","level":5}]'::jsonb),
        '10',jsonb_build_array(jsonb_build_object('id','land-arid-ward','type','grant','target','resistance','key','fire','payload',jsonb_build_object('label','Сопротивление огню')))
      ),
      'land:polar',jsonb_build_object(
        '5',private.builtin_spell_set('land-spells','land-polar-l5','[{"slug":"sleet-storm","name":"Мокрый снег","level":3}]'::jsonb),
        '7',private.builtin_spell_set('land-spells','land-polar-l7','[{"slug":"ice-storm","name":"Ледяная буря","level":4}]'::jsonb),
        '9',private.builtin_spell_set('land-spells','land-polar-l9','[{"slug":"cone-of-cold","name":"Конус холода","level":5}]'::jsonb),
        '10',jsonb_build_array(jsonb_build_object('id','land-polar-ward','type','grant','target','resistance','key','cold','payload',jsonb_build_object('label','Сопротивление холоду')))
      ),
      'land:temperate',jsonb_build_object(
        '5',private.builtin_spell_set('land-spells','land-temperate-l5','[{"slug":"lightning-bolt","name":"Молния","level":3}]'::jsonb),
        '7',private.builtin_spell_set('land-spells','land-temperate-l7','[{"slug":"freedom-of-movement","name":"Свобода перемещения","level":4}]'::jsonb),
        '9',private.builtin_spell_set('land-spells','land-temperate-l9','[{"slug":"tree-stride","name":"Переход через деревья","level":5}]'::jsonb),
        '10',jsonb_build_array(jsonb_build_object('id','land-temperate-ward','type','grant','target','resistance','key','lightning','payload',jsonb_build_object('label','Сопротивление электричеству')))
      ),
      'land:tropical',jsonb_build_object(
        '5',private.builtin_spell_set('land-spells','land-tropical-l5','[{"slug":"stinking-cloud","name":"Зловонное облако","level":3}]'::jsonb),
        '7',private.builtin_spell_set('land-spells','land-tropical-l7','[{"slug":"polymorph","name":"Превращение","level":4}]'::jsonb),
        '9',private.builtin_spell_set('land-spells','land-tropical-l9','[{"slug":"insect-plague","name":"Нашествие насекомых","level":5}]'::jsonb),
        '10',jsonb_build_array(jsonb_build_object('id','land-tropical-ward','type','grant','target','resistance','key','poison','payload',jsonb_build_object('label','Сопротивление яду')))
      )
    )
  ));

  insert into public.rule_templates(
    campaign_id,kind,slug,name,description,version,mechanics,choices,parent_template_id,unlock_level,
    catalog_key,catalog_revision,source_kind,source_label,is_builtin,mechanical_summary,
    author_description,author_comment,rules_meta,created_by,is_active
  ) values (
    p_campaign_id,'subclass','druid-circle-land','Круг Земли','Официальный круг друида 2024.',1,'[]'::jsonb,v_land_choices,v_druid,3,
    'subclass:druid:land','2024@1','official','Player''s Handbook 2024',true,
    'Меняемый после долгого отдыха набор круговых заклинаний, Land’s Aid, Natural Recovery, Nature’s Ward и Nature’s Sanctuary.',
    $voss$Круг Земли — для друида, который предпочитает готовиться к местности, а не жаловаться на неё. После отдыха он настраивает круг на один тип земли, получает соответствующий набор магии и дальше постепенно превращает выбранную среду в защиту для себя и группы.$voss$,
    $voss$Не путайте «землю» с родиной. Сегодня полярная, завтра тропическая — если после сна вы проснулись с правильными чарами, спорить с географией уже поздно.$voss$,
    jsonb_build_object('base_class','class:druid','revision','2024','persistent_choice','druid-land-type','choice_refresh','long_rest'),null,true
  )
  on conflict(campaign_id,kind,slug,version) do update set
    name=excluded.name,description=excluded.description,mechanics=excluded.mechanics,choices=excluded.choices,
    parent_template_id=excluded.parent_template_id,unlock_level=excluded.unlock_level,catalog_key=excluded.catalog_key,
    catalog_revision=excluded.catalog_revision,source_kind=excluded.source_kind,source_label=excluded.source_label,
    is_builtin=true,mechanical_summary=excluded.mechanical_summary,author_description=excluded.author_description,
    author_comment=excluded.author_comment,rules_meta=excluded.rules_meta,is_active=true,updated_at=now()
  returning id into v_land;

  delete from public.rule_template_levels where template_id=v_land;
  insert into public.rule_template_levels(template_id,level,mechanics,choices) values
  (v_land,3,$land3$[
    {"id":"land-spells-feature","type":"grant","sourceKey":"land-spells","target":"feature","key":"subclass:druid:land:spells","payload":{"label":"Заклинания Круга Земли","description":"После долгого отдыха выбирается один из четырёх типов земли. Выбранный вариант остаётся одним сохранённым выбором, а новые заклинания того же варианта приходят автоматически на 5, 7 и 9 уровнях.","mechanic":{"choice":"druid-land-type","refresh":"long_rest","alwaysPrepared":true}}},
    {"id":"lands-aid-action","type":"action","sourceKey":"lands-aid","key":"lands_aid","label":"Помощь земли","economy":"action","range":{"kind":"ranged","normal":60,"unit":"ft"},"damage":[{"key":"necrotic","damageType":"necrotic","count":2,"sides":6}],"resourceKey":"wild_shape","resourceCost":1,"tags":["unique","class","save:constitution","half-on-save","healing:2d6"]},
    {"id":"lands-aid-rules","type":"grant","sourceKey":"lands-aid","target":"feature","key":"subclass:druid:land:lands-aid","payload":{"label":"Помощь земли","description":"Действием тратит Дикая форма: точка в 60 футах, сфера радиусом 10 футов. Выбранные цели проходят спас Телосложения против Сл заклинаний: 2к6 некротического урона, при успехе половина. Одно выбранное существо одновременно лечится на 2к6.","mechanic":{"cost":{"resource":"wild_shape","amount":1},"area":{"shape":"sphere","radiusFeet":10,"rangeFeet":60},"save":{"ability":"constitution","dc":"spell","success":"half_damage"},"damage":{"dice":"2d6","type":"necrotic"},"healing":{"dice":"2d6","targets":1}}}}
  ]$land3$::jsonb,'[]'::jsonb),
  (v_land,6,$land6$[
    {"id":"land-natural-recovery-resource","type":"resource","sourceKey":"natural-recovery","key":"land_natural_recovery","label":"Природное восстановление","max":1,"recharge":["long_rest"],"restore":"full","presentation":{"tone":"green","icon":"↺","display":"pips","priority":70}},
    {"id":"land-natural-recovery-action","type":"action","sourceKey":"natural-recovery","key":"land_natural_recovery","label":"Природное восстановление","economy":"short_rest","resourceKey":"land_natural_recovery","resourceCost":1,"tags":["unique","class","restore-spell-slots"]},
    {"id":"land-natural-recovery-rules","type":"grant","sourceKey":"natural-recovery","target":"feature","key":"subclass:druid:land:natural-recovery","payload":{"label":"Природное восстановление","description":"Раз за долгий отдых можно бесплатно сотворить одно круговое заклинание 1+ уровня. Кроме того, после короткого отдыха восстанавливаются ячейки с суммой уровней не выше половины уровня друида, округляя вверх; ячейки 6+ уровня так вернуть нельзя.","mechanic":{"usesPerLongRest":1,"freeCircleSpell":{"minimumLevel":1,"casts":1},"shortRestSlotRecovery":{"budget":{"formula":"ceil(druid_level/2)"},"maximumSlotLevel":5}}}}
  ]$land6$::jsonb,'[]'::jsonb),
  (v_land,10,$land10$[
    {"id":"land-natures-ward","type":"grant","sourceKey":"natures-ward","target":"immunity","key":"condition:poisoned","payload":{"label":"Иммунитет: Отравлен"}},
    {"id":"land-natures-ward-rules","type":"grant","sourceKey":"natures-ward","target":"feature","key":"subclass:druid:land:natures-ward","payload":{"label":"Защита природы","description":"Иммунитет к состоянию Отравлен. Дополнительное сопротивление зависит от текущего выбранного типа земли и приходит из того же сохранённого выбора.","mechanic":{"poisonedImmunity":true,"resistanceFromChoice":"druid-land-type"}}}
  ]$land10$::jsonb,'[]'::jsonb),
  (v_land,14,$land14$[
    {"id":"land-sanctuary-action","type":"action","sourceKey":"natures-sanctuary","key":"natures_sanctuary","label":"Святилище природы","economy":"action","range":{"kind":"ranged","normal":120,"unit":"ft"},"resourceKey":"wild_shape","resourceCost":1,"tags":["unique","class","zone","duration:1m"]},
    {"id":"land-sanctuary-rules","type":"grant","sourceKey":"natures-sanctuary","target":"feature","key":"subclass:druid:land:natures-sanctuary","payload":{"label":"Святилище природы","description":"За Дикая форма создаётся на земле куб 15 футов в пределах 120 футов на 1 минуту. Союзники внутри получают половинное укрытие и сопротивление текущей земли; бонусным действием область можно передвигать.","mechanic":{"cost":{"resource":"wild_shape","amount":1},"zone":{"shape":"cube","sizeFeet":15,"rangeFeet":120,"durationRounds":10},"allies":{"halfCover":true,"inheritResistanceFrom":"druid-land-type"},"move":{"economy":"bonus_action","distanceFeet":60,"rangeFeet":120}}}}
  ]$land14$::jsonb,'[]'::jsonb);

  -- MOON ---------------------------------------------------------------------
  insert into public.rule_templates(
    campaign_id,kind,slug,name,description,version,mechanics,choices,parent_template_id,unlock_level,
    catalog_key,catalog_revision,source_kind,source_label,is_builtin,mechanical_summary,
    author_description,author_comment,rules_meta,created_by,is_active
  ) values (
    p_campaign_id,'subclass','druid-circle-moon','Круг Луны','Официальный круг друида 2024, адаптированный к Дикой форме 2014.',1,'[]'::jsonb,'[]'::jsonb,v_druid,3,
    'subclass:druid:moon','2024+wild-shape-2014@1','official','Player''s Handbook 2024 · Meganot compatibility',true,
    'Усиленная Дикая форма, круговые заклинания в форме, Improved Circle Forms, Moonlight Step и Lunar Form. Временные HP Circle Forms 2024 намеренно исключены.',
    $voss$Лунный друид выбирает самый короткий путь между «маг» и «зверь»: перестаёт считать это разными профессиями. Форма становится боевой платформой, круговые чары работают прямо из неё, а позже медведь ещё и учится телепортироваться. После этого спор о построении обычно заканчивается сам.$voss$,
    $voss$Мы используем старую форму с настоящими хитами зверя. Поэтому временные хиты новой Лунной формы сюда не складываем. Зверь уже принёс собственный мешок хитов; насыпать сверху ещё один — не друидизм, а бухгалтерская ошибка.$voss$,
    jsonb_build_object(
      'base_class','class:druid','revision','2024','wild_shape_revision','2014',
      'compatibility_overrides',jsonb_build_object('circle-forms',jsonb_build_object(
        'excluded',jsonb_build_array('temporary_hit_points_3x_druid_level'),
        'reason','2014 Wild Shape replaces the Druid HP pool with beast HP; stacking 2024 THP double-counts the defensive redesign.'
      ))
    ),null,true
  )
  on conflict(campaign_id,kind,slug,version) do update set
    name=excluded.name,description=excluded.description,mechanics=excluded.mechanics,choices=excluded.choices,
    parent_template_id=excluded.parent_template_id,unlock_level=excluded.unlock_level,catalog_key=excluded.catalog_key,
    catalog_revision=excluded.catalog_revision,source_kind=excluded.source_kind,source_label=excluded.source_label,
    is_builtin=true,mechanical_summary=excluded.mechanical_summary,author_description=excluded.author_description,
    author_comment=excluded.author_comment,rules_meta=excluded.rules_meta,is_active=true,updated_at=now()
  returning id into v_moon;

  delete from public.rule_template_levels where template_id=v_moon;
  insert into public.rule_template_levels(template_id,level,mechanics,choices) values
  (v_moon,3,
    $moon3$[
      {"id":"moon-circle-forms","type":"grant","sourceKey":"circle-forms","target":"feature","key":"subclass:druid:moon:circle-forms","payload":{"label":"Формы круга","description":"Максимальный CR зверя равен уровню друида / 3. В форме можно использовать КД 13 + модификатор Мудрости, если КД зверя ниже. Временные HP версии 2024 не применяются из-за нашей Дикой формы 2014.","mechanic":{"maxBeastCR":{"formula":"druid_level/3"},"minimumArmorClass":{"base":13,"ability":"wisdom"},"temporaryHitPoints":0,"compatibility":"wild_shape_2014_beast_hp"}}}
    ]$moon3$::jsonb
    || private.builtin_spell_set('moon-spells','moon-l3','[{"slug":"cure-wounds","name":"Лечение ран","level":1},{"slug":"moonbeam","name":"Лунный луч","level":2},{"slug":"starry-wisp","name":"Звёздный огонёк","level":0}]'::jsonb,'subclass_spell',true),
    '[]'::jsonb),
  (v_moon,5,private.builtin_spell_set('moon-spells','moon-l5','[{"slug":"conjure-animals","name":"Призыв животных","level":3}]'::jsonb,'subclass_spell',true),'[]'::jsonb),
  (v_moon,6,$moon6$[
    {"id":"moon-improved-forms","type":"grant","sourceKey":"improved-circle-forms","target":"feature","key":"subclass:druid:moon:improved-circle-forms","payload":{"label":"Улучшенные формы круга","description":"Атаки звериной формы могут наносить обычный или излучающий урон. К спасброскам Телосложения в форме добавляется модификатор Мудрости.","mechanic":{"beastAttackDamageChoice":["normal","radiant"],"wildShapeConstitutionSaveBonus":{"reference":"abilities.wisdom.modifier"}}}}
  ]$moon6$::jsonb,'[]'::jsonb),
  (v_moon,7,private.builtin_spell_set('moon-spells','moon-l7','[{"slug":"fount-of-moonlight","name":"Источник лунного света","level":4}]'::jsonb,'subclass_spell',true),'[]'::jsonb),
  (v_moon,9,private.builtin_spell_set('moon-spells','moon-l9','[{"slug":"mass-cure-wounds","name":"Массовое лечение ран","level":5}]'::jsonb,'subclass_spell',true),'[]'::jsonb),
  (v_moon,10,$moon10$[
    {"id":"moon-step-resource","type":"resource","sourceKey":"moonlight-step","key":"moonlight_step","label":"Лунный шаг","max":{"kind":"max","values":[{"kind":"literal","value":1},{"kind":"reference","key":"abilities.wisdom.modifier"}]},"recharge":["long_rest"],"restore":"full","presentation":{"tone":"violet","icon":"☾","display":"pips","priority":90}},
    {"id":"moon-step-action","type":"action","sourceKey":"moonlight-step","key":"moonlight_step","label":"Лунный шаг","economy":"bonus_action","range":{"kind":"custom","label":"Телепорт 30 футов"},"resourceKey":"moonlight_step","resourceCost":1,"tags":["unique","class","teleport","advantage-next-attack"]},
    {"id":"moon-step-rules","type":"grant","sourceKey":"moonlight-step","target":"feature","key":"subclass:druid:moon:moonlight-step","payload":{"label":"Лунный шаг","description":"Бонусным действием телепорт на 30 футов; следующая атака до конца хода с преимуществом. Использований — модификатор Мудрости, минимум одно, за долгий отдых. Ячейка 2+ уровня может вернуть одно использование.","mechanic":{"teleportFeet":30,"nextAttackAdvantage":true,"uses":{"reference":"abilities.wisdom.modifier","minimum":1,"recharge":"long_rest"},"restoreUse":{"spendSpellSlotMinimumLevel":2,"amount":1}}}}
  ]$moon10$::jsonb,'[]'::jsonb),
  (v_moon,14,$moon14$[
    {"id":"moon-step-action-l14","type":"action","sourceKey":"moonlight-step","grantOperation":"REPLACE","priority":14,"key":"moonlight_step","label":"Лунный шаг · спутник","economy":"bonus_action","range":{"kind":"custom","label":"Телепорт 30 футов + союзник рядом"},"resourceKey":"moonlight_step","resourceCost":1,"tags":["unique","class","teleport","ally","advantage-next-attack"]},
    {"id":"moon-lunar-form","type":"grant","sourceKey":"lunar-form","target":"feature","key":"subclass:druid:moon:lunar-form","payload":{"label":"Лунная форма","description":"Раз за ход попадание атакой звериной формы наносит ещё 2к10 излучающего урона. Лунный шаг может забрать согласного союзника рядом с собой.","mechanic":{"wildShapeHitBonus":{"frequency":"once_per_turn","damage":{"dice":"2d10","type":"radiant"}},"moonlightStepPassenger":{"originRangeFeet":10,"destinationRangeFeet":10,"willing":true}}}}
  ]$moon14$::jsonb,'[]'::jsonb);

  -- SEA ----------------------------------------------------------------------
  insert into public.rule_templates(
    campaign_id,kind,slug,name,description,version,mechanics,choices,parent_template_id,unlock_level,
    catalog_key,catalog_revision,source_kind,source_label,is_builtin,mechanical_summary,
    author_description,author_comment,rules_meta,created_by,is_active
  ) values (
    p_campaign_id,'subclass','druid-circle-sea','Круг Моря','Официальный круг друида 2024.',1,'[]'::jsonb,'[]'::jsonb,v_druid,3,
    'subclass:druid:sea','2024@1','official','Player''s Handbook 2024',true,
    'Круговые заклинания, Wrath of the Sea, Aquatic Affinity, Stormborn и Oceanic Gift.',
    $voss$Круг Моря носит шторм с собой. Его главная способность — не «заклинание про воду», а отдельное состояние боя: сначала поднимается прибой, потом каждое бонусное действие напоминает ближайшему противнику, что берег был безопаснее.$voss$,
    $voss$Пять футов вокруг себя — это не очень много, пока внутри них не живёт шторм. И да: мокрый пол сам по себе не считается контролем поля. Это называется производственная травма.$voss$,
    jsonb_build_object('base_class','class:druid','revision','2024','runtime_mode','wrath_of_the_sea'),null,true
  )
  on conflict(campaign_id,kind,slug,version) do update set
    name=excluded.name,description=excluded.description,mechanics=excluded.mechanics,choices=excluded.choices,
    parent_template_id=excluded.parent_template_id,unlock_level=excluded.unlock_level,catalog_key=excluded.catalog_key,
    catalog_revision=excluded.catalog_revision,source_kind=excluded.source_kind,source_label=excluded.source_label,
    is_builtin=true,mechanical_summary=excluded.mechanical_summary,author_description=excluded.author_description,
    author_comment=excluded.author_comment,rules_meta=excluded.rules_meta,is_active=true,updated_at=now()
  returning id into v_sea;

  delete from public.rule_template_levels where template_id=v_sea;
  insert into public.rule_template_levels(template_id,level,mechanics,choices) values
  (v_sea,3,
    $sea3$[
      {"id":"sea-wrath-activate","type":"action","sourceKey":"wrath-of-the-sea","key":"wrath_of_the_sea_activate","label":"Гнев моря · поднять шторм","economy":"bonus_action","range":{"kind":"self"},"resourceKey":"wild_shape","resourceCost":1,"tags":["unique","class","mode:wrath-of-the-sea","duration:10m"]},
      {"id":"sea-wrath-surge","type":"action","sourceKey":"wrath-of-the-sea","key":"wrath_of_the_sea_surge","label":"Гнев моря · удар волны","economy":"bonus_action","range":{"kind":"melee","reach":5,"unit":"ft"},"tags":["unique","class","save:constitution","requires:wrath-of-the-sea"]},
      {"id":"sea-wrath-rules","type":"grant","sourceKey":"wrath-of-the-sea","target":"feature","key":"subclass:druid:sea:wrath-of-the-sea","payload":{"label":"Гнев моря","description":"Бонусным действием тратит Дикая форма и на 10 минут создаёт вокруг себя морской шторм. При активации и затем бонусным действием выбирает цель в 5 футах: спас Телосложения; при провале холодный урон количеством к6, равным модификатору Мудрости (минимум 1), и Большую или меньшую цель можно оттолкнуть на 15 футов.","mechanic":{"cost":{"resource":"wild_shape","amount":1},"durationMinutes":10,"emanationFeet":5,"save":{"ability":"constitution","dc":"spell"},"damage":{"die":"d6","count":{"reference":"abilities.wisdom.modifier","minimum":1},"type":"cold"},"onFailedSave":{"pushFeet":15,"maximumSize":"large"}}}}
    ]$sea3$::jsonb
    || private.builtin_spell_set('sea-spells','sea-l3','[{"slug":"fog-cloud","name":"Облако тумана","level":1},{"slug":"gust-of-wind","name":"Порыв ветра","level":2},{"slug":"ray-of-frost","name":"Луч холода","level":0},{"slug":"shatter","name":"Дребезги","level":2},{"slug":"thunderwave","name":"Громовая волна","level":1}]'::jsonb),
    '[]'::jsonb),
  (v_sea,5,private.builtin_spell_set('sea-spells','sea-l5','[{"slug":"lightning-bolt","name":"Молния","level":3},{"slug":"water-breathing","name":"Дыхание под водой","level":3}]'::jsonb),'[]'::jsonb),
  (v_sea,6,$sea6$[
    {"id":"sea-aquatic-affinity","type":"grant","sourceKey":"aquatic-affinity","target":"feature","key":"subclass:druid:sea:aquatic-affinity","payload":{"label":"Связь с водой","description":"Гнев моря расширяется до 10 футов, а скорость плавания становится равной обычной скорости.","mechanic":{"wrathEmanationFeet":10,"swimSpeed":{"equals":"combat.speed"}}}}
  ]$sea6$::jsonb,'[]'::jsonb),
  (v_sea,7,private.builtin_spell_set('sea-spells','sea-l7','[{"slug":"control-water","name":"Управление водой","level":4},{"slug":"ice-storm","name":"Ледяная буря","level":4}]'::jsonb),'[]'::jsonb),
  (v_sea,9,private.builtin_spell_set('sea-spells','sea-l9','[{"slug":"conjure-elemental","name":"Призыв элементаля","level":5},{"slug":"hold-monster","name":"Удержание чудовища","level":5}]'::jsonb),'[]'::jsonb),
  (v_sea,10,$sea10$[
    {"id":"sea-stormborn","type":"grant","sourceKey":"stormborn","target":"feature","key":"subclass:druid:sea:stormborn","payload":{"label":"Рождённый бурей","description":"Пока активен Гнев моря, друид получает скорость полёта и сопротивление холоду, электричеству и звуку.","mechanic":{"while":"wrath_of_the_sea","flySpeed":{"equals":"combat.speed"},"resistances":["cold","lightning","thunder"]}}}
  ]$sea10$::jsonb,'[]'::jsonb),
  (v_sea,14,$sea14$[
    {"id":"sea-oceanic-gift-ally","type":"action","sourceKey":"oceanic-gift","key":"oceanic_gift","label":"Дар океана · союзник","economy":"bonus_action","range":{"kind":"ranged","normal":60,"unit":"ft"},"resourceKey":"wild_shape","resourceCost":1,"tags":["unique","class","share-wrath"]},
    {"id":"sea-oceanic-gift-dual","type":"action","sourceKey":"oceanic-gift","key":"oceanic_gift_dual","label":"Дар океана · двое","economy":"bonus_action","range":{"kind":"ranged","normal":60,"unit":"ft"},"resourceKey":"wild_shape","resourceCost":2,"tags":["unique","class","share-wrath","self-and-ally"]},
    {"id":"sea-oceanic-gift-rules","type":"grant","sourceKey":"oceanic-gift","target":"feature","key":"subclass:druid:sea:oceanic-gift","payload":{"label":"Дар океана","description":"Гнев моря можно развернуть вокруг согласного существа в 60 футах; оно использует Сл заклинаний и Мудрость друида для этой способности. Потратив два использования Дикой формы, шторм можно держать одновременно на себе и союзнике.","mechanic":{"target":{"willing":true,"rangeFeet":60},"usesDruidSpellDc":true,"usesDruidWisdom":true,"dualManifest":{"wildShapeCost":2},"inherits":"stormborn"}}}
  ]$sea14$::jsonb,'[]'::jsonb);

  -- STARS --------------------------------------------------------------------
  insert into public.rule_templates(
    campaign_id,kind,slug,name,description,version,mechanics,choices,parent_template_id,unlock_level,
    catalog_key,catalog_revision,source_kind,source_label,is_builtin,mechanical_summary,
    author_description,author_comment,rules_meta,created_by,is_active
  ) values (
    p_campaign_id,'subclass','druid-circle-stars','Круг Звёзд','Официальный круг друида 2024.',1,'[]'::jsonb,'[]'::jsonb,v_druid,3,
    'subclass:druid:stars','2024@1','official','Player''s Handbook 2024',true,
    'Star Map, Starry Form, Cosmic Omen, Twinkling Constellations и Full of Stars.',
    $voss$Звёздный друид смотрит вверх не ради предсказаний о любви, а ради рабочих инструментов. Карта даёт устойчивую магию, созвездие меняет стиль боя, а знамение позволяет вмешиваться в чужой бросок именно тогда, когда кто-то уже начал радоваться.$voss$,
    $voss$К астрологии я отношусь спокойно: пока она не просит денег вперёд. Эти звёзды хотя бы дают луч, лечение, концентрацию и иногда право сказать «нет, брось ещё раз». Уже полезнее половины гороскопов.$voss$,
    jsonb_build_object('base_class','class:druid','revision','2024','runtime_modes',jsonb_build_array('archer','chalice','dragon')),null,true
  )
  on conflict(campaign_id,kind,slug,version) do update set
    name=excluded.name,description=excluded.description,mechanics=excluded.mechanics,choices=excluded.choices,
    parent_template_id=excluded.parent_template_id,unlock_level=excluded.unlock_level,catalog_key=excluded.catalog_key,
    catalog_revision=excluded.catalog_revision,source_kind=excluded.source_kind,source_label=excluded.source_label,
    is_builtin=true,mechanical_summary=excluded.mechanical_summary,author_description=excluded.author_description,
    author_comment=excluded.author_comment,rules_meta=excluded.rules_meta,is_active=true,updated_at=now()
  returning id into v_stars;

  v_star_guiding := jsonb_build_object(
    'id','stars-guiding-bolt','type','spell','sourceKey','star-map','variantKey','star-map:guiding-bolt','key','spell:guiding-bolt',
    'payload',jsonb_build_object(
      'spell',jsonb_build_object('name','Направляющий снаряд','level',1),
      'preparation',jsonb_build_object('mode','always_prepared'),
      'methods',jsonb_build_array(
        jsonb_build_object(
          'key','star-map-slots','kind','subclass_spell','ability','wisdom','requiresPrepared',false,
          'resourceOptions',(select jsonb_agg(jsonb_build_object('key','slot-'||s::text,'castLevel',s,'costs',jsonb_build_array(jsonb_build_object('key','spell_slot_'||s::text,'amount',1))) order by s) from generate_series(1,9) s)
        ),
        jsonb_build_object(
          'key','star-map-free','kind','class_feature','ability','wisdom','requiresPrepared',false,
          'resourceOptions',jsonb_build_array(jsonb_build_object('key','star-map-free','castLevel',1,'costs',jsonb_build_array(jsonb_build_object('key','star_map_guiding_bolt','amount',1))))
        )
      )
    )
  );

  delete from public.rule_template_levels where template_id=v_stars;
  insert into public.rule_template_levels(template_id,level,mechanics,choices) values
  (v_stars,3,
    $stars3$[
      {"id":"stars-star-map-resource","type":"resource","sourceKey":"star-map","key":"star_map_guiding_bolt","label":"Звёздная карта · свободный снаряд","max":{"kind":"max","values":[{"kind":"literal","value":1},{"kind":"reference","key":"abilities.wisdom.modifier"}]},"recharge":["long_rest"],"restore":"full","presentation":{"tone":"violet","icon":"✦","display":"pips","priority":90}},
      {"id":"stars-star-map-rules","type":"grant","sourceKey":"star-map","target":"feature","key":"subclass:druid:stars:star-map","payload":{"label":"Звёздная карта","description":"«Указание» и «Направляющий снаряд» всегда готовы. Направляющий снаряд можно бесплатно сотворить число раз, равное модификатору Мудрости, минимум один раз за долгий отдых; обычные ячейки остаются дополнительным способом оплаты.","mechanic":{"alwaysPrepared":["guidance","guiding-bolt"],"freeGuidingBolt":{"uses":{"reference":"abilities.wisdom.modifier","minimum":1},"recharge":"long_rest"}}}},
      {"id":"stars-starry-form-activate","type":"action","sourceKey":"starry-form","key":"starry_form","label":"Звёздная форма","economy":"bonus_action","range":{"kind":"self"},"resourceKey":"wild_shape","resourceCost":1,"tags":["unique","class","mode-choice:archer-chalice-dragon","duration:10m"]},
      {"id":"stars-archer-shot","type":"action","sourceKey":"starry-form","key":"starry_archer","label":"Созвездие Лучника","economy":"bonus_action","range":{"kind":"ranged","normal":60,"unit":"ft"},"attackAbility":"wisdom","proficient":true,"damage":[{"key":"radiant","damageType":"radiant","count":1,"sides":8,"ability":"wisdom"}],"tags":["unique","class","requires:starry-form-archer"]},
      {"id":"stars-starry-form-rules","type":"grant","sourceKey":"starry-form","target":"feature","key":"subclass:druid:stars:starry-form","payload":{"label":"Звёздная форма","description":"За использование Дикой формы на 10 минут выбирается одно созвездие. Лучник даёт бонусную дальнюю атаку; Чаша добавляет лечение после заклинания с ячейкой; Дракон стабилизирует проверки Интеллекта/Мудрости и спас Телосложения на концентрацию.","mechanic":{"cost":{"resource":"wild_shape","amount":1},"durationMinutes":10,"modes":{"archer":{"action":"starry_archer"},"chalice":{"trigger":"slot_spell_restores_hp","extraHealing":{"dice":"1d8","modifier":"wisdom","rangeFeet":30}},"dragon":{"minimumD20":10,"appliesTo":["intelligence_check","wisdom_check","concentration_constitution_save"]}}}}}
    ]$stars3$::jsonb
    || jsonb_build_array(private.builtin_class_spell_mechanic('stars-guidance','star-map','guidance','Указание',0,'star-map:guidance','subclass_spell',false),v_star_guiding),
    '[]'::jsonb),
  (v_stars,6,$stars6$[
    {"id":"stars-cosmic-omen-resource","type":"resource","sourceKey":"cosmic-omen","key":"cosmic_omen","label":"Космическое знамение","max":{"kind":"max","values":[{"kind":"literal","value":1},{"kind":"reference","key":"abilities.wisdom.modifier"}]},"recharge":["long_rest"],"restore":"full","presentation":{"tone":"cyan","icon":"✧","display":"pips","priority":80}},
    {"id":"stars-cosmic-weal","type":"action","sourceKey":"cosmic-omen","key":"cosmic_omen_weal","label":"Знамение: благо","economy":"reaction","range":{"kind":"ranged","normal":30,"unit":"ft"},"resourceKey":"cosmic_omen","resourceCost":1,"tags":["unique","class","d20:+1d6"]},
    {"id":"stars-cosmic-woe","type":"action","sourceKey":"cosmic-omen","key":"cosmic_omen_woe","label":"Знамение: беда","economy":"reaction","range":{"kind":"ranged","normal":30,"unit":"ft"},"resourceKey":"cosmic_omen","resourceCost":1,"tags":["unique","class","d20:-1d6"]},
    {"id":"stars-cosmic-omen-rules","type":"grant","sourceKey":"cosmic-omen","target":"feature","key":"subclass:druid:stars:cosmic-omen","payload":{"label":"Космическое знамение","description":"После долгого отдыха бросок определяет знак — благо или беду. Реакцией после видимого броска существа поблизости можно прибавить или вычесть 1к6. Использований — модификатор Мудрости, минимум одно, за долгий отдых.","mechanic":{"dailyMode":{"roll":"d6","odd":"woe","even":"weal"},"reaction":{"rangeFeet":30,"die":"d6"},"uses":{"reference":"abilities.wisdom.modifier","minimum":1,"recharge":"long_rest"}}}}
  ]$stars6$::jsonb,'[]'::jsonb),
  (v_stars,10,$stars10$[
    {"id":"stars-archer-shot-l10","type":"action","sourceKey":"starry-form","grantOperation":"REPLACE","priority":10,"key":"starry_archer","label":"Созвездие Лучника · усиление","economy":"bonus_action","range":{"kind":"ranged","normal":60,"unit":"ft"},"attackAbility":"wisdom","proficient":true,"damage":[{"key":"radiant","damageType":"radiant","count":2,"sides":8,"ability":"wisdom"}],"tags":["unique","class","requires:starry-form-archer"]},
    {"id":"stars-twinkling","type":"grant","sourceKey":"twinkling-constellations","target":"feature","key":"subclass:druid:stars:twinkling-constellations","payload":{"label":"Мерцающие созвездия","description":"Лучник и Чаша используют 2к8 вместо 1к8; Дракон получает полёт 20 футов с зависанием. В начале своего хода можно сменить текущее созвездие без нового расхода Дикой формы.","mechanic":{"archerDamage":"2d8+wisdom","chaliceHealing":"2d8+wisdom","dragonFly":{"feet":20,"hover":true},"switchMode":"start_of_turn"}}}
  ]$stars10$::jsonb,'[]'::jsonb),
  (v_stars,14,$stars14$[
    {"id":"stars-full-of-stars","type":"grant","sourceKey":"full-of-stars","target":"feature","key":"subclass:druid:stars:full-of-stars","payload":{"label":"Полон звёзд","description":"Пока активна Звёздная форма, друид получает сопротивление дробящему, колющему и рубящему урону.","mechanic":{"while":"starry_form","resistances":["bludgeoning","piercing","slashing"]}}}
  ]$stars14$::jsonb,'[]'::jsonb);
end;
$$;

create or replace function private.install_builtin_druid_subclasses_2024_after_campaign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.install_builtin_druid_subclasses_2024(new.id);
  return new;
end;
$$;

drop trigger if exists campaigns_install_druid_subclasses_2024 on public.campaigns;
create trigger campaigns_install_druid_subclasses_2024
after insert on public.campaigns
for each row execute function private.install_builtin_druid_subclasses_2024_after_campaign();

do $$
declare v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.install_builtin_druid_subclasses_2024(v_campaign.id);
  end loop;
end;
$$;

commit;
