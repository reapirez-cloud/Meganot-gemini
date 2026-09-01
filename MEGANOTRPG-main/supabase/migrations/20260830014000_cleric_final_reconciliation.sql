-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:cleric
-- CLASS_PACKAGE_TEST: tests/clericFinalReconciliation.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: cleric:text=READY;mechanics=IN_PROGRESS
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md

begin;

-- Final Cleric reconciliation. This migration is intentionally safe on top of
-- both the historical dev chain and production, where part of the same work was
-- deployed earlier under different migration versions.

create or replace function private.cleric_final_normalize_json(p_value jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare v_type text;
begin
  if p_value is null then return null; end if;
  v_type := jsonb_typeof(p_value);
  if v_type='array' then
    return coalesce((select jsonb_agg(private.cleric_final_normalize_json(value) order by ord)
      from jsonb_array_elements(p_value) with ordinality e(value,ord)),'[]'::jsonb);
  elsif v_type='object' then
    return coalesce((select jsonb_object_agg(key,
      case when key='kind' and value='"subclass_spell"'::jsonb
        then '"class_spell"'::jsonb
        else private.cleric_final_normalize_json(value)
      end)
      from jsonb_each(p_value)),'{}'::jsonb);
  end if;
  return p_value;
end;
$$;

create or replace function private.cleric_final_upsert_level_mechanic(
  p_catalog_key text,
  p_level integer,
  p_mechanic jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_template uuid; v_id text:=p_mechanic->>'id';
begin
  select id into v_template from public.rule_templates
  where catalog_key=p_catalog_key and is_active
  order by version desc,updated_at desc limit 1;
  if v_template is null or nullif(v_id,'') is null then return; end if;

  update public.rule_template_levels l
  set mechanics=coalesce((
    select jsonb_agg(m order by ord)
    from (
      select m,ord from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality e(m,ord)
      where m->>'id'<>v_id
      union all select p_mechanic,1000000::bigint
    ) x
  ),'[]'::jsonb)
  where l.template_id=v_template and l.level=p_level;
end;
$$;

create or replace function private.cleric_final_upsert_level_choice(
  p_catalog_key text,
  p_level integer,
  p_choice jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_template uuid; v_key text:=p_choice->>'key';
begin
  select id into v_template from public.rule_templates
  where catalog_key=p_catalog_key and is_active
  order by version desc,updated_at desc limit 1;
  if v_template is null or nullif(v_key,'') is null then return; end if;

  update public.rule_template_levels l
  set choices=coalesce((
    select jsonb_agg(c order by ord)
    from (
      select c,ord from jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) with ordinality e(c,ord)
      where c->>'key'<>v_key
      union all select p_choice,1000000::bigint
    ) x
  ),'[]'::jsonb)
  where l.template_id=v_template and l.level=p_level;
end;
$$;

create or replace function private.cleric_final_cantrip_choice(
  p_choice_key text,
  p_label text,
  p_class_key text,
  p_source_key text,
  p_requires_choice_key text default null,
  p_requires_choice_option text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_options jsonb; v_labels jsonb; v_mechanics jsonb; v_choice jsonb;
begin
  select
    jsonb_agg(to_jsonb('spell:'||s.slug) order by coalesce(nullif(s.name_ru,''),s.name_en),s.slug),
    jsonb_object_agg('spell:'||s.slug,coalesce(nullif(s.name_ru,''),s.name_en)),
    jsonb_object_agg(
      'spell:'||s.slug,
      jsonb_build_array(jsonb_build_object(
        'id','cleric-final-'||p_choice_key||'-'||s.slug,
        'type','spell',
        'key','spell:'||s.slug,
        'catalogSlug',s.slug,
        'variantKey',p_choice_key||':'||s.slug,
        'sourceKey',p_source_key,
        'payload',jsonb_build_object(
          'spell',jsonb_strip_nulls(jsonb_build_object(
            'name',coalesce(nullif(s.name_ru,''),s.name_en),
            'level',0,
            'school',s.school,
            'ritual',coalesce(s.ritual,false)
          )),
          'preparation',jsonb_build_object('mode','not_required'),
          'methods',jsonb_build_array(jsonb_build_object(
            'key',p_choice_key||':'||s.slug,
            'kind','class_spell',
            'ability','wisdom',
            'requiresPrepared',false
          ))
        )
      ))
    )
  into v_options,v_labels,v_mechanics
  from public.spell_catalog s
  where s.spell_level=0
    and exists(select 1 from public.spell_catalog_classes sc where sc.spell_id=s.id and sc.class_key=p_class_key);

  if v_options is null or jsonb_array_length(v_options)=0 then
    raise exception 'No cantrips found for class %',p_class_key;
  end if;

  v_choice := jsonb_build_object(
    'key',p_choice_key,
    'label',p_label,
    'target','trait',
    'count',1,
    'options',v_options,
    'option_labels',v_labels,
    'option_mechanics',v_mechanics
  );
  if p_requires_choice_key is not null and p_requires_choice_option is not null then
    v_choice := v_choice || jsonb_build_object('requires_choice',jsonb_build_object(
      'key',p_requires_choice_key,'option',p_requires_choice_option
    ));
  end if;
  return v_choice;
end;
$$;

-- Historical dev choice keys are renamed to the canonical production keys.
-- The selected_choices object is migrated with the definition, so existing
-- characters retain their actual choice rather than being asked again.
do $$
declare r record; v_template uuid;
begin
  for r in select * from (values
    ('subclass:cleric:arcana-domain',1,'cleric-arcana-cantrips','arcana-initiate-cantrips'),
    ('subclass:cleric:arcana-domain',17,'cleric-arcana-mastery-6','arcane-mastery-6'),
    ('subclass:cleric:arcana-domain',17,'cleric-arcana-mastery-7','arcane-mastery-7'),
    ('subclass:cleric:arcana-domain',17,'cleric-arcana-mastery-8','arcane-mastery-8'),
    ('subclass:cleric:arcana-domain',17,'cleric-arcana-mastery-9','arcane-mastery-9'),
    ('subclass:cleric:death-domain',1,'cleric-death-reaper-cantrip','death-reaper-cantrip'),
    ('subclass:cleric:knowledge-domain',3,'cleric-knowledge-artisan-tool','knowledge-domain-tool'),
    ('subclass:cleric:knowledge-domain',3,'cleric-knowledge-expertise','knowledge-domain-expertise'),
    ('subclass:cleric:peace-domain',1,'cleric-peace-skill','peace-domain-skill')
  ) x(catalog_key,level_no,old_key,new_key)
  loop
    select id into v_template from public.rule_templates
      where catalog_key=r.catalog_key and is_active
      order by version desc,updated_at desc limit 1;
    if v_template is null then continue; end if;

    update public.rule_template_levels l
    set choices=coalesce((select jsonb_agg(
      case when c->>'key'=r.old_key then jsonb_set(c,'{key}',to_jsonb(r.new_key),true) else c end
      order by ord)
      from jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) with ordinality e(c,ord)),'[]'::jsonb)
    where l.template_id=v_template and l.level=r.level_no
      and exists(select 1 from jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) q where q->>'key'=r.old_key)
      and not exists(select 1 from jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) q where q->>'key'=r.new_key);

    update public.character_template_assignments a
    set selected_choices=(coalesce(a.selected_choices,'{}'::jsonb)-r.old_key)
      || jsonb_build_object(r.new_key,a.selected_choices->r.old_key),
      updated_at=now()
    where a.template_id=v_template and coalesce(a.selected_choices,'{}'::jsonb) ? r.old_key
      and not (coalesce(a.selected_choices,'{}'::jsonb) ? r.new_key);
  end loop;
