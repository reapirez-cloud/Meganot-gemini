-- CLASS_REFERENCE_NUANCES_REMOVED
-- Presentation-only cleanup for class and subclass templates.
-- Spells and the spell catalog are intentionally outside this migration.

begin;

create or replace function private.strip_class_reference_nuances(p_mechanics jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when p_mechanics is null then null
    when jsonb_typeof(p_mechanics) <> 'array' then p_mechanics
    else coalesce((
      select jsonb_agg(
        ((m #- '{payload,authorNuances}') #- '{presentation,authorNuances}')
        order by ord
      )
      from jsonb_array_elements(p_mechanics) with ordinality as q(m, ord)
    ), '[]'::jsonb)
  end
$$;

update public.rule_templates
set mechanics = private.strip_class_reference_nuances(mechanics),
    rules_meta = coalesce(rules_meta, '{}'::jsonb) - 'authorNuances' - 'nuances'
where kind in ('class', 'subclass');

update public.rule_template_levels l
set mechanics = private.strip_class_reference_nuances(l.mechanics)
from public.rule_templates t
where t.id = l.template_id
  and t.kind in ('class', 'subclass');

drop function private.strip_class_reference_nuances(jsonb);

commit;
