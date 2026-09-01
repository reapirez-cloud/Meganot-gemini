-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:cleric
-- CLASS_PACKAGE_TEST: tests/clericRuntimeCompletion.test.ts
-- CLASS_WORK_STATUS: cleric:text=READY;mechanics=IN_PROGRESS
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md

begin;

-- Historical Cleric rows stored the selectable values as
-- divine-order:protector / divine-order:thaumaturge, but option_labels and
-- option_mechanics were keyed as protector / thaumaturge. Resolver lookups are
-- exact, so an already persisted choice could render as selected while emitting
-- none of its CE mechanics. Preserve assignment values and repair the maps.
update public.rule_templates t
set choices = coalesce((
  select jsonb_agg(
    case when choice->>'key'='cleric-divine-order' then
      jsonb_set(
        jsonb_set(
          choice,
          '{option_labels}',
          jsonb_build_object(
            'divine-order:protector',coalesce(choice->'option_labels'->'divine-order:protector',choice->'option_labels'->'protector','"Защитник"'::jsonb),
            'divine-order:thaumaturge',coalesce(choice->'option_labels'->'divine-order:thaumaturge',choice->'option_labels'->'thaumaturge','"Чудотворец"'::jsonb)
          ),
          true
        ),
        '{option_mechanics}',
        jsonb_build_object(
          'divine-order:protector',coalesce(choice->'option_mechanics'->'divine-order:protector',choice->'option_mechanics'->'protector','[]'::jsonb),
          'divine-order:thaumaturge',coalesce(choice->'option_mechanics'->'divine-order:thaumaturge',choice->'option_mechanics'->'thaumaturge','[]'::jsonb)
        ),
        true
      )
    else choice end
    order by ord
  )
  from jsonb_array_elements(coalesce(t.choices,'[]'::jsonb)) with ordinality as e(choice,ord)
),'[]'::jsonb),
updated_at=now()
where t.catalog_key='class:cleric' and t.is_active;

-- Clear deliberate, resource-free activations should still be typed as
-- special_action on the Class tab. They do not get fake resource effects; the
-- exact rule remains authoritative for the world/target consequence.
create or replace function private.cleric_free_action_upsert(
  p_catalog_key text,
  p_level integer,
  p_action jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_template uuid; v_id text:=p_action->>'id';
begin
  select id into v_template from public.rule_templates
  where catalog_key=p_catalog_key and is_active
  order by version desc,updated_at desc limit 1;
  if v_template is null or nullif(v_id,'') is null then return; end if;

  update public.rule_template_levels l
  set mechanics=coalesce((
    select jsonb_agg(m order by ord)
    from (
      select m,ord from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality as e(m,ord)
      where m->>'id'<>v_id
      union all select p_action,1000000::bigint
    ) x
  ),'[]'::jsonb)
  where l.template_id=v_template and l.level=p_level;
end;
$$;

select private.cleric_free_action_upsert('subclass:cleric:forge-domain',1,jsonb_build_object(
  'id','cleric-forge-blessing-action','type','action','key','forge_blessing_of_the_forge','label','Благословение кузни',
  'economy','special','sourceKey','forge-domain-l1-1','tags',jsonb_build_array('class','subclass','after:long-rest')
));

select private.cleric_free_action_upsert('subclass:cleric:trickery-domain',3,jsonb_build_object(
  'id','cleric-trickery-blessing-action','type','action','key','trickery_blessing_of_the_trickster','label','Благословение обманщика',
  'economy','magic_action','sourceKey','trickery-domain-l3-1','tags',jsonb_build_array('class','subclass','duration:1h')
));

select private.cleric_free_action_upsert('subclass:cleric:twilight-domain',1,jsonb_build_object(
  'id','cleric-twilight-vigilant-action','type','action','key','twilight_vigilant_blessing','label','Бдительное благословение',
  'economy','action','sourceKey','twilight-domain-l1-1','tags',jsonb_build_array('class','subclass','initiative')
));

-- Fail the migration rather than silently preserving the original choice-key bug.
do $$
declare v_bad integer;
begin
  select count(*) into v_bad
  from public.rule_templates t
  cross join lateral jsonb_array_elements(coalesce(t.choices,'[]'::jsonb)) c(choice)
  where t.catalog_key='class:cleric' and t.is_active
    and c.choice->>'key'='cleric-divine-order'
    and (
      not (c.choice->'option_mechanics' ? 'divine-order:protector')
      or not (c.choice->'option_mechanics' ? 'divine-order:thaumaturge')
      or not (c.choice->'option_labels' ? 'divine-order:protector')
      or not (c.choice->'option_labels' ? 'divine-order:thaumaturge')
    );
  if v_bad>0 then raise exception 'Cleric Divine Order option maps are still inconsistent'; end if;
end $$;

drop function private.cleric_free_action_upsert(text,integer,jsonb);

commit;
