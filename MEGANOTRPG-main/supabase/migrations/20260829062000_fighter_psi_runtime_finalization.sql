begin;

-- Final Psi Warrior runtime pass. Scene consequences stay descriptive, while every
-- finite character-side use is represented by ordinary CE resources/actions.
-- Restoring a free use is a separate action because the 2024 rule is literally:
-- use the free activation, then spend one Psionic Energy Die to regain that use.

create or replace function private.fighter_upsert_level_mechanics(
  p_template_id uuid,
  p_level integer,
  p_mechanics jsonb
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_kept jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(coalesce(p_mechanics,'[]'::jsonb)) <> 'array' then
    raise exception 'Mechanics must be an array';
  end if;

  if exists(
    select 1 from public.rule_template_levels
    where template_id=p_template_id and level=p_level
  ) then
    select coalesce(jsonb_agg(m order by ord),'[]'::jsonb)
      into v_kept
    from public.rule_template_levels l
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality q(m,ord)
    where l.template_id=p_template_id
      and l.level=p_level
      and not exists(
        select 1
        from jsonb_array_elements(coalesce(p_mechanics,'[]'::jsonb)) incoming
        where incoming->>'id'=m->>'id'
      );

    update public.rule_template_levels
    set mechanics=coalesce(v_kept,'[]'::jsonb)||coalesce(p_mechanics,'[]'::jsonb)
    where template_id=p_template_id and level=p_level;
  else
    insert into public.rule_template_levels(template_id,level,mechanics,choices)
    values(p_template_id,p_level,coalesce(p_mechanics,'[]'::jsonb),'[]'::jsonb);
  end if;
end;
$$;

create or replace function private.fighter_psi_action(
  p_id text,
  p_source_key text,
  p_key text,
  p_label text,
  p_economy text,
  p_range jsonb,
  p_cost_key text default null
)
returns jsonb
language sql
immutable
set search_path=''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id',p_id,
    'type','action',
    'sourceKey',p_source_key,
    'key',p_key,
    'label',p_label,
    'economy',p_economy,
    'range',coalesce(p_range,jsonb_build_object('kind','self')),
    'resourceCosts',case when nullif(trim(coalesce(p_cost_key,'')),'') is null then null
      else jsonb_build_array(jsonb_build_object('key',p_cost_key,'amount',1)) end,
    'tags',jsonb_build_array('class','psi-warrior'),
    'presentation',jsonb_build_object('tone','violet','icon','✦','display','counter','priority',90)
  ));
$$;

create or replace function private.fighter_psi_restore_action(
  p_id text,
  p_source_key text,
  p_key text,
  p_label text,
  p_restore_key text
)
returns jsonb
language sql
immutable
set search_path=''
as $$
  select jsonb_build_object(
    'id',p_id,
    'type','action',
    'sourceKey',p_source_key,
    'key',p_key,
    'label',p_label,
    'economy','free',
    'range',jsonb_build_object('kind','self'),
    'resourceCosts',jsonb_build_array(jsonb_build_object('key','psionic_energy','amount',1)),
    'effects',jsonb_build_array(jsonb_build_object(
      'kind','resource','key',p_restore_key,'operation','RESTORE','amount',1
    )),
    'tags',jsonb_build_array('class','psi-warrior','resource_conversion'),
    'presentation',jsonb_build_object('tone','violet','icon','↻','display','counter','priority',89)
  );
$$;

