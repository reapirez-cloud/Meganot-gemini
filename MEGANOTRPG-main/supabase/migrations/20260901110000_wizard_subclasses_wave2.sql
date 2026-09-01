-- Migration: wizard_subclasses_wave2_legacy

DO $$ 
BEGIN

  -- Only run if template:class:wizard exists
  IF EXISTS (SELECT 1 FROM rule_templates WHERE id = 'template:class:wizard') THEN

    -- Некромант
    INSERT INTO rule_templates (id, kind, slug, name, description, version, catalog_key, parent_template_id, unlock_level, mechanics, choices, is_builtin, is_active)
    VALUES (
      'template:subclass:wizard-necromancy', 'subclass', 'wizard-necromancy', 'Некромант', 'Некроманты изучают магию жизни и смерти, управляя жизненной энергией и поднимая мертвых себе в услужение.', 1, 'subclass:wizard:necromancy', 'template:class:wizard', 3, '[]'::jsonb, '[]'::jsonb, true, true
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
      'level:3:wizard-necromancy', 'template:subclass:wizard-necromancy', 3, '[{"id":"necromancy-savant-l3","type":"grant","target":"trait","key":"necromancy-savant","sourceKey":"necromancy-savant-l3-1","presentation":{"authorExplanation":"[PHB 2014] Золото и время, которые вы тратите на копирование заклинания Некромантии в свою книгу заклинаний, уменьшаются вдвое."}},{"id":"grim-harvest-l3","type":"grant","target":"trait","key":"grim-harvest","sourceKey":"grim-harvest-l3-1","presentation":{"authorExplanation":"Раз в ход, когда вы убиваете одно или несколько существ заклинанием 1-го уровня или выше, вы восстанавливаете хиты, равные удвоенному уровню заклинания (или утроенному, если это заклинание Некромантии). Это не работает на конструктов и нежить."}}]'::jsonb, '[{"key":"necromancy-savant-spells","label":"Заклинания Некромантии","target":"trait","options":[],"options_query":"spell:school=necromancy","count":2}]'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      mechanics = EXCLUDED.mechanics,
      choices = EXCLUDED.choices;

    INSERT INTO rule_template_levels (id, template_id, level, mechanics, choices)
    VALUES (
      'level:6:wizard-necromancy', 'template:subclass:wizard-necromancy', 6, '[{"id":"undead-thralls-l6","type":"grant","target":"trait","key":"undead-thralls","sourceKey":"undead-thralls-l6-1","presentation":{"authorExplanation":"Вы получаете заклинание Восставший труп (Animate Dead). При его касте вы можете выбрать дополнительную цель. Ваша созданная нежить получает бонус к максимуму хитов, равный вашему уровню волшебника, и добавляет ваш бонус мастерства к своим броскам урона оружием."}}]'::jsonb, '[]'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      mechanics = EXCLUDED.mechanics,
      choices = EXCLUDED.choices;

    INSERT INTO rule_template_levels (id, template_id, level, mechanics, choices)
    VALUES (
      'level:10:wizard-necromancy', 'template:subclass:wizard-necromancy', 10, '[{"id":"inured-to-undeath-l10","type":"grant","target":"trait","key":"inured-to-undeath","sourceKey":"inured-to-undeath-l10-1","presentation":{"authorExplanation":"Вы получаете сопротивление некротическому урону, и максимум ваших хитов не может быть уменьшен никакими эффектами."}}]'::jsonb, '[]'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      mechanics = EXCLUDED.mechanics,
      choices = EXCLUDED.choices;

    INSERT INTO rule_template_levels (id, template_id, level, mechanics, choices)
    VALUES (
      'level:14:wizard-necromancy', 'template:subclass:wizard-necromancy', 14, '[{"id":"command-undead-l14","type":"grant","target":"trait","key":"command-undead","sourceKey":"command-undead-l14-1","presentation":{"authorExplanation":"Действием вы можете попытаться взять под контроль нежить в 60 футах. Цель делает спасбросок Харизмы. Нежить с Интеллектом 8+ получает преимущество на спасбросок, а если Интеллект 12+, то цель может повторять спасбросок каждый час. Провал дает вам постоянный контроль над ней."}}]'::jsonb, '[]'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      mechanics = EXCLUDED.mechanics,
      choices = EXCLUDED.choices;

    -- Школа Вызова
    INSERT INTO rule_templates (id, kind, slug, name, description, version, catalog_key, parent_template_id, unlock_level, mechanics, choices, is_builtin, is_active)
    VALUES (
      'template:subclass:wizard-conjuration', 'subclass', 'wizard-conjuration', 'Школа Вызова', 'Призыватели специализируются на заклинаниях, которые создают предметы и существ из ничего или перемещают их в пространстве.', 1, 'subclass:wizard:conjuration', 'template:class:wizard', 3, '[]'::jsonb, '[]'::jsonb, true, true
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
      'level:3:wizard-conjuration', 'template:subclass:wizard-conjuration', 3, '[{"id":"conjuration-savant-l3","type":"grant","target":"trait","key":"conjuration-savant","sourceKey":"conjuration-savant-l3-1","presentation":{"authorExplanation":"[PHB 2014] Золото и время, которые вы тратите на копирование заклинания Вызова в свою книгу заклинаний, уменьшаются вдвое."}},{"id":"minor-conjuration-l3","type":"action","key":"action:minor-conjuration","label":"Малый вызов","economy":"action","sourceKey":"minor-conjuration-l3-1","presentation":{"authorExplanation":"Действием вы можете призвать неодушевленный предмет не больше 3 футов и не тяжелее 10 фунтов в вашей руке или на земле. Объект излучает тусклый свет (5 футов) и исчезает через 1 час, при получении урона или если вы используете это умение снова."}}]'::jsonb, '[{"key":"conjuration-savant-spells","label":"Заклинания Вызова","target":"trait","options":[],"options_query":"spell:school=conjuration","count":2}]'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      mechanics = EXCLUDED.mechanics,
      choices = EXCLUDED.choices;

    INSERT INTO rule_template_levels (id, template_id, level, mechanics, choices)
    VALUES (
      'level:6:wizard-conjuration', 'template:subclass:wizard-conjuration', 6, '[{"id":"benign-transposition-l6","type":"action","key":"action:benign-transposition","label":"Безвредное перемещение","economy":"bonus_action","range":{"short":30,"unit":"ft"},"resourceCosts":[{"key":"resource:benign-transposition","amount":1}],"sourceKey":"benign-transposition-l6-1","presentation":{"authorExplanation":"Действием вы можете телепортироваться на 30 футов в свободное видимое пространство. Альтернативно, вы можете поменяться местами с согласным существом Малого или Среднего размера. Это умение восстанавливается после долгого отдыха или после наложения заклинания Вызова 1-го уровня и выше."}},{"id":"benign-transposition-resource-l6","type":"resource","key":"resource:benign-transposition","label":"Безвредное перемещение (использование)","max":1,"recharge":["long_rest"]}]'::jsonb, '[]'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      mechanics = EXCLUDED.mechanics,
      choices = EXCLUDED.choices;

    INSERT INTO rule_template_levels (id, template_id, level, mechanics, choices)
    VALUES (
      'level:10:wizard-conjuration', 'template:subclass:wizard-conjuration', 10, '[{"id":"focused-conjuration-l10","type":"grant","target":"trait","key":"focused-conjuration","sourceKey":"focused-conjuration-l10-1","presentation":{"authorExplanation":"Пока вы концентрируетесь на заклинании Вызова, получение урона не может нарушить вашу концентрацию на этом заклинании."}}]'::jsonb, '[]'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      mechanics = EXCLUDED.mechanics,
      choices = EXCLUDED.choices;

    INSERT INTO rule_template_levels (id, template_id, level, mechanics, choices)
    VALUES (
      'level:14:wizard-conjuration', 'template:subclass:wizard-conjuration', 14, '[{"id":"durable-summons-l14","type":"grant","target":"trait","key":"durable-summons","sourceKey":"durable-summons-l14-1","presentation":{"authorExplanation":"Любое существо, которое вы призываете или создаете с помощью заклинания Вызова, получает 30 временных хитов."}}]'::jsonb, '[]'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      mechanics = EXCLUDED.mechanics,
      choices = EXCLUDED.choices;

    -- Школа Очарования
    INSERT INTO rule_templates (id, kind, slug, name, description, version, catalog_key, parent_template_id, unlock_level, mechanics, choices, is_builtin, is_active)
    VALUES (
      'template:subclass:wizard-enchantment', 'subclass', 'wizard-enchantment', 'Школа Очарования', 'Очарователи манипулируют разумом окружающих, заставляя их подчиняться своей воле, и мастерски плетут социальные иллюзии.', 1, 'subclass:wizard:enchantment', 'template:class:wizard', 3, '[]'::jsonb, '[]'::jsonb, true, true
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
      'level:3:wizard-enchantment', 'template:subclass:wizard-enchantment', 3, '[{"id":"enchantment-savant-l3","type":"grant","target":"trait","key":"enchantment-savant","sourceKey":"enchantment-savant-l3-1","presentation":{"authorExplanation":"[PHB 2014] Золото и время, которые вы тратите на копирование заклинания Очарования в свою книгу заклинаний, уменьшаются вдвое."}},{"id":"hypnotic-gaze-l3","type":"action","key":"action:hypnotic-gaze","label":"Гипнотический взгляд","economy":"action","range":{"short":5,"unit":"ft"},"sourceKey":"hypnotic-gaze-l3-1","presentation":{"authorExplanation":"Действием вы можете очаровать существо в пределах 5 футов (спасбросок Мудрости). Завороженная цель обездвижена (Speed 0) и ошеломлена, пока вы поддерживаете эффект действием каждый свой ход (сохраняя дистанцию 5 футов). Завершается, если цель получает урон. После успеха или провала цель иммунна к эффекту до долгого отдыха."}}]'::jsonb, '[{"key":"enchantment-savant-spells","label":"Заклинания Очарования","target":"trait","options":[],"options_query":"spell:school=enchantment","count":2}]'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      mechanics = EXCLUDED.mechanics,
      choices = EXCLUDED.choices;

    INSERT INTO rule_template_levels (id, template_id, level, mechanics, choices)
    VALUES (
      'level:6:wizard-enchantment', 'template:subclass:wizard-enchantment', 6, '[{"id":"instinctive-charm-l6","type":"action","key":"action:instinctive-charm","label":"Инстинктивное очарование","economy":"reaction","range":{"short":30,"unit":"ft"},"sourceKey":"instinctive-charm-l6-1","presentation":{"authorExplanation":"Реакцией, когда по вам совершают атаку существом в пределах 30 футов, вы заставляете атакующего выбрать другую случайную цель в пределах его досягаемости (спасбросок Мудрости для отмены). Если атакующий преуспел в спасе, он получает иммунитет на эту способность до долгого отдыха."}}]'::jsonb, '[]'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      mechanics = EXCLUDED.mechanics,
      choices = EXCLUDED.choices;

    INSERT INTO rule_template_levels (id, template_id, level, mechanics, choices)
    VALUES (
      'level:10:wizard-enchantment', 'template:subclass:wizard-enchantment', 10, '[{"id":"split-enchantment-l10","type":"grant","target":"trait","key":"split-enchantment","sourceKey":"split-enchantment-l10-1","presentation":{"authorExplanation":"Когда вы накладываете заклинание Очарования 1-го уровня или выше, которое выбирает целью только одно существо, вы можете сделать так, чтобы оно нацелилось на второе существо."}}]'::jsonb, '[]'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      mechanics = EXCLUDED.mechanics,
      choices = EXCLUDED.choices;

    INSERT INTO rule_template_levels (id, template_id, level, mechanics, choices)
    VALUES (
      'level:14:wizard-enchantment', 'template:subclass:wizard-enchantment', 14, '[{"id":"alter-memories-l14","type":"grant","target":"trait","key":"alter-memories","sourceKey":"alter-memories-l14-1","presentation":{"authorExplanation":"Накладывая заклинания Очарования для очарования существ, вы можете заставить одно из существ забыть факт наложения (если оно проваливает спасбросок Интеллекта). Вы также можете заставить его забыть до 1 часа воспоминаний за время, пока оно было очаровано."}}]'::jsonb, '[]'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      mechanics = EXCLUDED.mechanics,
      choices = EXCLUDED.choices;

    -- Школа Преобразования
    INSERT INTO rule_templates (id, kind, slug, name, description, version, catalog_key, parent_template_id, unlock_level, mechanics, choices, is_builtin, is_active)
    VALUES (
      'template:subclass:wizard-transmutation', 'subclass', 'wizard-transmutation', 'Школа Преобразования', 'Трансмутаторы — это исследователи, стремящиеся изменять структуру материи, превращая одно в другое, изменяя законы физики.', 1, 'subclass:wizard:transmutation', 'template:class:wizard', 3, '[]'::jsonb, '[]'::jsonb, true, true
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
      'level:3:wizard-transmutation', 'template:subclass:wizard-transmutation', 3, '[{"id":"transmutation-savant-l3","type":"grant","target":"trait","key":"transmutation-savant","sourceKey":"transmutation-savant-l3-1","presentation":{"authorExplanation":"[PHB 2014] Золото и время, которые вы тратите на копирование заклинания Преобразования в свою книгу заклинаний, уменьшаются вдвое."}},{"id":"minor-alchemy-l3","type":"grant","target":"trait","key":"minor-alchemy","sourceKey":"minor-alchemy-l3-1","presentation":{"authorExplanation":"Вы можете временно изменять физические свойства немагического объекта (дерево, камень, железо, медь или серебро), тратя по 10 минут за каждый кубический фут материала. Эффект длится 1 час или пока вы не отмените его (не требует действия)."}}]'::jsonb, '[{"key":"transmutation-savant-spells","label":"Заклинания Преобразования","target":"trait","options":[],"options_query":"spell:school=transmutation","count":2}]'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      mechanics = EXCLUDED.mechanics,
      choices = EXCLUDED.choices;

    INSERT INTO rule_template_levels (id, template_id, level, mechanics, choices)
    VALUES (
      'level:6:wizard-transmutation', 'template:subclass:wizard-transmutation', 6, '[{"id":"transmuters-stone-l6","type":"action","key":"action:transmuters-stone","label":"Создать камень преобразователя","economy":"action","sourceKey":"transmuters-stone-l6-1","presentation":{"authorExplanation":"Вы можете потратить 8 часов, чтобы создать Камень преобразователя, дающий носителю один бафф на выбор: Темное зрение (60 фт.), Скорость +10 фт., Владение спасбросками Телосложения, или сопротивление урону (кислота, холод, огонь, молния или звук). Вы можете менять эффект при касте заклинаний Преобразования."}}]'::jsonb, '[]'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      mechanics = EXCLUDED.mechanics,
      choices = EXCLUDED.choices;

    INSERT INTO rule_template_levels (id, template_id, level, mechanics, choices)
    VALUES (
      'level:10:wizard-transmutation', 'template:subclass:wizard-transmutation', 10, '[{"id":"shapechanger-l10","type":"spell","key":"spell:polymorph","payload":{"spell":{"name":"Превращение (Зверь 1 ОП)","level":4,"school":"transmutation"},"preparation":{"mode":"always_prepared"},"methods":[{"key":"shapechanger-cast","kind":"class_feature","resourceOptions":[{"key":"shapechanger-charge","costs":[{"key":"resource:shapechanger","amount":1}]}]}]},"sourceKey":"shapechanger-l10-1","presentation":{"authorExplanation":"Вы получаете заклинание Превращение (Polymorph). Вы можете накладывать его на себя один раз без ячейки до короткого или долгого отдыха (только в зверя опасности 1 или ниже)."}},{"id":"shapechanger-resource-l10","type":"resource","key":"resource:shapechanger","label":"Перевертыш (использование)","max":1,"recharge":["short_rest","long_rest"]}]'::jsonb, '[]'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      mechanics = EXCLUDED.mechanics,
      choices = EXCLUDED.choices;

    INSERT INTO rule_template_levels (id, template_id, level, mechanics, choices)
    VALUES (
      'level:14:wizard-transmutation', 'template:subclass:wizard-transmutation', 14, '[{"id":"master-transmuter-l14","type":"grant","target":"trait","key":"master-transmuter","sourceKey":"master-transmuter-l14-1","presentation":{"authorExplanation":"Вы можете разрушить свой Камень преобразователя действием для мощного эффекта: Полное преобразование (предмет 5x5x5 в другой), Панацея (снять все недуги и восстановить хиты), Восстановление жизни (каст Raise Dead без компонентов) или Омоложение (омолодить цель на 3d10 лет)."}}]'::jsonb, '[]'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      mechanics = EXCLUDED.mechanics,
      choices = EXCLUDED.choices;

  END IF;

END $$;
