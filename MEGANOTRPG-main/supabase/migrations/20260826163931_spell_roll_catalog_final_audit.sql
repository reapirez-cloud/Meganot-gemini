-- Final hand audit of remaining auto-roll edge cases.
-- These spells require choices or derived post-roll values that Roll Engine v1
-- cannot yet represent without hiding mechanics from the user.
update public.spell_catalog
set roll_mode = 'contextual', roll_recipe = null, updated_at = now()
where slug in (
  'detect-thoughts',
  'vampiric-touch',
  'seeming',
  'draconic-transformation',
  'reverse-gravity'
);

do $$
begin
  if exists (select 1 from public.spell_catalog where roll_mode = 'unclassified') then
    raise exception 'final spell roll audit left unclassified spells';
  end if;

  if exists (
    select 1
    from public.spell_catalog
    where roll_mode = 'roll'
      and (
        roll_recipe is null
        or jsonb_typeof(roll_recipe) <> 'object'
        or jsonb_typeof(roll_recipe -> 'sequences') <> 'array'
        or jsonb_array_length(roll_recipe -> 'sequences') = 0
      )
  ) then
    raise exception 'final spell roll audit found malformed roll recipes';
  end if;
end
$$;
