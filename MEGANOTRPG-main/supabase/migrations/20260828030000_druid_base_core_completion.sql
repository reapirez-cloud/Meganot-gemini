begin;

create or replace function private.druid_patch_feature(p_mechanics jsonb,p_source_key text,p_description text,p_mechanic jsonb)
returns jsonb language sql immutable set search_path='' as $$
select coalesce(jsonb_agg(
  case when m->>'type'='grant' and m->>'target'='feature' and coalesce(m->>'sourceKey','')=p_source_key
    then jsonb_set(jsonb_set(m,'{payload,description}',to_jsonb(p_description),true),'{payload,mechanic}',p_mechanic,true)
    else m end order by ord),'[]'::jsonb)
from jsonb_array_elements(coalesce(p_mechanics,'[]'::jsonb)) with ordinality x(m,ord);
$$;

create or replace function private.normalize_druid_base_core(p_campaign_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  select id into v_id from public.rule_templates
  where campaign_id=p_campaign_id and is_active and catalog_key='class:druid'
  order by version desc limit 1;
  if v_id is null then return; end if;

  update public.rule_templates
  set rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object('ce_rule_dependencies',true),updated_at=now()
  where id=v_id;

  update public.rule_templates t set choices=(
    select coalesce(jsonb_agg(
      case when c->>'key'='druid-primal-order' then jsonb_set(c,'{option_mechanics,primal-order:magician}',jsonb_build_array(
        jsonb_build_object('id','druid-order-magician-detail','type','grant','target','feature','key','class:druid:primal-order:magician',
          'payload',jsonb_build_object('label','Первобытный путь: Маг',
            'description','Друид знает на один заговор друида больше. Выбери Магию или Природу: к проверкам выбранного навыка добавляется модификатор Мудрости, минимум +1.',
            'mechanic',jsonb_build_object('version',1,'kind','choice_bonus','extraDruidCantrips',1,
              'dependentChoice',jsonb_build_object('key','primal-order-magician-skill','options',jsonb_build_array('arcana','nature'),
                'bonus',jsonb_build_object('reference','abilities.wisdom.modifier','minimum',1)))))) ,true)
      else c end order by ord),'[]'::jsonb)
    from jsonb_array_elements(coalesce(t.choices,'[]'::jsonb)) with ordinality q(c,ord)
  ),updated_at=now() where t.id=v_id;

  update public.rule_template_levels l set mechanics=private.druid_patch_feature(l.mechanics,'wild-shape',
    'Действием друид превращается в виденного ранее зверя, подходящего по пределу CR. Форма использует HP и физические параметры зверя. Она длится до половины уровня друида часов; выйти можно бонусным действием, а при 0 HP формы, потере сознания или смерти друид возвращается в обычный облик. Доступно 2 использования, оба восстанавливаются после короткого или долгого отдыха.',
    jsonb_build_object('version',1,'kind','transformation','activation','action','cost',jsonb_build_object('resource','wild_shape','amount',1),
      'uses',2,'recharge',jsonb_build_array('short_rest','long_rest'),'durationHours','floor(source.level/2)',
      'formHitPoints','beast_stat_block','endsOn',jsonb_build_array('manual_bonus_action','zero_form_hp','unconscious','death'),
      'spellcasting',jsonb_build_object('allowed',false,'upgradeSource','beast-spells')))
  where l.template_id=v_id and l.level=2;

  update public.rule_template_levels l set mechanics=(
    select coalesce(jsonb_agg(m order by ord) filter(where m->>'id'<>'druid-wild-companion-rules'),'[]'::jsonb)
    from jsonb_array_elements(l.mechanics) with ordinality x(m,ord)
  )||jsonb_build_array(jsonb_build_object('id','druid-wild-companion-rules','type','grant','target','feature','key','class:druid:wild-companion','sourceKey','wild-companion',
    'payload',jsonb_build_object('label','Дикий спутник',
      'description','Магическим действием друид творит «Поиск фамильяра» без материальных компонентов, тратя 1 использование Дикой формы или подходящую ячейку. Фамильяр имеет тип Фея и исчезает после следующего долгого отдыха друида.',
      'mechanic',jsonb_build_object('version',1,'kind','alternate_spell_payment','spell','find-familiar','activation','magic_action',
        'costOptions',jsonb_build_array(jsonb_build_object('resource','wild_shape','amount',1),jsonb_build_object('resourceFamily','spell_slot','minimumLevel',1,'amount',1)),
        'materialComponents','ignored','familiarCreatureType','fey','expires','long_rest'))))
  where l.template_id=v_id and l.level=2;

  update public.rule_template_levels l set mechanics=private.druid_patch_feature(l.mechanics,'wild-resurgence',
    'Если Дикая форма равна 0, один раз на каждом своём ходу без действия можно потратить одну ячейку любого уровня и вернуть ровно 1 использование Дикой формы. Уровень ячейки не меняет результат. Обратно: без действия потрать 1 Дикая форма и восстанови 1 ячейку 1 уровня; такой обратный обмен доступен 1 раз до долгого отдыха.',
    jsonb_build_object('version',1,'kind','resource_conversion','slotToWildShape',jsonb_build_object('requiresWildShapeCurrent',0,'spendAnySpellSlot',1,'restoreWildShape',1,'frequency','once_per_turn'),
      'wildShapeToSlot',jsonb_build_object('spendWildShape',1,'restoreSpellSlotLevel',1,'frequency','once_per_long_rest')))
  where l.template_id=v_id and l.level=5;

  update public.rule_template_levels l set mechanics=private.druid_patch_feature(l.mechanics,'beast-spells',
    'В Дикой форме друид может творить заклинания, кроме заклинаний с материальным компонентом указанной стоимости или с расходуемым материальным компонентом.',
    jsonb_build_object('version',1,'kind','spellcasting_permission','dependsOn',jsonb_build_array('wild_shape_active'),'allow',true,'forbidMaterialWithCost',true,'forbidConsumedMaterial',true))
  where l.template_id=v_id and l.level=18;

  update public.rule_template_levels l set mechanics=private.druid_patch_feature(l.mechanics,'archdruid',
    'При инициативе, если Дикая форма равна 0, возвращается 1 использование. Раз за долгий отдых без действия можно превратить оставшиеся использования Дикой формы в одну ячейку: каждое использование даёт 2 уровня ячейки. Тело друида стареет в десять раз медленнее.',
    jsonb_build_object('version',1,'kind','capstone','initiativeRecovery',jsonb_build_object('whenResourceZero','wild_shape','restore',1),
      'conversion',jsonb_build_object('resource','wild_shape','spellSlotLevelsPerUse',2,'frequency','once_per_long_rest','economy','none'),'agingRate',0.1))
  where l.template_id=v_id and l.level=20;
end;
$$;

DO $$ declare r record; begin for r in select id from public.campaigns loop perform private.normalize_druid_base_core(r.id); end loop; end $$;

commit;
