create or replace function public.normalize_character_spell_cast()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.spell_level = 0 and (new.cast_mode is null or (new.cast_mode = 'slot' and new.slot_level is null)) then
    new.cast_mode := 'cantrip';
    new.slot_level := null;
  elsif new.cast_mode is null then
    new.cast_mode := case when new.spell_level = 0 then 'cantrip' else 'slot' end;
  end if;

  if new.cast_mode = 'cantrip' then
    new.slot_level := null;
  elsif new.cast_mode = 'slot' and new.slot_level is null then
    new.slot_level := greatest(1, least(9, new.spell_level));
  end if;

  return new;
end;
$$;

drop trigger if exists character_spells_normalize_cast on public.character_spells;
create trigger character_spells_normalize_cast
before insert or update of spell_level, cast_mode, slot_level
on public.character_spells
for each row
execute function public.normalize_character_spell_cast();