end $$;

-- Divine Order: preserve the persisted prefixed values and make the maps use
-- exactly those same stable keys. Explicit fallback mechanics guarantee that an
-- older production row cannot leave Protector or Thaumaturge mechanically inert.
update public.rule_templates t
set choices=coalesce((
  select jsonb_agg(
    case when choice->>'key'='cleric-divine-order' then
      choice
      || jsonb_build_object(
        'option_labels',jsonb_build_object(
          'divine-order:protector','Защитник',
          'divine-order:thaumaturge','Чудотворец'
        ),
        'option_mechanics',jsonb_build_object(
          'divine-order:protector',coalesce(
            choice->'option_mechanics'->'divine-order:protector',
            choice->'option_mechanics'->'protector',
            jsonb_build_array(
              jsonb_build_object('id','cleric-divine-order-protector-weapons','type','grant','target','proficiency','key','category:martial_weapons','payload',jsonb_build_object('rank',1,'label','Воинское оружие'),'sourceKey','divine-order:protector'),
              jsonb_build_object('id','cleric-divine-order-protector-armor','type','grant','target','proficiency','key','category:heavy_armor','payload',jsonb_build_object('rank',1,'label','Тяжёлая броня'),'sourceKey','divine-order:protector')
            )
          ),
          'divine-order:thaumaturge',coalesce(
            choice->'option_mechanics'->'divine-order:thaumaturge',
            choice->'option_mechanics'->'thaumaturge',
            jsonb_build_array(jsonb_build_object(
              'id','cleric-divine-order-thaumaturge-rules','type','grant','target','feature',
              'key','class:cleric:divine-order:thaumaturge','sourceKey','divine-order:thaumaturge',
              'payload',jsonb_build_object(
                'label','Чудотворец',
                'description','Даёт ещё один заговор жреца. К проверкам Интеллекта (Магия или Религия) добавляется модификатор Мудрости, минимум +1.',
                'mechanic',jsonb_build_object('kind','check_bonus','skills',jsonb_build_array('arcana','religion'),'ability','intelligence','bonusAbilityModifier','wisdom','minimumBonus',1,'extraClericCantrips',1)
              )
            ))
          )
        )
      )
    else choice end
    order by ord
  ) from jsonb_array_elements(coalesce(t.choices,'[]'::jsonb)) with ordinality e(choice,ord)
),'[]'::jsonb),updated_at=now()
where t.catalog_key='class:cleric' and t.is_active;

