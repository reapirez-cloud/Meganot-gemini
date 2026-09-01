begin;

-- CLASS_INTEGRATION_STRICT: class:fighter
-- CLASS_INTEGRATION_STRICT: class:cleric
-- CLASS_PACKAGE_TEST: tests/classTextNarrationAudit.test.ts
-- Text-only audit. Structured class mechanics, resources, actions, formulas and effects are not changed here.

create or replace function private.voss_feature_comment(
  p_label text,
  p_description text,
  p_source_key text
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_label text := coalesce(nullif(trim(p_label),''),'Эта способность');
  v_description text := lower(coalesce(p_description,''));
  v_seed integer := mod(char_length(coalesce(p_label,'')) + char_length(coalesce(p_source_key,'')), 4);
begin
  if v_description ~ '(восстанавлив|лечен|исцелен|временн.{0,8}hp|хитов)' then
    return case v_seed
      when 0 then 'Лечение не исправляет дурных решений. Оно лишь позволяет пережить их и принять следующие.'
      when 1 then 'Полезная вещь. Особенно для тех, кто считает собственную кровь неисчерпаемым ресурсом.'
      when 2 then 'Хороший лекарь возвращает бойца в строй. Плохой — даёт ему время снова полезть под клинок.'
      else 'Пока остальные упражняются в героизме, кому-то приходится сводить дебет с кредитом по чужим ранам.'
    end;
  elsif v_description ~ '(реакци|уменьш.{0,12}урон|сопротивлен|кд|укрыти|спасброс)' then
    return case v_seed
      when 0 then 'Защита особенно хороша за миг до того, как становится поздно. После — это уже работа могильщика.'
      when 1 then 'Редкий дар: возможность пожалеть о чужом ударе ещё до того, как он закончил вас убеждать.'
      when 2 then 'Пережить удар — не победа. Но мёртвые спорят с этим заметно реже.'
      else 'Броня, выдержка, удача — названия разные. Смысл один: сегодня хоронят кого-то другого.'
    end;
  elsif v_description ~ '(заклин|магичес|ритуал|телекин|пси|ру[нн])' then
    return case v_seed
      when 0 then 'Магия — превосходный инструмент. Особенно если не спрашивать, почему после неё стены дымятся.'
      when 1 then 'Когда сталь перестаёт убеждать, люди обычно зовут это магией и продолжают спор уже с руинами.'
      when 2 then 'Ничего таинственного: правильный жест, правильная цена и достаточно свидетелей, чтобы потом всё отрицать.'
      else 'Чудеса ценят до первого счёта. Потом внезапно выясняется, что даже невозможное имеет расход.'
    end;
  elsif v_description ~ '(атак|урон|крит|оруж|стрел|удар|ман[её]вр)' then
    return case v_seed
      when 0 then 'Тонкость здесь простая: враг должен понять ошибку раньше, чем перестанет понимать вообще.'
      when 1 then 'Хороший приём заканчивает спор. Отличный — ещё и сокращает число желающих его продолжить.'
      when 2 then 'Сталь не любит длинных объяснений. В этом у неё есть чему поучиться.'
      else 'Можно назвать это техникой. Человек на другом конце оружия, как правило, использует выражения короче.'
    end;
  elsif v_description ~ '(перемест|скорост|телепорт|полет|пол[её]т|досягаем)' then
    return case v_seed
      when 0 then 'Правильное место в бою — там, где вас не ждали. Неправильное обычно узнаётся по количеству клинков вокруг.'
      when 1 then 'Ноги спасли больше героев, чем баллады готовы признать. Баллады вообще отвратительно считают.'
      when 2 then 'Расстояние — тоже оружие. Просто им редко удаётся эффектно размахивать на портрете.'
      else 'Кто первым меняет позицию, тот обычно выбирает, где останется кровь. Иногда даже не своя.'
    end;
  elsif v_description ~ '(харизм|убежден|запугив|выступлен|язык|проницатель|навык|провер)' then
    return case v_seed
      when 0 then 'Слова дешевле стрел, пока не выясняется, сколько людей готовы убить за неудачно выбранное.'
      when 1 then 'Умение говорить с людьми полезно. Особенно когда альтернатива — выяснять их убеждения по содержимому карманов.'
      when 2 then 'Хорошая речь открывает двери. Плохая тоже, но обычно плечом и под крики стражи.'
      else 'Знание и обаяние редко выглядят героически. Зато могил после них обычно меньше.'
    end;
  else
    return case v_seed
      when 0 then v_label || '. Название звучит внушительно. К счастью, правило полезнее названия — читайте его целиком.'
      when 1 then v_label || '. Ещё один инструмент между вами и преждевременным некрологом. Пользуйтесь до написания последнего.'
      when 2 then v_label || '. В умелых руках — преимущество. В неумелых — весьма подробное объяснение для следующего персонажа.'
      else v_label || '. Запомните условие применения. Надгробия полны людей, которые помнили только красивую часть.'
    end;
  end if;
end;
$$;

create or replace function private.audit_feature_mechanics_text(p_mechanics jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    case
      when m->>'type'='grant' and m->>'target'='feature' then
        jsonb_set(
          m,
          '{payload,authorComment}',
          to_jsonb(coalesce(
            nullif(trim(m->'payload'->>'authorComment'),''),
            private.voss_feature_comment(
              m->'payload'->>'label',
              m->'payload'->>'description',
              m->>'sourceKey'
            )
          )),
          true
        )
      else m
    end
    order by ord
  ), '[]'::jsonb)
  from jsonb_array_elements(
    case when jsonb_typeof(coalesce(p_mechanics,'[]'::jsonb))='array' then coalesce(p_mechanics,'[]'::jsonb) else '[]'::jsonb end
  ) with ordinality q(m,ord);
