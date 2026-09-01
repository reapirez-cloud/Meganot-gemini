create or replace function public.set_character_inventory_equipped(
  p_item_id uuid,
  p_equipped boolean,
  p_equipment_slot text default null
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_character_id uuid;
  v_slot text;
  v_category text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select character_id,
         category,
         coalesce(nullif(trim(p_equipment_slot), ''), equipment_slot)
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

  if p_equipped and v_slot not in (
    'main_hand', 'off_hand', 'two_hands', 'head', 'neck', 'shoulders',
    'chest', 'hands', 'wrists', 'waist', 'legs', 'feet', 'back',
    'ring_left', 'ring_right', 'ammo', 'other'
  ) then
    raise exception 'Unsupported equipment slot';
  end if;

  if p_equipped then
    update public.character_inventory_items
    set equipped = false,
        updated_at = now()
    where character_id = v_character_id
      and id <> p_item_id
      and equipped = true
      and equipment_slot = v_slot;

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
      equipment_slot = case when p_equipped then v_slot else equipment_slot end,
      updated_at = now()
  where id = p_item_id;
end;
$$;
