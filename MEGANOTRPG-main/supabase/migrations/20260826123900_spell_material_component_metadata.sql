alter table public.spell_catalog
  add column if not exists material_cost_gp numeric(12,2),
  add column if not exists material_consumed boolean not null default false;

comment on column public.spell_catalog.material_cost_gp is
  'Minimum listed gold-piece value attached to the material requirement; exact mixed-component requirements remain in material text.';
comment on column public.spell_catalog.material_consumed is
  'True when at least one listed material component is consumed by the spell.';

update public.spell_catalog
set material_consumed = true
where material is not null
  and lower(material) ~ '(расход|consum)';

update public.spell_catalog
set material_cost_gp = replace((regexp_match(lower(material), '([0-9]+(?:[.,][0-9]+)?)\+?\s*(?:зм|gp)'))[1], ',', '.')::numeric
where material is not null
  and material_cost_gp is null
  and lower(material) ~ '([0-9]+(?:[.,][0-9]+)?)\+?\s*(?:зм|gp)';
