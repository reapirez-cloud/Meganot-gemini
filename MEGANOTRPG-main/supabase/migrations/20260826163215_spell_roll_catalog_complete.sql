do $$
declare
  r record;
  check_lower text;
  damage_lower text;
  summary_lower text;
  notes_lower text;
  up_lower text;
  combined_lower text;
  base_source text;
  type_source text;
  base_match text[];
  scale_match text[];
  flat_match text[];
  base_dice_matches integer;
  upcast_dice_matches integer;
  dice_count integer;
  dice_sides integer;
  scale_count integer;
  scale_sides integer;
  scale_above integer;
  flat_modifier integer;
  has_attack boolean;
  has_save boolean;
  has_damage_semantics boolean;
  is_healing boolean;
  is_temp_hp boolean;
  is_delayed boolean;
  is_multi_resolution boolean;
  is_instance_scaling boolean;
  is_noncombat_roll boolean;
  save_ability text;
  damage_type text;
  damage_type_count integer;
  on_success text;
  resolution jsonb;
  effect jsonb;
  effects jsonb;
  scaling jsonb;
  recipe jsonb;
  effect_kind text;
begin
  for r in
    select id, slug, spell_level, check_type, damage, upcast, effect_summary, notes
    from public.spell_catalog
    where roll_mode = 'unclassified'
    order by spell_level, slug
  loop
    check_lower := lower(coalesce(r.check_type, ''));
    damage_lower := lower(coalesce(r.damage, ''));
    summary_lower := lower(coalesce(r.effect_summary, ''));
    notes_lower := lower(coalesce(r.notes, ''));
    up_lower := lower(coalesce(r.upcast, ''));
    combined_lower := concat_ws(' ', check_lower, damage_lower, summary_lower, notes_lower, up_lower);

    has_attack := check_lower ~ '(атака заклинанием|spell attack)';
    has_save := check_lower ~ '(спасброс|saving throw)';

    save_ability := case
      when check_lower ~ '(ловк|dexterity)' then 'dexterity'
      when check_lower ~ '(телослож|constitution)' then 'constitution'
      when check_lower ~ '(интеллект|intelligence)' then 'intelligence'
      when check_lower ~ '(мудрост|wisdom)' then 'wisdom'
      when check_lower ~ '(харизм|charisma)' then 'charisma'
      when check_lower ~ '(^|[^а-я])(сила|силы)([^а-я]|$)|strength' then 'strength'
      else null
    end;

    is_healing := combined_lower ~ '(лечение|лечит|восстанавлива[ею]т[^.]*хит|healing|restore[^.]*hit)';
    is_temp_hp := combined_lower ~ '(временн[^.]*хит|temporary hit)';

    if damage_lower ~ '[0-9]+[[:space:]]*[кd][[:space:]]*[0-9]+' then
      base_source := damage_lower;
    else
      base_source := summary_lower;
    end if;
    type_source := concat_ws(' ', damage_lower, summary_lower);

    base_match := regexp_match(base_source, '([0-9]+)[[:space:]]*[кd][[:space:]]*([0-9]+)', 'i');
    select count(*) into base_dice_matches
    from regexp_matches(base_source, '([0-9]+)[[:space:]]*[кd][[:space:]]*([0-9]+)', 'gi');

    scale_match := regexp_match(
      up_lower,
      '([0-9]+)[[:space:]]*[кd][[:space:]]*([0-9]+).*за каждый уровень ячейки выше[[:space:]]*([0-9]+)',
      'i'
    );
    select count(*) into upcast_dice_matches
    from regexp_matches(up_lower, '([0-9]+)[[:space:]]*[кd][[:space:]]*([0-9]+)', 'gi');

    flat_match := regexp_match(base_source, '[0-9]+[[:space:]]*[кd][[:space:]]*[0-9]+[[:space:]]*\+[[:space:]]*([0-9]+)', 'i');

    dice_count := null;
    dice_sides := null;
    scale_count := null;
    scale_sides := null;
    scale_above := null;
    flat_modifier := null;
    if base_match is not null then
      dice_count := base_match[1]::integer;
      dice_sides := base_match[2]::integer;
    end if;
    if scale_match is not null then
      scale_count := scale_match[1]::integer;
      scale_sides := scale_match[2]::integer;
      scale_above := scale_match[3]::integer;
    end if;
    if flat_match is not null then
      flat_modifier := flat_match[1]::integer;
    end if;

    has_damage_semantics := combined_lower ~ '(урон|damage|кислот|acid|холод|cold|огнен|fire|электр|lightning|некрот|necrotic|яд|poison|псих|psychic|излуч|radiant|звуков|thunder|силов[^ы]|force|дробящ|bludgeoning|колющ|piercing|рубящ|slashing)';

    is_multi_resolution :=
      (has_attack and has_save)
      or check_lower ~ '(два|две|несколько|two|multiple)[^.]*спасброс'
      or check_lower ~ '(затем|then)[^.]*спасброс'
      or (has_save and check_lower ~ ' или | or ');

    is_instance_scaling := up_lower ~ '(ещ[её][^.]{0,30}(луч|снаряд|вспыш|атак|дротик)|дополнительн[^.]{0,30}(луч|снаряд|вспыш|атак|дротик)|(луч|снаряд|вспыш|дротик)[^.]{0,60}за каждый уровень)';

    is_delayed :=
      combined_lower ~ '(ловушк|срабатыва[ею]т[^.]*когда|когда[^.]{0,40}(входит|наступает|перемещается)|в начале каждого|в конце каждого|каждый раз[^.]{0,30}когда)'
      or combined_lower ~ '(следующ[^.]{0,40}атак[^.]{0,50}(урон|нанос)|после попадания|сразу после попадания)'
      or combined_lower ~ '(оружи[^.]{0,60}попадан|попадан[^.]{0,60}оружи)'
      or check_lower ~ '(атакующ|attacker)';

    is_noncombat_roll := base_match is not null
      and not has_damage_semantics
      and not is_healing
      and not is_temp_hp
      and combined_lower ~ '(бросок|брось|roll)';

    damage_type_count :=
      (case when type_source ~ '(кислот|acid)' then 1 else 0 end) +
      (case when type_source ~ '(холод|cold)' then 1 else 0 end) +
      (case when type_source ~ '(огнен|fire)' then 1 else 0 end) +
      (case when type_source ~ '(электр|lightning)' then 1 else 0 end) +
      (case when type_source ~ '(некрот|necrotic)' then 1 else 0 end) +
      (case when type_source ~ '(яд|poison)' then 1 else 0 end) +
      (case when type_source ~ '(псих|psychic)' then 1 else 0 end) +
      (case when type_source ~ '(излуч|radiant)' then 1 else 0 end) +
      (case when type_source ~ '(звуков|thunder)' then 1 else 0 end) +
      (case when type_source ~ '(силов[^ы]|force)' then 1 else 0 end) +
      (case when type_source ~ '(дробящ|bludgeoning)' then 1 else 0 end) +
      (case when type_source ~ '(колющ|piercing)' then 1 else 0 end) +
      (case when type_source ~ '(рубящ|slashing)' then 1 else 0 end);

    damage_type := case
      when type_source ~ '(кислот|acid)' then 'acid'
      when type_source ~ '(холод|cold)' then 'cold'
      when type_source ~ '(огнен|fire)' then 'fire'
      when type_source ~ '(электр|lightning)' then 'lightning'
      when type_source ~ '(некрот|necrotic)' then 'necrotic'
      when type_source ~ '(яд|poison)' then 'poison'
      when type_source ~ '(псих|psychic)' then 'psychic'
      when type_source ~ '(излуч|radiant)' then 'radiant'
      when type_source ~ '(звуков|thunder)' then 'thunder'
      when type_source ~ '(силов[^ы]|force)' then 'force'
      when type_source ~ '(дробящ|bludgeoning)' then 'bludgeoning'
      when type_source ~ '(колющ|piercing)' then 'piercing'
      when type_source ~ '(рубящ|slashing)' then 'slashing'
      else null
    end;

    if is_multi_resolution
       or is_delayed
       or is_instance_scaling
       or is_noncombat_roll
       or (has_save and save_ability is null)
       or (base_dice_matches > 1)
       or (damage_type_count > 1 and has_damage_semantics)
       or (upcast_dice_matches > 0 and scale_match is null and up_lower !~ '(не усиливается|does not scale)')
       or (scale_match is not null and base_match is not null and scale_sides <> dice_sides)
       or (base_match is not null and base_source ~ '\+[[:space:]]*(модификатор|modifier)' and not is_healing)
    then
      update public.spell_catalog
      set roll_mode = 'contextual', roll_recipe = null, updated_at = now()
      where id = r.id;
      continue;
    end if;

    effect_kind := null;
    if base_match is not null then
      if is_healing then
        effect_kind := 'healing';
      elsif is_temp_hp then
        effect_kind := 'roll';
      elsif has_damage_semantics then
        effect_kind := 'damage';
      end if;
    end if;

    if not has_attack and not has_save and effect_kind is null then
      update public.spell_catalog
      set roll_mode = 'link', roll_recipe = null, updated_at = now()
      where id = r.id;
      continue;
    end if;

    if has_attack then
      resolution := jsonb_build_object(
        'kind', 'attack',
        'bonus', jsonb_build_object('kind', 'reference', 'key', 'attack_bonus'),
        'target', 'armor_class'
      );
    elsif has_save then
      on_success := case when combined_lower ~ '(половин|half)' then 'half' else 'none' end;
      resolution := jsonb_build_object(
        'kind', 'save',
        'ability', save_ability,
        'dc', jsonb_build_object('kind', 'reference', 'key', 'save_dc'),
        'onSuccess', on_success
      );
    else
      resolution := jsonb_build_object('kind', 'none');
    end if;

    effects := '[]'::jsonb;
    if effect_kind is not null then
      effect := jsonb_build_object(
        'key', case when effect_kind = 'damage' then 'damage' when effect_kind = 'healing' then 'healing' else 'roll' end,
        'kind', effect_kind,
        'dice', jsonb_build_object('count', dice_count, 'sides', dice_sides)
      );

      if effect_kind = 'damage' and damage_type is not null then
        effect := effect || jsonb_build_object('damageType', damage_type);
      elsif effect_kind = 'roll' and is_temp_hp then
        effect := effect || jsonb_build_object('label', 'temporary_hp');
      end if;

      if is_healing and combined_lower ~ '(модификатор заклинательной характеристики|casting ability modifier)' then
        effect := effect || jsonb_build_object(
          'modifier', jsonb_build_object('kind', 'reference', 'key', 'casting_ability_modifier')
        );
      elsif flat_modifier is not null then
        effect := effect || jsonb_build_object(
          'modifier', jsonb_build_object('kind', 'literal', 'value', flat_modifier)
        );
      end if;

      if scale_match is not null and scale_sides = dice_sides and scale_count > 0 then
        scaling := jsonb_build_array(jsonb_build_object(
          'kind', 'per_level',
          'reference', jsonb_build_object('source', 'cast_level'),
          'above', scale_above,
          'diceCountPerLevel', scale_count
        ));
        effect := effect || jsonb_build_object('scaling', scaling);
      end if;

      effects := jsonb_build_array(effect);
    end if;

    recipe := jsonb_build_object(
      'sequences', jsonb_build_array(jsonb_build_object(
        'key', 'main',
        'resolution', resolution,
        'effects', effects
      ))
    );

    update public.spell_catalog
    set roll_mode = 'roll', roll_recipe = recipe, updated_at = now()
    where id = r.id;
  end loop;

  if exists (select 1 from public.spell_catalog where roll_mode = 'unclassified') then
    raise exception 'spell roll catalog completion left unclassified spells';
  end if;
end
$$;

comment on column public.spell_catalog.roll_mode is
  'Internal Roll Engine classification: unclassified, link, roll, or contextual. Contextual means reviewed but requires external cast/target/item context before automatic rolling.';
