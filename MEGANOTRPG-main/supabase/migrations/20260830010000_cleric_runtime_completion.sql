-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:cleric
-- CLASS_PACKAGE_TEST: tests/clericRuntimeCompletion.test.ts
-- CLASS_WORK_STATUS: cleric:text=READY;mechanics=IN_PROGRESS
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md

begin;

-- Generic runtime support for resources whose recovery differs by trigger.
-- Backward compatible with the legacy {triggers, restore, amount} shape.
create or replace function public.recover_character_resources(
  p_character_id uuid,
  p_trigger text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_manage_character(p_character_id,auth.uid()) then raise exception 'Only GM or owner can restore resources'; end if;
  if p_trigger not in ('short_rest','long_rest','dawn','manual') then raise exception 'Unsupported recovery trigger'; end if;

  update public.character_resource_states s set
    current = coalesce(
      (
        select case
          when coalesce(rule->>'restore','full')='amount'
            then least(s.max_snapshot,s.current+greatest(0,coalesce((rule->>'amount')::integer,0)))
          else s.max_snapshot
        end
        from jsonb_array_elements(coalesce(s.recharge->'rules','[]'::jsonb)) with ordinality as rr(rule,ord)
        where rule->>'trigger'=p_trigger
        order by ord
        limit 1
      ),
      case
        when exists(
          select 1
          from jsonb_array_elements_text(coalesce(s.recharge->'triggers','[]'::jsonb)) t(value)
          where t.value=p_trigger
        ) then case
          when coalesce(s.recharge->>'restore','full')='amount'
            then least(s.max_snapshot,s.current+greatest(0,coalesce((s.recharge->>'amount')::integer,0)))
          else s.max_snapshot
        end
        else s.current
      end
    ),
    updated_by=auth.uid(),
    updated_at=now()
  where s.character_id=p_character_id
    and (
      exists(
        select 1
        from jsonb_array_elements(coalesce(s.recharge->'rules','[]'::jsonb)) rr(rule)
        where rule->>'trigger'=p_trigger
      )
      or exists(
        select 1
        from jsonb_array_elements_text(coalesce(s.recharge->'triggers','[]'::jsonb)) t(value)
        where t.value=p_trigger
      )
    );
end;
$$;

revoke all on function public.recover_character_resources(uuid,text) from public,anon;
grant execute on function public.recover_character_resources(uuid,text) to authenticated;

create or replace function private.cleric_runtime_upsert(
  p_catalog_key text,
  p_level integer,
  p_mechanic jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_template uuid;
  v_id text := p_mechanic->>'id';
begin
  select id into v_template
  from public.rule_templates
  where catalog_key=p_catalog_key and is_active
  order by version desc, updated_at desc
  limit 1;
  if v_template is null or nullif(v_id,'') is null then return; end if;

  update public.rule_template_levels l
  set mechanics = coalesce((
    select jsonb_agg(m order by ord)
    from (
      select m,ord
      from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality as e(m,ord)
      where m->>'id'<>v_id
      union all
      select p_mechanic, 1000000::bigint
    ) x
  ),'[]'::jsonb)
  where l.template_id=v_template and l.level=p_level;
end;
$$;

create or replace function private.cleric_runtime_patch_action_cost(
  p_catalog_key text,
  p_level integer,
  p_source_key text,
  p_resource_key text,
  p_cost integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_template uuid;
begin
  select id into v_template
  from public.rule_templates
  where catalog_key=p_catalog_key and is_active
  order by version desc,updated_at desc limit 1;
  if v_template is null then return; end if;

  update public.rule_template_levels l
  set mechanics=coalesce((
    select jsonb_agg(
      case when m->>'type'='action' and m->>'sourceKey'=p_source_key then
        m || jsonb_build_object('resourceKey',p_resource_key,'resourceCost',p_cost)
      else m end
      order by ord
    )
    from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality as e(m,ord)
  ),'[]'::jsonb)
  where l.template_id=v_template and l.level=p_level;
end;
$$;

-- Channel Divinity has mixed recovery: +1 on short rest, full on long rest.
update public.rule_template_levels l
set mechanics=coalesce((
  select jsonb_agg(
    case when m->>'type'='resource' and m->>'key'='channel_divinity' then
      m || jsonb_build_object(
        'recoveryRules',jsonb_build_array(
          jsonb_build_object('trigger','short_rest','restore','amount','amount',1),
          jsonb_build_object('trigger','long_rest','restore','full')
        )
      )
    else m end
    order by ord
  )
  from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality as e(m,ord)
),'[]'::jsonb)
where l.template_id in (
  select id from public.rule_templates where catalog_key='class:cleric' and is_active
)
and l.level in (2,6,18);

-- Death: Touch of Death spends the shared Channel Divinity pool.
select private.cleric_runtime_upsert('subclass:cleric:death-domain',2,jsonb_build_object(
  'id','cleric-death-touch-runtime','type','action','key','death_touch_of_death','label','Касание смерти',
  'economy','special','resourceKey','channel_divinity','resourceCost',1,
  'sourceKey','channel-divinity-touch-of-death-l2-1','tags',jsonb_build_array('class','subclass','after:melee-hit')
));

-- Forge: real proficiencies, Channel Divinity spend, and permanent fire defenses.
select private.cleric_runtime_upsert('subclass:cleric:forge-domain',1,jsonb_build_object(
  'id','cleric-forge-heavy-armor-runtime','type','grant','target','proficiency','key','category:heavy_armor',
  'payload',jsonb_build_object('rank',1,'label','Тяжёлая броня'),'sourceKey','forge-domain-l1-1'
));
select private.cleric_runtime_upsert('subclass:cleric:forge-domain',1,jsonb_build_object(
  'id','cleric-forge-smith-tools-runtime','type','grant','target','proficiency','key','tool:smith_tools',
  'payload',jsonb_build_object('rank',1,'label','Инструменты кузнеца'),'sourceKey','forge-domain-l1-1'
));
select private.cleric_runtime_upsert('subclass:cleric:forge-domain',2,jsonb_build_object(
  'id','cleric-forge-artisan-runtime','type','action','key','forge_artisans_blessing','label','Благословение ремесленника',
  'economy','special','resourceKey','channel_divinity','resourceCost',1,
  'sourceKey','channel-divinity-artisan-s-blessing-l2-1','tags',jsonb_build_array('class','subclass','ritual:1h')
));
select private.cleric_runtime_upsert('subclass:cleric:forge-domain',6,jsonb_build_object(
  'id','cleric-forge-fire-resistance-runtime','type','grant','target','resistance','key','fire',
  'sourceKey','soul-of-the-forge-l6-1'
));
select private.cleric_runtime_upsert('subclass:cleric:forge-domain',17,jsonb_build_object(
  'id','cleric-forge-fire-immunity-runtime','type','grant','target','immunity','key','fire',
  'sourceKey','saint-of-forge-and-fire-l17-1'
));

-- Grave: Path to the Grave spends Channel Divinity; finite reactions and Keeper of Souls are real pools.
select private.cleric_runtime_upsert('subclass:cleric:grave-domain',3,jsonb_build_object(
  'id','cleric-grave-path-runtime','type','action','key','grave_path_to_the_grave','label','Путь к могиле',
  'economy','bonus_action','resourceKey','channel_divinity','resourceCost',1,
  'sourceKey','grave-domain-l3-1','tags',jsonb_build_array('class','subclass','range:30ft')
));
select private.cleric_runtime_upsert('subclass:cleric:grave-domain',6,jsonb_build_object(
  'id','cleric-grave-sentinel-resource','type','resource','key','grave_sentinel','label','Страж у врат смерти',
  'max',jsonb_build_object('kind','max','values',jsonb_build_array(
    jsonb_build_object('kind','literal','value',1),
    jsonb_build_object('kind','reference','key','abilities.wisdom.modifier')
  )),
  'recharge','long_rest','sourceKey','sentinel-at-death-s-door-l6-1'
));
select private.cleric_runtime_patch_action_cost('subclass:cleric:grave-domain',6,'sentinel-at-death-s-door-l6-1','grave_sentinel',1);
select private.cleric_runtime_upsert('subclass:cleric:grave-domain',17,jsonb_build_object(
  'id','cleric-grave-enhanced-necromancy-runtime','type','action','key','grave_enhanced_necromancy','label','Усиленная некромантия',
  'economy','special','resourceKey','channel_divinity','resourceCost',1,
  'sourceKey','divine-reaper-l17-1','tags',jsonb_build_array('class','subclass','second-target')
));
select private.cleric_runtime_upsert('subclass:cleric:grave-domain',17,jsonb_build_object(
  'id','cleric-grave-keeper-resource','type','resource','key','grave_keeper_of_souls','label','Хранитель душ',
  'max',1,'recharge',jsonb_build_array('short_rest','long_rest'),'sourceKey','divine-reaper-l17-1'
));

-- Knowledge: Channel Divinity, native telepathy/save proficiency, and finite foreknowledge.
select private.cleric_runtime_upsert('subclass:cleric:knowledge-domain',3,jsonb_build_object(
  'id','cleric-knowledge-mind-magic-runtime','type','action','key','knowledge_mind_magic','label','Магия разума',
  'economy','magic_action','resourceKey','channel_divinity','resourceCost',1,
  'sourceKey','knowledge-domain-l3-1','tags',jsonb_build_array('class','subclass','domain-divination')
));
select private.cleric_runtime_upsert('subclass:cleric:knowledge-domain',6,jsonb_build_object(
  'id','cleric-knowledge-telepathy-runtime','type','grant','target','sense','key','telepathy',
  'payload',jsonb_build_object('range',60,'unit','ft'),'sourceKey','unfettered-mind-l6-1'
));
select private.cleric_runtime_upsert('subclass:cleric:knowledge-domain',6,jsonb_build_object(
  'id','cleric-knowledge-int-save-runtime','type','grant','target','proficiency','key','savingThrow:intelligence',
  'payload',jsonb_build_object('rank',1,'label','Спасброски Интеллекта'),'sourceKey','unfettered-mind-l6-1'
));
select private.cleric_runtime_upsert('subclass:cleric:knowledge-domain',17,jsonb_build_object(
  'id','cleric-knowledge-foreknowledge-resource','type','resource','key','knowledge_foreknowledge','label','Божественное предвидение',
  'max',1,'recharge','long_rest','sourceKey','divine-foreknowledge-l17-1'
));
select private.cleric_runtime_patch_action_cost('subclass:cleric:knowledge-domain',17,'divine-foreknowledge-l17-1','knowledge_foreknowledge',1);

-- Light: both halves of the level-3 package receive their own runtime accounting.
select private.cleric_runtime_upsert('subclass:cleric:light-domain',3,jsonb_build_object(
  'id','cleric-light-radiance-runtime','type','action','key','light_radiance_of_dawn','label','Сияние рассвета',
  'economy','magic_action','resourceKey','channel_divinity','resourceCost',1,
  'sourceKey','light-domain-l3-1','tags',jsonb_build_array('class','subclass','save:constitution','radiant')
));
select private.cleric_runtime_upsert('subclass:cleric:light-domain',3,jsonb_build_object(
  'id','cleric-light-flare-resource','type','resource','key','light_warding_flare','label','Защитная вспышка',
  'max',jsonb_build_object('kind','max','values',jsonb_build_array(
    jsonb_build_object('kind','literal','value',1),
    jsonb_build_object('kind','reference','key','abilities.wisdom.modifier')
  )),
  'recharge','long_rest','sourceKey','light-domain-l3-1','priority',3
));
select private.cleric_runtime_upsert('subclass:cleric:light-domain',3,jsonb_build_object(
  'id','cleric-light-flare-action','type','action','key','light_warding_flare','label','Защитная вспышка',
  'economy','reaction','resourceKey','light_warding_flare','resourceCost',1,'sourceKey','light-domain-l3-1'
));
select private.cleric_runtime_upsert('subclass:cleric:light-domain',6,jsonb_build_object(
  'id','cleric-light-flare-upgrade-resource','type','resource','key','light_warding_flare','label','Защитная вспышка',
  'max',jsonb_build_object('kind','max','values',jsonb_build_array(
    jsonb_build_object('kind','literal','value',1),
    jsonb_build_object('kind','reference','key','abilities.wisdom.modifier')
  )),
  'recharge',jsonb_build_array('short_rest','long_rest'),'sourceKey','improved-warding-flare-l6-1',
  'grantOperation','REPLACE','priority',6
));

-- Order: finite bonus-action spell acceleration.
select private.cleric_runtime_upsert('subclass:cleric:order-domain',6,jsonb_build_object(
  'id','cleric-order-law-resource','type','resource','key','order_embodiment_law','label','Воплощение закона',
  'max',jsonb_build_object('kind','max','values',jsonb_build_array(
    jsonb_build_object('kind','literal','value',1),
    jsonb_build_object('kind','reference','key','abilities.wisdom.modifier')
  )),
  'recharge','long_rest','sourceKey','embodiment-of-the-law-l6-1'
));
select private.cleric_runtime_patch_action_cost('subclass:cleric:order-domain',6,'embodiment-of-the-law-l6-1','order_embodiment_law',1);

-- Peace: Emboldening Bond has PB uses per long rest.
select private.cleric_runtime_upsert('subclass:cleric:peace-domain',1,jsonb_build_object(
  'id','cleric-peace-bond-resource','type','resource','key','peace_emboldening_bond','label','Ободряющая связь',
  'max',jsonb_build_object('kind','reference','key','core.proficiencyBonus'),
  'recharge','long_rest','sourceKey','peace-domain-l1-1'
));
select private.cleric_runtime_upsert('subclass:cleric:peace-domain',1,jsonb_build_object(
  'id','cleric-peace-bond-action','type','action','key','peace_emboldening_bond','label','Ободряющая связь',
  'economy','action','resourceKey','peace_emboldening_bond','resourceCost',1,'sourceKey','peace-domain-l1-1'
));

-- Tempest: proficiencies, finite Wrath of the Storm, and Destructive Wrath CD spend.
select private.cleric_runtime_upsert('subclass:cleric:tempest-domain',1,jsonb_build_object(
  'id','cleric-tempest-martial-runtime','type','grant','target','proficiency','key','category:martial_weapons',
  'payload',jsonb_build_object('rank',1,'label','Воинское оружие'),'sourceKey','tempest-domain-l1-1'
));
select private.cleric_runtime_upsert('subclass:cleric:tempest-domain',1,jsonb_build_object(
  'id','cleric-tempest-heavy-runtime','type','grant','target','proficiency','key','category:heavy_armor',
  'payload',jsonb_build_object('rank',1,'label','Тяжёлая броня'),'sourceKey','tempest-domain-l1-1'
));
select private.cleric_runtime_upsert('subclass:cleric:tempest-domain',1,jsonb_build_object(
  'id','cleric-tempest-wrath-resource','type','resource','key','tempest_wrath_of_storm','label','Гнев бури',
  'max',jsonb_build_object('kind','max','values',jsonb_build_array(
    jsonb_build_object('kind','literal','value',1),
    jsonb_build_object('kind','reference','key','abilities.wisdom.modifier')
  )),
  'recharge','long_rest','sourceKey','tempest-domain-l1-1'
));
select private.cleric_runtime_upsert('subclass:cleric:tempest-domain',1,jsonb_build_object(
  'id','cleric-tempest-wrath-action','type','action','key','tempest_wrath_of_storm','label','Гнев бури',
  'economy','reaction','resourceKey','tempest_wrath_of_storm','resourceCost',1,'sourceKey','tempest-domain-l1-1'
));
select private.cleric_runtime_upsert('subclass:cleric:tempest-domain',2,jsonb_build_object(
  'id','cleric-tempest-destructive-runtime','type','action','key','tempest_destructive_wrath','label','Разрушительный гнев',
  'economy','special','resourceKey','channel_divinity','resourceCost',1,
  'sourceKey','channel-divinity-destructive-wrath-l2-1','tags',jsonb_build_array('class','subclass','maximize:lightning-or-thunder')
));

-- Trickery: Invoke Duplicity must actually spend Channel Divinity.
select private.cleric_runtime_upsert('subclass:cleric:trickery-domain',3,jsonb_build_object(
  'id','cleric-trickery-duplicity-runtime','type','action','key','trickery_invoke_duplicity','label','Вызов двойника',
  'economy','bonus_action','resourceKey','channel_divinity','resourceCost',1,
  'sourceKey','trickery-domain-l3-1','tags',jsonb_build_array('class','subclass','duration:1m')
));

-- Twilight: proficiencies, 300-ft darkvision, finite shared sight and Steps of Night.
select private.cleric_runtime_upsert('subclass:cleric:twilight-domain',1,jsonb_build_object(
  'id','cleric-twilight-martial-runtime','type','grant','target','proficiency','key','category:martial_weapons',
  'payload',jsonb_build_object('rank',1,'label','Воинское оружие'),'sourceKey','twilight-domain-l1-1'
));
select private.cleric_runtime_upsert('subclass:cleric:twilight-domain',1,jsonb_build_object(
  'id','cleric-twilight-heavy-runtime','type','grant','target','proficiency','key','category:heavy_armor',
  'payload',jsonb_build_object('rank',1,'label','Тяжёлая броня'),'sourceKey','twilight-domain-l1-1'
));
select private.cleric_runtime_upsert('subclass:cleric:twilight-domain',1,jsonb_build_object(
  'id','cleric-twilight-darkvision-runtime','type','grant','target','sense','key','darkvision',
  'payload',jsonb_build_object('range',300,'unit','ft'),'sourceKey','twilight-domain-l1-1'
));
select private.cleric_runtime_upsert('subclass:cleric:twilight-domain',1,jsonb_build_object(
  'id','cleric-twilight-share-sight-resource','type','resource','key','twilight_share_darkvision','label','Передача ночного зрения',
  'max',1,'recharge','long_rest','sourceKey','twilight-domain-l1-1'
));
select private.cleric_runtime_upsert('subclass:cleric:twilight-domain',1,jsonb_build_object(
  'id','cleric-twilight-share-sight-action','type','action','key','twilight_share_darkvision','label','Передать ночное зрение',
  'economy','action','costOptions',jsonb_build_array(
    jsonb_build_object('key','free-use','label','Бесплатное использование','costs',jsonb_build_array(jsonb_build_object('key','twilight_share_darkvision','amount',1))),
    jsonb_build_object('key','slot-1','label','Ячейка 1 уровня','costs',jsonb_build_array(jsonb_build_object('key','spell_slot_1','amount',1))),
    jsonb_build_object('key','slot-2','label','Ячейка 2 уровня','costs',jsonb_build_array(jsonb_build_object('key','spell_slot_2','amount',1))),
    jsonb_build_object('key','slot-3','label','Ячейка 3 уровня','costs',jsonb_build_array(jsonb_build_object('key','spell_slot_3','amount',1))),
    jsonb_build_object('key','slot-4','label','Ячейка 4 уровня','costs',jsonb_build_array(jsonb_build_object('key','spell_slot_4','amount',1))),
    jsonb_build_object('key','slot-5','label','Ячейка 5 уровня','costs',jsonb_build_array(jsonb_build_object('key','spell_slot_5','amount',1))),
    jsonb_build_object('key','slot-6','label','Ячейка 6 уровня','costs',jsonb_build_array(jsonb_build_object('key','spell_slot_6','amount',1))),
    jsonb_build_object('key','slot-7','label','Ячейка 7 уровня','costs',jsonb_build_array(jsonb_build_object('key','spell_slot_7','amount',1))),
    jsonb_build_object('key','slot-8','label','Ячейка 8 уровня','costs',jsonb_build_array(jsonb_build_object('key','spell_slot_8','amount',1))),
    jsonb_build_object('key','slot-9','label','Ячейка 9 уровня','costs',jsonb_build_array(jsonb_build_object('key','spell_slot_9','amount',1)))
  ),
  'sourceKey','twilight-domain-l1-1'
));
select private.cleric_runtime_upsert('subclass:cleric:twilight-domain',6,jsonb_build_object(
  'id','cleric-twilight-steps-resource','type','resource','key','twilight_steps_of_night','label','Шаги ночи',
  'max',jsonb_build_object('kind','reference','key','core.proficiencyBonus'),
  'recharge','long_rest','sourceKey','steps-of-night-l6-1'
));
select private.cleric_runtime_patch_action_cost('subclass:cleric:twilight-domain',6,'steps-of-night-l6-1','twilight_steps_of_night',1);

-- War: real proficiencies, both level-3 costs, level-6 Channel Divinity alternatives, and Avatar defenses.
select private.cleric_runtime_upsert('subclass:cleric:war-domain',3,jsonb_build_object(
  'id','cleric-war-martial-runtime','type','grant','target','proficiency','key','category:martial_weapons',
  'payload',jsonb_build_object('rank',1,'label','Воинское оружие'),'sourceKey','war-domain-l3-1'
));
select private.cleric_runtime_upsert('subclass:cleric:war-domain',3,jsonb_build_object(
  'id','cleric-war-heavy-runtime','type','grant','target','proficiency','key','category:heavy_armor',
  'payload',jsonb_build_object('rank',1,'label','Тяжёлая броня'),'sourceKey','war-domain-l3-1'
));
select private.cleric_runtime_upsert('subclass:cleric:war-domain',3,jsonb_build_object(
  'id','cleric-war-priest-resource','type','resource','key','war_priest','label','Жрец войны',
  'max',jsonb_build_object('kind','max','values',jsonb_build_array(
    jsonb_build_object('kind','literal','value',1),
    jsonb_build_object('kind','reference','key','abilities.wisdom.modifier')
  )),
  'recharge',jsonb_build_array('short_rest','long_rest'),'sourceKey','war-domain-l3-1'
));
select private.cleric_runtime_upsert('subclass:cleric:war-domain',3,jsonb_build_object(
  'id','cleric-war-guided-strike-action','type','action','key','war_guided_strike','label','Направленный удар',
  'economy','special','resourceKey','channel_divinity','resourceCost',1,'sourceKey','war-domain-l3-1'
));
select private.cleric_runtime_upsert('subclass:cleric:war-domain',3,jsonb_build_object(
  'id','cleric-war-priest-action','type','action','key','war_priest','label','Жрец войны',
  'economy','bonus_action','resourceKey','war_priest','resourceCost',1,'sourceKey','war-domain-l3-1'
));
select private.cleric_runtime_upsert('subclass:cleric:war-domain',6,jsonb_build_object(
  'id','cleric-war-god-shield-action','type','action','key','war_god_shield_of_faith','label','Благословение бога войны: Щит веры',
  'economy','bonus_action','resourceKey','channel_divinity','resourceCost',1,'sourceKey','war-god-s-blessing-l6-1'
));
select private.cleric_runtime_upsert('subclass:cleric:war-domain',6,jsonb_build_object(
  'id','cleric-war-god-weapon-action','type','action','key','war_god_spiritual_weapon','label','Благословение бога войны: Духовное оружие',
  'economy','bonus_action','resourceKey','channel_divinity','resourceCost',1,'sourceKey','war-god-s-blessing-l6-1'
));
select private.cleric_runtime_upsert('subclass:cleric:war-domain',17,jsonb_build_object(
  'id','cleric-war-avatar-bludgeoning','type','grant','target','resistance','key','bludgeoning','sourceKey','avatar-of-battle-l17-1'
));
select private.cleric_runtime_upsert('subclass:cleric:war-domain',17,jsonb_build_object(
  'id','cleric-war-avatar-piercing','type','grant','target','resistance','key','piercing','sourceKey','avatar-of-battle-l17-1'
));
select private.cleric_runtime_upsert('subclass:cleric:war-domain',17,jsonb_build_object(
  'id','cleric-war-avatar-slashing','type','grant','target','resistance','key','slashing','sourceKey','avatar-of-battle-l17-1'
));

-- Verify the active catalog shape at migration time. This catches the original
-- regression where only a subset of domains survived into a live campaign.
do $$
declare v_domains integer;
begin
  select count(*) into v_domains
  from public.rule_templates s
  join public.rule_templates c on c.id=s.parent_template_id
  where c.catalog_key='class:cleric' and c.is_active
    and s.kind='subclass' and s.is_active
    and s.catalog_key like 'subclass:cleric:%';
  if v_domains<>14 then
    raise exception 'Cleric runtime completion expected 14 active domains, got %',v_domains;
  end if;
end $$;

drop function private.cleric_runtime_patch_action_cost(text,integer,text,text,integer);
drop function private.cleric_runtime_upsert(text,integer,jsonb);

commit;
