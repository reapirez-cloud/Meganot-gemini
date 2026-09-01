-- Global spell reference for text play.
-- SRD rows may contain CC-BY-4.0 material. Non-SRD official rows must use
-- original short mechanical summaries rather than copied book prose.

create table if not exists public.spell_catalog (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_en text not null,
  name_ru text,
  spell_level smallint not null check (spell_level between 0 and 9),
  school text not null default '',
  casting_time text not null default '',
  spell_range text not null default '',
  area text not null default '',
  duration text not null default '',
  components text[] not null default '{}'::text[],
  material text,
  concentration boolean not null default false,
  ritual boolean not null default false,
  check_type text not null default '',
  damage text not null default '',
  effect_summary text not null default '',
  upcast text not null default '',
  notes text not null default '',
  rules_text text,
  source text not null,
  source_kind text not null check (source_kind in ('srd', 'official')),
  license text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.spell_catalog_classes (
  spell_id uuid not null references public.spell_catalog(id) on delete cascade,
  class_key text not null check (class_key in (
    'artificer', 'barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk',
    'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard'
  )),
  primary key (spell_id, class_key)
);

create index if not exists spell_catalog_level_name_idx
  on public.spell_catalog (spell_level, name_en);
create index if not exists spell_catalog_source_idx
  on public.spell_catalog (source, spell_level);
create index if not exists spell_catalog_classes_class_idx
  on public.spell_catalog_classes (class_key, spell_id);

alter table public.spell_catalog enable row level security;
alter table public.spell_catalog_classes enable row level security;

create policy spell_catalog_authenticated_read
  on public.spell_catalog
  for select
  to authenticated
  using (true);

create policy spell_catalog_classes_authenticated_read
  on public.spell_catalog_classes
  for select
  to authenticated
  using (true);

grant select on public.spell_catalog to authenticated;
grant select on public.spell_catalog_classes to authenticated;

create table if not exists private.spell_class_aliases (
  alias text primary key,
  class_key text not null check (class_key in (
    'artificer', 'barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk',
    'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard'
  ))
);

insert into private.spell_class_aliases (alias, class_key) values
  ('artificer', 'artificer'), ('артификер', 'artificer'), ('изобретатель', 'artificer'),
  ('barbarian', 'barbarian'), ('варвар', 'barbarian'),
  ('bard', 'bard'), ('бард', 'bard'),
  ('cleric', 'cleric'), ('жрец', 'cleric'), ('клирик', 'cleric'),
  ('druid', 'druid'), ('друид', 'druid'),
  ('fighter', 'fighter'), ('воин', 'fighter'),
  ('monk', 'monk'), ('монах', 'monk'),
  ('paladin', 'paladin'), ('паладин', 'paladin'),
  ('ranger', 'ranger'), ('рейнджер', 'ranger'), ('следопыт', 'ranger'),
  ('rogue', 'rogue'), ('плут', 'rogue'), ('разбойник', 'rogue'),
  ('sorcerer', 'sorcerer'), ('чародей', 'sorcerer'),
  ('warlock', 'warlock'), ('варлок', 'warlock'), ('колдун', 'warlock'),
  ('wizard', 'wizard'), ('волшебник', 'wizard'), ('маг', 'wizard')
on conflict (alias) do update set class_key = excluded.class_key;

create or replace function private.spell_class_key(p_label text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select a.class_key
  from private.spell_class_aliases a
  where a.alias = replace(lower(trim(coalesce(p_label, ''))), 'ё', 'е')
  limit 1
$$;

alter table public.character_spells
  add column if not exists catalog_spell_id uuid references public.spell_catalog(id) on delete set null;

create unique index if not exists character_spells_catalog_unique
  on public.character_spells (character_id, catalog_spell_id)
  where catalog_spell_id is not null;

create or replace function public.learn_catalog_spell(
  p_character_id uuid,
  p_spell_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_spell public.spell_catalog%rowtype;
  v_character_class text;
  v_class_key text;
  v_spellcasting_enabled boolean;
  v_spell_slots jsonb;
  v_max_slot integer;
  v_spell_id uuid;
  v_is_manager boolean;
  v_is_assigned boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select c.character_class
    into v_character_class
  from public.characters c
  where c.id = p_character_id;

  if not found then
    raise exception 'Character not found';
  end if;

  select * into v_spell
  from public.spell_catalog s
  where s.id = p_spell_id;

  if v_spell.id is null then
    raise exception 'Catalog spell not found';
  end if;

  v_is_manager := private.can_manage_character(p_character_id, auth.uid());
  v_is_assigned := private.is_assigned_character(p_character_id, auth.uid());

  if not (v_is_manager or v_is_assigned) then
    raise exception 'Not allowed';
  end if;

  if not v_is_manager then
    select cs.spellcasting_enabled, cs.spell_slots
      into v_spellcasting_enabled, v_spell_slots
    from public.character_sheets cs
    where cs.character_id = p_character_id;

    if coalesce(v_spellcasting_enabled, false) is not true then
      raise exception 'Spellcasting is disabled for this character';
    end if;

    v_class_key := private.spell_class_key(v_character_class);
    if v_class_key is null then
      raise exception 'Character class is not supported by the spell catalog';
    end if;

    if not exists (
      select 1
      from public.spell_catalog_classes sc
      where sc.spell_id = p_spell_id
        and sc.class_key = v_class_key
    ) then
      raise exception 'Spell is not available to this class';
    end if;

    if v_spell.spell_level > 0 then
      select max(
        case
          when e.key ~ '^[1-9]$'
            and coalesce((e.value ->> 'max')::integer, 0) > 0
          then e.key::integer
          else null
        end
      )
      into v_max_slot
      from jsonb_each(coalesce(v_spell_slots, '{}'::jsonb)) e;

      if coalesce(v_max_slot, 0) < v_spell.spell_level then
        raise exception 'Spell level is not available to this character';
      end if;
    end if;
  end if;

  if exists (
    select 1
    from public.character_spells s
    where s.character_id = p_character_id
      and (
        s.catalog_spell_id = p_spell_id
        or lower(trim(s.name)) = lower(trim(coalesce(nullif(v_spell.name_ru, ''), v_spell.name_en)))
        or lower(trim(s.name)) = lower(trim(v_spell.name_en))
      )
  ) then
    raise exception 'Spell is already learned';
  end if;

  insert into public.character_spells (
    character_id,
    catalog_spell_id,
    name,
    spell_level,
    school,
    casting_time,
    spell_range,
    duration,
    components,
    concentration,
    ritual,
    prepared,
    description,
    source,
    sort_order,
    cast_mode,
    slot_level
  ) values (
    p_character_id,
    p_spell_id,
    coalesce(nullif(v_spell.name_ru, ''), v_spell.name_en),
    v_spell.spell_level,
    v_spell.school,
    v_spell.casting_time,
    v_spell.spell_range,
    v_spell.duration,
    array_to_string(v_spell.components, ', '),
    v_spell.concentration,
    v_spell.ritual,
    false,
    concat_ws(E'\n\n', nullif(v_spell.effect_summary, ''), nullif(v_spell.notes, ''), nullif(v_spell.upcast, '')),
    v_spell.source,
    v_spell.sort_order,
    case when v_spell.spell_level = 0 then 'cantrip' else 'slot' end,
    case when v_spell.spell_level = 0 then null else v_spell.spell_level end
  )
  returning id into v_spell_id;

  return v_spell_id;
end;
$$;

revoke all on function public.learn_catalog_spell(uuid, uuid) from public;
grant execute on function public.learn_catalog_spell(uuid, uuid) to authenticated;

-- Small verified SRD starter pack so the UI is immediately testable.
-- The full SRD 5.2.1 catalog is imported separately in batches.
insert into public.spell_catalog (
  slug, name_en, name_ru, spell_level, school, casting_time, spell_range,
  area, duration, components, material, concentration, ritual, check_type,
  damage, effect_summary, upcast, notes, source, source_kind, license, sort_order
) values
  (
    'acid-arrow', 'Acid Arrow', 'Кислотная стрела', 2, 'Evocation', 'Действие', '90 футов',
    '', 'Мгновенно', array['В','С','М'], 'измельчённый лист ревеня', false, false,
    'Дальняя атака заклинанием', '4к4 кислота; затем 2к4 кислота в конце следующего хода',
    'Создаёт кислотную стрелу. При попадании цель получает начальный и отложенный урон; при промахе — половину только начального урона.',
    '+1к4 к обоим значениям урона за каждый уровень ячейки выше 2.', '',
    'SRD 5.2.1', 'srd', 'CC-BY-4.0', 0
  ),
  (
    'acid-splash', 'Acid Splash', 'Кислотные брызги', 0, 'Evocation', 'Действие', '60 футов',
    'Сфера радиусом 5 футов', 'Мгновенно', array['В','С'], null, false, false,
    'Спасбросок Ловкости', '1к6 кислота',
    'В выбранной точке взрывается кислотный пузырь. Существа в области получают урон при провале спасброска.',
    '', 'Урон растёт на уровнях персонажа 5, 11 и 17.',
    'SRD 5.2.1', 'srd', 'CC-BY-4.0', 0
  ),
  (
    'aid', 'Aid', 'Подмога', 2, 'Abjuration', 'Действие', '30 футов',
    'До трёх существ', '8 часов', array['В','С','М'], 'полоска белой ткани', false, false,
    '', '',
    'Максимум и текущее количество HP до трёх целей увеличиваются на 5 на время действия.',
    '+5 HP за каждый уровень ячейки выше 2.', '',
    'SRD 5.2.1', 'srd', 'CC-BY-4.0', 0
  ),
  (
    'alarm', 'Alarm', 'Сигнал тревоги', 1, 'Abjuration', '1 минута', '30 футов',
    'Дверь, окно или область до куба 20 футов', '8 часов', array['В','С','М'], 'колокольчик и серебряная проволока', false, true,
    '', '',
    'Ставит магическую сигнализацию на выбранную область или проход. Можно исключить выбранных существ и выбрать мысленный или слышимый сигнал.',
    '', '', 'SRD 5.2.1', 'srd', 'CC-BY-4.0', 0
  ),
  (
    'bane', 'Bane', 'Порча', 1, 'Enchantment', 'Действие', '30 футов',
    'До трёх существ', 'Концентрация, до 1 минуты', array['В','С','М'], 'капля крови', true, false,
    'Спасбросок Харизмы', '',
    'До трёх целей при провале спасброска вычитают 1к4 из бросков атаки и спасбросков до конца действия.',
    '+1 цель за каждый уровень ячейки выше 1.', '',
    'SRD 5.2.1', 'srd', 'CC-BY-4.0', 0
  ),
  (
    'beacon-of-hope', 'Beacon of Hope', 'Маяк надежды', 3, 'Abjuration', 'Действие', '30 футов',
    'Любое число выбранных существ', 'Концентрация, до 1 минуты', array['В','С'], null, true, false,
    '', '',
    'Цели получают преимущество на спасброски Мудрости и спасброски от смерти и всегда получают максимальное возможное лечение.',
    '', '', 'SRD 5.2.1', 'srd', 'CC-BY-4.0', 0
  ),
  (
    'bless', 'Bless', 'Благословение', 1, 'Enchantment', 'Действие', '30 футов',
    'До трёх существ', 'Концентрация, до 1 минуты', array['В','С','М'], 'священный символ стоимостью 5+ зм', true, false,
    '', '',
    'До трёх целей добавляют 1к4 к броскам атаки и спасброскам на время действия.',
    '+1 цель за каждый уровень ячейки выше 1.', '',
    'SRD 5.2.1', 'srd', 'CC-BY-4.0', 0
  ),
  (
    'burning-hands', 'Burning Hands', 'Пылающие ладони', 1, 'Evocation', 'Действие', 'На себя',
    'Конус 15 футов', 'Мгновенно', array['В','С'], null, false, false,
    'Спасбросок Ловкости', '3к6 огонь; половина при успехе',
    'Пламя поражает существ в конусе и поджигает незакреплённые воспламеняемые предметы.',
    '+1к6 урона за каждый уровень ячейки выше 1.', '',
    'SRD 5.2.1', 'srd', 'CC-BY-4.0', 0
  )
on conflict (slug) do update set
  name_en = excluded.name_en,
  name_ru = excluded.name_ru,
  spell_level = excluded.spell_level,
  school = excluded.school,
  casting_time = excluded.casting_time,
  spell_range = excluded.spell_range,
  area = excluded.area,
  duration = excluded.duration,
  components = excluded.components,
  material = excluded.material,
  concentration = excluded.concentration,
  ritual = excluded.ritual,
  check_type = excluded.check_type,
  damage = excluded.damage,
  effect_summary = excluded.effect_summary,
  upcast = excluded.upcast,
  notes = excluded.notes,
  source = excluded.source,
  source_kind = excluded.source_kind,
  license = excluded.license,
  updated_at = now();

insert into public.spell_catalog_classes (spell_id, class_key)
select s.id, x.class_key
from public.spell_catalog s
join (values
  ('acid-arrow', 'wizard'),
  ('acid-splash', 'sorcerer'), ('acid-splash', 'wizard'),
  ('aid', 'bard'), ('aid', 'cleric'), ('aid', 'druid'), ('aid', 'paladin'), ('aid', 'ranger'),
  ('alarm', 'ranger'), ('alarm', 'wizard'),
  ('bane', 'bard'), ('bane', 'cleric'), ('bane', 'warlock'),
  ('beacon-of-hope', 'cleric'),
  ('bless', 'cleric'), ('bless', 'paladin'),
  ('burning-hands', 'sorcerer'), ('burning-hands', 'wizard')
) as x(slug, class_key) on x.slug = s.slug
on conflict do nothing;
