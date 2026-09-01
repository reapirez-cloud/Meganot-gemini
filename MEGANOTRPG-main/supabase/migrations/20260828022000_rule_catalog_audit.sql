begin;

create or replace function private.audit_rule_catalog(p_campaign_id uuid)
returns table(
  template_kind text,
  catalog_key text,
  template_name text,
  feature_level integer,
  source_key text,
  feature_key text,
  feature_label text,
  description text,
  text_quality text,
  ce_rule_quality text,
  runtime_types text[],
  runtime_backed boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with feature_rows as (
    select
      t.kind::text as template_kind,
      t.catalog_key,
      t.name as template_name,
      l.level as feature_level,
      coalesce(nullif(m->>'sourceKey',''), m->>'id') as source_key,
      m->>'key' as feature_key,
      coalesce(m->'payload'->>'label', m->>'label', m->>'key') as feature_label,
      coalesce(m->'payload'->>'description','') as description,
      m->'payload'->'mechanic' as mechanic
    from public.rule_templates t
    join public.rule_template_levels l on l.template_id = t.id
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m
    where t.campaign_id = p_campaign_id
      and t.is_active
      and t.kind in ('class','subclass')
      and m->>'type' = 'grant'
      and m->>'target' = 'feature'
  ), runtime_rows as (
    select
      t.kind::text as template_kind,
      t.catalog_key,
      l.level as feature_level,
      coalesce(nullif(m->>'sourceKey',''), m->>'id') as source_key,
      array_agg(distinct m->>'type' order by m->>'type') filter (
        where not (m->>'type'='grant' and m->>'target'='feature')
      ) as runtime_types
    from public.rule_templates t
    join public.rule_template_levels l on l.template_id = t.id
    cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m
    where t.campaign_id = p_campaign_id
      and t.is_active
      and t.kind in ('class','subclass')
    group by t.kind,t.catalog_key,l.level,coalesce(nullif(m->>'sourceKey',''),m->>'id')
  )
  select
    f.template_kind,
    f.catalog_key,
    f.template_name,
    f.feature_level,
    f.source_key,
    f.feature_key,
    f.feature_label,
    f.description,
    case
      when btrim(f.description) = '' then 'missing'
      when lower(f.description) like '%расширяет возможности%'
        or lower(f.description) like '%развивает направление%'
        or lower(f.description) like '%усиленное лечение%самоисцеление%максимальн%'
        then 'boilerplate'
      else 'specific'
    end as text_quality,
    case
      when jsonb_typeof(f.mechanic) = 'object'
        and nullif(btrim(f.mechanic->>'kind'),'') is not null then 'structured'
      when jsonb_typeof(f.mechanic) = 'object'
        and f.mechanic <> '{}'::jsonb then 'summary'
      else 'missing'
    end as ce_rule_quality,
    coalesce(r.runtime_types,'{}'::text[]) as runtime_types,
    coalesce(cardinality(r.runtime_types),0) > 0 as runtime_backed
  from feature_rows f
  left join runtime_rows r
    on r.template_kind=f.template_kind
   and r.catalog_key=f.catalog_key
   and r.feature_level=f.feature_level
   and r.source_key=f.source_key
  order by f.template_kind,f.catalog_key,f.feature_level,f.feature_label;
$$;

commit;
