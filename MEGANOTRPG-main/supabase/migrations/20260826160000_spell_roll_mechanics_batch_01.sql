alter table public.spell_catalog
  add column if not exists roll_mode text not null default 'unclassified',
  add column if not exists roll_recipe jsonb;

alter table public.spell_catalog
  drop constraint if exists spell_catalog_roll_mode_check;
alter table public.spell_catalog
  add constraint spell_catalog_roll_mode_check
  check (roll_mode in ('unclassified', 'link', 'roll'));

alter table public.spell_catalog
  drop constraint if exists spell_catalog_roll_recipe_consistency_check;
alter table public.spell_catalog
  add constraint spell_catalog_roll_recipe_consistency_check
  check (
    (roll_mode in ('unclassified', 'link') and roll_recipe is null)
    or
    (
      roll_mode = 'roll'
      and jsonb_typeof(roll_recipe) = 'object'
      and jsonb_typeof(roll_recipe -> 'sequences') = 'array'
      and jsonb_array_length(roll_recipe -> 'sequences') > 0
    )
  );

comment on column public.spell_catalog.roll_mode is
  'Internal Roll Engine classification. Not presentation text: unclassified, link, or roll.';
comment on column public.spell_catalog.roll_recipe is
  'Internal Roll Engine mechanics only. Visible spell description must not render this JSON.';

update public.spell_catalog
set roll_mode = 'link', roll_recipe = null, updated_at = now()
where slug in ('detect-magic', 'guidance');

update public.spell_catalog
set roll_mode = 'roll',
    roll_recipe = case slug
      when 'fire-bolt' then '{"sequences":[{"key":"bolt","resolution":{"kind":"attack","bonus":{"kind":"reference","key":"attack_bonus"},"target":"armor_class"},"effects":[{"key":"fire","kind":"damage","damageType":"fire","dice":{"count":1,"sides":10},"scaling":[{"kind":"steps","reference":{"source":"character_level"},"steps":[{"atLeast":1,"adjustment":{"diceCount":1}},{"atLeast":5,"adjustment":{"diceCount":2}},{"atLeast":11,"adjustment":{"diceCount":3}},{"atLeast":17,"adjustment":{"diceCount":4}}]}]}]}]}'::jsonb
      when 'eldritch-blast' then '{"sequences":[{"key":"beam","instances":1,"instanceScaling":[{"kind":"steps","reference":{"source":"character_level"},"steps":[{"atLeast":1,"adjustment":{"instances":1}},{"atLeast":5,"adjustment":{"instances":2}},{"atLeast":11,"adjustment":{"instances":3}},{"atLeast":17,"adjustment":{"instances":4}}]}],"resolution":{"kind":"attack","bonus":{"kind":"reference","key":"attack_bonus"},"target":"armor_class"},"effects":[{"key":"force","kind":"damage","damageType":"force","dice":{"count":1,"sides":10}}]}]}'::jsonb
      when 'sacred-flame' then '{"sequences":[{"key":"flame","resolution":{"kind":"save","ability":"dexterity","dc":{"kind":"reference","key":"save_dc"},"onSuccess":"none"},"effects":[{"key":"radiant","kind":"damage","damageType":"radiant","dice":{"count":1,"sides":8},"scaling":[{"kind":"steps","reference":{"source":"character_level"},"steps":[{"atLeast":1,"adjustment":{"diceCount":1}},{"atLeast":5,"adjustment":{"diceCount":2}},{"atLeast":11,"adjustment":{"diceCount":3}},{"atLeast":17,"adjustment":{"diceCount":4}}]}]}]}]}'::jsonb
      when 'cure-wounds' then '{"sequences":[{"key":"healing","resolution":{"kind":"none"},"effects":[{"key":"healing","kind":"healing","dice":{"count":2,"sides":8},"modifier":{"kind":"reference","key":"casting_ability_modifier"},"scaling":[{"kind":"per_level","reference":{"source":"cast_level"},"above":1,"diceCountPerLevel":2}]}]}]}'::jsonb
      when 'healing-word' then '{"sequences":[{"key":"healing","resolution":{"kind":"none"},"effects":[{"key":"healing","kind":"healing","dice":{"count":2,"sides":4},"modifier":{"kind":"reference","key":"casting_ability_modifier"},"scaling":[{"kind":"per_level","reference":{"source":"cast_level"},"above":1,"diceCountPerLevel":2}]}]}]}'::jsonb
      when 'guiding-bolt' then '{"sequences":[{"key":"bolt","resolution":{"kind":"attack","bonus":{"kind":"reference","key":"attack_bonus"},"target":"armor_class"},"effects":[{"key":"radiant","kind":"damage","damageType":"radiant","dice":{"count":4,"sides":6},"scaling":[{"kind":"per_level","reference":{"source":"cast_level"},"above":1,"diceCountPerLevel":1}]}]}]}'::jsonb
      when 'inflict-wounds' then '{"sequences":[{"key":"wounds","resolution":{"kind":"save","ability":"constitution","dc":{"kind":"reference","key":"save_dc"},"onSuccess":"half"},"effects":[{"key":"necrotic","kind":"damage","damageType":"necrotic","dice":{"count":2,"sides":10},"scaling":[{"kind":"per_level","reference":{"source":"cast_level"},"above":1,"diceCountPerLevel":1}]}]}]}'::jsonb
      when 'magic-missile' then '{"sequences":[{"key":"dart","instances":3,"instanceScaling":[{"kind":"per_level","reference":{"source":"cast_level"},"above":1,"instancesPerLevel":1}],"resolution":{"kind":"automatic"},"effects":[{"key":"force","kind":"damage","damageType":"force","dice":{"count":1,"sides":4},"modifier":{"kind":"literal","value":1}}]}]}'::jsonb
      when 'scorching-ray' then '{"sequences":[{"key":"ray","instances":3,"instanceScaling":[{"kind":"per_level","reference":{"source":"cast_level"},"above":2,"instancesPerLevel":1}],"resolution":{"kind":"attack","bonus":{"kind":"reference","key":"attack_bonus"},"target":"armor_class"},"effects":[{"key":"fire","kind":"damage","damageType":"fire","dice":{"count":2,"sides":6}}]}]}'::jsonb
      when 'fireball' then '{"sequences":[{"key":"blast","resolution":{"kind":"save","ability":"dexterity","dc":{"kind":"reference","key":"save_dc"},"onSuccess":"half"},"effects":[{"key":"fire","kind":"damage","damageType":"fire","dice":{"count":8,"sides":6},"scaling":[{"kind":"per_level","reference":{"source":"cast_level"},"above":3,"diceCountPerLevel":1}]}]}]}'::jsonb
      else roll_recipe
    end,
    updated_at = now()
where slug in (
  'fire-bolt', 'eldritch-blast', 'sacred-flame', 'cure-wounds', 'healing-word',
  'guiding-bolt', 'inflict-wounds', 'magic-missile', 'scorching-ray', 'fireball'
);
