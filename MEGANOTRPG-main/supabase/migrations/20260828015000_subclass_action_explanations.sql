begin;

create or replace function private.ensure_subclass_action_explanation(
  p_campaign_id uuid,
  p_catalog_key text,
  p_level integer,
  p_source_key text,
  p_mechanic jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.rule_template_levels l
  set mechanics = coalesce(l.mechanics,'[]'::jsonb) || jsonb_build_array(p_mechanic)
  from public.rule_templates t
  where t.id=l.template_id
    and t.campaign_id=p_campaign_id
    and t.kind='subclass'
    and t.catalog_key=p_catalog_key
    and l.level=p_level
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) e(item)
      where e.item->>'type'='grant'
        and e.item->>'target'='feature'
        and e.item->>'sourceKey'=p_source_key
        and length(trim(coalesce(e.item->'payload'->>'description','')))>=45
    );
$$;

create or replace function private.apply_subclass_action_explanation_quality(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bad_count integer;
begin
  perform private.ensure_subclass_action_explanation(
    p_campaign_id,
    'subclass:druid:moon',
    14,
    'moonlight-step',
    jsonb_build_object(
      'id','moon-step-upgrade-rules',
      'type','grant',
      'sourceKey','moonlight-step',
      'target','feature',
      'key','subclass:druid:moon:moonlight-step-l14',
      'payload',jsonb_build_object(
        'label','Лунный шаг · спутник',
        'description','С 14 уровня одно использование Лунного шага переносит вместе с друидом одного согласного союзника, который находится в пределах 10 футов от точки отправления. После телепорта союзник появляется в пределах 10 футов от точки назначения. Цена и дальность самого Лунного шага не меняются: бонусное действие, 1 использование, телепорт друида на 30 футов.',
        'mechanic',jsonb_build_object('passenger',jsonb_build_object('willing',true,'originRangeFeet',10,'destinationRangeFeet',10))
      )
    )
  );

  perform private.ensure_subclass_action_explanation(
    p_campaign_id,
    'subclass:druid:stars',
    10,
    'starry-form',
    jsonb_build_object(
      'id','stars-starry-form-upgrade-rules',
      'type','grant',
      'sourceKey','starry-form',
      'target','feature',
      'key','subclass:druid:stars:starry-form-l10',
      'payload',jsonb_build_object(
        'label','Звёздная форма · усиление',
        'description','С 10 уровня Лучник наносит 2к8 + модификатор Мудрости излучающего урона вместо 1к8 + Мудрость. Чаша лечит на 2к8 + Мудрость вместо 1к8 + Мудрость. Дракон получает скорость полёта 20 футов и зависание. В начале своего хода друид переключает текущее созвездие без нового расхода Дикой формы.',
        'mechanic',jsonb_build_object('archerDamage','2d8+wisdom','chaliceHealing','2d8+wisdom','dragonFlyFeet',20,'dragonHover',true,'switchMode','start_of_turn')
      )
    )
  );

  with subclass_mechanics as (
    select t.catalog_key,1 as level,e.item
    from public.rule_templates t
    cross join lateral jsonb_array_elements(coalesce(t.mechanics,'[]'::jsonb)) e(item)
    where t.campaign_id=p_campaign_id and t.kind='subclass' and t.is_active
    union all
    select t.catalog_key,l.level,e.item
    from public.rule_templates t
    join public.rule_template_levels l on l.template_id=t.id
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) e(item)
    where t.campaign_id=p_campaign_id and t.kind='subclass' and t.is_active
  ), grouped as (
    select catalog_key,level,coalesce(nullif(item->>'sourceKey',''),item->>'id') source_key,
           bool_or(item->>'type'='action') has_action,
           bool_or(
             item->>'type'='grant'
             and item->>'target'='feature'
             and length(trim(coalesce(item->'payload'->>'description','')))>=45
           ) has_explanation
    from subclass_mechanics
    group by catalog_key,level,coalesce(nullif(item->>'sourceKey',''),item->>'id')
  )
  select count(*) into v_bad_count
  from grouped
  where has_action and not has_explanation;

  if v_bad_count>0 then
    raise exception 'Subclass catalog has % action groups without rules explanations',v_bad_count;
  end if;
end;
$$;

create or replace function private.enforce_subclass_reference_quality_after_campaign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.apply_subclass_reference_quality(new.id);
  perform private.apply_subclass_action_explanation_quality(new.id);
  return new;
end;
$$;

do $$
declare r record;
begin
  for r in select id from public.campaigns loop
    perform private.apply_subclass_action_explanation_quality(r.id);
  end loop;
end;
$$;

commit;
