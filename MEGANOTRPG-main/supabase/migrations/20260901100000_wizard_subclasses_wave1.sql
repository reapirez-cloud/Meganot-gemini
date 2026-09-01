-- Migration: wizard_subclasses_wave1_2024

DO $$ 
BEGIN

  -- Only run if template:class:wizard exists
  IF EXISTS (SELECT 1 FROM rule_templates WHERE id = 'template:class:wizard') THEN

    -- Эвокер
    INSERT INTO rule_templates (id, kind, slug, name, description, version, catalog_key, parent_template_id, unlock_level, mechanics, choices, is_builtin, is_active)
    VALUES (
      'template:subclass:wizard-evoker', 'subclass', 'wizard-evoker', 'Эвокер', 'Эвокеры (Воплотители) фокусируются на магической энергии, создающей мощные стихийные эффекты — лед, пламя, гром, молнии и кислоту.', 1, 'subclass:wizard:evoker', 'template:class:wizard', 3, '[]'::jsonb, '[]'::jsonb, true, true
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      mechanics = EXCLUDED.mechanics,
      choices = EXCLUDED.choices,
      version = EXCLUDED.version,
      updated_at = NOW();

    INSERT INTO rule_template_levels (id, template_id, level, mechanics, choices)
    VALUES (
      'level:3:wizard-evoker', 'template:subclass:wizard-evoker', 3, '[{"id":"evocation-savant-l3","type":"grant","target":"trait","key":"evocation-savant","sourceKey":"evocation-savant-l3-1","presentation":{"authorExplanation":"[PHB 2024] Вы бесплатно добавляете два заклинания школы Воплощения в свою книгу. Эти заклинания всегда считаются подготовленными и не идут в счет лимита. При повышении уровня волшебника вы можете заменить одно из этих заклинаний на другое заклинание Воплощения."}},{"id":"sculpt-spells-l3","type":"grant","target":"trait","key":"sculpt-spells","sourceKey":"sculpt-spells-l3-1","presentation":{"authorExplanation":"Создавая область эффекта заклинания Воплощения, вы можете выбрать количество существ (до 1 + уровень заклинания), которые автоматически преуспеют в спасброске и не получат урон."}}]'::jsonb, '[{"key":"evocation-savant-spells","label":"Заклинания Воплощения","target":"trait","options":[],"options_query":"spell:school=evocation","count":2}]'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      mechanics = EXCLUDED.mechanics,
      choices = EXCLUDED.choices;

    INSERT INTO rule_template_levels (id, template_id, level, mechanics, choices)
    VALUES (
      'level:6:wizard-evoker', 'template:subclass:wizard-evoker', 6, '[{"id":"potent-cantrip-l6","type":"grant","target":"trait","key":"potent-cantrip","sourceKey":"potent-cantrip-l6-1","presentation":{"authorExplanation":"[PHB 2024] Если вы промахиваетесь по существу броском атаки заговора или оно успешно проходит спасбросок от него, цель получает половину урона (но не подвергается дополнительным эффектам)."}}]'::jsonb, '[]'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      mechanics = EXCLUDED.mechanics,
      choices = EXCLUDED.choices;

    INSERT INTO rule_template_levels (id, template_id, level, mechanics, choices)
    VALUES (
      'level:10:wizard-evoker', 'template:subclass:wizard-evoker', 10, '[{"id":"empowered-evocation-l10","type":"grant","target":"trait","key":"empowered-evocation","sourceKey":"empowered-evocation-l10-1","presentation":{"authorExplanation":"Вы можете добавить свой модификатор Интеллекта к одному броску урона любого заклинания Воплощения, которое вы накладываете."}}]'::jsonb, '[]'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      mechanics = EXCLUDED.mechanics,
      choices = EXCLUDED.choices;

    INSERT INTO rule_template_levels (id, template_id, level, mechanics, choices)
    VALUES (
      'level:14:wizard-evoker', 'template:subclass:wizard-evoker', 14, '[{"id":"overchannel-l14","type":"grant","target":"trait","key":"overchannel","sourceKey":"overchannel-l14-1","presentation":{"authorExplanation":"При накладывании заклинания Воплощения 1-5 уровня, вы можете нанести им максимальный урон. Первое использование безопасно, каждое последующее до долгого отдыха наносит вам некротический урон (2d12 за уровень заклинания), игнорирующий сопротивления и иммунитеты."}}]'::jsonb, '[]'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      mechanics = EXCLUDED.mechanics,
      choices = EXCLUDED.choices;

    -- Абжурер
    INSERT INTO rule_templates (id, kind, slug, name, description, version, catalog_key, parent_template_id, unlock_level, mechanics, choices, is_builtin, is_active)
    VALUES (
      'template:subclass:wizard-abjurer', 'subclass', 'wizard-abjurer', 'Абжурер', 'Абжуреры (Оградители) посвящают себя защитной магии, создавая мистические обереги, изгоняя потусторонних существ и разрушая чужие чары.', 1, 'subclass:wizard:abjurer', 'template:class:wizard', 3, '[]'::jsonb, '[]'::jsonb, true, true
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      mechanics = EXCLUDED.mechanics,
      choices = EXCLUDED.choices,
      version = EXCLUDED.version,
      updated_at = NOW();

    INSERT INTO rule_template_levels (id, template_id, level, mechanics, choices)
    VALUES (
      'level:3:wizard-abjurer', 'template:subclass:wizard-abjurer', 3, '[{"id":"abjuration-savant-l3","type":"grant","target":"trait","key":"abjuration-savant","sourceKey":"abjuration-savant-l3-1","presentation":{"authorExplanation":"[PHB 2024] Вы бесплатно добавляете два заклинания школы Ограждения в свою книгу. Эти заклинания всегда считаются подготовленными и не идут в счет лимита. При повышении уровня вы можете заменить одно из них на другое заклинание Ограждения."}},{"id":"arcane-ward-l3","type":"resource","key":"resource:arcane-ward","label":"Магический оберег","max":"class:wizard:level * 2 + intelligence:modifier","recharge":["long_rest"],"initial":"empty","sourceKey":"arcane-ward-l3-1","presentation":{"authorExplanation":"Создает магический оберег, когда вы накладываете заклинание Ограждения. Оберег имеет хиты (уровень волшебника * 2 + мод. Интеллекта) и принимает урон на себя. Когда вы накладываете другие заклинания Ограждения, оберег восстанавливает хиты (удвоенный уровень заклинания)."}}]'::jsonb, '[{"key":"abjuration-savant-spells","label":"Заклинания Ограждения","target":"trait","options":[],"options_query":"spell:school=abjuration","count":2}]'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      mechanics = EXCLUDED.mechanics,
      choices = EXCLUDED.choices;

    INSERT INTO rule_template_levels (id, template_id, level, mechanics, choices)
    VALUES (
      'level:6:wizard-abjurer', 'template:subclass:wizard-abjurer', 6, '[{"id":"projected-ward-l6","type":"action","key":"action:projected-ward","label":"Спроецированный оберег","economy":"reaction","range":{"short":30,"unit":"ft"},"sourceKey":"projected-ward-l6-1","presentation":{"authorExplanation":"Когда существо в пределах 30 футов от вас получает урон, вы можете реакцией заставить ваш Магический оберег принять этот урон на себя."}}]'::jsonb, '[]'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      mechanics = EXCLUDED.mechanics,
      choices = EXCLUDED.choices;

    INSERT INTO rule_template_levels (id, template_id, level, mechanics, choices)
    VALUES (
      'level:10:wizard-abjurer', 'template:subclass:wizard-abjurer', 10, '[{"id":"spellbreaker-l10","type":"spell","key":"spell:dispel-magic","payload":{"spell":{"name":"Рассеивание магии","level":3,"school":"abjuration"},"preparation":{"mode":"always_prepared"},"methods":[{"key":"spellbreaker-cast","kind":"class_feature","resourceOptions":[{"key":"spellbreaker-bonus","costs":[{"key":"resource:spell_slot_3","amount":1}]}]}]},"sourceKey":"spellbreaker-l10-1","presentation":{"authorExplanation":"[PHB 2024] Вы всегда имеете подготовленным заклинание Рассеивание магии (Dispel Magic). Вы можете накладывать его как Бонусное действие. Если вы накладываете его и успешно прерываете заклинание, ваш Оберег восстанавливает хиты."}}]'::jsonb, '[]'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      mechanics = EXCLUDED.mechanics,
      choices = EXCLUDED.choices;

    INSERT INTO rule_template_levels (id, template_id, level, mechanics, choices)
    VALUES (
      'level:14:wizard-abjurer', 'template:subclass:wizard-abjurer', 14, '[{"id":"spell-resistance-l14","type":"grant","target":"trait","key":"spell-resistance","sourceKey":"spell-resistance-l14-1","presentation":{"authorExplanation":"Вы получаете преимущество на спасброски от заклинаний, а также сопротивление к урону от заклинаний."}}]'::jsonb, '[]'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      mechanics = EXCLUDED.mechanics,
      choices = EXCLUDED.choices;

    -- Прорицатель
    INSERT INTO rule_templates (id, kind, slug, name, description, version, catalog_key, parent_template_id, unlock_level, mechanics, choices, is_builtin, is_active)
    VALUES (
      'template:subclass:wizard-diviner', 'subclass', 'wizard-diviner', 'Прорицатель', 'Прорицатели раздвигают границы пространства и времени, используя свою магию, чтобы прозревать сокрытое и предвидеть грядущее.', 1, 'subclass:wizard:diviner', 'template:class:wizard', 3, '[]'::jsonb, '[]'::jsonb, true, true
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      mechanics = EXCLUDED.mechanics,
      choices = EXCLUDED.choices,
      version = EXCLUDED.version,
      updated_at = NOW();

    INSERT INTO rule_template_levels (id, template_id, level, mechanics, choices)
    VALUES (
      'level:3:wizard-diviner', 'template:subclass:wizard-diviner', 3, '[{"id":"divination-savant-l3","type":"grant","target":"trait","key":"divination-savant","sourceKey":"divination-savant-l3-1","presentation":{"authorExplanation":"[PHB 2024] Вы бесплатно добавляете два заклинания школы Прорицания в свою книгу. Они всегда подготовлены и не идут в счет лимита. При повышении уровня можно заменить одно из них."}},{"id":"portent-l3","type":"resource","key":"resource:portent","label":"Кубики Знамения","max":2,"recharge":["long_rest"],"sourceKey":"portent-l3-1","presentation":{"authorExplanation":"После долгого отдыха вы кидаете 2к20 и записываете результаты. До следующего отдыха вы можете заменить любой бросок атаки, спасбросок или проверку характеристики (свой или чужой) одним из этих результатов до совершения броска."}}]'::jsonb, '[{"key":"divination-savant-spells","label":"Заклинания Прорицания","target":"trait","options":[],"options_query":"spell:school=divination","count":2}]'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      mechanics = EXCLUDED.mechanics,
      choices = EXCLUDED.choices;

    INSERT INTO rule_template_levels (id, template_id, level, mechanics, choices)
    VALUES (
      'level:6:wizard-diviner', 'template:subclass:wizard-diviner', 6, '[{"id":"expert-divination-l6","type":"grant","target":"trait","key":"expert-divination","sourceKey":"expert-divination-l6-1","presentation":{"authorExplanation":"Когда вы накладываете заклинание Прорицания 2-го уровня или выше (тратя ячейку), вы восстанавливаете одну потраченную ячейку заклинаний, уровень которой ниже наложенного заклинания (максимум 5-й уровень)."}}]'::jsonb, '[]'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      mechanics = EXCLUDED.mechanics,
      choices = EXCLUDED.choices;

    INSERT INTO rule_template_levels (id, template_id, level, mechanics, choices)
    VALUES (
      'level:10:wizard-diviner', 'template:subclass:wizard-diviner', 10, '[{"id":"third-eye-resource-l10","type":"resource","key":"resource:third-eye","label":"Третий глаз (использование)","max":1,"recharge":["short_rest","long_rest"]},{"id":"third-eye-l10","type":"action","key":"action:third-eye","label":"Третий глаз","economy":"bonus_action","resourceCosts":[{"key":"resource:third-eye","amount":1}],"sourceKey":"third-eye-l10-1","presentation":{"authorExplanation":"[PHB 2024] Бонусным действием вы можете наложить заклинание Видение невидимого (See Invisibility) без использования ячейки. Кроме того, вы можете бонусным действием получить Темное зрение (120 футов) или Понимание языков до конца следующего отдыха."}}]'::jsonb, '[]'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      mechanics = EXCLUDED.mechanics,
      choices = EXCLUDED.choices;

    INSERT INTO rule_template_levels (id, template_id, level, mechanics, choices)
    VALUES (
      'level:14:wizard-diviner', 'template:subclass:wizard-diviner', 14, '[{"id":"greater-portent-l14","type":"resource","grantOperation":"REPLACE","key":"resource:portent","label":"Кубики Знамения (Великое)","max":3,"recharge":["long_rest"],"sourceKey":"greater-portent-l14-1","presentation":{"authorExplanation":"Ваше Знамение становится сильнее: теперь после долгого отдыха вы кидаете 3к20 вместо двух."}}]'::jsonb, '[]'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      mechanics = EXCLUDED.mechanics,
      choices = EXCLUDED.choices;

    -- Иллюзионист
    INSERT INTO rule_templates (id, kind, slug, name, description, version, catalog_key, parent_template_id, unlock_level, mechanics, choices, is_builtin, is_active)
    VALUES (
      'template:subclass:wizard-illusionist', 'subclass', 'wizard-illusionist', 'Иллюзионист', 'Иллюзионисты — мастера обмана, создающие невероятно правдоподобные фантомы, чтобы путать чувства и разум своих врагов.', 1, 'subclass:wizard:illusionist', 'template:class:wizard', 3, '[]'::jsonb, '[]'::jsonb, true, true
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      mechanics = EXCLUDED.mechanics,
      choices = EXCLUDED.choices,
      version = EXCLUDED.version,
      updated_at = NOW();

    INSERT INTO rule_template_levels (id, template_id, level, mechanics, choices)
    VALUES (
      'level:3:wizard-illusionist', 'template:subclass:wizard-illusionist', 3, '[{"id":"illusion-savant-l3","type":"grant","target":"trait","key":"illusion-savant","sourceKey":"illusion-savant-l3-1","presentation":{"authorExplanation":"[PHB 2024] Вы бесплатно добавляете два заклинания школы Иллюзии в свою книгу. Они всегда подготовлены и не идут в счет лимита. При повышении уровня можно заменить одно из них."}},{"id":"improved-minor-illusion-l3","type":"spell","key":"spell:minor-illusion","payload":{"spell":{"name":"Малая иллюзия","level":0,"school":"illusion"},"preparation":{"mode":"always_prepared"},"methods":[{"key":"illusionist-cantrip","kind":"spellcasting"}]},"sourceKey":"improved-minor-illusion-l3-1","presentation":{"authorExplanation":"[PHB 2024] Вы получаете заговор Малая иллюзия. Вы можете накладывать его Бонусным действием, а также можете создавать звук и образ одновременно (и менять их бонусным действием)."}}]'::jsonb, '[{"key":"illusion-savant-spells","label":"Заклинания Иллюзии","target":"trait","options":[],"options_query":"spell:school=illusion","count":2}]'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      mechanics = EXCLUDED.mechanics,
      choices = EXCLUDED.choices;

    INSERT INTO rule_template_levels (id, template_id, level, mechanics, choices)
    VALUES (
      'level:6:wizard-illusionist', 'template:subclass:wizard-illusionist', 6, '[{"id":"malleable-illusions-l6","type":"action","key":"action:malleable-illusions","label":"Изменение иллюзий","economy":"bonus_action","sourceKey":"malleable-illusions-l6-1","presentation":{"authorExplanation":"[PHB 2024] Вы можете накладывать заклинания Иллюзии без вербальных компонентов. Также вы можете бонусным действием изменить природу активной иллюзии (в рамках её заклинания)."}}]'::jsonb, '[]'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      mechanics = EXCLUDED.mechanics,
      choices = EXCLUDED.choices;

    INSERT INTO rule_template_levels (id, template_id, level, mechanics, choices)
    VALUES (
      'level:10:wizard-illusionist', 'template:subclass:wizard-illusionist', 10, '[{"id":"illusory-self-resource-l10","type":"resource","key":"resource:illusory-self","label":"Иллюзорный двойник (использование)","max":1,"recharge":["short_rest","long_rest"]},{"id":"illusory-self-l10","type":"action","key":"action:illusory-self","label":"Иллюзорный двойник","economy":"reaction","resourceCosts":[{"key":"resource:illusory-self","amount":1}],"sourceKey":"illusory-self-l10-1","presentation":{"authorExplanation":"[PHB 2024] Когда по вам попадает атака, вы можете реакцией создать иллюзорного двойника, заставляя атаку промахнуться. После использования вы можете восстановить это свойство коротким/долгим отдыхом ИЛИ потратив ячейку 2+ уровня."}}]'::jsonb, '[]'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      mechanics = EXCLUDED.mechanics,
      choices = EXCLUDED.choices;

    INSERT INTO rule_template_levels (id, template_id, level, mechanics, choices)
    VALUES (
      'level:14:wizard-illusionist', 'template:subclass:wizard-illusionist', 14, '[{"id":"illusory-reality-l14","type":"grant","target":"trait","key":"illusory-reality","sourceKey":"illusory-reality-l14-1","presentation":{"authorExplanation":"Когда вы накладываете заклинание Иллюзии 1-го уровня или выше, вы можете сделать один неживой объект, являющийся частью иллюзии, реальным на 1 минуту (он не может наносить урон напрямую)."}}]'::jsonb, '[]'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      mechanics = EXCLUDED.mechanics,
      choices = EXCLUDED.choices;

  END IF;

END $$;
