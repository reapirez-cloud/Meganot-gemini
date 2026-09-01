begin;

-- CLASS_INTEGRATION_STRICT: class:fighter
-- CLASS_INTEGRATION_STRICT: subclass:fighter:arcane-archer
-- CLASS_INTEGRATION_STRICT: class:cleric
-- CLASS_PACKAGE_TEST: tests/classTextNarrationAudit.test.ts
-- Final player-facing prose pass only. Structured mechanics remain untouched.

create or replace function private.apply_class_reference_text_final_pass(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.rule_templates
  set mechanical_summary='Мистический лучник имеет 2 использования Магического выстрела, которые полностью возвращаются после короткого или долгого отдыха. На 3 уровне он выбирает 2 варианта выстрела, затем изучает ещё по одному варианту на 7, 10, 15 и 18 уровнях; общий запас применений остаётся равен 2.',
      updated_at=now()
  where campaign_id=p_campaign_id and is_active and catalog_key='subclass:fighter:arcane-archer';

  update public.rule_templates
  set mechanical_summary='Мастер боя расходует Кости превосходства на выбранные приёмы. На 3 уровне он знает 3 приёма и имеет 4к8; на 7 уровне знает 5 приёмов и имеет 5 костей; на 10 уровне знает 7 приёмов и кость становится к10; на 15 уровне знает 9 приёмов и имеет 6 костей; на 18 уровне кость становится к12. Потраченные кости полностью возвращаются после короткого или долгого отдыха.',
      updated_at=now()
  where campaign_id=p_campaign_id and is_active and catalog_key='subclass:fighter:battle-master';

  update public.rule_templates
  set mechanical_summary='Мистический рыцарь использует Интеллект для заклинаний Волшебника, знает заговоры и подготавливает ограниченное число заклинаний по своей прогрессии. Потраченные ячейки возвращаются после долгого отдыха. Связь с оружием позволяет призывать связанное оружие, а Боевая магия на высоких уровнях заменяет часть атак заклинаниями.',
      updated_at=now()
  where campaign_id=p_campaign_id and is_active and catalog_key='subclass:fighter:eldritch-knight';

  update public.rule_templates
  set mechanical_summary='Баннерет превращает базовые ресурсы Воина в поддержку отряда: Групповое оздоровление лечит союзников вместе со Вторым дыханием и имеет отдельный лимит 1 раз между короткими или долгими отдыхами; Воодушевляющий всплеск даёт союзникам реакцию при Всплеске действий; Устойчивость команды тратит Неукротимого, чтобы союзник перебросил проваленный спасбросок.',
      updated_at=now()
  where campaign_id=p_campaign_id and is_active and catalog_key='subclass:fighter:banneret';

  update public.rule_templates
  set mechanical_summary='Рунный рыцарь выбирает 2 руны на 3 уровне, 3 на 7, 4 на 10 и 5 на 15; Холмовая и Штормовая руны доступны с 7 уровня. У каждой выбранной руны свой эффект и своё применение, которое возвращается после короткого или долгого отдыха; с 15 уровня каждую известную руну можно активировать дважды между отдыхами.',
      updated_at=now()
  where campaign_id=p_campaign_id and is_active and catalog_key='subclass:fighter:rune-knight';
end;
$$;

create or replace function private.apply_class_reference_text_final_pass_after_campaign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.apply_class_reference_text_final_pass(new.id);
  return new;
end;
$$;

drop trigger if exists zzzzzzzzzzz_campaigns_class_reference_text_final_pass on public.campaigns;
create trigger zzzzzzzzzzz_campaigns_class_reference_text_final_pass
after insert on public.campaigns
for each row execute function private.apply_class_reference_text_final_pass_after_campaign();

do $$
declare r record;
begin
  for r in select id from public.campaigns loop
    perform private.apply_class_reference_text_final_pass(r.id);
  end loop;
end $$;

commit;
