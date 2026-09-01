-- Conservative second-pass audit of generated spell roll mechanics.
-- A spell is only auto-rollable when the cast-time result is represented honestly.

update public.spell_catalog
set roll_mode = 'link', roll_recipe = null, updated_at = now()
where slug in (
  'disguise-self', 'silent-image',
  'alter-self', 'animal-messenger', 'death-armor', 'kinetic-jaunt',
  'meld-into-stone', 'major-image',
  'dimension-door', 'faithful-hound', 'fire-shield', 'guardian-of-nature', 'hallucinatory-terrain',
  'summon-draconic-spirit',
  'programmed-illusion',
  'crown-of-stars', 'forcecage', 'project-image', 'temple-of-the-gods',
  'holy-aura'
);

update public.spell_catalog
set roll_mode = 'contextual', roll_recipe = null, updated_at = now()
where slug in (
  'hex', 'hunter-s-mark',
  'dust-devil', 'flaming-sphere', 'gust-of-wind', 'heat-metal', 'moonbeam', 'phantasmal-force', 'pyrotechnics',
  'cacophonic-shield', 'conjure-animals', 'melf-s-minute-meteors', 'stinking-cloud',
  'black-tentacles', 'control-water', 'sickening-radiance', 'spellfire-storm', 'watery-sphere',
  'control-winds', 'dispel-evil-and-good', 'dream', 'geas', 'maelstrom', 'steel-wind-strike', 'transmute-rock', 'wall-of-stone',
  'bones-of-the-earth', 'create-homunculus', 'freezing-sphere', 'heroes-feast', 'investiture-of-ice', 'investiture-of-wind', 'magic-jar',
  'teleport', 'tether-essence', 'whirlwind',
  'antipathy-sympathy', 'dark-star', 'maddening-darkness',
  'power-word-kill', 'prismatic-wall', 'ravenous-void'
);

update public.spell_catalog
set roll_mode = 'roll',
    roll_recipe = '{"sequences":[{"key":"temporary_hp","resolution":{"kind":"none"},"effects":[{"key":"temporary_hp","kind":"roll","label":"temporary_hp","dice":{"count":2,"sides":4},"modifier":{"kind":"literal","value":4},"scaling":[{"kind":"per_level","reference":{"source":"cast_level"},"above":1,"modifierPerLevel":5}]}]}]}'::jsonb,
    updated_at = now()
where slug = 'false-life';

update public.spell_catalog
set roll_mode = 'roll',
    roll_recipe = '{"sequences":[{"key":"healing","resolution":{"kind":"none"},"effects":[{"key":"healing","kind":"healing","dice":{"count":2,"sides":4},"modifier":{"kind":"reference","key":"casting_ability_modifier"},"scaling":[{"kind":"per_level","reference":{"source":"cast_level"},"above":3,"diceCountPerLevel":1}]}]}]}'::jsonb,
    updated_at = now()
where slug = 'mass-healing-word';

update public.spell_catalog
set roll_mode = 'roll',
    roll_recipe = '{"sequences":[{"key":"healing","resolution":{"kind":"none"},"effects":[{"key":"healing","kind":"healing","dice":{"count":5,"sides":8},"modifier":{"kind":"reference","key":"casting_ability_modifier"},"scaling":[{"kind":"per_level","reference":{"source":"cast_level"},"above":5,"diceCountPerLevel":1}]}]}]}'::jsonb,
    updated_at = now()
where slug = 'mass-cure-wounds';

update public.spell_catalog
set roll_mode = 'roll',
    roll_recipe = '{"sequences":[{"key":"contact","resolution":{"kind":"save","ability":"intelligence","dc":{"kind":"literal","value":15},"onSuccess":"none"},"effects":[]}]}'::jsonb,
    updated_at = now()
where slug = 'contact-other-plane';

do $$
begin
  if exists (select 1 from public.spell_catalog where roll_mode = 'unclassified') then
    raise exception 'spell roll catalog audit reintroduced unclassified spells';
  end if;
end
$$;
