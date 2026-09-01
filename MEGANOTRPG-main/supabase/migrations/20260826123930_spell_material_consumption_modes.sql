alter table public.spell_catalog
  add column if not exists material_consumption text not null default 'none';

alter table public.spell_catalog
  drop constraint if exists spell_catalog_material_consumption_check;

alter table public.spell_catalog
  add constraint spell_catalog_material_consumption_check
  check (material_consumption in ('none','always','optional','mixed'));

comment on column public.spell_catalog.material_consumption is
  'How material components are consumed: none, always, optional for a special use, or mixed when only part of a multi-component requirement is consumed.';

update public.spell_catalog
set material_consumption = case when material_consumed then 'always' else 'none' end;

update public.spell_catalog
set material_consumption = 'optional', material_consumed = true
where source_kind='official' and slug in ('summon-lesser-demons','summon-greater-demon');

update public.spell_catalog
set material_consumption = 'mixed', material_consumed = true
where source_kind='official' and slug in ('create-homunculus','create-magen');
