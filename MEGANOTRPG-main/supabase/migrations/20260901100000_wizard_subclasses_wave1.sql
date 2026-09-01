begin;

create or replace function private.install_wizard_subclasses(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wizard uuid;
  v_subclass uuid;
begin
  select id into v_wizard from public.rule_templates where campaign_id = p_campaign_id and catalog_key = 'class:wizard' limit 1;
  if v_wizard is null then return; end if;


  insert into public.rule_templates(
    campaign_id, kind, slug, name, description, version, mechanics, choices,
    parent_template_id, unlock_level, catalog_key, catalog_revision, source_kind, source_label, is_builtin,
    is_active
  ) values (
    p_campaign_id, 'subclass', 'wizard-necromancy', 'Школа некромантии', 'Волшебники школы Некромантии изучают магию, манипулирующую энергиями жизни и смерти.', 1, '[]'::jsonb, '[]'::jsonb,
    v_wizard, 3, 'subclass:wizard:necromancy', '2024', 'official', 'Player''s Handbook 2024', true, true
  )
  on conflict(campaign_id, kind, slug, version) do update set
    name=excluded.name, description=excluded.description, mechanics=excluded.mechanics, choices=excluded.choices,
    parent_template_id=excluded.parent_template_id, unlock_level=excluded.unlock_level, catalog_key=excluded.catalog_key,
    is_builtin=true, is_active=true, updated_at=now()
  returning id into v_subclass;

  delete from public.rule_template_levels where template_id = v_subclass;
  insert into public.rule_template_levels(template_id, level, mechanics, choices) values
  (v_subclass, 3, '[{"id":"necromancy-savant-l3","type":"grant","target":"trait","key":"necromancy-savant","sourceKey":"necromancy-savant-l3-1","presentation":{"authorExplanation":"Время и стоимость копирования заклинаний Некромантии в вашу книгу уменьшены вдвое."}},{"id":"grim-harvest-l3","type":"grant","target":"trait","key":"grim-harvest","sourceKey":"grim-harvest-l3-1","presentation":{"authorExplanation":"Один раз в ход, когда вы убиваете существо заклинанием 1-го уровня или выше, вы восстанавливаете хиты, равные удвоенному уровню заклинания (или утроенному, если это заклинание Некромантии)."}}]'::jsonb, '[]'::jsonb),
  (v_subclass, 6, '[{"id":"undead-thralls-l6","type":"grant","target":"trait","key":"undead-thralls","sourceKey":"undead-thralls-l6-1","presentation":{"authorExplanation":"Вы добавляете Восстание мертвецов в свою книгу. При его накладывании вы можете поднять дополнительного мертвеца. Созданные существа получают бонус к максимуму хитов (равный уровню волшебника) и бонус к урону (равный бонусу мастерства)."}}]'::jsonb, '[]'::jsonb),
  (v_subclass, 10, '[{"id":"inured-to-undeath-l10","type":"grant","target":"trait","key":"inured-to-undeath","sourceKey":"inured-to-undeath-l10-1","presentation":{"authorExplanation":"Вы получаете сопротивление к некротическому урону, и ваш максимум хитов больше не может быть уменьшен."}}]'::jsonb, '[]'::jsonb),
  (v_subclass, 14, '[{"id":"command-undead-l14","type":"grant","target":"trait","key":"command-undead","sourceKey":"command-undead-l14-1","presentation":{"authorExplanation":"Вы можете действием попытаться подчинить себе нежить (цель совершает спасбросок Харизмы, нежить с высоким Интеллектом получает преимущество или иммунитет)."}}]'::jsonb, '[]'::jsonb);

  insert into public.rule_templates(
    campaign_id, kind, slug, name, description, version, mechanics, choices,
    parent_template_id, unlock_level, catalog_key, catalog_revision, source_kind, source_label, is_builtin,
    is_active
  ) values (
    p_campaign_id, 'subclass', 'wizard-conjuration', 'Школа воплощения', 'Волшебники школы Призыва специализируются на заклинаниях, которые создают объекты и существ из ничего или переносят их из других мест.', 1, '[]'::jsonb, '[]'::jsonb,
    v_wizard, 3, 'subclass:wizard:conjuration', '2024', 'official', 'Player''s Handbook 2024', true, true
  )
  on conflict(campaign_id, kind, slug, version) do update set
    name=excluded.name, description=excluded.description, mechanics=excluded.mechanics, choices=excluded.choices,
    parent_template_id=excluded.parent_template_id, unlock_level=excluded.unlock_level, catalog_key=excluded.catalog_key,
    is_builtin=true, is_active=true, updated_at=now()
  returning id into v_subclass;

  delete from public.rule_template_levels where template_id = v_subclass;
  insert into public.rule_template_levels(template_id, level, mechanics, choices) values
  (v_subclass, 3, '[{"id":"conjuration-savant-l3","type":"grant","target":"trait","key":"conjuration-savant","sourceKey":"conjuration-savant-l3-1","presentation":{"authorExplanation":"Время и стоимость копирования заклинаний Вызова в вашу книгу уменьшены вдвое."}},{"id":"minor-conjuration-l3","type":"grant","target":"trait","key":"minor-conjuration","sourceKey":"minor-conjuration-l3-1","presentation":{"authorExplanation":"Действием вы можете создать неволшебный предмет в своей руке (или на земле в 10 футах). Он светится тусклым светом и исчезает через 1 час, если получит урон, или если вы используете умение снова."}}]'::jsonb, '[]'::jsonb),
  (v_subclass, 6, '[{"id":"benign-transposition-l6","type":"grant","target":"trait","key":"benign-transposition","sourceKey":"benign-transposition-l6-1","presentation":{"authorExplanation":"Действием вы можете телепортироваться на 30 футов. Вы можете поменяться местами с согласным существом. Восстанавливается после долгого отдыха или накладывания заклинания Вызова 1+ уровня."}}]'::jsonb, '[]'::jsonb),
  (v_subclass, 10, '[{"id":"focused-conjuration-l10","type":"grant","target":"trait","key":"focused-conjuration","sourceKey":"focused-conjuration-l10-1","presentation":{"authorExplanation":"Получение урона не может нарушить вашу концентрацию на заклинаниях Вызова."}}]'::jsonb, '[]'::jsonb),
  (v_subclass, 14, '[{"id":"durable-summons-l14","type":"grant","target":"trait","key":"durable-summons","sourceKey":"durable-summons-l14-1","presentation":{"authorExplanation":"Любое существо, которое вы вызываете или создаёте заклинанием Вызова, получает 30 временных хитов."}}]'::jsonb, '[]'::jsonb);

  insert into public.rule_templates(
    campaign_id, kind, slug, name, description, version, mechanics, choices,
    parent_template_id, unlock_level, catalog_key, catalog_revision, source_kind, source_label, is_builtin,
    is_active
  ) values (
    p_campaign_id, 'subclass', 'wizard-transmutation', 'Школа преобразования', 'Волшебники школы Преобразования изменяют энергию и материю, манипулируя фундаментальными законами природы.', 1, '[]'::jsonb, '[]'::jsonb,
    v_wizard, 3, 'subclass:wizard:transmutation', '2024', 'official', 'Player''s Handbook 2024', true, true
  )
  on conflict(campaign_id, kind, slug, version) do update set
    name=excluded.name, description=excluded.description, mechanics=excluded.mechanics, choices=excluded.choices,
    parent_template_id=excluded.parent_template_id, unlock_level=excluded.unlock_level, catalog_key=excluded.catalog_key,
    is_builtin=true, is_active=true, updated_at=now()
  returning id into v_subclass;

  delete from public.rule_template_levels where template_id = v_subclass;
  insert into public.rule_template_levels(template_id, level, mechanics, choices) values
  (v_subclass, 3, '[{"id":"transmutation-savant-l3","type":"grant","target":"trait","key":"transmutation-savant","sourceKey":"transmutation-savant-l3-1","presentation":{"authorExplanation":"Время и стоимость копирования заклинаний Преобразования в вашу книгу уменьшены вдвое."}},{"id":"minor-alchemy-l3","type":"grant","target":"trait","key":"minor-alchemy","sourceKey":"minor-alchemy-l3-1","presentation":{"authorExplanation":"Вы можете потратить 10 минут, чтобы изменить физические свойства одного неволшебного предмета (дерево, камень, железо, медь или серебро) на 1 час."}}]'::jsonb, '[]'::jsonb),
  (v_subclass, 6, '[{"id":"transmuters-stone-l6","type":"grant","target":"trait","key":"transmuters-stone","sourceKey":"transmuters-stone-l6-1","presentation":{"authorExplanation":"Вы можете создать камень трансмутатора, дающий носителю один эффект на выбор (тёмное зрение, скорость, владение спасброском Телосложения или сопротивление урону)."}}]'::jsonb, '[]'::jsonb),
  (v_subclass, 10, '[{"id":"shapechanger-l10","type":"grant","target":"trait","key":"shapechanger","sourceKey":"shapechanger-l10-1","presentation":{"authorExplanation":"Вы добавляете заклинание Превращение (Polymorph) в свою книгу. Вы можете наложить его на себя без траты ячейки, превратившись в зверя с показателем опасности 1 или ниже."}}]'::jsonb, '[]'::jsonb),
  (v_subclass, 14, '[{"id":"master-transmuter-l14","type":"grant","target":"trait","key":"master-transmuter","sourceKey":"master-transmuter-l14-1","presentation":{"authorExplanation":"Вы можете разрушить свой камень трансмутатора, чтобы произвести мощный эффект (Полное исцеление, Возвращение к жизни, омоложение или превращение объекта)."}}]'::jsonb, '[]'::jsonb);

  insert into public.rule_templates(
    campaign_id, kind, slug, name, description, version, mechanics, choices,
    parent_template_id, unlock_level, catalog_key, catalog_revision, source_kind, source_label, is_builtin,
    is_active
  ) values (
    p_campaign_id, 'subclass', 'wizard-enchantment', 'Школа очарования', 'Волшебники школы Очарования манипулируют разумом, заставляя других выполнять их волю и подчиняться их приказам.', 1, '[]'::jsonb, '[]'::jsonb,
    v_wizard, 3, 'subclass:wizard:enchantment', '2024', 'official', 'Player''s Handbook 2024', true, true
  )
  on conflict(campaign_id, kind, slug, version) do update set
    name=excluded.name, description=excluded.description, mechanics=excluded.mechanics, choices=excluded.choices,
    parent_template_id=excluded.parent_template_id, unlock_level=excluded.unlock_level, catalog_key=excluded.catalog_key,
    is_builtin=true, is_active=true, updated_at=now()
  returning id into v_subclass;

  delete from public.rule_template_levels where template_id = v_subclass;
  insert into public.rule_template_levels(template_id, level, mechanics, choices) values
  (v_subclass, 3, '[{"id":"enchantment-savant-l3","type":"grant","target":"trait","key":"enchantment-savant","sourceKey":"enchantment-savant-l3-1","presentation":{"authorExplanation":"Время и стоимость копирования заклинаний Очарования в вашу книгу уменьшены вдвое."}},{"id":"hypnotic-gaze-l3","type":"grant","target":"trait","key":"hypnotic-gaze","sourceKey":"hypnotic-gaze-l3-1","presentation":{"authorExplanation":"Действием вы можете очаровать существо в 5 футах от вас, заставляя его стоять на месте в прострации. Эффект длится до конца вашего следующего хода, но вы можете поддерживать его каждый свой ход."}}]'::jsonb, '[]'::jsonb),
  (v_subclass, 6, '[{"id":"instinctive-charm-l6","type":"grant","target":"trait","key":"instinctive-charm","sourceKey":"instinctive-charm-l6-1","presentation":{"authorExplanation":"Реакцией на атаку по вам от существа в пределах 30 футов, вы можете заставить атакующего перенаправить атаку на другое существо в пределах его досягаемости."}}]'::jsonb, '[]'::jsonb),
  (v_subclass, 10, '[{"id":"split-enchantment-l10","type":"grant","target":"trait","key":"split-enchantment","sourceKey":"split-enchantment-l10-1","presentation":{"authorExplanation":"При накладывании заклинания Очарования с уровнем от 1, нацеленного на одно существо, вы можете нацелить его на второе существо."}}]'::jsonb, '[]'::jsonb),
  (v_subclass, 14, '[{"id":"alter-memories-l14","type":"grant","target":"trait","key":"alter-memories","sourceKey":"alter-memories-l14-1","presentation":{"authorExplanation":"Вы можете заставить существо забыть то время, когда оно было очаровано вами (и изменить его воспоминания)."}}]'::jsonb, '[]'::jsonb);

end;
$$;

create or replace function private.install_wizard_subclasses_after_campaign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.install_wizard_subclasses(new.id);
  return new;
end;
$$;

drop trigger if exists zzzz_campaigns_install_wizard_subclasses on public.campaigns;
create trigger zzzz_campaigns_install_wizard_subclasses
after insert on public.campaigns
for each row execute function private.install_wizard_subclasses_after_campaign();

do $$
declare
  v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.install_wizard_subclasses(v_campaign.id);
  end loop;
end$$;

commit;
