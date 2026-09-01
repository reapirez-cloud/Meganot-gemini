begin;

-- CLASS_INTEGRATION_STRICT: class:cleric
-- CLASS_INTEGRATION_STRICT: subclass:cleric:life-domain
-- CLASS_PACKAGE_TEST: tests/classTextNarrationAudit.test.ts
-- Presentation-only continuation of the class text audit. No structured mechanics are changed.

create or replace function private.apply_cleric_subclass_text_voss_audit(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cleric uuid;
begin
  select id into v_cleric
  from public.rule_templates
  where campaign_id=p_campaign_id
    and is_active
    and catalog_key='class:cleric'
  order by version desc
  limit 1;

  if v_cleric is not null then
    update public.rule_template_levels
    set mechanics=private.patch_feature_description_text(
      mechanics,
      'spellcasting',
      'Мудрость — заклинательная характеристика Жреца; священный символ можно использовать как заклинательную фокусировку. На 1 уровне вы знаете 3 заговора, подготавливаете 4 заклинания Жреца 1 уровня и имеете 2 ячейки 1 уровня. Дальше число заговоров, подготовленных заклинаний и ячеек берётся из таблицы Жреца. Чтобы сотворить подготовленное заклинание 1 уровня или выше, потратьте ячейку, уровень которой не ниже уровня заклинания. Все потраченные ячейки возвращаются после долгого отдыха. После каждого долгого отдыха можно заменить любое число подготовленных заклинаний другими заклинаниями Жреца тех уровней, для которых у вас есть ячейки.'
    )
    where template_id=v_cleric and level=1;
  end if;

  update public.rule_templates t
  set mechanics=private.audit_feature_mechanics_text(t.mechanics),
      choices=private.audit_feature_choices_text(t.choices),
      rules_meta=coalesce(t.rules_meta,'{}'::jsonb)||jsonb_build_object(
        'feature_author_comments',true,
        'feature_author','Рейнар Восс',
        'feature_author_voice',jsonb_build_array('циничный','саркастичный','чёрный юмор'),
        'feature_author_clarity_first',true
      ),
      updated_at=now()
  where t.campaign_id=p_campaign_id
    and t.is_active
    and t.catalog_key like 'subclass:cleric:%';

  update public.rule_template_levels l
  set mechanics=private.audit_feature_mechanics_text(l.mechanics),
      choices=private.audit_feature_choices_text(l.choices)
  where exists(
    select 1
    from public.rule_templates t
    where t.id=l.template_id
      and t.campaign_id=p_campaign_id
      and t.is_active
      and t.catalog_key like 'subclass:cleric:%'
  );
end;
$$;

create or replace function private.apply_cleric_subclass_text_voss_audit_after_campaign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.apply_cleric_subclass_text_voss_audit(new.id);
  return new;
end;
$$;

drop trigger if exists zzzzzzzzzz_campaigns_cleric_subclass_text_voss_audit on public.campaigns;
create trigger zzzzzzzzzz_campaigns_cleric_subclass_text_voss_audit
after insert on public.campaigns
for each row execute function private.apply_cleric_subclass_text_voss_audit_after_campaign();

do $$
declare r record;
begin
  for r in select id from public.campaigns loop
    perform private.apply_cleric_subclass_text_voss_audit(r.id);
  end loop;
end $$;

commit;