-- Thaumaturge's extra Cleric cantrip is a real persistent child choice. It is
-- invisible/inert unless Divine Order is currently Thaumaturge.
update public.rule_templates t
set choices=coalesce((select jsonb_agg(c order by ord) from (
  select c,ord from jsonb_array_elements(coalesce(t.choices,'[]'::jsonb)) with ordinality e(c,ord)
  where c->>'key'<>'cleric-thaumaturge-cantrip'
  union all
  select private.cleric_final_cantrip_choice(
    'cleric-thaumaturge-cantrip','Чудотворец · дополнительный заговор','cleric','divine-order:thaumaturge',
    'cleric-divine-order','divine-order:thaumaturge'
  ),1000000::bigint
) x),'[]'::jsonb),updated_at=now()
where t.catalog_key='class:cleric' and t.is_active;

-- Nature Domain level 1: prose is now backed by the three actual CE grants.
select private.cleric_final_upsert_level_mechanic('subclass:cleric:nature-domain',1,jsonb_build_object(
  'id','cleric-nature-heavy-runtime','type','grant','target','proficiency','key','category:heavy_armor',
  'payload',jsonb_build_object('rank',1,'label','Тяжёлая броня'),'sourceKey','nature-domain-l1-1'
));
select private.cleric_final_upsert_level_choice('subclass:cleric:nature-domain',1,jsonb_build_object(
  'key','nature-domain-skill','label','Домен природы · навык','target','proficiency','count',1,
  'options',jsonb_build_array('skill:animal_handling','skill:nature','skill:survival'),
  'option_labels',jsonb_build_object('skill:animal_handling','Уход за животными','skill:nature','Природа','skill:survival','Выживание')
));
select private.cleric_final_upsert_level_choice(
  'subclass:cleric:nature-domain',1,
  private.cleric_final_cantrip_choice('nature-domain-cantrip','Домен природы · заговор Друида','druid','nature-domain-l1-1')
);

