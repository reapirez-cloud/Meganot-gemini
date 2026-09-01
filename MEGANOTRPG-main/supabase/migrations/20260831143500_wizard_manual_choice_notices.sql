-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:wizard
-- CLASS_PACKAGE_TEST: tests/wizardCompletionRuntime.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: wizard:text=READY;mechanics=IN_PROGRESS
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- Some durable sheet choices intentionally use the normal GM edit path instead
-- of a class-specific engine. Gena still tells the player when such a decision
-- is available so the rule cannot disappear behind prose.

begin;

do $block$
declare
  v_notice jsonb := jsonb_build_object(
    'key','wizard-cantrip-replacement-notice',
    'trigger','long_rest',
    'unlockLevel',1,
    'label','Можно заменить один заговор',
    'input',jsonb_build_object(
      'kind','notice',
      'body','После этого Долгого отдыха можно заменить один заговор, полученный способностью «Заклинания», другим заговором Волшебника. Сообщи выбор ГМ; ГМ изменит известный заговор через обычный лист персонажа. На 1 уровне Волшебник знает 3 таких заговора, на 4 уровне — 4, на 10 уровне — 5.'
    )
  );
  v_current jsonb;
begin
  for v_current in
    select jsonb_build_object('id',t.id,'preparations',coalesce(t.rules_meta->'post_rest_preparations','[]'::jsonb))
    from public.rule_templates t
    where t.is_active=true and t.catalog_key='class:wizard'
  loop
    if not exists(
      select 1
      from jsonb_array_elements(v_current->'preparations') entry
      where entry->>'key'='wizard-cantrip-replacement-notice'
    ) then
      update public.rule_templates
      set rules_meta=coalesce(rules_meta,'{}'::jsonb)
        || jsonb_build_object(
          'post_rest_preparations',(v_current->'preparations') || jsonb_build_array(v_notice),
          'manual_resolution_policy',coalesce(rules_meta->'manual_resolution_policy','{}'::jsonb)
            || jsonb_build_object(
              'cantrip_progression','gm_sheet_edit',
              'cantrip_long_rest_replacement','gena_notice_then_gm_sheet_edit',
              'scholar','player_choice_then_gm_expertise_edit',
              'asi_epic_boon','generic_or_gm_sheet_edit'
            )
        ),
        updated_at=now()
      where id=(v_current->>'id')::uuid;
    end if;
  end loop;
end;
$block$;

commit;
