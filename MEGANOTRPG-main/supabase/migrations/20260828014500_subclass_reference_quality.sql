begin;

create or replace function private.rewrite_subclass_feature_description(
  p_campaign_id uuid,
  p_catalog_key text,
  p_level integer,
  p_source_key text,
  p_description text
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.rule_template_levels l
  set mechanics = (
    select coalesce(jsonb_agg(
      case
        when e.item->>'type'='grant'
         and e.item->>'target'='feature'
         and e.item->>'sourceKey'=p_source_key
        then jsonb_set(e.item,'{payload,description}',to_jsonb(p_description),true)
        else e.item
      end
      order by e.ord
    ),'[]'::jsonb)
    from jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) with ordinality as e(item,ord)
  )
  from public.rule_templates t
  where t.id=l.template_id
    and t.campaign_id=p_campaign_id
    and t.kind='subclass'
    and t.catalog_key=p_catalog_key
    and l.level=p_level;
$$;

create or replace function private.apply_subclass_reference_quality(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bad_count integer;
begin
  -- Replace permission-style wording with deterministic rules text.
  perform private.rewrite_subclass_feature_description(
    p_campaign_id,
    'subclass:druid:moon',
    6,
    'improved-circle-forms',
    'При попадании атакой звериной формы выбирается тип урона: исходный тип атаки или излучающий. Пока друид находится в Дикой форме, к каждому спасброску Телосложения добавляется модификатор Мудрости.'
  );

  perform private.rewrite_subclass_feature_description(
    p_campaign_id,
    'subclass:druid:moon',
    10,
    'moonlight-step',
    'Бонусным действием друид телепортируется на 30 футов; следующая атака до конца этого хода совершается с преимуществом. Запас использований равен модификатору Мудрости, минимум 1, и полностью возвращается после долгого отдыха. Чтобы вернуть 1 использование раньше, потрать 1 ячейку заклинаний 2 уровня или выше.'
  );

  perform private.rewrite_subclass_feature_description(
    p_campaign_id,
    'subclass:druid:moon',
    14,
    'lunar-form',
    'Один раз за ход попадание атакой звериной формы наносит дополнительно 2к10 излучающего урона. При Лунном шаге друид также переносит одного согласного союзника в пределах 10 футов от точки отправления; союзник появляется в пределах 10 футов от точки назначения.'
  );

  -- Mechanical summaries are navigation copy, but still must explain a concrete play identity.
  select count(*) into v_bad_count
  from public.rule_templates t
  where t.campaign_id=p_campaign_id
    and t.kind='subclass'
    and t.is_active
    and (
      length(trim(coalesce(t.mechanical_summary,''))) < 45
      or lower(coalesce(t.mechanical_summary,'')) ~ '(а вдруг|при необходимости|по ситуации|в некоторых случаях|особым образом|расширяет возможности|усиливает возможности)'
    );
  if v_bad_count>0 then
    raise exception 'Subclass catalog has % unclear mechanical summaries',v_bad_count;
  end if;

  -- Every subclass feature shown in the reference must contain a real rules explanation.
  with subclass_features as (
    select t.catalog_key,1 as level,e.item->'payload'->>'description' as description
    from public.rule_templates t
    cross join lateral jsonb_array_elements(coalesce(t.mechanics,'[]'::jsonb)) e(item)
    where t.campaign_id=p_campaign_id and t.kind='subclass' and t.is_active
      and e.item->>'type'='grant' and e.item->>'target'='feature'
    union all
    select t.catalog_key,l.level,e.item->'payload'->>'description' as description
    from public.rule_templates t
    join public.rule_template_levels l on l.template_id=t.id
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) e(item)
    where t.campaign_id=p_campaign_id and t.kind='subclass' and t.is_active
      and e.item->>'type'='grant' and e.item->>'target'='feature'
  )
  select count(*) into v_bad_count
  from subclass_features f
  where length(trim(coalesce(f.description,''))) < 45
     or lower(coalesce(f.description,'')) ~ '(а вдруг|при необходимости|по ситуации|в некоторых случаях|особым образом|расширяет возможности|усиливает возможности)'
     or (' '||lower(coalesce(f.description,''))||' ') like any(array[
       '% может %','% могут %','% иногда %','% обычно %','% примерно %'
     ]);

  if v_bad_count>0 then
    raise exception 'Subclass catalog has % vague or incomplete feature explanations',v_bad_count;
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
  return new;
end;
$$;

drop trigger if exists zz_campaigns_enforce_subclass_reference_quality on public.campaigns;
create trigger zz_campaigns_enforce_subclass_reference_quality
after insert on public.campaigns
for each row execute function private.enforce_subclass_reference_quality_after_campaign();

do $$
declare r record;
begin
  for r in select id from public.campaigns loop
    perform private.apply_subclass_reference_quality(r.id);
  end loop;
end;
$$;

commit;
