-- CLASS_MIGRATION_SCOPE: infrastructure
begin;

-- Historical class/subclass catalog installers remain in migration history because
-- production has already executed them. This migration retires obsolete campaign
-- bootstrap paths that would otherwise resurrect removed builtin classes and
-- rejected presentation layers on every newly-created campaign.
--
-- Custom/non-builtin templates are deliberately out of scope. In particular the
-- historical test/easter-egg class "Жопка" must remain untouched.

create or replace function private.prune_removed_builtin_class_catalog(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assigned integer;
begin
  select count(*)
    into v_assigned
  from public.character_template_assignments assignment
  join public.rule_templates template on template.id = assignment.template_id
  left join public.rule_templates parent on parent.id = template.parent_template_id
  join public.characters character on character.id = assignment.character_id
  where character.campaign_id = p_campaign_id
    and (
      (
        template.kind = 'class'
        and template.is_builtin is true
        and template.catalog_key not in ('class:fighter', 'class:druid', 'class:cleric')
      )
      or (
        template.kind = 'subclass'
        and parent.kind = 'class'
        and parent.is_builtin is true
        and parent.catalog_key not in ('class:fighter', 'class:druid', 'class:cleric')
      )
    );

  if v_assigned > 0 then
    raise exception
      'Refusing legacy class prune: % assignment(s) still point at removed builtin classes/subclasses',
      v_assigned;
  end if;

  delete from public.rule_templates subclass
  using public.rule_templates parent
  where subclass.campaign_id = p_campaign_id
    and subclass.kind = 'subclass'
    and subclass.parent_template_id = parent.id
    and parent.campaign_id = p_campaign_id
    and parent.kind = 'class'
    and parent.is_builtin is true
    and parent.catalog_key not in ('class:fighter', 'class:druid', 'class:cleric');

  delete from public.rule_templates
  where campaign_id = p_campaign_id
    and kind = 'class'
    and is_builtin is true
    and catalog_key not in ('class:fighter', 'class:druid', 'class:cleric');

  if exists (
    select 1
    from public.rule_templates
    where campaign_id = p_campaign_id
      and kind = 'class'
      and is_builtin is true
      and catalog_key not in ('class:fighter', 'class:druid', 'class:cleric')
  ) then
    raise exception 'Legacy builtin classes remain after campaign bootstrap prune';
  end if;
end;
$$;

create or replace function private.prune_removed_builtin_class_catalog_after_campaign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.prune_removed_builtin_class_catalog(new.id);
  return new;
end;
$$;

-- These two paths duplicate work already performed by
-- campaigns_install_builtin_rule_catalog. Keeping both makes bootstrap order harder
-- to reason about and runs the obsolete full catalog more than once.
drop trigger if exists campaigns_install_official_class_catalog on public.campaigns;
drop trigger if exists campaigns_install_official_subclass_catalog on public.campaigns;

-- Both presentation layers were explicitly superseded. Historical functions stay
-- available as migration history, but must never mutate a newly-created campaign.
drop trigger if exists zzzzzzzzzzzzz_campaigns_voss_subclass_nuances on public.campaigns;
drop trigger if exists zzzzzzzzzzzzzz_campaigns_voss_spell_style_ability_explanations on public.campaigns;

-- The old combined bootstrap still creates the historical full catalog because
-- Fighter/Druid/Cleric currently depend on that bootstrap as their initial seed.
-- Prune after every other campaign trigger until the three classes get dedicated
-- clean installers. PostgreSQL fires same-event triggers in name order, hence the
-- deliberately-last name.
drop trigger if exists zzzzzzzzzzzzzzzzzzzz_campaigns_prune_removed_builtin_classes on public.campaigns;
create trigger zzzzzzzzzzzzzzzzzzzz_campaigns_prune_removed_builtin_classes
after insert on public.campaigns
for each row execute function private.prune_removed_builtin_class_catalog_after_campaign();

-- Normalize existing campaigns too. This is assignment-safe and refuses to erase
-- a legacy source if it somehow became attached to a character.
do $$
declare
  v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.prune_removed_builtin_class_catalog(v_campaign.id);
  end loop;
end
$$;

commit;
