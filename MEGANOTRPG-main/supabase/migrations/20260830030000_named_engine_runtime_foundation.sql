begin;

-- Named-engine runtime foundation.
--
-- Cheburashka owns complete inventory persistence. CE never owns these rows;
-- it receives only a fresh mechanical projection after Cheburashka changes
-- warehouse state. Gena coordinates the play command and chat history.

alter table public.character_inventory_items
  add column if not exists usage_mode text not null default 'none',
  add column if not exists charges_current integer,
  add column if not exists charges_max integer,
  add column if not exists item_state jsonb not null default '{}'::jsonb,
  add column if not exists version bigint not null default 1;

-- DELETE events must retain character_id so Cheburashka's persistence adapter
-- can signal resolution after the final grenade in a stack disappears.
alter table public.character_inventory_items replica identity full;

update public.character_inventory_items
set usage_mode = 'quantity'
where category = 'consumable'
  and usage_mode = 'none';

alter table public.character_inventory_items
  drop constraint if exists character_inventory_items_usage_mode_check,
  add constraint character_inventory_items_usage_mode_check
    check (usage_mode in ('none', 'quantity', 'charges')),
  drop constraint if exists character_inventory_items_charges_check,
  add constraint character_inventory_items_charges_check check (
    (usage_mode <> 'charges' and charges_current is null and charges_max is null)
    or (
      usage_mode = 'charges'
      and charges_max is not null
      and charges_max >= 1
      and charges_current is not null
      and charges_current between 0 and charges_max
    )
  ),
  drop constraint if exists character_inventory_items_state_object_check,
  add constraint character_inventory_items_state_object_check
    check (jsonb_typeof(item_state) = 'object'),
  drop constraint if exists character_inventory_items_version_check,
  add constraint character_inventory_items_version_check check (version >= 1);

create or replace function private.cheburashka_bump_item_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists character_inventory_items_bump_version
  on public.character_inventory_items;
create trigger character_inventory_items_bump_version
before update on public.character_inventory_items
for each row execute function private.cheburashka_bump_item_version();

revoke all on function private.cheburashka_bump_item_version()
  from public, anon, authenticated;

-- Correlation/idempotency storage is engine infrastructure, not a UI model.
create table if not exists public.engine_command_receipts (
  command_id uuid primary key,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  engine text not null,
  command_kind text not null,
  aggregate_id uuid,
  result jsonb not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(result) = 'object')
);

create index if not exists engine_command_receipts_campaign_created_idx
  on public.engine_command_receipts(campaign_id, created_at desc);

alter table public.engine_command_receipts enable row level security;
revoke all on table public.engine_command_receipts from public, anon, authenticated;
grant select, insert, update, delete on table public.engine_command_receipts to service_role;