-- Remove the pre-reconciliation Nature aliases if a dev database already ran
-- 20260830011000 before this migration.
update public.rule_template_levels l
set choices=coalesce((select jsonb_agg(c order by ord)
  from jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) with ordinality e(c,ord)
  where c->>'key' not in ('cleric-nature-skill','cleric-nature-cantrip')),'[]'::jsonb)
where l.template_id in (select id from public.rule_templates where is_active and catalog_key='subclass:cleric:nature-domain')
  and l.level=1;

-- Resource-free activations are still real class actions. They intentionally do
-- not invent counters; scene/target/duration rules remain in the exact text.
select private.cleric_final_upsert_level_mechanic('subclass:cleric:forge-domain',1,jsonb_build_object(
  'id','cleric-forge-blessing-action','type','action','key','forge_blessing_of_the_forge','label','Благословение кузни',
  'economy','special','sourceKey','forge-domain-l1-1','tags',jsonb_build_array('class','subclass','after:long-rest')
));
select private.cleric_final_upsert_level_mechanic('subclass:cleric:trickery-domain',3,jsonb_build_object(
  'id','cleric-trickery-blessing-action','type','action','key','trickery_blessing_of_the_trickster','label','Благословение обманщика',
  'economy','magic_action','sourceKey','trickery-domain-l3-1','tags',jsonb_build_array('class','subclass','duration:1h')
));
select private.cleric_final_upsert_level_mechanic('subclass:cleric:twilight-domain',1,jsonb_build_object(
  'id','cleric-twilight-vigilant-action','type','action','key','twilight_vigilant_blessing','label','Бдительное благословение',
  'economy','action','sourceKey','twilight-domain-l1-1','tags',jsonb_build_array('class','subclass','initiative')
));

-- Any legacy class/subclass spell method inside the Cleric package is normalized
-- to the one machine category consumed by the Class chat bucket.
update public.rule_templates t
set mechanics=private.cleric_final_normalize_json(coalesce(t.mechanics,'[]'::jsonb)),
    choices=private.cleric_final_normalize_json(coalesce(t.choices,'[]'::jsonb)),
    updated_at=now()
where t.is_active and (t.catalog_key='class:cleric' or t.catalog_key like 'subclass:cleric:%');

update public.rule_template_levels l
set mechanics=private.cleric_final_normalize_json(coalesce(l.mechanics,'[]'::jsonb)),
    choices=private.cleric_final_normalize_json(coalesce(l.choices,'[]'::jsonb))
where l.template_id in (
  select id from public.rule_templates where is_active and (catalog_key='class:cleric' or catalog_key like 'subclass:cleric:%')
);