$$;

create or replace function private.audit_feature_option_levels_text(p_levels jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(level_key, private.audit_feature_mechanics_text(level_mechanics)), '{}'::jsonb)
  from jsonb_each(case when jsonb_typeof(coalesce(p_levels,'{}'::jsonb))='object' then coalesce(p_levels,'{}'::jsonb) else '{}'::jsonb end) q(level_key,level_mechanics);
$$;

create or replace function private.audit_feature_choice_text(p_choice jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_result jsonb := coalesce(p_choice,'{}'::jsonb);
  v_options jsonb;
  v_levels jsonb;
begin
  if jsonb_typeof(v_result->'option_mechanics')='object' then
    select coalesce(jsonb_object_agg(option_key, private.audit_feature_mechanics_text(option_mechanics)), '{}'::jsonb)
      into v_options
    from jsonb_each(v_result->'option_mechanics') q(option_key,option_mechanics);
    v_result := jsonb_set(v_result,'{option_mechanics}',coalesce(v_options,'{}'::jsonb),true);
  end if;

  if jsonb_typeof(v_result->'option_mechanics_by_level')='object' then
    select coalesce(jsonb_object_agg(option_key, private.audit_feature_option_levels_text(option_levels)), '{}'::jsonb)
      into v_levels
    from jsonb_each(v_result->'option_mechanics_by_level') q(option_key,option_levels);
    v_result := jsonb_set(v_result,'{option_mechanics_by_level}',coalesce(v_levels,'{}'::jsonb),true);
  end if;

  return v_result;
end;
$$;

create or replace function private.audit_feature_choices_text(p_choices jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(private.audit_feature_choice_text(choice_value) order by ord),'[]'::jsonb)
  from jsonb_array_elements(
    case when jsonb_typeof(coalesce(p_choices,'[]'::jsonb))='array' then coalesce(p_choices,'[]'::jsonb) else '[]'::jsonb end
  ) with ordinality q(choice_value,ord);
$$;

create or replace function private.patch_feature_description_text(
  p_mechanics jsonb,
  p_source_key text,
  p_description text
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    case
      when m->>'type'='grant' and m->>'target'='feature' and m->>'sourceKey'=p_source_key
        then jsonb_set(m,'{payload,description}',to_jsonb(p_description),true)
      else m
    end
    order by ord
  ),'[]'::jsonb)
  from jsonb_array_elements(coalesce(p_mechanics,'[]'::jsonb)) with ordinality q(m,ord);
$$;