create or replace function private.cheburashka_consume_inventory_item_v1(
  p_character_id uuid,
  p_item_id uuid,
  p_amount integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_usage_mode text;
  v_quantity integer;
  v_charges integer;
begin
  if p_amount is null or p_amount < 1 or p_amount > 10000 then
    raise exception 'Inventory amount must be between 1 and 10000';
  end if;

  select to_jsonb(item), item.usage_mode, item.quantity, item.charges_current
    into v_before, v_usage_mode, v_quantity, v_charges
  from public.character_inventory_items item
  where item.id = p_item_id
    and item.character_id = p_character_id
  for update;

  if v_before is null then
    raise exception 'Inventory item not found for this character';
  end if;

  if v_usage_mode = 'none' then
    v_after := v_before;
  elsif v_usage_mode = 'charges' then
    if coalesce(v_charges, 0) < p_amount then
      raise exception 'Not enough item charges';
    end if;
    update public.character_inventory_items item
    set charges_current = item.charges_current - p_amount
    where item.id = p_item_id
    returning to_jsonb(item) into v_after;
  else
    if v_quantity < p_amount then
      raise exception 'Not enough item quantity';
    end if;
    if v_quantity = p_amount then
      delete from public.character_inventory_items
      where id = p_item_id;
      v_after := 'null'::jsonb;
    else
      update public.character_inventory_items item
      set quantity = item.quantity - p_amount
      where item.id = p_item_id
      returning to_jsonb(item) into v_after;
    end if;
  end if;

  return jsonb_build_object(
    'itemId', p_item_id,
    'affectedCharacterIds', jsonb_build_array(p_character_id),
    'before', v_before,
    'after', v_after
  );
end;
$$;

revoke all on function private.cheburashka_consume_inventory_item_v1(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function private.cheburashka_consume_inventory_item_v1(uuid, uuid, integer)
  to service_role;

create or replace function public.consume_inventory_item_v1(
  p_character_id uuid,
  p_item_id uuid,
  p_amount integer default 1,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign_id uuid;
  v_existing record;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_command_id is null then raise exception 'Command id is required'; end if;
  if not private.can_operate_character_resources(p_character_id, auth.uid()) then
    raise exception 'Not allowed';
  end if;

  select campaign_id into v_campaign_id
  from public.characters
  where id = p_character_id;
  if v_campaign_id is null then raise exception 'Character not found'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_command_id::text, 0));
  select * into v_existing
  from public.engine_command_receipts
  where command_id = p_command_id;
  if found then
    if v_existing.created_by <> auth.uid()
      or v_existing.engine <> 'cheburashka'
      or v_existing.command_kind <> 'inventory.consume'
      or v_existing.aggregate_id <> p_item_id then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  v_result := private.cheburashka_consume_inventory_item_v1(
    p_character_id, p_item_id, p_amount
  );

  insert into public.engine_command_receipts(
    command_id, campaign_id, engine, command_kind, aggregate_id, result, created_by
  ) values (
    p_command_id, v_campaign_id, 'cheburashka', 'inventory.consume', p_item_id,
    v_result, auth.uid()
  );
  return v_result;
end;
$$;

create or replace function public.transfer_inventory_item_v1(
  p_from_character_id uuid,
  p_to_character_id uuid,
  p_item_id uuid,
  p_amount integer default 1,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign_id uuid;
  v_target_campaign_id uuid;
  v_existing record;
  v_before jsonb;
  v_after jsonb := 'null'::jsonb;
  v_destination jsonb;
  v_quantity integer;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_command_id is null then raise exception 'Command id is required'; end if;
  if p_from_character_id = p_to_character_id then raise exception 'Characters must be different'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 10000 then
    raise exception 'Inventory amount must be between 1 and 10000';
  end if;
  if not private.can_manage_character(p_from_character_id, auth.uid())
    or not private.can_manage_character(p_to_character_id, auth.uid()) then
    raise exception 'Only GM can transfer inventory between characters';
  end if;

  select campaign_id into v_campaign_id from public.characters where id = p_from_character_id;
  select campaign_id into v_target_campaign_id from public.characters where id = p_to_character_id;
  if v_campaign_id is null or v_target_campaign_id is null or v_campaign_id <> v_target_campaign_id then
    raise exception 'Characters must belong to the same campaign';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_command_id::text, 0));
  select * into v_existing from public.engine_command_receipts where command_id = p_command_id;
  if found then
    if v_existing.created_by <> auth.uid()
      or v_existing.engine <> 'cheburashka'
      or v_existing.command_kind <> 'inventory.transfer'
      or v_existing.aggregate_id <> p_item_id then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  select to_jsonb(item), item.quantity
    into v_before, v_quantity
  from public.character_inventory_items item
  where item.id = p_item_id
    and item.character_id = p_from_character_id
  for update;
  if v_before is null then raise exception 'Inventory item not found for source character'; end if;
  if v_quantity < p_amount then raise exception 'Not enough item quantity'; end if;

  if v_quantity = p_amount then
    update public.character_inventory_items item
    set character_id = p_to_character_id,
        equipped = false
    where item.id = p_item_id
    returning to_jsonb(item) into v_destination;
  else
    update public.character_inventory_items item
    set quantity = item.quantity - p_amount
    where item.id = p_item_id
    returning to_jsonb(item) into v_after;

    insert into public.character_inventory_items(
      character_id, name, quantity, weight, equipped, image_url, description,
      sort_order, category, equipment_slot, mechanics, usage_mode,
      charges_current, charges_max, item_state
    )
    select
      p_to_character_id, item.name, p_amount, item.weight, false, item.image_url,
      item.description, item.sort_order, item.category, item.equipment_slot,
      item.mechanics, item.usage_mode, item.charges_current, item.charges_max,
      item.item_state
    from public.character_inventory_items item
    where item.id = p_item_id
    returning to_jsonb(character_inventory_items) into v_destination;
  end if;

  v_result := jsonb_build_object(
    'itemId', p_item_id,
    'affectedCharacterIds', jsonb_build_array(p_from_character_id, p_to_character_id),
    'before', v_before,
    'after', v_after,
    'destinationItem', v_destination
  );

  insert into public.engine_command_receipts(
    command_id, campaign_id, engine, command_kind, aggregate_id, result, created_by
  ) values (
    p_command_id, v_campaign_id, 'cheburashka', 'inventory.transfer', p_item_id,
    v_result, auth.uid()
  );
  return v_result;
