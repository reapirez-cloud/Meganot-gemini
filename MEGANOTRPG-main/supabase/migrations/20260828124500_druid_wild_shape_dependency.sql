begin;

-- Wild Shape has two independent dependencies:
-- 1) maximum beast CR;
-- 2) movement access (swim/fly).
-- Circle of the Moon replaces only the CR identity. Base movement progression
-- remains active, so subclass scaling cannot accidentally erase other limits.
create or replace function private.normalize_druid_wild_shape_dependencies(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_druid uuid;
  v_moon uuid;
begin
  select id into v_druid
  from public.rule_templates
  where campaign_id = p_campaign_id
    and kind = 'class'
    and catalog_key = 'class:druid'
    and is_active
  order by version desc
  limit 1;

  select id into v_moon
  from public.rule_templates
  where campaign_id = p_campaign_id
    and kind = 'subclass'
    and catalog_key = 'subclass:druid:moon'
    and is_active
  order by version desc
  limit 1;

  if v_druid is null or v_moon is null then
    return;
  end if;

  -- Replace the old combined tier cards with two stable CE identities. Later
  -- base levels REPLACE earlier base values; a subclass can therefore replace
  -- max CR without also replacing movement permissions.
  update public.rule_template_levels l
  set mechanics = (
    select coalesce(jsonb_agg(m order by ord), '[]'::jsonb)
    from jsonb_array_elements(coalesce(l.mechanics, '[]'::jsonb)) with ordinality as x(m, ord)
    where m->>'id' not in ('druid-wild-shape-tier-2', 'druid-wild-shape-tier-4', 'druid-wild-shape-tier-8')
  ) || case l.level
    when 2 then jsonb_build_array(
      jsonb_build_object(
        'id','druid-wild-shape-max-cr-l2',
        'type','grant',
        'sourceKey','wild-shape',
        'target','trait',
        'key','class:druid:wild-shape:max-cr',
        'grantOperation','REPLACE',
        'priority',2,
        'payload',jsonb_build_object(
          'label','Предел Дикой формы',
          'description','Максимальный CR зверя: 1/4.',
          'mechanic',jsonb_build_object('kind','wild_shape_max_cr','version',1,'value','1/4')
        )
      ),
      jsonb_build_object(
        'id','druid-wild-shape-movement-l2',
        'type','grant',
        'sourceKey','wild-shape',
        'target','trait',
        'key','class:druid:wild-shape:movement',
        'grantOperation','REPLACE',
        'priority',2,
        'payload',jsonb_build_object(
          'label','Передвижение Дикой формы',
          'description','Форма не может иметь скорость плавания или полёта.',
          'mechanic',jsonb_build_object('kind','wild_shape_movement','version',1,'swim',false,'fly',false)
        )
      )
    )
    when 4 then jsonb_build_array(
      jsonb_build_object(
        'id','druid-wild-shape-max-cr-l4',
        'type','grant',
        'sourceKey','wild-shape',
        'target','trait',
        'key','class:druid:wild-shape:max-cr',
        'grantOperation','REPLACE',
        'priority',4,
        'payload',jsonb_build_object(
          'label','Предел Дикой формы',
          'description','Максимальный CR зверя: 1/2.',
          'mechanic',jsonb_build_object('kind','wild_shape_max_cr','version',1,'value','1/2')
        )
      ),
      jsonb_build_object(
        'id','druid-wild-shape-movement-l4',
        'type','grant',
        'sourceKey','wild-shape',
        'target','trait',
        'key','class:druid:wild-shape:movement',
        'grantOperation','REPLACE',
        'priority',4,
        'payload',jsonb_build_object(
          'label','Передвижение Дикой формы',
          'description','Скорость плавания разрешена; скорость полёта ещё недоступна.',
          'mechanic',jsonb_build_object('kind','wild_shape_movement','version',1,'swim',true,'fly',false)
        )
      )
    )
    when 8 then jsonb_build_array(
      jsonb_build_object(
        'id','druid-wild-shape-max-cr-l8',
        'type','grant',
        'sourceKey','wild-shape',
        'target','trait',
        'key','class:druid:wild-shape:max-cr',
        'grantOperation','REPLACE',
        'priority',8,
        'payload',jsonb_build_object(
          'label','Предел Дикой формы',
          'description','Максимальный CR зверя: 1.',
          'mechanic',jsonb_build_object('kind','wild_shape_max_cr','version',1,'value','1')
        )
      ),
      jsonb_build_object(
        'id','druid-wild-shape-movement-l8',
        'type','grant',
        'sourceKey','wild-shape',
        'target','trait',
        'key','class:druid:wild-shape:movement',
        'grantOperation','REPLACE',
        'priority',8,
        'payload',jsonb_build_object(
          'label','Передвижение Дикой формы',
          'description','Скорости плавания и полёта разрешены.',
          'mechanic',jsonb_build_object('kind','wild_shape_movement','version',1,'swim',true,'fly',true)
        )
      )
    )
    else '[]'::jsonb
  end
  where l.template_id = v_druid
    and l.level in (2,4,8);

  -- Circle Forms remains a normal subclass feature, while this sibling mechanic
  -- replaces only the shared max-CR identity. Priority 100 intentionally stays
  -- above every base Druid tier so later class levels cannot overwrite the circle.
  update public.rule_template_levels l
  set mechanics = (
    select coalesce(jsonb_agg(m order by ord), '[]'::jsonb)
    from jsonb_array_elements(coalesce(l.mechanics, '[]'::jsonb)) with ordinality as x(m, ord)
    where m->>'id' <> 'moon-circle-forms-max-cr'
  ) || jsonb_build_array(
    jsonb_build_object(
      'id','moon-circle-forms-max-cr',
      'type','grant',
      'sourceKey','circle-forms',
      'target','trait',
      'key','class:druid:wild-shape:max-cr',
      'grantOperation','REPLACE',
      'priority',100,
      'payload',jsonb_build_object(
        'label','Предел Дикой формы · Круг Луны',
        'description','Максимальный CR зверя равен уровню друида / 3 с округлением вниз. Например, на 4 уровне друида это CR 1.',
        'mechanic',jsonb_build_object(
          'kind','wild_shape_max_cr',
          'version',1,
          'formula',jsonb_build_object('source','class_level','operation','floor_divide','divisor',3)
        )
      )
    )
  )
  where l.template_id = v_moon
    and l.level = 3;
end;
$$;

create or replace function private.normalize_druid_wild_shape_dependencies_after_campaign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.normalize_druid_wild_shape_dependencies(new.id);
  return new;
end;
$$;

drop trigger if exists zzz_campaigns_normalize_druid_wild_shape_dependencies on public.campaigns;
create trigger zzz_campaigns_normalize_druid_wild_shape_dependencies
after insert on public.campaigns
for each row execute function private.normalize_druid_wild_shape_dependencies_after_campaign();

do $$
declare
  v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.normalize_druid_wild_shape_dependencies(v_campaign.id);
  end loop;
end;
$$;

commit;