-- Fresh installs may have passed through the older runtime migration. Reassert
-- the final persistent-resource boundary after it: no manual/never recovery.
create or replace function public.recover_character_resources(p_character_id uuid,p_trigger text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_state record; v_rule jsonb; v_restore text; v_amount integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_manage_character(p_character_id,auth.uid()) then raise exception 'Only GM or owner can restore resources'; end if;
  if p_trigger not in ('short_rest','long_rest','dawn') then raise exception 'Unsupported persistent recovery trigger'; end if;

  for v_state in
    select state_key,current,max_snapshot,recharge from public.character_resource_states
    where character_id=p_character_id for update
  loop
    v_rule:=null;
    if v_state.recharge ? 'rules' then
      select value into v_rule from jsonb_array_elements(v_state.recharge->'rules')
      where value->>'trigger'=p_trigger limit 1;
    elsif exists(select 1 from jsonb_array_elements_text(coalesce(v_state.recharge->'triggers','[]'::jsonb)) t(value) where t.value=p_trigger) then
      v_rule:=v_state.recharge;
    end if;
    if v_rule is null then continue; end if;
    v_restore:=coalesce(v_rule->>'restore','full');
    if v_restore='amount' then
      v_amount:=greatest(0,coalesce((v_rule->>'amount')::integer,0));
      update public.character_resource_states set current=least(max_snapshot,current+v_amount),updated_by=auth.uid(),updated_at=now()
      where character_id=p_character_id and state_key=v_state.state_key;
    else
      update public.character_resource_states set current=max_snapshot,updated_by=auth.uid(),updated_at=now()
      where character_id=p_character_id and state_key=v_state.state_key;
    end if;
  end loop;
end;
$$;

-- Rebuild relational spell links when the production helper exists. Dynamic SQL
-- keeps this forward migration compatible with older local databases.
do $$
declare r record;
begin
  if to_regprocedure('private.sync_rule_template_spell_links(uuid)') is not null then
    for r in select id from public.rule_templates
      where is_active and (catalog_key='class:cleric' or catalog_key like 'subclass:cleric:%')
    loop
      execute 'select private.sync_rule_template_spell_links($1)' using r.id;
    end loop;
  end if;
end $$;

-- Hard final gates: 14 domains, no legacy spell category, required Nature and
-- Thaumaturge choices, and the three resource-free actions.
do $$
declare v_domains integer; v_bad integer;
begin
  select count(*) into v_domains from public.rule_templates
    where is_active and kind='subclass' and catalog_key like 'subclass:cleric:%';
  if v_domains<>14 then raise exception 'Cleric final reconciliation expected 14 active domains, got %',v_domains; end if;

  select count(*) into v_bad
  from public.rule_templates t
  left join public.rule_template_levels l on l.template_id=t.id
  where t.is_active and (t.catalog_key='class:cleric' or t.catalog_key like 'subclass:cleric:%')
    and (coalesce(t.mechanics,'[]'::jsonb)::text||coalesce(t.choices,'[]'::jsonb)::text||coalesce(l.mechanics,'[]'::jsonb)::text||coalesce(l.choices,'[]'::jsonb)::text) like '%subclass_spell%';
  if v_bad>0 then raise exception 'Cleric package still contains subclass_spell methods'; end if;

  if not exists(
    select 1 from public.rule_templates t cross join lateral jsonb_array_elements(coalesce(t.choices,'[]'::jsonb)) c
    where t.is_active and t.catalog_key='class:cleric' and c->>'key'='cleric-thaumaturge-cantrip'
      and c->'requires_choice'->>'option'='divine-order:thaumaturge'
  ) then raise exception 'Thaumaturge dependent cantrip choice is missing'; end if;

  if not exists(
    select 1 from public.rule_templates t join public.rule_template_levels l on l.template_id=t.id
    cross join lateral jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) c
    where t.is_active and t.catalog_key='subclass:cleric:nature-domain' and l.level=1 and c->>'key'='nature-domain-cantrip'
  ) then raise exception 'Nature Domain cantrip choice is missing'; end if;

  select count(distinct m->>'key') into v_bad
  from public.rule_templates t join public.rule_template_levels l on l.template_id=t.id
  cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m
  where t.is_active and m->>'type'='action' and m->>'key' in (
    'forge_blessing_of_the_forge','trickery_blessing_of_the_trickster','twilight_vigilant_blessing'
  );
  if v_bad<>3 then raise exception 'Cleric resource-free action reconciliation incomplete'; end if;
end $$;

drop function private.cleric_final_cantrip_choice(text,text,text,text,text,text);
drop function private.cleric_final_upsert_level_choice(text,integer,jsonb);
drop function private.cleric_final_upsert_level_mechanic(text,integer,jsonb);
drop function private.cleric_final_normalize_json(jsonb);

commit;