end;
$$;

-- Gena gateway: inventory mutation, optional character-resource payment and
-- chat history succeed or roll back as one transaction. Dice remain a recorded
-- declaration and never mutate HP.
create or replace function public.send_chat_inventory_roll_v1(
  p_room_id uuid,
  p_character_id uuid,
  p_item_id uuid,
  p_item_amount integer,
  p_label text,
  p_kind text,
  p_modifier integer default 0,
  p_roll_d20 boolean default false,
  p_dice_count integer default 0,
  p_dice_sides integer default 0,
  p_dice_modifier integer default 0,
  p_resource_costs jsonb default '[]'::jsonb,
  p_command_id uuid default gen_random_uuid()
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign_id uuid;
  v_existing record;
  v_mutation jsonb;
  v_id bigint;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_command_id is null then raise exception 'Command id is required'; end if;
  if not private.can_write_chat_room(p_room_id, auth.uid()) then raise exception 'Нет права писать в этот чат'; end if;
  if not private.can_operate_character_resources(p_character_id, auth.uid()) then raise exception 'Not allowed'; end if;
  select campaign_id into v_campaign_id from public.characters where id = p_character_id;
  if v_campaign_id is null then raise exception 'Character not found'; end if;
  if not exists (
    select 1 from public.chat_rooms room
    where room.id = p_room_id and room.campaign_id = v_campaign_id
  ) then raise exception 'Character and chat room must belong to the same campaign'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_command_id::text, 0));
  select * into v_existing from public.engine_command_receipts where command_id = p_command_id;
  if found then
    if v_existing.created_by <> auth.uid()
      or v_existing.engine <> 'gena'
      or v_existing.command_kind <> 'inventory.roll'
      or v_existing.aggregate_id <> p_item_id then
      raise exception 'Command id is already used by another command';
    end if;
    return (v_existing.result->>'messageId')::bigint;
  end if;

  v_mutation := private.cheburashka_consume_inventory_item_v1(
    p_character_id, p_item_id, p_item_amount
  );
  v_id := public.send_chat_roll_v3(
    p_room_id, p_character_id, p_label, p_kind, p_modifier, p_roll_d20,
    p_dice_count, p_dice_sides, p_dice_modifier, coalesce(p_resource_costs, '[]'::jsonb)
  );

  update public.chat_messages
  set event_payload = coalesce(event_payload, '{}'::jsonb) || jsonb_build_object(
    'source', jsonb_build_object(
      'engine', 'cheburashka',
      'sourceType', 'inventory_item',
      'sourceId', 'item:' || p_item_id::text
    ),
    'inventoryMutation', v_mutation
  )
  where id = v_id;

  v_result := jsonb_build_object('messageId', v_id, 'inventoryMutation', v_mutation);
  insert into public.engine_command_receipts(
    command_id, campaign_id, engine, command_kind, aggregate_id, result, created_by
  ) values (
    p_command_id, v_campaign_id, 'gena', 'inventory.roll', p_item_id,
    v_result, auth.uid()
  );
  return v_id;
