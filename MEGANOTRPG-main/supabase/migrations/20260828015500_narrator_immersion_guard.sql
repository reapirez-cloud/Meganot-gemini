begin;

create or replace function private.normalize_builtin_narrator_copy(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_moon uuid;
begin
  select id into v_moon
  from public.rule_templates
  where campaign_id = p_campaign_id
    and catalog_key = 'subclass:druid:moon'
    and is_active
  order by version desc
  limit 1;

  if v_moon is null then return; end if;

  update public.rule_templates
  set
    description = 'Круг боевых превращений, лунной магии и усиленной звериной формы.',
    mechanical_summary = 'Усиленная звериная форма, круговые заклинания в облике зверя, Лунный шаг и Лунная форма.',
    source_label = 'Player''s Handbook',
    author_description = 'Лунные друиды не делят бой на магию и звериный облик. Они входят в схватку в шкуре хищника, удерживают форму под ударами, проводят через неё круговые чары и со временем учатся переноситься по полю боя вспышкой лунного света.',
    author_comment = 'Лунного друида легко узнать в бою: обычный маг отходит от клинка, этот становится тем, у кого клинок чаще застревает в шкуре. Если медведь держит строй и следит за флангом, относитесь к нему как к коллеге. И не тяните руки к ушам.',
    updated_at = now()
  where id = v_moon;

  update public.rule_template_levels l
  set mechanics = coalesce((
    select jsonb_agg(
      case
        when m->>'id' = 'moon-circle-forms' then
          jsonb_set(
            m,
            '{payload,description}',
            to_jsonb('Максимальный CR зверя равен уровню друида / 3. В зверином облике КД равен 13 + модификатор Мудрости, если это выше КД зверя.'::text),
            true
          )
        else m
      end
      order by ord
    )
    from jsonb_array_elements(l.mechanics) with ordinality as e(m, ord)
  ), '[]'::jsonb)
  where l.template_id = v_moon
    and l.level = 3;
end;
$$;

create or replace function private.assert_builtin_narrator_immersion(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bad text;
begin
  select t.catalog_key into v_bad
  from public.rule_templates t
  where t.campaign_id = p_campaign_id
    and t.is_active
    and (
      coalesce(t.author_description, '') ~* '(character engine|редакци|совместимост|compatib|мы использу|player.?s handbook|\bSRD\b|\bD&D\b|\b2014\b|\b2024\b)'
      or coalesce(t.author_comment, '') ~* '(character engine|редакци|совместимост|compatib|мы использу|player.?s handbook|\bSRD\b|\bD&D\b|\b2014\b|\b2024\b)'
    )
  order by t.catalog_key
  limit 1;

  if v_bad is not null then
    raise exception 'Narrator copy leaks implementation/source meta: %', v_bad;
  end if;
end;
$$;

create or replace function private.normalize_builtin_narrator_copy_after_campaign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.normalize_builtin_narrator_copy(new.id);
  perform private.assert_builtin_narrator_immersion(new.id);
  return new;
end;
$$;

drop trigger if exists zz_campaigns_normalize_builtin_narrator_copy on public.campaigns;
create trigger zz_campaigns_normalize_builtin_narrator_copy
after insert on public.campaigns
for each row execute function private.normalize_builtin_narrator_copy_after_campaign();

do $$
declare
  v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.normalize_builtin_narrator_copy(v_campaign.id);
    perform private.assert_builtin_narrator_immersion(v_campaign.id);
  end loop;
end;
$$;

commit;
