begin;

-- CLASS_INTEGRATION_STRICT: class:druid
-- CLASS_INTEGRATION_STRICT: subclass:druid:moon
-- CLASS_PACKAGE_TEST: tests/classTextNarrationAudit.test.ts
-- CLASS_WORK_STATUS: druid:text=READY;mechanics=NOT_AUDITED
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
-- PRESENTATION ONLY. Player-facing Druid text contains only game rules and in-world author copy.
-- No choices, resources, actions, formulas, effects, levels or Character Engine behavior are changed.

update public.rule_templates
set mechanical_summary = 'К8 здоровья, Мудрость как заклинательная характеристика, полный подготовленный прогресс заклинаний и Дикая форма: 2 использования, HP и физические характеристики зверя, полное восстановление после короткого или долгого отдыха.',
    author_description = 'Друид сочетает подготовленную природную магию с Дикой формой, Диким спутником, обменом ячеек и формы и способностями выбранного Круга.',
    updated_at = now()
where is_active and catalog_key = 'class:druid';

update public.rule_templates
set mechanical_summary = 'Боевая специализация Дикой формы: повышает предел CR и КД зверя, позволяет накладывать заклинания Круга в форме, добавляет излучающий урон и открывает Лунный шаг с переносом союзника.',
    author_description = 'Круг Луны превращает Дикую форму в основной боевой инструмент: повышает допустимую опасность зверей и их защиту, позволяет применять заклинания Круга в форме, усиливает атаки излучающим уроном и открывает Лунный шаг.',
    author_comment = 'Если медведь телепортируется вам за спину, спор о том, разумна ли природа, уже закончен.',
    updated_at = now()
where is_active and catalog_key = 'subclass:druid:moon';

update public.rule_template_levels rtl
set mechanics = (
  select coalesce(jsonb_agg(
    case
      when mechanic->>'type' = 'grant'
        and mechanic->>'target' = 'feature'
        and mechanic->>'id' = 'druid-wild-shape-rules'
      then jsonb_set(
        jsonb_set(
          jsonb_set(mechanic, '{payload,label}', to_jsonb('Дикая форма'::text), true),
          '{payload,description}',
          to_jsonb('Действием потратьте 1 из 2 использований Дикой формы и превратитесь в зверя, которого уже видели и который удовлетворяет пределу CR и ограничениям перемещения. Форма длится число часов, равное половине уровня друида с округлением вниз; выйти раньше можно бонусным действием. Сила, Ловкость, Телосложение, HP и физические возможности берутся у зверя, а Интеллект, Мудрость, Харизма, личность и мировоззрение остаются вашими. Сохраняются ваши владения навыками и спасбросками и добавляются владения зверя; при совпадении используйте больший итоговый бонус. При 0 HP формы вы возвращаетесь в обычный облик, а избыточный урон переносится на обычные HP; форма также заканчивается при потере сознания или смерти. До «Заклинаний зверя» в форме нельзя накладывать заклинания, но уже действующая концентрация не прерывается. Классовые, видовые и иные способности сохраняются, если новый облик физически способен ими пользоваться; особые чувства работают только если они есть у зверя. Для каждого предмета снаряжения при превращении выберите: он падает, остаётся надетым или переносимым либо сливается с формой; слитый предмет не действует. Запас всегда равен 2 использованиям, и оба полностью восстанавливаются после короткого или долгого отдыха.'::text), true)
        ),
        '{payload,authorComment}',
        to_jsonb('Сегодня лекарь, через мгновение — волк. Если после драки кто-то спрашивает, куда делись штаны, значит всё прошло лучше обычного.'::text), true
      )
      else mechanic
    end
    order by ord
  ), '[]'::jsonb)
  from jsonb_array_elements(coalesce(rtl.mechanics, '[]'::jsonb)) with ordinality as items(mechanic, ord)
)
where rtl.level = 2
  and rtl.template_id in (
    select id from public.rule_templates where is_active and catalog_key = 'class:druid'
  );

update public.rule_template_levels rtl
set mechanics = (
  select coalesce(jsonb_agg(
    case
      when mechanic->>'type' = 'grant'
        and mechanic->>'target' = 'feature'
        and mechanic->>'id' = 'moon-circle-forms'
      then jsonb_set(
        jsonb_set(
          jsonb_set(mechanic, '{payload,label}', to_jsonb('Формы круга и заклинания Луны'::text), true),
          '{payload,description}',
          to_jsonb('Максимальный CR зверя для вашей Дикой формы равен уровню друида / 3 с округлением вниз. Пока вы в форме, ваш КД равен большему из двух значений: обычный КД зверя или 13 + модификатор Мудрости. Заклинания Круга Луны всегда подготовлены, не занимают обычный лимит и могут накладываться вами даже в Дикой форме: с 3 уровня «Лечение ран», «Лунный луч», «Звёздный огонёк»; с 5 — «Призыв животных»; с 7 — «Источник лунного света»; с 9 — «Массовое лечение ран».'::text), true)
        ),
        '{payload,authorComment}',
        to_jsonb('Лунный друид становится зверем лучше остальных. Если медведь выглядит слишком уверенно, переговоры уже провалились.'::text), true
      )
      else mechanic
    end
    order by ord
  ), '[]'::jsonb)
  from jsonb_array_elements(coalesce(rtl.mechanics, '[]'::jsonb)) with ordinality as items(mechanic, ord)
)
where rtl.level = 3
  and rtl.template_id in (
    select id from public.rule_templates where is_active and catalog_key = 'subclass:druid:moon'
  );

-- Guard the effective player-facing rows touched by this fix. Historical migrations may
-- retain provenance notes for developers, but active rule text may not expose them.
do $$
declare v_leaks integer;
begin
  with visible_text as (
    select mechanical_summary as text from public.rule_templates
      where is_active and catalog_key in ('class:druid','subclass:druid:moon')
    union all
    select author_description from public.rule_templates
      where is_active and catalog_key in ('class:druid','subclass:druid:moon')
    union all
    select m->'payload'->>'description'
      from public.rule_templates rt
      join public.rule_template_levels rtl on rtl.template_id = rt.id
      cross join lateral jsonb_array_elements(coalesce(rtl.mechanics,'[]'::jsonb)) m
      where rt.is_active
        and rt.catalog_key in ('class:druid','subclass:druid:moon')
        and m->>'type'='grant' and m->>'target'='feature'
  )
  select count(*) into v_leaks
  from visible_text
  where lower(coalesce(text,'')) ~ '(модель 20[0-9]{2}|верси[яи] 20[0-9]{2}|эта кампания|в этой кампании|проектн|совместимост|meganot|character engine|runtime|миграц)';

  if v_leaks > 0 then
    raise exception 'Druid player text immersion failed: % meta-language rows remain', v_leaks;
  end if;
end $$;

commit;