end;
$$;

create or replace function public.send_chat_inventory_event_v1(
  p_room_id uuid,
  p_character_id uuid,
  p_item_id uuid,
  p_item_amount integer,
  p_label text,
  p_payload jsonb default '{}'::jsonb,
  p_resource_costs jsonb default '[]'::jsonb,
  p_command_id uuid default gen_random_uuid()
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign_id uuid;
  v_existing record;
  v_mutation jsonb;
  v_id bigint;
  v_result jsonb;
  v_payload jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_command_id is null then raise exception 'Command id is required'; end if;
  if not private.can_write_chat_room(p_room_id, auth.uid()) then raise exception 'Нет права писать в этот чат'; end if;
  if not private.can_operate_character_resources(p_character_id, auth.uid()) then raise exception 'Not allowed'; end if;
  select campaign_id into v_campaign_id from public.characters where id = p_character_id;
  if v_campaign_id is null then raise exception 'Character not found'; end if;
  if not exists (
    select 1 from public.chat_rooms room
    where room.id = p_room_id and room.campaign_id = v_campaign_id
  ) then raise exception 'Character and chat room must belong to the same campaign'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_command_id::text, 0));
  select * into v_existing from public.engine_command_receipts where command_id = p_command_id;
  if found then
    if v_existing.created_by <> auth.uid()
      or v_existing.engine <> 'gena'
      or v_existing.command_kind <> 'inventory.event'
      or v_existing.aggregate_id <> p_item_id then
      raise exception 'Command id is already used by another command';
    end if;
    return (v_existing.result->>'messageId')::bigint;
  end if;

  v_mutation := private.cheburashka_consume_inventory_item_v1(
    p_character_id, p_item_id, p_item_amount
  );
  v_payload := coalesce(p_payload, '{}'::jsonb) || jsonb_build_object(
    'source', jsonb_build_object(
      'engine', 'cheburashka',
      'sourceType', 'inventory_item',
      'sourceId', 'item:' || p_item_id::text
    ),
    'inventoryMutation', v_mutation
  );
  v_id := public.send_chat_event_v3(
    p_room_id, p_character_id, 'action', p_label, v_payload,
    coalesce(p_resource_costs, '[]'::jsonb)
  );

  v_result := jsonb_build_object('messageId', v_id, 'inventoryMutation', v_mutation);
  insert into public.engine_command_receipts(
    command_id, campaign_id, engine, command_kind, aggregate_id, result, created_by
  ) values (
    p_command_id, v_campaign_id, 'gena', 'inventory.event', p_item_id,
    v_result, auth.uid()
  );
  return v_id;
end;
$$;

