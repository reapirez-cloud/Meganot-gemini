begin;

create or replace function private.apply_cleric_precision_pack(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cleric uuid;
  v_life uuid;
begin
  select id into v_cleric
  from public.rule_templates
  where campaign_id = p_campaign_id
    and kind = 'class'
    and catalog_key = 'class:cleric'
    and is_active
  order by version desc
  limit 1;

  if v_cleric is null then return; end if;

  -- Divine Order: exact rule copy. Choice mechanics remain separate CE sources.
  update public.rule_template_levels l
  set mechanics = coalesce((
    select jsonb_agg(
      case when m->>'id' = 'cleric-divine-order-feature-l1' then
        jsonb_set(
          jsonb_set(
            m,
            '{payload,description}',
            to_jsonb('На 1 уровне выбирается один Божественный сан. Защитник даёт владение воинским оружием и тяжёлой бронёй. Чудотворец даёт ещё один заговор жреца и добавляет модификатор Мудрости (минимум +1) к проверкам Интеллекта (Магия или Религия). Выбор сохраняется.'::text),
            true
          ),
          '{payload,mechanic}',
          jsonb_build_object(
            'kind','persistent_choice',
            'choiceKey','cleric-divine-order',
            'options',jsonb_build_object(
              'protector',jsonb_build_object('martialWeapons',true,'heavyArmor',true),
              'thaumaturge',jsonb_build_object('extraClericCantrips',1,'intelligenceCheckBonus',jsonb_build_object('skills',jsonb_build_array('arcana','religion'),'abilityModifier','wisdom','minimum',1))
            )
          ),
          true
        )
      else m end
      order by ord
    )
    from jsonb_array_elements(l.mechanics) with ordinality as e(m,ord)
  ), '[]'::jsonb)
  where l.template_id = v_cleric and l.level = 1;

  -- Tighten the existing top-level Divine Order choice as well.
  update public.rule_templates t
  set choices = coalesce((
    select jsonb_agg(
      case when c->>'key' = 'cleric-divine-order' then
        c || jsonb_build_object(
          'label','Божественный сан',
          'option_labels',jsonb_build_object('protector','Защитник','thaumaturge','Чудотворец'),
          'option_mechanics',jsonb_build_object(
            'protector',jsonb_build_array(
              jsonb_build_object('id','cleric-divine-order-protector-weapons','type','grant','target','proficiency','key','category:martial_weapons','payload',jsonb_build_object('rank',1,'label','Воинское оружие'),'sourceKey','divine-order:protector'),
              jsonb_build_object('id','cleric-divine-order-protector-armor','type','grant','target','proficiency','key','category:heavy_armor','payload',jsonb_build_object('rank',1,'label','Тяжёлая броня'),'sourceKey','divine-order:protector')
            ),
            'thaumaturge',jsonb_build_array(
              jsonb_build_object(
                'id','cleric-divine-order-thaumaturge-rules','type','grant','target','feature','key','class:cleric:divine-order:thaumaturge','sourceKey','divine-order:thaumaturge',
                'payload',jsonb_build_object(
                  'label','Чудотворец',
                  'description','Даёт ещё один заговор жреца. К проверкам Интеллекта (Магия или Религия) добавляется модификатор Мудрости, минимум +1.',
                  'mechanic',jsonb_build_object('kind','check_bonus','skills',jsonb_build_array('arcana','religion'),'ability','intelligence','bonusAbilityModifier','wisdom','minimumBonus',1,'extraClericCantrips',1)
                )
              )
            )
          )
        )
      else c end
      order by ord
    )
    from jsonb_array_elements(coalesce(t.choices,'[]'::jsonb)) with ordinality as e(c,ord)
  ), '[]'::jsonb)
  where t.id = v_cleric;

  -- Channel Divinity: exact recovery and both starting effects are explicit CE data.
  update public.rule_template_levels l
  set mechanics = coalesce((
    select jsonb_agg(
      case
        when m->>'id' = 'cleric-channel-divinity-feature-l2' then
          jsonb_set(
            jsonb_set(
              m,
              '{payload,description}',
              to_jsonb('Запас Божественного канала: 2 использования на 2 уровне, 3 на 6 и 4 на 18. После короткого отдыха возвращается 1 потраченное использование; после долгого отдыха — весь запас. На 2 уровне доступны Божественная искра и Изгнание нежити; способности домена могут добавлять новые способы расхода.'::text),
              true
            ),
            '{payload,mechanic}',
            jsonb_build_object(
              'kind','resource_with_effects','resource','channel_divinity',
              'usesByClericLevel',jsonb_build_object('2',2,'6',3,'18',4),
              'recovery',jsonb_build_array(
                jsonb_build_object('trigger','short_rest','restore','amount','amount',1),
                jsonb_build_object('trigger','long_rest','restore','full')
              ),
              'saveDc','cleric_spell_save_dc',
              'effects',jsonb_build_array('divine_spark','turn_undead')
            ),
            true
          )
        when m->>'id' = 'cleric-turn-undead' then
          (m || jsonb_build_object(
            'economy','magic_action',
            'range',jsonb_build_object('kind','area','shape','emanation','size',30,'unit','ft'),
            'tags',jsonb_build_array('unique','class','save:wisdom','target:undead','condition:frightened','condition:incapacitated','duration:1m','ends:on-damage-or-incapacitated-or-death')
          ))
        when m->>'id' = 'cleric-divine-spark' then
          (m || jsonb_build_object(
            'economy','magic_action',
            'range',jsonb_build_object('kind','ranged','normal',30,'unit','ft'),
            'tags',jsonb_build_array('unique','class','choice:heal-or-damage','save:constitution','half-on-save','damage:necrotic-or-radiant','formula:1d8+wisdom')
          ))
        else m
      end
      order by ord
    )
    from jsonb_array_elements(l.mechanics) with ordinality as e(m,ord)
  ), '[]'::jsonb)
  where l.template_id = v_cleric and l.level = 2;

  -- Sear Undead.
  update public.rule_template_levels l
  set mechanics = coalesce((
    select jsonb_agg(
      case when m->>'id' = 'cleric-sear-undead-feature-l5' then
        jsonb_set(
          jsonb_set(m,'{payload,description}',to_jsonb('Когда жрец использует Изгнание нежити, он бросает число к8, равное модификатору Мудрости (минимум 1к8). Каждая нежить, провалившая спасбросок против этого Изгнания, получает сияющий урон, равный общей сумме броска. Этот урон не прекращает эффект Изгнания нежити.'::text),true),
          '{payload,mechanic}',
          jsonb_build_object('kind','triggered_damage','trigger','turn_undead_failed_save','dice',jsonb_build_object('countAbilityModifier','wisdom','minimumCount',1,'sides',8),'damageType','radiant','doesNotEndTriggerEffect',true),
          true
        )
      else m end
      order by ord
    ) from jsonb_array_elements(l.mechanics) with ordinality as e(m,ord)
  ),'[]'::jsonb)
  where l.template_id = v_cleric and l.level = 5;

  -- Blessed Strikes is a real persistent choice. Its level-14 upgrade follows the saved option.
  update public.rule_template_levels l
  set mechanics = coalesce((
      select jsonb_agg(
        case when m->>'id' = 'cleric-blessed-strikes-feature-l7' then
          jsonb_set(
            jsonb_set(m,'{payload,description}',to_jsonb('Выберите один вариант один раз. Божественный удар: один раз на каждом своём ходу после попадания атакой оружием добавить 1к8 некротического или сияющего урона. Могущественные заклинания: к урону любого заговора жреца добавляется модификатор Мудрости. На 14 уровне автоматически усиливается выбранный вариант.'::text),true),
            '{payload,mechanic}',jsonb_build_object('kind','persistent_choice','choiceKey','cleric-blessed-strikes','upgradeLevel',14),true
          )
        else m end
        order by ord
      ) from jsonb_array_elements(l.mechanics) with ordinality as e(m,ord)
    ),'[]'::jsonb),
    choices = jsonb_build_array(
      jsonb_build_object(
        'key','cleric-blessed-strikes','label','Благословенные удары','target','trait','count',1,
        'options',jsonb_build_array('divine-strike','potent-spellcasting'),
        'option_labels',jsonb_build_object('divine-strike','Божественный удар','potent-spellcasting','Могущественные заклинания'),
        'option_mechanics',jsonb_build_object(
          'divine-strike',jsonb_build_array(
            jsonb_build_object(
              'id','cleric-blessed-strikes-divine-strike','type','grant','target','feature','key','class:cleric:blessed-strikes:divine-strike','sourceKey','blessed-strikes:divine-strike','priority',7,
              'payload',jsonb_build_object('label','Божественный удар','description','Один раз на каждом своём ходу после попадания атакой оружием цель получает дополнительно 1к8 некротического или сияющего урона; тип выбирается при попадании.','mechanic',jsonb_build_object('kind','triggered_damage','trigger','weapon_attack_hit','frequency','once_per_own_turn','dice','1d8','damageTypes',jsonb_build_array('necrotic','radiant'),'chooseDamageTypeOnHit',true))
            )
          ),
          'potent-spellcasting',jsonb_build_array(
            jsonb_build_object(
              'id','cleric-blessed-strikes-potent-spellcasting','type','grant','target','feature','key','class:cleric:blessed-strikes:potent-spellcasting','sourceKey','blessed-strikes:potent-spellcasting','priority',7,
              'payload',jsonb_build_object('label','Могущественные заклинания','description','К урону любого заговора жреца добавляется модификатор Мудрости.','mechanic',jsonb_build_object('kind','spell_damage_modifier','spellClass','cleric','spellLevel',0,'addAbilityModifier','wisdom'))
            )
          )
        ),
        'option_mechanics_by_level',jsonb_build_object(
          'divine-strike',jsonb_build_object('14',jsonb_build_array(
            jsonb_build_object(
              'id','cleric-blessed-strikes-divine-strike-l14','type','grant','target','feature','key','class:cleric:blessed-strikes:divine-strike','sourceKey','blessed-strikes:divine-strike','priority',14,'grantOperation','REPLACE',
              'payload',jsonb_build_object('label','Божественный удар','description','Один раз на каждом своём ходу после попадания атакой оружием цель получает дополнительно 2к8 некротического или сияющего урона; тип выбирается при попадании.','mechanic',jsonb_build_object('kind','triggered_damage','trigger','weapon_attack_hit','frequency','once_per_own_turn','dice','2d8','damageTypes',jsonb_build_array('necrotic','radiant'),'chooseDamageTypeOnHit',true))
            )
          )),
          'potent-spellcasting',jsonb_build_object('14',jsonb_build_array(
            jsonb_build_object(
              'id','cleric-blessed-strikes-potent-spellcasting-l14','type','grant','target','feature','key','class:cleric:blessed-strikes:potent-spellcasting','sourceKey','blessed-strikes:potent-spellcasting','priority',14,'grantOperation','REPLACE',
              'payload',jsonb_build_object('label','Могущественные заклинания','description','К урону любого заговора жреца добавляется модификатор Мудрости. Кроме того, когда заговор жреца наносит урон, жрец может дать себе или существу в 60 футах временные HP, равные удвоенному модификатору Мудрости.','mechanic',jsonb_build_object('kind','spell_damage_modifier_with_temp_hp','spellClass','cleric','spellLevel',0,'addAbilityModifier','wisdom','onDamageTempHp',jsonb_build_object('rangeFeet',60,'amountAbilityModifier','wisdom','multiplier',2,'target','self_or_creature')))
            )
          ))
        )
      )
    )
  where l.template_id = v_cleric and l.level = 7;

  update public.rule_template_levels l
  set mechanics = coalesce((
    select jsonb_agg(
      case when m->>'id' = 'cleric-improved-blessed-strikes-feature-l14' then
        jsonb_set(
          jsonb_set(m,'{payload,description}',to_jsonb('Автоматически усиливает вариант Благословенных ударов, выбранный на 7 уровне. Божественный удар увеличивается с 1к8 до 2к8. Могущественные заклинания дополнительно после урона заговором позволяют дать себе или существу в 60 футах временные HP, равные удвоенному модификатору Мудрости.'::text),true),
          '{payload,mechanic}',jsonb_build_object('kind','choice_upgrade','choiceKey','cleric-blessed-strikes','sourceLevel',7),true
        )
      else m end order by ord
    ) from jsonb_array_elements(l.mechanics) with ordinality as e(m,ord)
  ),'[]'::jsonb)
  where l.template_id = v_cleric and l.level = 14;

  -- Divine Intervention: native resource + action, plus exact structured rule.
  update public.rule_template_levels l
  set mechanics = (
    select jsonb_agg(m order by ord)
    from (
      select case when m->>'id' = 'cleric-divine-intervention-feature-l10' then
        jsonb_set(
          jsonb_set(m,'{payload,description}',to_jsonb('Магическим действием выбрать заклинание жреца 5 уровня или ниже, которому не нужна реакция. Это заклинание сотворяется частью того же действия без траты ячейки и без материальных компонентов. После применения способность недоступна до долгого отдыха.'::text),true),
          '{payload,mechanic}',jsonb_build_object('kind','free_spell_cast','economy','magic_action','spellClass','cleric','maximumSpellLevel',5,'excludeCastingTime','reaction','slotCost',0,'materialComponentsRequired',false,'recharge','long_rest'),true
        ) else m end as m, ord
      from jsonb_array_elements(l.mechanics) with ordinality as e(m,ord)
      union all
      select jsonb_build_object('id','cleric-divine-intervention-resource','type','resource','key','divine_intervention','label','Божественное вмешательство','max',1,'recharge',jsonb_build_array('long_rest'),'restore','full','initial','full','sourceKey','divine-intervention','presentation',jsonb_build_object('icon','✦','tone','amber','display','pips','priority',88)), 1000
      union all
      select jsonb_build_object('id','cleric-divine-intervention-action','type','action','key','divine_intervention','label','Божественное вмешательство','economy','magic_action','resourceKey','divine_intervention','resourceCost',1,'sourceKey','divine-intervention','tags',jsonb_build_array('unique','class','free-cleric-spell','max-spell-level:5','no-reaction-spell','no-slot','no-material-components')), 1001
    ) q
  )
  where l.template_id = v_cleric and l.level = 10;

  -- Greater Divine Intervention.
  update public.rule_template_levels l
  set mechanics = coalesce((
    select jsonb_agg(
      case when m->>'id' = 'cleric-greater-divine-intervention-feature-l20' then
        jsonb_set(
          jsonb_set(m,'{payload,description}',to_jsonb('При использовании Божественного вмешательства можно выбрать «Исполнение желаний». Если выбран именно этот вариант, Божественное вмешательство после применения недоступно до окончания 2к4 долгих отдыхов.'::text),true),
          '{payload,mechanic}',jsonb_build_object('kind','feature_upgrade','upgrades','divine_intervention','addsSpell','wish','specialCooldown',jsonb_build_object('whenSpell','wish','longRestsDice','2d4')),true
        )
      else m end order by ord
    ) from jsonb_array_elements(l.mechanics) with ordinality as e(m,ord)
  ),'[]'::jsonb)
  where l.template_id = v_cleric and l.level = 20;

  -- LIFE DOMAIN -------------------------------------------------------------
  select id into v_life
  from public.rule_templates
  where campaign_id = p_campaign_id
    and kind = 'subclass'
    and catalog_key = 'subclass:cleric:life-domain'
    and parent_template_id = v_cleric
    and is_active
  order by version desc
  limit 1;

  if v_life is null then return; end if;

  update public.rule_templates
  set description = 'Лечение через заклинания и Божественный канал: дополнительное восстановление HP, самоисцеление при помощи союзникам и максимальные значения костей лечения.',
      mechanical_summary = 'Заклинания домена всегда подготовлены. Лечение заклинаниями с ячейкой получает +2 + уровень ячейки; «Сохранить жизнь» распределяет 5 × уровень жреца HP между окровавленными целями; позже жрец лечит себя при лечении других и максимизирует кости лечения.',
      author_description = 'Жрецы Жизни занимаются самой неблагодарной арифметикой в отряде: считают чужие раны быстрее, чем их успевают нанести. Их чудеса не делают людей неуязвимыми — они просто очень настойчиво отказываются признавать, что бой уже всё решил.',
      author_comment = 'Если такой жрец велит вам отойти назад, отойдите. Обычно он уже посчитал, сколько крови вы потеряли, а вы — ещё нет.'
  where id = v_life;

  -- Level 3: Disciple of Life + Preserve Life. Existing domain spells stay intact.
  update public.rule_template_levels l
  set mechanics = (
    select jsonb_agg(m order by ord)
    from (
      select
        case when m->>'id' = 'cleric-life-domain-life-domain-l3-1-feature' then
          jsonb_build_object(
            'id','cleric-life-domain-disciple-of-life','type','grant','target','feature','key','subclass:cleric:life-domain:disciple-of-life','sourceKey','disciple-of-life',
            'payload',jsonb_build_object(
              'label','Ученик жизни',
              'description','Когда заклинание, сотворённое с тратой ячейки, восстанавливает существу HP, в ход сотворения эта цель дополнительно восстанавливает HP в количестве 2 + уровень потраченной ячейки.',
              'mechanic',jsonb_build_object('kind','triggered_healing_bonus','trigger',jsonb_build_object('event','spell_restores_hp','requiresSpellSlot',true,'timing','casting_turn'),'effect',jsonb_build_object('target','healed_creature','amount',jsonb_build_object('flat',2,'plus','spell_slot_level')))
            )
          )
        else m end as m, ord
      from jsonb_array_elements(l.mechanics) with ordinality as e(m,ord)
      union all
      select jsonb_build_object(
        'id','cleric-life-domain-preserve-life-feature','type','grant','target','feature','key','subclass:cleric:life-domain:preserve-life','sourceKey','preserve-life',
        'payload',jsonb_build_object(
          'label','Сохранить жизнь',
          'description','Магическим действием потратить 1 Божественный канал. Выберите любое число окровавленных существ в 30 футах, включая себя. Получите общий запас лечения, равный 5 × уровень жреца, и распределите его между выбранными целями. Ни одну цель нельзя этим лечением поднять выше половины её максимума HP.',
          'mechanic',jsonb_build_object('kind','healing_pool_action','economy','magic_action','cost',jsonb_build_object('resource','channel_divinity','amount',1),'rangeFeet',30,'targets',jsonb_build_object('count','any','requires','bloodied','includesSelf',true),'pool',jsonb_build_object('classLevelMultiplier',5,'class','cleric'),'perTargetCap','half_max_hp')
        )
      ), 1000
      union all
      select jsonb_build_object(
        'id','cleric-life-domain-preserve-life-action','type','action','key','preserve_life','label','Сохранить жизнь','economy','magic_action','range',jsonb_build_object('kind','area','shape','emanation','size',30,'unit','ft'),'resourceKey','channel_divinity','resourceCost',1,'sourceKey','preserve-life','tags',jsonb_build_array('unique','class','healing-pool','pool:5x-cleric-level','target:bloodied','includes:self','cap:half-max-hp')
      ), 1001
    ) q
  )
  where l.template_id = v_life and l.level = 3;

  update public.rule_template_levels l
  set mechanics = coalesce((
    select jsonb_agg(
      case when m->>'id' = 'cleric-life-domain-blessed-healer-l6-1-feature' then
        jsonb_build_object(
          'id','cleric-life-domain-blessed-healer','type','grant','target','feature','key','subclass:cleric:life-domain:blessed-healer','sourceKey','blessed-healer',
          'payload',jsonb_build_object(
            'label','Благословенный целитель',
            'description','Сразу после того, как жрец сотворил с тратой ячейки заклинание, восстановившее HP хотя бы одному существу кроме него самого, жрец восстанавливает себе HP в количестве 2 + уровень потраченной ячейки.',
            'mechanic',jsonb_build_object('kind','triggered_self_healing','trigger',jsonb_build_object('event','spell_restores_hp','requiresSpellSlot',true,'requiresOtherTarget',true,'timing','immediately_after_cast'),'effect',jsonb_build_object('target','self','amount',jsonb_build_object('flat',2,'plus','spell_slot_level')))
          )
        )
      else m end order by ord
    ) from jsonb_array_elements(l.mechanics) with ordinality as e(m,ord)
  ),'[]'::jsonb)
  where l.template_id = v_life and l.level = 6;

  update public.rule_template_levels l
  set mechanics = coalesce((
    select jsonb_agg(
      case when m->>'id' = 'cleric-life-domain-supreme-healing-l17-1-feature' then
        jsonb_build_object(
          'id','cleric-life-domain-supreme-healing','type','grant','target','feature','key','subclass:cleric:life-domain:supreme-healing','sourceKey','supreme-healing',
          'payload',jsonb_build_object(
            'label','Высшее исцеление',
            'description','Когда заклинание или Божественный канал должен бросить одну или несколько костей для восстановления HP, кости лечения не бросаются: каждая считается выпавшей на максимальное значение. Например, 2к6 лечения дают 12 HP до применения остальных модификаторов.',
            'mechanic',jsonb_build_object('kind','maximize_healing_dice','appliesTo',jsonb_build_array('spell','channel_divinity'))
          )
        )
      else m end order by ord
    ) from jsonb_array_elements(l.mechanics) with ordinality as e(m,ord)
  ),'[]'::jsonb)
  where l.template_id = v_life and l.level = 17;
end;
$$;

-- Keep all future campaign installs on the same precise catalog layer.
create or replace function private.install_builtin_rule_catalog(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.install_builtin_druid_class(p_campaign_id);
  perform private.install_official_class_catalog(p_campaign_id);
  perform private.install_official_subclass_catalog(p_campaign_id);
  perform private.apply_subclass_reference_quality(p_campaign_id);
  perform private.apply_subclass_action_explanations(p_campaign_id);
  perform private.apply_narrator_immersion_guard(p_campaign_id);
  perform private.apply_cleric_precision_pack(p_campaign_id);
end;
$$;

-- Patch every campaign that already has the catalog installed.
do $$
declare
  v_campaign record;
begin
  for v_campaign in
    select distinct campaign_id
    from public.rule_templates
    where campaign_id is not null
  loop
    perform private.apply_cleric_precision_pack(v_campaign.campaign_id);
  end loop;
end;
$$;

commit;
