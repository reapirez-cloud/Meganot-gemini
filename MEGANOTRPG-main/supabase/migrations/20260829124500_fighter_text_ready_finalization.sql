begin;

-- CLASS_INTEGRATION_STRICT: class:fighter
-- CLASS_INTEGRATION_STRICT: subclass:fighter:echo-knight
-- CLASS_INTEGRATION_STRICT: subclass:fighter:eldritch-knight
-- CLASS_INTEGRATION_STRICT: subclass:fighter:champion
-- CLASS_PACKAGE_TEST: tests/classTextNarrationAudit.test.ts
-- CLASS_WORK_STATUS: fighter:text=READY;mechanics=NOT_AUDITED
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
-- Presentation-only Fighter closure. This pass changes player/GM prose and project-status metadata only.
-- It does NOT add/remove grants, actions, resources, formulas, costs, effects, spell access, choices or CE dependencies.

create or replace function private.apply_fighter_text_ready_finalization(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Echo Knight level 3 must be self-contained for a GM even before the later mechanics audit.
  -- Unleash Incarnation is stated here as rules prose; this migration does not create or repair its mechanical grant/resource/action.
  perform private.patch_builtin_feature_rule_text(
    p_campaign_id,
    'subclass:fighter:echo-knight',
    3,
    'manifest-echo',
    $r$Бонусным действием создайте магическое полупрозрачное эхо в свободном месте, которое видите в пределах 15 футов. У эха КД 14 + ваш бонус мастерства, 1 HP и иммунитет ко всем состояниям; оно использует ваши бонусы спасбросков, занимает своё пространство и уничтожается, если в конце вашего хода находится дальше 30 футов от вас. На своём ходу можете мысленно переместить эхо на расстояние до 30 футов без действия. Когда совершаете действие Атака, каждую свою атаку можете выполнять из собственного пространства или из пространства эха. Бонусным действием можете поменяться с эхом местами: каждый из вас телепортируется в пространство другого, а вы тратите 15 футов своего перемещения. Когда существо в пределах 5 футов от эха перемещается от него хотя бы на 5 футов, можете реакцией совершить по этому существу атаку по возможности так, будто находитесь в пространстве эха. На 3 уровне вы также получаете «Воплощение ярости»: когда в свой ход совершаете действие Атака, можете потратить 1 использование этой способности и совершить одну дополнительную атаку оружием ближнего боя из пространства эха. Число использований «Воплощения ярости» равно вашему модификатору Телосложения, минимум 1; все потраченные использования возвращаются после долгого отдыха.$r$
  );

  -- Spellcasting progression is written into the card instead of delegating basic usage to an external table.
  perform private.patch_builtin_feature_rule_text(
    p_campaign_id,
    'subclass:fighter:eldritch-knight',
    3,
    'eldritch-knight-spellcasting',
    $r$Интеллект — ваша заклинательная характеристика для заклинаний Мистического рыцаря. На 3 уровне вы знаете 2 заговора Волшебника; на 10 уровне число известных заговоров становится 3. Число подготовленных заклинаний Волшебника равно: 3 на 3 уровне Воина, 4 на 4, 5 на 7, 6 на 8, 7 на 10, 8 на 11, 9 на 13, 10 на 14, 11 на 16, 12 на 19 и 13 на 20. Подготавливайте заклинания тех уровней, которые способны накладывать имеющимися ячейками. При получении нового уровня Воина можете заменить одно подготовленное заклинание Мистического рыцаря другим доступным заклинанием Волшебника. Прогрессия ячеек подкласса: на 3 уровне — 2 ячейки 1 уровня; на 4 — 3 ячейки 1 уровня; на 7 — 4 ячейки 1 уровня и 2 ячейки 2 уровня; на 10 — 4 ячейки 1 уровня и 3 ячейки 2 уровня; на 13 — дополнительно 2 ячейки 3 уровня; на 16 — 3 ячейки 3 уровня; на 19 — дополнительно 1 ячейка 4 уровня. Чтобы наложить заклинание 1 уровня или выше, потратьте ячейку не ниже уровня заклинания; потраченные ячейки возвращаются после долгого отдыха.$r$
  );

  perform private.patch_builtin_feature_rule_text(
    p_campaign_id,
    'subclass:fighter:champion',
    7,
    'additional-fighting-style',
    $r$Получите ещё один талант категории «Боевой стиль», требованиям которого соответствуете. Это отдельный дополнительный Боевой стиль: он не заменяет стиль, полученный от базового Воина, и оба стиля действуют одновременно по собственным правилам. Если правило таланта не разрешает выбирать его повторно, выберите другой подходящий Боевой стиль.$r$
  );

  update public.rule_templates
  set mechanical_summary='Кавалерист помечает противника Непоколебимой меткой, реакцией защищает себя или соседнего союзника Защитным манёвром, останавливает перемещение атаками по возможности через «Держать строй», сбивает цели Свирепым натиском и на 18 уровне получает отдельную специальную реакцию для атаки по возможности на каждом ходу другого существа.',
      updated_at=now()
  where campaign_id=p_campaign_id and is_active and catalog_key='subclass:fighter:cavalier';

  update public.rule_templates
  set mechanical_summary='Чемпион наносит критические попадания оружием и безоружными ударами при 19–20, а с 15 уровня при 18–20; получает преимущество на инициативу и Атлетику, дополнительный Боевой стиль, Героическое вдохновение в начале своего хода в бою и на 18 уровне улучшенные спасброски от смерти вместе с восстановлением HP, пока Окровавлен.',
      updated_at=now()
  where campaign_id=p_campaign_id and is_active and catalog_key='subclass:fighter:champion';

  update public.rule_templates
  set mechanical_summary='Рыцарь Эха бонусным действием создаёт эхо и проводит атаки, телепортацию и атаки по возможности через его позицию. «Воплощение ярости» даёт ограниченные дополнительные ближние атаки из пространства эха; позднее подкласс получает дальнее восприятие через эхо, Теневого мученика, Возврат потенциала и возможность поддерживать два эха одновременно.',
      updated_at=now()
  where campaign_id=p_campaign_id and is_active and catalog_key='subclass:fighter:echo-knight';

  update public.rule_templates
  set mechanical_summary='Самурай имеет 3 использования Боевого духа за долгий отдых: бонусным действием получает преимущество на атаки оружием до конца хода и временные HP. Позднее он добавляет Мудрость к Убеждению и получает владение спасбросками, возвращает 1 Боевой дух при инициативе с пустым запасом, превращает преимущество одной атаки в дополнительную атаку и на 18 уровне может реакцией совершить дополнительный ход при падении до 0 HP один раз за долгий отдых.',
      updated_at=now()
  where campaign_id=p_campaign_id and is_active and catalog_key='subclass:fighter:samurai';

  -- Project-status metadata is deliberately separate from gameplay mechanics.
  -- Future Fighter work MUST update CLASS_WORK_STATUS.md and reopen the affected layer before changing it.
  update public.rule_templates
  set rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
        'class_work_status',jsonb_build_object(
          'text','READY',
          'mechanics','NOT_AUDITED',
          'text_audit_date','2026-08-29',
          'status_ledger','src/rule-templates/CLASS_WORK_STATUS.md'
        )
      ),
      updated_at=now()
  where campaign_id=p_campaign_id
    and is_active
    and (catalog_key='class:fighter' or catalog_key like 'subclass:fighter:%');
end;
$$;

create or replace function private.apply_fighter_text_ready_finalization_after_campaign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.apply_fighter_text_ready_finalization(new.id);
  return new;
end;
$$;

drop trigger if exists zzzzzzzzzzzzzz_campaigns_fighter_text_ready_finalization on public.campaigns;
create trigger zzzzzzzzzzzzzz_campaigns_fighter_text_ready_finalization
after insert on public.campaigns
for each row execute function private.apply_fighter_text_ready_finalization_after_campaign();

do $$
declare r record;
begin
  for r in select id from public.campaigns loop
    perform private.apply_fighter_text_ready_finalization(r.id);
  end loop;
end $$;

commit;