-- Shapoklyak persists HP only when the GM explicitly establishes it. Tobik
-- rolls and Gena action declarations intentionally never call this command.
create or replace function public.set_character_hp_v1(
  p_character_id uuid,
  p_current_hp integer,
  p_max_hp integer default null,
  p_temp_hp integer default null,
  p_command_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign_id uuid;
  v_existing record;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_command_id is null then raise exception 'Command id is required'; end if;
  if not private.can_manage_character(p_character_id, auth.uid()) then
    raise exception 'Only GM can establish character HP';
  end if;
  if p_current_hp is null or p_current_hp < 0
    or (p_max_hp is not null and p_max_hp < 0)
    or (p_temp_hp is not null and p_temp_hp < 0) then
    raise exception 'HP values must be non-negative integers';
  end if;
  select campaign_id into v_campaign_id from public.characters where id = p_character_id;
  if v_campaign_id is null then raise exception 'Character not found'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_command_id::text, 0));
  select * into v_existing from public.engine_command_receipts where command_id = p_command_id;
  if found then
    if v_existing.created_by <> auth.uid()
      or v_existing.engine <> 'shapoklyak'
      or v_existing.command_kind <> 'entity.set_hp'
      or v_existing.aggregate_id <> p_character_id then
      raise exception 'Command id is already used by another command';
    end if;
    return v_existing.result;
  end if;

  insert into public.character_sheets(character_id, current_hp, max_hp, temp_hp)
  values (
    p_character_id,
    p_current_hp,
    coalesce(p_max_hp, greatest(1, p_current_hp)),
    coalesce(p_temp_hp, 0)
  )
  on conflict(character_id) do update set
    current_hp = excluded.current_hp,
    max_hp = coalesce(p_max_hp, public.character_sheets.max_hp),
    temp_hp = coalesce(p_temp_hp, public.character_sheets.temp_hp),
    updated_at = now();

  select jsonb_build_object(
    'characterId', sheet.character_id,
    'currentHp', sheet.current_hp,
    'maxHp', sheet.max_hp,
    'tempHp', sheet.temp_hp
  ) into v_result
  from public.character_sheets sheet
  where sheet.character_id = p_character_id;

  insert into public.engine_command_receipts(
    command_id, campaign_id, engine, command_kind, aggregate_id, result, created_by
  ) values (
    p_command_id, v_campaign_id, 'shapoklyak', 'entity.set_hp', p_character_id,
    v_result, auth.uid()
  );
  return v_result;
end;
$$;

comment on table public.character_inventory_items is
  'CHEBURASHKA canonical inventory storage. CE receives projections, never these rows as owned state.';
comment on table public.engine_command_receipts is
  'Idempotency receipts for explicit engine commands; not a UI-facing domain model.';
comment on function public.consume_inventory_item_v1(uuid, uuid, integer, uuid) is
  'CHEBURASHKA command: atomically consume quantity/charges or record use of a non-consumed item.';
comment on function public.transfer_inventory_item_v1(uuid, uuid, uuid, integer, uuid) is
  'CHEBURASHKA command: atomically transfer inventory between character warehouses.';
comment on function public.send_chat_inventory_roll_v1(uuid, uuid, uuid, integer, text, text, integer, boolean, integer, integer, integer, jsonb, uuid) is
  'GENA command: atomically consume an item, pay resources, request/record a roll and append chat history.';
comment on function public.send_chat_inventory_event_v1(uuid, uuid, uuid, integer, text, jsonb, jsonb, uuid) is
  'GENA command: atomically consume an item, pay resources and append an action event.';
comment on function public.set_character_hp_v1(uuid, integer, integer, integer, uuid) is
  'SHAPOKLYAK command: persist GM-authoritative HP; never inferred from rolls or action declarations.';

revoke all on function public.consume_inventory_item_v1(uuid, uuid, integer, uuid)
  from public, anon;
revoke all on function public.transfer_inventory_item_v1(uuid, uuid, uuid, integer, uuid)
  from public, anon;
revoke all on function public.send_chat_inventory_roll_v1(uuid, uuid, uuid, integer, text, text, integer, boolean, integer, integer, integer, jsonb, uuid)
  from public, anon;
revoke all on function public.send_chat_inventory_event_v1(uuid, uuid, uuid, integer, text, jsonb, jsonb, uuid)
  from public, anon;
revoke all on function public.set_character_hp_v1(uuid, integer, integer, integer, uuid)
  from public, anon;

grant execute on function public.consume_inventory_item_v1(uuid, uuid, integer, uuid)
  to authenticated;
grant execute on function public.transfer_inventory_item_v1(uuid, uuid, uuid, integer, uuid)
  to authenticated;
grant execute on function public.send_chat_inventory_roll_v1(uuid, uuid, uuid, integer, text, text, integer, boolean, integer, integer, integer, jsonb, uuid)
  to authenticated;
grant execute on function public.send_chat_inventory_event_v1(uuid, uuid, uuid, integer, text, jsonb, jsonb, uuid)
  to authenticated;
grant execute on function public.set_character_hp_v1(uuid, integer, integer, integer, uuid)
  to authenticated;

commit;