create or replace function private.apply_class_text_voss_audit(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fighter uuid;
  v_cleric uuid;
  v_banneret uuid;
begin
  select id into v_fighter
  from public.rule_templates
  where campaign_id=p_campaign_id and is_active and catalog_key='class:fighter'
  order by version desc limit 1;

  select id into v_cleric
  from public.rule_templates
  where campaign_id=p_campaign_id and is_active and catalog_key='class:cleric'
  order by version desc limit 1;

  -- The class-progression rows must explain what the choice actually does rather than merely saying that a choice opens.
  if v_fighter is not null then
    update public.rule_template_levels
    set mechanics=private.patch_feature_description_text(
      mechanics,
      'fighter-subclass',
      'На 3 уровне выберите Воинский архетип. Вы сразу получаете способности 3 уровня выбранного подкласса. На 7, 10, 15 и 18 уровнях Воина тот же архетип даёт следующие способности; повторно выбирать подкласс не нужно, а точные правила каждой способности находятся в его прогрессии.'
    )
    where template_id=v_fighter and level=3;

    update public.rule_template_levels
    set mechanics=private.patch_feature_description_text(
      mechanics,
      'subclass',
      'На этом уровне выбранный Воинский архетип даёт способность этого уровня. Используйте полное правило из прогрессии уже выбранного подкласса; новый архетип не выбирается.'
    )
    where template_id=v_fighter and level in (7,10,15,18);

    update public.rule_template_levels
    set mechanics=private.patch_feature_description_text(
      mechanics,
      'ability-score-improvement',
      'Получите талант «Улучшение характеристик» или другой талант по выбору, требованиям которого соответствуете. Если выбран «Улучшение характеристик», увеличьте одну характеристику на 2 либо две характеристики на 1; этим талантом нельзя поднять характеристику выше 20. Воин получает эту возможность на 4, 6, 8, 12, 14 и 16 уровнях.'
    )
    where template_id=v_fighter and level in (4,6,8,12,14,16);

    update public.rule_template_levels
    set mechanics=private.patch_feature_description_text(
      mechanics,
      'epic-boon',
      'На 19 уровне получите один талант категории «Эпический дар» или другой талант по выбору, требованиям которого соответствуете. Выбранный талант действует по собственному полному описанию и не расходует отдельный классовый ресурс.'
    )
    where template_id=v_fighter and level=19;
  end if;

  if v_cleric is not null then
    update public.rule_template_levels
    set mechanics=private.patch_feature_description_text(
      mechanics,
      'spellcasting',
      'Мудрость — заклинательная характеристика Жреца; священный символ можно использовать как заклинательную фокусировку. На 1 уровне вы знаете 3 заговора, подготавливаете 4 заклинания Жреца 1 уровня и имеете 2 ячейки 1 уровня. Дальше число заговоров, подготовленных заклинаний и ячеек берётся из таблицы Жреца. Чтобы сотворить подготовленное заклинание 1 уровня или выше, потратьте ячейку подходящего уровня; все потраченные ячейки возвращаются после долгого отдыха. После каждого долгого отдыха можно заменить любое число подготовленных заклинаний другими заклинаниями Жреца тех уровней, для которых у вас есть ячейки.'
    )
    where template_id=v_cleric and level=1;

    update public.rule_template_levels
    set mechanics=private.patch_feature_description_text(
      mechanics,
      'cleric-subclass',
      'На 3 уровне выберите домен Жреца. Вы сразу получаете способности 3 уровня выбранного домена. На 6 и 17 уровнях Жреца тот же домен даёт следующие способности; повторно выбирать домен не нужно, а точные правила каждой способности находятся в прогрессии подкласса.'
    )
    where template_id=v_cleric and level=3;

    update public.rule_template_levels
    set mechanics=private.patch_feature_description_text(
      mechanics,
      'subclass',
      'На этом уровне выбранный домен даёт способность этого уровня. Используйте полное правило из прогрессии уже выбранного подкласса; новый домен не выбирается.'
    )
    where template_id=v_cleric and level in (6,17);

    update public.rule_template_levels
    set mechanics=private.patch_feature_description_text(
      mechanics,
      'ability-score-improvement',
      'Получите талант «Улучшение характеристик» или другой талант по выбору, требованиям которого соответствуете. Если выбран «Улучшение характеристик», увеличьте одну характеристику на 2 либо две характеристики на 1; этим талантом нельзя поднять характеристику выше 20. Жрец получает эту возможность на 4, 8, 12 и 16 уровнях.'
    )
    where template_id=v_cleric and level in (4,8,12,16);

    update public.rule_template_levels
    set mechanics=private.patch_feature_description_text(
      mechanics,
      'epic-boon',
      'На 19 уровне получите один талант категории «Эпический дар» или другой талант по выбору, требованиям которого соответствуете. Выбранный талант действует по собственному полному описанию и не расходует отдельный классовый ресурс.'
    )
    where template_id=v_cleric and level=19;
  end if;

  -- One remaining Fighter subclass card was still a pointer to unnamed subfeatures rather than a rule.
  select id into v_banneret
  from public.rule_templates
  where campaign_id=p_campaign_id
    and is_active
    and catalog_key='subclass:fighter:banneret'
  order by version desc
  limit 1;

  if v_banneret is not null then
    update public.rule_template_levels
    set mechanics=private.patch_feature_description_text(
      mechanics,
      'knightly-envoy',
      'Посланник рыцарства даёт три эффекта. Понимание: вы можете накладывать «Понимание языков» только как ритуал; заклинательная характеристика для него — Харизма. Полиглот: вы знаете один дополнительный язык; после долгого отдыха можете заменить его другим языком, который слышали, видели в жестах или читали за последние 24 часа. Поставленная речь: получите владение одним навыком на выбор — Проницательность, Запугивание, Убеждение или Выступление.'
    )
    where template_id=v_banneret;
  end if;

  -- Remove engine/developer language from summaries. These are rules-facing descriptions, not implementation notes.
  update public.rule_templates
  set mechanical_summary='Воин 2024: Второе дыхание лечит и восстанавливается частично или полностью после отдыха; Всплеск действий даёт дополнительное действие; Неукротимый позволяет перебросить проваленный спасбросок; Мастерство оружия и число атак растут с уровнем.',
      updated_at=now()
  where campaign_id=p_campaign_id and is_active and catalog_key='class:fighter';

  update public.rule_templates
  set mechanical_summary='Жрец 2024: подготовленный заклинатель на Мудрости. Заговоры, число подготовленных заклинаний и ячейки растут по таблице класса; Божественный канал имеет отдельный запас, а выбранный домен добавляет собственные способности и всегда подготовленные заклинания.',
      updated_at=now()
  where campaign_id=p_campaign_id and is_active and catalog_key='class:cleric';

  update public.rule_templates
  set mechanical_summary='Пси-воин: Кости пси-энергии усиливают защиту, урон и телекинез. Размер и число костей растут с уровнем Воина; после короткого отдыха возвращается 1 потраченная кость, после долгого — весь запас. Отдельные пси-способности указывают собственные бесплатные применения и способы повторного использования.',
      updated_at=now()
  where campaign_id=p_campaign_id and is_active and catalog_key='subclass:fighter:psi-warrior';

  -- Add a renderer-only Voss comment to every feature grant, including feature grants nested inside persistent choices.
  update public.rule_templates t
  set mechanics=private.audit_feature_mechanics_text(t.mechanics),
      choices=private.audit_feature_choices_text(t.choices),
      rules_meta=coalesce(t.rules_meta,'{}'::jsonb)||jsonb_build_object(
        'feature_author_comments',true,
        'feature_author','Рейнар Восс',
        'feature_author_voice',jsonb_build_array('циничный','саркастичный','чёрный юмор'),
        'feature_author_clarity_first',true
      ),
      updated_at=now()
  where t.campaign_id=p_campaign_id
    and t.is_active
    and (
      t.catalog_key='class:fighter'
      or t.catalog_key like 'subclass:fighter:%'
      or t.catalog_key='class:cleric'
    );

  update public.rule_template_levels l
  set mechanics=private.audit_feature_mechanics_text(l.mechanics),
      choices=private.audit_feature_choices_text(l.choices)
  where exists(
    select 1
    from public.rule_templates t
    where t.id=l.template_id
      and t.campaign_id=p_campaign_id
      and t.is_active
      and (
        t.catalog_key='class:fighter'
        or t.catalog_key like 'subclass:fighter:%'
        or t.catalog_key='class:cleric'
      )
  );
end;
$$;

create or replace function private.apply_class_text_voss_audit_after_campaign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.apply_class_text_voss_audit(new.id);
  return new;
end;
$$;

-- Alphabetically after the catalog/Fighter completion triggers: future campaigns receive the final text layer last.
drop trigger if exists zzzzzzzzz_campaigns_class_text_voss_audit on public.campaigns;
create trigger zzzzzzzzz_campaigns_class_text_voss_audit
after insert on public.campaigns
for each row execute function private.apply_class_text_voss_audit_after_campaign();

do $$
declare r record;
begin
  for r in select id from public.campaigns loop
    perform private.apply_class_text_voss_audit(r.id);
  end loop;
end $$;

commit;
