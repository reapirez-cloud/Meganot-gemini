alter table public.character_inventory_items
  add column if not exists category text not null default 'other',
  add column if not exists equipment_slot text;

update public.character_inventory_items
set category = 'equipment'
where equipped = true and category = 'other';

create or replace function public.set_character_inventory_equipped(
  p_item_id uuid,
  p_equipped boolean,
  p_equipment_slot text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_character_id uuid;
  v_slot text;
  v_category text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select character_id, category, coalesce(nullif(trim(p_equipment_slot), ''), equipment_slot)
    into v_character_id, v_category, v_slot
  from public.character_inventory_items
  where id = p_item_id;

  if v_character_id is null then
    raise exception 'Inventory item not found';
  end if;

  if not (
    private.can_manage_character(v_character_id)
    or private.is_assigned_character(v_character_id)
  ) then
    raise exception 'Not allowed';
  end if;

  if p_equipped and v_category <> 'equipment' then
    raise exception 'Only equipment items can be equipped';
  end if;

  if p_equipped and (v_slot is null or trim(v_slot) = '') then
    raise exception 'Equipment slot is required';
  end if;

  if p_equipped then
    -- One visible item per normal slot. Rings have two explicit slots in UI.
    update public.character_inventory_items
    set equipped = false,
        updated_at = now()
    where character_id = v_character_id
      and id <> p_item_id
      and equipped = true
      and equipment_slot = v_slot;

    -- A two-handed item conflicts with both hand slots and vice versa.
    if v_slot = 'two_hands' then
      update public.character_inventory_items
      set equipped = false,
          updated_at = now()
      where character_id = v_character_id
        and id <> p_item_id
        and equipped = true
        and equipment_slot in ('main_hand', 'off_hand');
    elsif v_slot in ('main_hand', 'off_hand') then
      update public.character_inventory_items
      set equipped = false,
          updated_at = now()
      where character_id = v_character_id
        and id <> p_item_id
        and equipped = true
        and equipment_slot = 'two_hands';
    end if;
  end if;

  update public.character_inventory_items
  set equipped = p_equipped,
      equipment_slot = case
        when p_equipped then v_slot
        else equipment_slot
      end,
      updated_at = now()
  where id = p_item_id;
end;
$$;

create or replace function public.set_character_spellcasting_enabled(
  p_character_id uuid,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not (
    private.can_manage_character(p_character_id)
    or private.is_assigned_character(p_character_id)
  ) then
    raise exception 'Not allowed';
  end if;

  insert into public.character_sheets (character_id, spellcasting_enabled)
  values (p_character_id, p_enabled)
  on conflict (character_id)
  do update set
    spellcasting_enabled = excluded.spellcasting_enabled,
    updated_at = now();
end;
$$;

revoke all on function public.set_character_inventory_equipped(uuid, boolean, text) from public, anon;
grant execute on function public.set_character_inventory_equipped(uuid, boolean, text) to authenticated;
revoke all on function public.set_character_spellcasting_enabled(uuid, boolean) from public, anon;
grant execute on function public.set_character_spellcasting_enabled(uuid, boolean) to authenticated;
