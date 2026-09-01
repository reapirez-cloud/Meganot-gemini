-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:cleric
-- CLASS_PACKAGE_TEST: tests/clericRuntimeCompletion.test.ts
-- CLASS_WORK_STATUS: cleric:text=READY;mechanics=IN_PROGRESS
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md

begin;

create or replace function private.cleric_gap_upsert_mechanic(
  p_catalog_key text,
  p_level integer,
  p_mechanic jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_template uuid; v_id text := p_mechanic->>'id';
begin
  select id into v_template
  from public.rule_templates
  where catalog_key=p_catalog_key and is_active
  order by version desc,updated_at desc limit 1;
  if v_template is null or nullif(v_id,'') is null then return; end if;

  update public.rule_template_levels l
  set mechanics=coalesce((
    select jsonb_agg(m order by ord)
    from (
      select m,ord
      from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality as e(m,ord)
      where m->>'id'<>v_id
      union all
      select p_mechanic,1000000::bigint
    ) x
  ),'[]'::jsonb)
  where l.template_id=v_template and l.level=p_level;
end;
$$;

create or replace function private.cleric_gap_upsert_choice(
  p_catalog_key text,
  p_level integer,
  p_choice jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_template uuid; v_key text := p_choice->>'key';
begin
  select id into v_template
  from public.rule_templates
  where catalog_key=p_catalog_key and is_active
  order by version desc,updated_at desc limit 1;
  if v_template is null or nullif(v_key,'') is null then return; end if;

  update public.rule_template_levels l
  set choices=coalesce((
    select jsonb_agg(c order by ord)
    from (
      select c,ord
      from jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) with ordinality as e(c,ord)
      where c->>'key'<>v_key
      union all
      select p_choice,1000000::bigint
    ) x
  ),'[]'::jsonb)
  where l.template_id=v_template and l.level=p_level;
end;
$$;

create or replace function private.cleric_gap_spell_choice(
  p_catalog_key text,
  p_level integer,
  p_choice_key text,
  p_label text,
  p_count integer,
  p_class_key text default null,
  p_spell_level integer default 0,
  p_school text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_options jsonb;
  v_labels jsonb;
  v_mechanics jsonb;
begin
  select
    jsonb_agg(to_jsonb(s.slug) order by coalesce(nullif(s.name_ru,''),s.name_en),s.slug),
    jsonb_object_agg(s.slug,coalesce(nullif(s.name_ru,''),s.name_en)),
    jsonb_object_agg(
      s.slug,
      jsonb_build_array(
        jsonb_build_object(
          'id','cleric-choice-'||p_choice_key||'-'||s.slug,
          'type','spell',
          'key','spell:'||s.slug,
          'sourceKey',p_choice_key||':'||s.slug,
          'payload',jsonb_build_object(
            'spell',jsonb_build_object('name',coalesce(nullif(s.name_ru,''),s.name_en),'level',s.spell_level),
            'preparation',jsonb_build_object('mode','always_prepared'),
            'methods',jsonb_build_array(
              jsonb_build_object(
                'key',p_choice_key||':'||s.slug,
                'kind','subclass_spell',
                'ability','wisdom',
                'requiresPrepared',false
              ) || case when s.spell_level>0 then jsonb_build_object(
                'resourceOptions',(
                  select jsonb_agg(
                    jsonb_build_object(
                      'key','slot-'||slot_level::text,
                      'castLevel',slot_level,
                      'costs',jsonb_build_array(jsonb_build_object('key','spell_slot_'||slot_level::text,'amount',1))
                    ) order by slot_level
                  )
                  from generate_series(s.spell_level,9) slot_level
                )
              ) else '{}'::jsonb end
            )
          )
        )
      )
    )
  into v_options,v_labels,v_mechanics
  from public.spell_catalog s
  where s.spell_level=p_spell_level
    and (p_school is null or lower(s.school)=lower(p_school))
    and (
      p_class_key is null
      or exists(
        select 1 from public.spell_catalog_classes sc
        where sc.spell_id=s.id and sc.class_key=p_class_key
      )
    );

  if v_options is null or jsonb_array_length(v_options)=0 then
    raise exception 'No spell options found for Cleric choice %',p_choice_key;
  end if;

  perform private.cleric_gap_upsert_choice(
    p_catalog_key,
    p_level,
    jsonb_build_object(
      'key',p_choice_key,
      'label',p_label,
      'target','trait',
      'count',p_count,
      'options',v_options,
      'option_labels',v_labels,
      'option_mechanics',v_mechanics
    )
  );
end;
$$;

-- Arcana: fixed Arcana proficiency + two persistent Wizard cantrips.
select private.cleric_gap_upsert_mechanic('subclass:cleric:arcana-domain',1,jsonb_build_object(
  'id','cleric-arcana-skill-runtime','type','grant','target','proficiency','key','skill:arcana',
  'payload',jsonb_build_object('rank',1,'label','Магия'),'sourceKey','arcana-domain-l1-1'
));
select private.cleric_gap_spell_choice(
  'subclass:cleric:arcana-domain',1,'cleric-arcana-cantrips','Заговоры Волшебника',2,'wizard',0,null
);

-- Arcane Mastery: one persistent Wizard spell of each level 6–9.
select private.cleric_gap_spell_choice('subclass:cleric:arcana-domain',17,'cleric-arcana-mastery-6','Заклинание Волшебника 6 уровня',1,'wizard',6,null);
select private.cleric_gap_spell_choice('subclass:cleric:arcana-domain',17,'cleric-arcana-mastery-7','Заклинание Волшебника 7 уровня',1,'wizard',7,null);
select private.cleric_gap_spell_choice('subclass:cleric:arcana-domain',17,'cleric-arcana-mastery-8','Заклинание Волшебника 8 уровня',1,'wizard',8,null);
select private.cleric_gap_spell_choice('subclass:cleric:arcana-domain',17,'cleric-arcana-mastery-9','Заклинание Волшебника 9 уровня',1,'wizard',9,null);

-- Death: martial weapons + one persistent Necromancy cantrip from any list.
select private.cleric_gap_upsert_mechanic('subclass:cleric:death-domain',1,jsonb_build_object(
  'id','cleric-death-martial-runtime','type','grant','target','proficiency','key','category:martial_weapons',
  'payload',jsonb_build_object('rank',1,'label','Воинское оружие'),'sourceKey','death-domain-l1-1'
));
select private.cleric_gap_spell_choice(
  'subclass:cleric:death-domain',1,'cleric-death-reaper-cantrip','Заговор Некромантии',1,null,0,'Necromancy'
);

-- Knowledge: artisan tool + two expertise skills are persistent assignment choices.
select private.cleric_gap_upsert_choice('subclass:cleric:knowledge-domain',3,jsonb_build_object(
  'key','cleric-knowledge-artisan-tool','label','Ремесленный инструмент','target','proficiency','count',1,
  'options',jsonb_build_array(
    'tool:alchemist','tool:brewer','tool:calligrapher','tool:carpenter','tool:cartographer','tool:cobbler','tool:cook','tool:glassblower','tool:jeweler','tool:leatherworker','tool:mason','tool:painter','tool:potter','tool:smith','tool:tinker','tool:weaver','tool:woodcarver'
  ),
  'option_labels',jsonb_build_object(
    'tool:alchemist','Инструменты алхимика','tool:brewer','Инструменты пивовара','tool:calligrapher','Инструменты каллиграфа',
    'tool:carpenter','Инструменты плотника','tool:cartographer','Инструменты картографа','tool:cobbler','Инструменты сапожника',
    'tool:cook','Инструменты повара','tool:glassblower','Инструменты стеклодува','tool:jeweler','Инструменты ювелира',
    'tool:leatherworker','Инструменты кожевника','tool:mason','Инструменты каменщика','tool:painter','Инструменты художника',
    'tool:potter','Инструменты гончара','tool:smith','Инструменты кузнеца','tool:tinker','Инструменты ремонтника',
    'tool:weaver','Инструменты ткача','tool:woodcarver','Инструменты резчика по дереву'
  ),
  'option_mechanics',jsonb_build_object(
    'tool:alchemist',jsonb_build_array(jsonb_build_object('id','knowledge-tool-alchemist','type','grant','target','proficiency','key','tool:alchemist','payload',jsonb_build_object('rank',1),'sourceKey','knowledge-domain-l3-1')),
    'tool:brewer',jsonb_build_array(jsonb_build_object('id','knowledge-tool-brewer','type','grant','target','proficiency','key','tool:brewer','payload',jsonb_build_object('rank',1),'sourceKey','knowledge-domain-l3-1')),
    'tool:calligrapher',jsonb_build_array(jsonb_build_object('id','knowledge-tool-calligrapher','type','grant','target','proficiency','key','tool:calligrapher','payload',jsonb_build_object('rank',1),'sourceKey','knowledge-domain-l3-1')),
    'tool:carpenter',jsonb_build_array(jsonb_build_object('id','knowledge-tool-carpenter','type','grant','target','proficiency','key','tool:carpenter','payload',jsonb_build_object('rank',1),'sourceKey','knowledge-domain-l3-1')),
    'tool:cartographer',jsonb_build_array(jsonb_build_object('id','knowledge-tool-cartographer','type','grant','target','proficiency','key','tool:cartographer','payload',jsonb_build_object('rank',1),'sourceKey','knowledge-domain-l3-1')),
    'tool:cobbler',jsonb_build_array(jsonb_build_object('id','knowledge-tool-cobbler','type','grant','target','proficiency','key','tool:cobbler','payload',jsonb_build_object('rank',1),'sourceKey','knowledge-domain-l3-1')),
    'tool:cook',jsonb_build_array(jsonb_build_object('id','knowledge-tool-cook','type','grant','target','proficiency','key','tool:cook','payload',jsonb_build_object('rank',1),'sourceKey','knowledge-domain-l3-1')),
    'tool:glassblower',jsonb_build_array(jsonb_build_object('id','knowledge-tool-glassblower','type','grant','target','proficiency','key','tool:glassblower','payload',jsonb_build_object('rank',1),'sourceKey','knowledge-domain-l3-1')),
    'tool:jeweler',jsonb_build_array(jsonb_build_object('id','knowledge-tool-jeweler','type','grant','target','proficiency','key','tool:jeweler','payload',jsonb_build_object('rank',1),'sourceKey','knowledge-domain-l3-1')),
    'tool:leatherworker',jsonb_build_array(jsonb_build_object('id','knowledge-tool-leatherworker','type','grant','target','proficiency','key','tool:leatherworker','payload',jsonb_build_object('rank',1),'sourceKey','knowledge-domain-l3-1')),
    'tool:mason',jsonb_build_array(jsonb_build_object('id','knowledge-tool-mason','type','grant','target','proficiency','key','tool:mason','payload',jsonb_build_object('rank',1),'sourceKey','knowledge-domain-l3-1')),
    'tool:painter',jsonb_build_array(jsonb_build_object('id','knowledge-tool-painter','type','grant','target','proficiency','key','tool:painter','payload',jsonb_build_object('rank',1),'sourceKey','knowledge-domain-l3-1')),
    'tool:potter',jsonb_build_array(jsonb_build_object('id','knowledge-tool-potter','type','grant','target','proficiency','key','tool:potter','payload',jsonb_build_object('rank',1),'sourceKey','knowledge-domain-l3-1')),
    'tool:smith',jsonb_build_array(jsonb_build_object('id','knowledge-tool-smith','type','grant','target','proficiency','key','tool:smith','payload',jsonb_build_object('rank',1),'sourceKey','knowledge-domain-l3-1')),
    'tool:tinker',jsonb_build_array(jsonb_build_object('id','knowledge-tool-tinker','type','grant','target','proficiency','key','tool:tinker','payload',jsonb_build_object('rank',1),'sourceKey','knowledge-domain-l3-1')),
    'tool:weaver',jsonb_build_array(jsonb_build_object('id','knowledge-tool-weaver','type','grant','target','proficiency','key','tool:weaver','payload',jsonb_build_object('rank',1),'sourceKey','knowledge-domain-l3-1')),
    'tool:woodcarver',jsonb_build_array(jsonb_build_object('id','knowledge-tool-woodcarver','type','grant','target','proficiency','key','tool:woodcarver','payload',jsonb_build_object('rank',1),'sourceKey','knowledge-domain-l3-1'))
  )
));
select private.cleric_gap_upsert_choice('subclass:cleric:knowledge-domain',3,jsonb_build_object(
  'key','cleric-knowledge-expertise','label','Экспертиза домена Знания','target','proficiency','count',2,
  'options',jsonb_build_array('skill:arcana','skill:history','skill:nature','skill:religion'),
  'option_labels',jsonb_build_object('skill:arcana','Магия','skill:history','История','skill:nature','Природа','skill:religion','Религия'),
  'option_mechanics',jsonb_build_object(
    'skill:arcana',jsonb_build_array(jsonb_build_object('id','knowledge-expertise-arcana','type','grant','target','proficiency','key','skill:arcana','payload',jsonb_build_object('rank',2),'sourceKey','knowledge-domain-l3-1')),
    'skill:history',jsonb_build_array(jsonb_build_object('id','knowledge-expertise-history','type','grant','target','proficiency','key','skill:history','payload',jsonb_build_object('rank',2),'sourceKey','knowledge-domain-l3-1')),
    'skill:nature',jsonb_build_array(jsonb_build_object('id','knowledge-expertise-nature','type','grant','target','proficiency','key','skill:nature','payload',jsonb_build_object('rank',2),'sourceKey','knowledge-domain-l3-1')),
    'skill:religion',jsonb_build_array(jsonb_build_object('id','knowledge-expertise-religion','type','grant','target','proficiency','key','skill:religion','payload',jsonb_build_object('rank',2),'sourceKey','knowledge-domain-l3-1'))
  )
));

-- Nature: heavy armor, one persistent skill and one persistent Druid cantrip.
select private.cleric_gap_upsert_mechanic('subclass:cleric:nature-domain',1,jsonb_build_object(
  'id','cleric-nature-heavy-runtime','type','grant','target','proficiency','key','category:heavy_armor',
  'payload',jsonb_build_object('rank',1,'label','Тяжёлая броня'),'sourceKey','nature-domain-l1-1'
));
select private.cleric_gap_upsert_choice('subclass:cleric:nature-domain',1,jsonb_build_object(
  'key','cleric-nature-skill','label','Навык домена Природы','target','proficiency','count',1,
  'options',jsonb_build_array('skill:animal_handling','skill:nature','skill:survival'),
  'option_labels',jsonb_build_object('skill:animal_handling','Уход за животными','skill:nature','Природа','skill:survival','Выживание'),
  'option_mechanics',jsonb_build_object(
    'skill:animal_handling',jsonb_build_array(jsonb_build_object('id','nature-skill-animal-handling','type','grant','target','proficiency','key','skill:animal_handling','payload',jsonb_build_object('rank',1),'sourceKey','nature-domain-l1-1')),
    'skill:nature',jsonb_build_array(jsonb_build_object('id','nature-skill-nature','type','grant','target','proficiency','key','skill:nature','payload',jsonb_build_object('rank',1),'sourceKey','nature-domain-l1-1')),
    'skill:survival',jsonb_build_array(jsonb_build_object('id','nature-skill-survival','type','grant','target','proficiency','key','skill:survival','payload',jsonb_build_object('rank',1),'sourceKey','nature-domain-l1-1'))
  )
));
select private.cleric_gap_spell_choice('subclass:cleric:nature-domain',1,'cleric-nature-cantrip','Заговор Друида',1,'druid',0,null);

-- Peace: persistent skill choice.
select private.cleric_gap_upsert_choice('subclass:cleric:peace-domain',1,jsonb_build_object(
  'key','cleric-peace-skill','label','Навык домена Мира','target','proficiency','count',1,
  'options',jsonb_build_array('skill:insight','skill:performance','skill:persuasion'),
  'option_labels',jsonb_build_object('skill:insight','Проницательность','skill:performance','Выступление','skill:persuasion','Убеждение'),
  'option_mechanics',jsonb_build_object(
    'skill:insight',jsonb_build_array(jsonb_build_object('id','peace-skill-insight','type','grant','target','proficiency','key','skill:insight','payload',jsonb_build_object('rank',1),'sourceKey','peace-domain-l1-1')),
    'skill:performance',jsonb_build_array(jsonb_build_object('id','peace-skill-performance','type','grant','target','proficiency','key','skill:performance','payload',jsonb_build_object('rank',1),'sourceKey','peace-domain-l1-1')),
    'skill:persuasion',jsonb_build_array(jsonb_build_object('id','peace-skill-persuasion','type','grant','target','proficiency','key','skill:persuasion','payload',jsonb_build_object('rank',1),'sourceKey','peace-domain-l1-1'))
  )
));

-- Light: Corona of Light is a finite Wisdom-modifier pool.
select private.cleric_gap_upsert_mechanic('subclass:cleric:light-domain',17,jsonb_build_object(
  'id','cleric-light-corona-resource','type','resource','key','light_corona','label','Корона света',
  'max',jsonb_build_object('kind','max','values',jsonb_build_array(
    jsonb_build_object('kind','literal','value',1),
    jsonb_build_object('kind','reference','key','abilities.wisdom.modifier')
  )),
  'recharge','long_rest','sourceKey','corona-of-light-l17-1'
));
select private.cleric_gap_upsert_mechanic('subclass:cleric:light-domain',17,jsonb_build_object(
  'id','cleric-light-corona-action','type','action','key','light_corona','label','Корона света',
  'economy','magic_action','resourceKey','light_corona','resourceCost',1,'sourceKey','corona-of-light-l17-1'
));

-- Slot-powered early refresh is real resource conversion, so the server may execute it.
select private.cleric_gap_upsert_mechanic('subclass:cleric:knowledge-domain',17,jsonb_build_object(
  'id','cleric-knowledge-foreknowledge-refresh','type','action','key','knowledge_foreknowledge_refresh','label','Восстановить Божественное предвидение',
  'economy','special','sourceKey','divine-foreknowledge-l17-1',
  'costOptions',jsonb_build_array(
    jsonb_build_object('key','slot-6','label','Ячейка 6 уровня','costs',jsonb_build_array(jsonb_build_object('key','spell_slot_6','amount',1))),
    jsonb_build_object('key','slot-7','label','Ячейка 7 уровня','costs',jsonb_build_array(jsonb_build_object('key','spell_slot_7','amount',1))),
    jsonb_build_object('key','slot-8','label','Ячейка 8 уровня','costs',jsonb_build_array(jsonb_build_object('key','spell_slot_8','amount',1))),
    jsonb_build_object('key','slot-9','label','Ячейка 9 уровня','costs',jsonb_build_array(jsonb_build_object('key','spell_slot_9','amount',1)))
  ),
  'effects',jsonb_build_array(jsonb_build_object('kind','resource','operation','RESTORE','key','knowledge_foreknowledge','amount',1))
));
select private.cleric_gap_upsert_mechanic('subclass:cleric:grave-domain',17,jsonb_build_object(
  'id','cleric-grave-keeper-refresh','type','action','key','grave_keeper_refresh','label','Восстановить Хранителя душ',
  'economy','special','sourceKey','divine-reaper-l17-1',
  'costOptions',jsonb_build_array(
    jsonb_build_object('key','slot-6','label','Ячейка 6 уровня','costs',jsonb_build_array(jsonb_build_object('key','spell_slot_6','amount',1))),
    jsonb_build_object('key','slot-7','label','Ячейка 7 уровня','costs',jsonb_build_array(jsonb_build_object('key','spell_slot_7','amount',1))),
    jsonb_build_object('key','slot-8','label','Ячейка 8 уровня','costs',jsonb_build_array(jsonb_build_object('key','spell_slot_8','amount',1))),
    jsonb_build_object('key','slot-9','label','Ячейка 9 уровня','costs',jsonb_build_array(jsonb_build_object('key','spell_slot_9','amount',1)))
  ),
  'effects',jsonb_build_array(jsonb_build_object('kind','resource','operation','RESTORE','key','grave_keeper_of_souls','amount',1))
));

-- Every dynamic choice above must resolve to at least one option in the current spell catalog.
do $$
declare v_missing integer;
begin
  select count(*) into v_missing
  from public.rule_template_levels l
  join public.rule_templates t on t.id=l.template_id
  cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) c(choice)
  where t.catalog_key in ('subclass:cleric:arcana-domain','subclass:cleric:death-domain','subclass:cleric:nature-domain')
    and c.choice->>'key' like 'cleric-%'
    and jsonb_array_length(coalesce(c.choice->'options','[]'::jsonb))=0;
  if v_missing>0 then raise exception 'Cleric domain spell choices contain empty option sets'; end if;
end $$;

drop function private.cleric_gap_spell_choice(text,integer,text,text,integer,text,integer,text);
drop function private.cleric_gap_upsert_choice(text,integer,jsonb);
drop function private.cleric_gap_upsert_mechanic(text,integer,jsonb);

commit;
