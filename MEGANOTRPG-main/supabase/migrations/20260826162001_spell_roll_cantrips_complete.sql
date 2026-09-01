alter table public.spell_catalog
  drop constraint if exists spell_catalog_roll_mode_check;
alter table public.spell_catalog
  add constraint spell_catalog_roll_mode_check
  check (roll_mode in ('unclassified', 'link', 'roll', 'contextual'));

alter table public.spell_catalog
  drop constraint if exists spell_catalog_roll_recipe_consistency_check;
alter table public.spell_catalog
  add constraint spell_catalog_roll_recipe_consistency_check
  check (
    (roll_mode in ('unclassified', 'link', 'contextual') and roll_recipe is null)
    or
    (
      roll_mode = 'roll'
      and jsonb_typeof(roll_recipe) = 'object'
      and jsonb_typeof(roll_recipe -> 'sequences') = 'array'
      and jsonb_array_length(roll_recipe -> 'sequences') > 0
    )
  );

comment on column public.spell_catalog.roll_mode is
  'Internal Roll Engine classification. Not presentation text: unclassified, link, roll, or contextual.';

update public.spell_catalog
set roll_mode = 'link', roll_recipe = null, updated_at = now()
where spell_level = 0 and slug in (
  'dancing-lights','druidcraft','elementalism','light','mage-hand','mending','message',
  'minor-illusion','prestidigitation','resistance','shillelagh','spare-the-dying',
  'thaumaturgy','control-flames','encode-thoughts','magic-stone','mold-earth','shape-water'
);

update public.spell_catalog
set roll_mode = 'contextual', roll_recipe = null, updated_at = now()
where spell_level = 0 and slug in (
  'produce-flame','gust','sorcerous-burst','toll-the-dead','true-strike',
  'booming-blade','green-flame-blade'
);

with mechanics(slug, sequence_key, resolution_kind, save_ability, die_sides, damage_type) as (
  values
    ('acid-splash','splash','save','dexterity',6,'acid'),
    ('chill-touch','touch','attack',null,10,'necrotic'),
    ('poison-spray','spray','attack',null,12,'poison'),
    ('ray-of-frost','ray','attack',null,8,'cold'),
    ('shocking-grasp','grasp','attack',null,8,'lightning'),
    ('starry-wisp','wisp','attack',null,8,'radiant'),
    ('vicious-mockery','mockery','save','wisdom',6,'psychic'),
    ('frostbite','frostbite','save','constitution',6,'cold'),
    ('infestation','infestation','save','constitution',6,'poison'),
    ('lightning-lure','lure','save','strength',8,'lightning'),
    ('mind-sliver','sliver','save','intelligence',6,'psychic'),
    ('primal-savagery','savagery','attack',null,10,'acid'),
    ('sapping-sting','sting','save','constitution',4,'necrotic'),
    ('sword-burst','burst','save','dexterity',6,'force'),
    ('thunderclap','thunderclap','save','constitution',6,'thunder'),
    ('word-of-radiance','radiance','save','constitution',6,'radiant'),
    ('create-bonfire','bonfire','save','dexterity',8,'fire')
),
scaling as (
  select '[{"kind":"steps","reference":{"source":"character_level"},"steps":[{"atLeast":1,"adjustment":{"diceCount":1}},{"atLeast":5,"adjustment":{"diceCount":2}},{"atLeast":11,"adjustment":{"diceCount":3}},{"atLeast":17,"adjustment":{"diceCount":4}}]}]'::jsonb as rules
)
update public.spell_catalog s
set roll_mode = 'roll',
    roll_recipe = jsonb_build_object(
      'sequences',
      jsonb_build_array(
        jsonb_build_object(
          'key', m.sequence_key,
          'resolution',
            case
              when m.resolution_kind = 'attack' then
                jsonb_build_object(
                  'kind','attack',
                  'bonus',jsonb_build_object('kind','reference','key','attack_bonus'),
                  'target','armor_class'
                )
              else
                jsonb_build_object(
                  'kind','save',
                  'ability',m.save_ability,
                  'dc',jsonb_build_object('kind','reference','key','save_dc'),
                  'onSuccess','none'
                )
            end,
          'effects',
            jsonb_build_array(
              jsonb_build_object(
                'key',m.damage_type,
                'kind','damage',
                'damageType',m.damage_type,
                'dice',jsonb_build_object('count',1,'sides',m.die_sides),
                'scaling',sc.rules
              )
            )
        )
      )
    ),
    updated_at = now()
from mechanics m
cross join scaling sc
where s.spell_level = 0 and s.slug = m.slug;

update public.spell_catalog
set roll_recipe = jsonb_set(
      roll_recipe,
      '{sequences,0,effects}',
      (roll_recipe #> '{sequences,0,effects}')
      || jsonb_build_array(
        jsonb_build_object(
          'key','direction',
          'kind','roll',
          'dice',jsonb_build_object('count',1,'sides',4),
          'label','Случайное направление перемещения'
        )
      )
    ),
    updated_at = now()
where slug = 'infestation' and spell_level = 0;

do $$
begin
  if exists (
    select 1 from public.spell_catalog
    where spell_level = 0 and roll_mode = 'unclassified'
  ) then
    raise exception 'cantrip roll classification incomplete';
  end if;
end
$$;
