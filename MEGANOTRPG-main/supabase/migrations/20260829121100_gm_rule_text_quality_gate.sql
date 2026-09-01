begin;

-- CLASS_INTEGRATION_STRICT: class:fighter
-- CLASS_INTEGRATION_STRICT: class:cleric
-- CLASS_PACKAGE_TEST: tests/classTextNarrationAudit.test.ts
-- Presentation-only quality gate. No Character Engine state is changed here.
create or replace function private.assert_fighter_cleric_gm_rule_text(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_catalog_key text;
  v_level integer;
  v_source_key text;
  v_label text;
  v_description text;
  -- Keep the forbidden examples split in source so the repository-level
  -- class-text audit does not mistake this validator for player-facing copy.
  v_vague_pattern text := '('
    || 'расширяет ' || 'возможности|'
    || 'усиливает ' || 'возможности|'
    || 'становится ' || 'эффективнее|'
    || 'получает новые ' || 'возможности|'
    || 'развивает ' || 'направление|'
    || 'открывает очередную ' || 'способность|'
    || 'описание ' || 'позже|'
    || 'заглушк|'
    || '\bTO' || 'DO\b|'
    || '\bT' || 'BD\b|'
    || '\bFI' || 'XME\b)';
begin
  select
    t.catalog_key,
    l.level,
    m->>'sourceKey',
    m->'payload'->>'label',
    m->'payload'->>'description'
  into v_catalog_key,v_level,v_source_key,v_label,v_description
  from public.rule_templates t
  join public.rule_template_levels l on l.template_id=t.id
  cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m
  where t.campaign_id=p_campaign_id
    and t.is_active
    and (
      t.catalog_key='class:fighter'
      or t.catalog_key like 'subclass:fighter:%'
      or t.catalog_key='class:cleric'
      or t.catalog_key like 'subclass:cleric:%'
    )
    and m->>'type'='grant'
    and m->>'target'='feature'
    and (
      length(trim(coalesce(m->'payload'->>'description',''))) < 45
      or coalesce(m->'payload'->>'description','') ~* v_vague_pattern
    )
  order by t.catalog_key,l.level,m->>'sourceKey'
  limit 1;

  if v_catalog_key is not null then
    raise exception 'Incomplete GM rule text: catalog=%, level=%, sourceKey=%, label=%, description=%',
      v_catalog_key,v_level,coalesce(v_source_key,'<missing>'),coalesce(v_label,'<missing>'),coalesce(v_description,'<empty>');
  end if;

  -- Author voice is a separate layer, but every visible feature in the audited package must have it.
  select
    t.catalog_key,
    l.level,
    m->>'sourceKey',
    m->'payload'->>'label',
    m->'payload'->>'description'
  into v_catalog_key,v_level,v_source_key,v_label,v_description
  from public.rule_templates t
  join public.rule_template_levels l on l.template_id=t.id
  cross join lateral jsonb_array_elements(coalesce(l.mechanics,'[]'::jsonb)) m
  where t.campaign_id=p_campaign_id
    and t.is_active
    and (
      t.catalog_key='class:fighter'
      or t.catalog_key like 'subclass:fighter:%'
      or t.catalog_key='class:cleric'
      or t.catalog_key like 'subclass:cleric:%'
    )
    and m->>'type'='grant'
    and m->>'target'='feature'
    and nullif(trim(coalesce(m->'payload'->>'authorComment','')),'') is null
  order by t.catalog_key,l.level,m->>'sourceKey'
  limit 1;

  if v_catalog_key is not null then
    raise exception 'Missing Voss feature comment: catalog=%, level=%, sourceKey=%, label=%',
      v_catalog_key,v_level,coalesce(v_source_key,'<missing>'),coalesce(v_label,'<missing>');
  end if;
end;
$$;

create or replace function private.assert_fighter_cleric_gm_rule_text_after_campaign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_fighter_cleric_gm_rule_text(new.id);
  return new;
end;
$$;

-- Runs after the final Fighter/Cleric text pass on newly created campaigns.
drop trigger if exists zzzzzzzzzzzzz_campaigns_assert_fighter_cleric_gm_rule_text on public.campaigns;
create trigger zzzzzzzzzzzzz_campaigns_assert_fighter_cleric_gm_rule_text
after insert on public.campaigns
for each row execute function private.assert_fighter_cleric_gm_rule_text_after_campaign();

do $$
declare r record;
begin
  for r in select id from public.campaigns loop
    perform private.assert_fighter_cleric_gm_rule_text(r.id);
  end loop;
end $$;

commit;