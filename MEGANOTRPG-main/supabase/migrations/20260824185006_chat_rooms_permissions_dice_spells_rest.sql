create table if not exists public.chat_room_members (
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  can_read boolean not null default true,
  can_write boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

alter table public.chat_room_members enable row level security;

create index if not exists chat_room_members_user_idx
  on public.chat_room_members(user_id, room_id);

alter table public.character_spells
  add column if not exists cast_mode text not null default 'slot',
  add column if not exists slot_level integer;

update public.character_spells
set cast_mode = case when spell_level = 0 then 'cantrip' else 'slot' end,
    slot_level = case when spell_level = 0 then null else greatest(1, least(9, spell_level)) end
where cast_mode is null
   or cast_mode not in ('cantrip', 'slot')
   or (cast_mode = 'slot' and slot_level is null);

update public.character_spells
set cast_mode = 'cantrip', slot_level = null
where spell_level = 0 and cast_mode = 'slot' and slot_level is null;

update public.character_spells
set slot_level = greatest(1, least(9, spell_level))
where cast_mode = 'slot' and slot_level is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.character_spells'::regclass
      and conname = 'character_spells_cast_mode_check'
  ) then
    alter table public.character_spells
      add constraint character_spells_cast_mode_check
      check (cast_mode in ('cantrip', 'slot'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.character_spells'::regclass
      and conname = 'character_spells_slot_level_check'
  ) then
    alter table public.character_spells
      add constraint character_spells_slot_level_check
      check (
        (cast_mode = 'cantrip' and slot_level is null)
        or (cast_mode = 'slot' and slot_level between 1 and 9)
      );
  end if;
end $$;

-- Keep one permanent flood room. Empty extra flood rooms are removed;
-- non-empty extras are preserved as game rooms instead of losing messages.
with ranked as (
  select r.id,
         row_number() over (partition by r.campaign_id order by r.created_at, r.id) as rn,
         exists(select 1 from public.chat_messages m where m.room_id = r.id) as has_messages
  from public.chat_rooms r
  where r.category = 'flood'
)
update public.chat_rooms r
set category = 'game'
from ranked x
where r.id = x.id
  and x.rn > 1
  and x.has_messages = true;

with ranked as (
  select r.id,
         row_number() over (partition by r.campaign_id order by r.created_at, r.id) as rn,
         exists(select 1 from public.chat_messages m where m.room_id = r.id) as has_messages
  from public.chat_rooms r
  where r.category = 'flood'
)
delete from public.chat_rooms r
using ranked x
where r.id = x.id
  and x.rn > 1
  and x.has_messages = false;

with first_flood as (
  select distinct on (campaign_id) id
  from public.chat_rooms
  where category = 'flood'
  order by campaign_id, created_at, id
)
update public.chat_rooms r
set title = 'Флуд', position = 0
from first_flood f
where r.id = f.id;

create unique index if not exists chat_rooms_one_flood_per_campaign
  on public.chat_rooms(campaign_id)
  where category = 'flood';

-- Preserve access for people who already wrote in existing game rooms.
insert into public.chat_room_members(room_id, user_id, can_read, can_write)
select distinct m.room_id, m.user_id, true, true
from public.chat_messages m
join public.chat_rooms r on r.id = m.room_id and r.category = 'game'
where m.user_id is not null
on conflict (room_id, user_id) do update
set can_read = true,
    can_write = true,
    updated_at = now();

create or replace function private.can_manage_chat_room(
  p_room_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.chat_rooms r
    where r.id = p_room_id
      and private.can_manage_campaign(r.campaign_id, p_user_id)
  );
$$;

create or replace function private.can_read_chat_room(
  p_room_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.chat_rooms r
    join public.campaign_members cm
      on cm.campaign_id = r.campaign_id
     and cm.user_id = p_user_id
    where r.id = p_room_id
      and (
        r.category = 'flood'
        or cm.is_owner = true
        or cm.role = 'gm'
        or exists (
          select 1
          from public.chat_room_members crm
          where crm.room_id = r.id
            and crm.user_id = p_user_id
            and crm.can_read = true
        )
      )
  );
$$;

create or replace function private.can_write_chat_room(
  p_room_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.chat_rooms r
    join public.campaign_members cm
      on cm.campaign_id = r.campaign_id
     and cm.user_id = p_user_id
    where r.id = p_room_id
      and (
        r.category = 'flood'
        or cm.is_owner = true
        or cm.role = 'gm'
        or exists (
          select 1
          from public.chat_room_members crm
          where crm.room_id = r.id
            and crm.user_id = p_user_id
            and crm.can_write = true
        )
      )
  );
$$;

drop policy if exists chat_rooms_member_read on public.chat_rooms;
drop policy if exists chat_rooms_scoped_read on public.chat_rooms;
drop policy if exists chat_rooms_manage_write on public.chat_rooms;

create policy chat_rooms_scoped_read
on public.chat_rooms
for select
to authenticated
using (private.can_read_chat_room(id));

create policy chat_rooms_manage_write
on public.chat_rooms
for all
to authenticated
using (private.can_manage_campaign(campaign_id))
with check (private.can_manage_campaign(campaign_id));

drop policy if exists chat_messages_member_read on public.chat_messages;
drop policy if exists chat_messages_member_insert on public.chat_messages;
drop policy if exists chat_messages_scoped_read on public.chat_messages;
drop policy if exists chat_messages_scoped_insert on public.chat_messages;

create policy chat_messages_scoped_read
on public.chat_messages
for select
to authenticated
using (private.can_read_chat_room(room_id));

create policy chat_messages_scoped_insert
on public.chat_messages
for insert
to authenticated
with check (
  user_id = auth.uid()
  and private.can_write_chat_room(room_id)
);

drop policy if exists chat_room_members_manage on public.chat_room_members;
drop policy if exists chat_room_members_scoped_read on public.chat_room_members;

create policy chat_room_members_scoped_read
on public.chat_room_members
for select
to authenticated
using (
  user_id = auth.uid()
  or private.can_manage_chat_room(room_id)
);

create policy chat_room_members_manage
on public.chat_room_members
for all
to authenticated
using (private.can_manage_chat_room(room_id))
with check (private.can_manage_chat_room(room_id));

grant select, insert, update, delete on public.chat_room_members to authenticated;
grant select, insert, update, delete on public.chat_rooms to authenticated;
grant select, insert on public.chat_messages to authenticated;
grant select, insert, update, delete on public.character_spells to authenticated;

create or replace function public.roll_chat_dice(
  p_room_id uuid,
  p_sides integer,
  p_count integer default 1,
  p_modifier integer default 0
)
returns text
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_rolls integer[] := '{}';
  v_roll integer;
  v_sum integer := 0;
  v_total integer;
  v_body text;
  i integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not private.can_write_chat_room(p_room_id, auth.uid()) then
    raise exception 'Нет права писать в этот чат';
  end if;

  if p_sides not in (4, 6, 8, 10, 12, 20, 100) then
    raise exception 'Неподдерживаемый кубик';
  end if;

  if p_count < 1 or p_count > 20 then
    raise exception 'Количество кубиков должно быть от 1 до 20';
  end if;

  if p_modifier < -100 or p_modifier > 100 then
    raise exception 'Модификатор должен быть от -100 до 100';
  end if;

  for i in 1..p_count loop
    v_roll := floor(random() * p_sides + 1)::integer;
    v_rolls := array_append(v_rolls, v_roll);
    v_sum := v_sum + v_roll;
  end loop;

  v_total := v_sum + p_modifier;
  v_body := '🎲 ' || p_count || 'd' || p_sides;

  if p_modifier > 0 then
    v_body := v_body || ' +' || p_modifier;
  elsif p_modifier < 0 then
    v_body := v_body || ' ' || p_modifier;
  end if;

  v_body := v_body || ' = ' || v_total || ' [' || array_to_string(v_rolls, ', ') || ']';

  insert into public.chat_messages(room_id, body)
  values (p_room_id, v_body);

  return v_body;
end;
$$;

grant execute on function public.roll_chat_dice(uuid, integer, integer, integer) to authenticated;

create or replace function public.cast_prepared_spell(
  p_room_id uuid,
  p_spell_id uuid
)
returns text
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_character_id uuid;
  v_spell public.character_spells%rowtype;
  v_slots jsonb;
  v_key text;
  v_max integer;
  v_used integer;
  v_remaining integer;
  v_body text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not private.can_write_chat_room(p_room_id, auth.uid()) then
    raise exception 'Нет права писать в этот чат';
  end if;

  select cm.active_character_id
    into v_character_id
  from public.chat_rooms r
  join public.campaign_members cm
    on cm.campaign_id = r.campaign_id
   and cm.user_id = auth.uid()
  where r.id = p_room_id;

  if v_character_id is null then
    raise exception 'Для заклинания нужен активный персонаж';
  end if;

  select *
    into v_spell
  from public.character_spells s
  where s.id = p_spell_id
    and s.character_id = v_character_id;

  if v_spell.id is null then
    raise exception 'Заклинание не принадлежит активному персонажу';
  end if;

  if not v_spell.prepared then
    raise exception 'Заклинание не подготовлено';
  end if;

  if v_spell.cast_mode = 'slot' then
    if v_spell.slot_level is null then
      raise exception 'Для заклинания не выбран уровень ячейки';
    end if;

    select cs.spell_slots
      into v_slots
    from public.character_sheets cs
    where cs.character_id = v_character_id
    for update;

    v_key := v_spell.slot_level::text;
    v_max := coalesce((v_slots -> v_key ->> 'max')::integer, 0);
    v_used := coalesce((v_slots -> v_key ->> 'used')::integer, 0);

    if v_max <= 0 then
      raise exception 'У персонажа нет ячеек % уровня', v_spell.slot_level;
    end if;

    if v_used >= v_max then
      raise exception 'Ячейки % уровня закончились', v_spell.slot_level;
    end if;

    v_used := v_used + 1;
    v_remaining := v_max - v_used;

    update public.character_sheets
    set spell_slots = jsonb_set(
          coalesce(spell_slots, '{}'::jsonb),
          array[v_key],
          jsonb_build_object('max', v_max, 'used', v_used),
          true
        ),
        updated_at = now()
    where character_id = v_character_id;

    v_body := '✨ ' || v_spell.name || ' — ячейка ' || v_spell.slot_level || ' ур. (' || v_remaining || '/' || v_max || ' осталось)';
  else
    v_body := '✨ ' || v_spell.name || ' — кантрип';
  end if;

  insert into public.chat_messages(room_id, body)
  values (p_room_id, v_body);

  return v_body;
end;
$$;

grant execute on function public.cast_prepared_spell(uuid, uuid) to authenticated;

create or replace function public.grant_character_long_rest(
  p_character_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_campaign_id uuid;
  v_restored_slots jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select c.campaign_id
    into v_campaign_id
  from public.characters c
  where c.id = p_character_id;

  if v_campaign_id is null then
    raise exception 'Персонаж не найден';
  end if;

  if not private.can_manage_campaign(v_campaign_id, auth.uid()) then
    raise exception 'Только GM или владелец может дать отдых';
  end if;

  select coalesce(
           jsonb_object_agg(
             key,
             jsonb_build_object(
               'max', greatest(coalesce((value ->> 'max')::integer, 0), 0),
               'used', 0
             )
           ),
           '{}'::jsonb
         )
    into v_restored_slots
  from jsonb_each(
    coalesce(
      (select cs.spell_slots from public.character_sheets cs where cs.character_id = p_character_id),
      '{}'::jsonb
    )
  );

  update public.character_sheets
  set current_hp = max_hp,
      temp_hp = 0,
      death_save_successes = 0,
      death_save_failures = 0,
      spell_slots = coalesce(v_restored_slots, '{}'::jsonb),
      updated_at = now()
  where character_id = p_character_id;
end;
$$;

grant execute on function public.grant_character_long_rest(uuid) to authenticated;