create or replace function private.finalize_fighter_psi_runtime(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_psi uuid;
begin
  select id into v_psi
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='subclass'
    and catalog_key='subclass:fighter:psi-warrior'
    and is_active
  order by version desc
  limit 1;
  if v_psi is null then return; end if;

  update public.rule_templates
  set catalog_revision='xphb-2024-psi-warrior-ru-precision-v3',
      mechanical_summary='Пси-воин 2024: Кости пси-энергии следуют таблице уровня Воина. CE отдельно ведёт расход Защитного поля, Псионического удара и бесплатные применения Телекинетического передвижения, Пси-прыжка, Оплота силы и Мастера телекинеза.',
      rules_meta=coalesce(rules_meta,'{}'::jsonb)||jsonb_build_object(
        'psi_runtime_complete',true,
        'free_use_resources',true,
        'telekinesis_always_prepared',true,
        'no_fake_scene_state',true
      ),
      updated_at=now()
  where id=v_psi;

  perform private.fighter_upsert_level_mechanics(v_psi,3,jsonb_build_array(
    private.fighter_feature(
      'fighter-psi-protective-field-feature','protective-field','subclass:fighter:psi-warrior:protective-field','Защитное поле',
      'Реакцией, когда вы или другое видимое вами существо в пределах 30 футов получает урон, потратьте 1 Кость пси-энергии и бросьте её. Уменьшите получаемый урон на результат кости + модификатор Интеллекта, минимум на 1.'
    ),
    private.fighter_psi_action(
      'fighter-psi-protective-field-use','protective-field','psi_protective_field','Защитное поле','reaction',
      '{"kind":"ranged","normal":30,"unit":"ft"}'::jsonb,'psionic_energy'
    ),
    private.fighter_feature(
      'fighter-psi-strike-feature','psionic-strike','subclass:fighter:psi-warrior:psionic-strike','Псионический удар',
      'Один раз в каждый свой ход, сразу после того как вы попали по цели в пределах 30 футов атакой оружием и нанесли ей урон, можно потратить 1 Кость пси-энергии. Цель получает дополнительный урон силовым полем, равный результату кости + модификатор Интеллекта.'
    ),
    private.fighter_psi_action(
      'fighter-psi-strike-use','psionic-strike','psi_psionic_strike','Псионический удар','triggered',
      '{"kind":"ranged","normal":30,"unit":"ft"}'::jsonb,'psionic_energy'
    ),
    private.fighter_feature(
      'fighter-psi-movement-feature','telekinetic-movement','subclass:fighter:psi-warrior:telekinetic-movement','Телекинетическое передвижение',
      'Магическим действием выберите видимую цель в пределах 30 футов: свободный предмет Большого размера или меньше либо одно согласное существо, кроме вас. Переместите цель на расстояние до 30 футов в свободное видимое место. Если предмет Крошечный, его можно переместить в вашу руку или из руки. Первое применение бесплатно и возвращается после короткого или долгого отдыха; если бесплатное применение потрачено, без действия потратьте 1 Кость пси-энергии, чтобы восстановить его.'
    ),
    private.fighter_resource(
      'fighter-psi-movement-free','telekinetic-movement','psi_telekinetic_movement_free','Телекинетическое передвижение · бесплатно','1'::jsonb,
      '{"triggers":["short_rest","long_rest"],"restore":"full"}'::jsonb,3,'REPLACE'
    ),
    private.fighter_psi_action(
      'fighter-psi-movement-use','telekinetic-movement','psi_telekinetic_movement','Телекинетическое передвижение','magic_action',
      '{"kind":"ranged","normal":30,"unit":"ft"}'::jsonb,'psi_telekinetic_movement_free'
    ),
    private.fighter_psi_restore_action(
      'fighter-psi-movement-restore','telekinetic-movement','psi_telekinetic_movement_restore','Восстановить Телекинетическое передвижение','psi_telekinetic_movement_free'
    )
  ));

  perform private.fighter_upsert_level_mechanics(v_psi,7,jsonb_build_array(
    private.fighter_feature(
      'fighter-psi-leap-feature','psi-powered-leap','subclass:fighter:psi-warrior:psi-powered-leap','Усиленный пси-прыжок',
      'Бонусным действием получите Скорость полёта, равную удвоенной Скорости ходьбы, до конца текущего хода. Первое применение бесплатно и возвращается после короткого или долгого отдыха; если оно потрачено, без действия потратьте 1 Кость пси-энергии, чтобы восстановить применение.'
    ),
    private.fighter_resource(
      'fighter-psi-leap-free','psi-powered-leap','psi_powered_leap_free','Усиленный пси-прыжок · бесплатно','1'::jsonb,
      '{"triggers":["short_rest","long_rest"],"restore":"full"}'::jsonb,7,'REPLACE'
    ),
    private.fighter_psi_action(
      'fighter-psi-leap-use','psi-powered-leap','psi_powered_leap','Усиленный пси-прыжок','bonus_action',
      '{"kind":"self"}'::jsonb,'psi_powered_leap_free'
    ),
    private.fighter_psi_restore_action(
      'fighter-psi-leap-restore','psi-powered-leap','psi_powered_leap_restore','Восстановить Усиленный пси-прыжок','psi_powered_leap_free'
    ),
    private.fighter_feature(
      'fighter-psi-thrust-feature','telekinetic-thrust','subclass:fighter:psi-warrior:telekinetic-thrust','Телекинетический толчок',
      'Когда наносите дополнительный урон Псионическим ударом, цель совершает спасбросок Силы против Сл 8 + бонус мастерства + модификатор Интеллекта. При провале выберите один эффект: цель становится Опрокинутой или перемещается на расстояние до 10 футов по горизонтали.'
    )
  ));

  perform private.fighter_upsert_level_mechanics(v_psi,10,jsonb_build_array(
    private.fighter_psi_action(
      'fighter-psi-guarded-mind-use','guarded-mind','psi_guarded_mind','Защищённый разум · завершить эффект','triggered',
      '{"kind":"self"}'::jsonb,'psionic_energy'
    )
  ));

  perform private.fighter_upsert_level_mechanics(v_psi,15,jsonb_build_array(
    private.fighter_resource(
      'fighter-psi-bulwark-free','bulwark-of-force','psi_bulwark_free','Оплот силы · бесплатно','1'::jsonb,
      '{"triggers":["long_rest"],"restore":"full"}'::jsonb,15,'REPLACE'
    ),
    private.fighter_psi_action(
      'fighter-psi-bulwark-use','bulwark-of-force','psi_bulwark_of_force','Оплот силы','bonus_action',
      '{"kind":"area","shape":"emanation","size":30,"unit":"ft"}'::jsonb,'psi_bulwark_free'
    ),
    private.fighter_psi_restore_action(
      'fighter-psi-bulwark-restore','bulwark-of-force','psi_bulwark_restore','Восстановить Оплот силы','psi_bulwark_free'
    )
  ));

  perform private.fighter_upsert_level_mechanics(v_psi,18,jsonb_build_array(
    private.fighter_resource(
      'fighter-psi-telekinesis-free','telekinetic-master','psi_telekinetic_master_free','Мастер телекинеза · бесплатный Телекинез','1'::jsonb,
      '{"triggers":["long_rest"],"restore":"full"}'::jsonb,18,'REPLACE'
    ),
    jsonb_build_object(
      'id','fighter-psi-telekinesis-spell',
      'type','spell',
      'sourceKey','telekinetic-master',
      'key','telekinesis',
      'variantKey','psi-warrior-telekinetic-master',
      'payload',jsonb_build_object(
        'spell',jsonb_build_object('name','Телекинез','level',5,'school','transmutation'),
        'preparation',jsonb_build_object('mode','always_prepared'),
        'methods',jsonb_build_array(jsonb_build_object(
          'key','telekinetic-master',
          'kind','feature',
          'ability','intelligence',
          'requiresPrepared',false,
          'resourceOptions',jsonb_build_array(jsonb_build_object(
            'key','free-use','castLevel',5,
            'costs',jsonb_build_array(jsonb_build_object('key','psi_telekinetic_master_free','amount',1))
          ))
        ))
      )
    ),
    private.fighter_psi_restore_action(
      'fighter-psi-telekinesis-restore','telekinetic-master','psi_telekinetic_master_restore','Восстановить бесплатный Телекинез','psi_telekinetic_master_free'
    )
  ));
end;
$$;

create or replace function private.finalize_fighter_psi_runtime_after_campaign()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.finalize_fighter_psi_runtime(new.id);
  return new;
end;
$$;

drop trigger if exists zzzzzzzz_campaigns_fighter_psi_runtime on public.campaigns;
create trigger zzzzzzzz_campaigns_fighter_psi_runtime
after insert on public.campaigns
for each row execute function private.finalize_fighter_psi_runtime_after_campaign();

do $$
declare r record;
begin
  for r in select id from public.campaigns loop
    perform private.finalize_fighter_psi_runtime(r.id);
  end loop;
end $$;

commit;
