begin;

-- Game-room model: a personal character thread, a shared scene, or flood.
alter table public.characters
  add column if not exists life_state text not null default 'alive',
  add column if not exists died_at timestamptz;

alter table public.chat_rooms
  add column if not exists room_type text not null default 'scene',
  add column if not exists character_id uuid references public.characters(id) on delete cascade,
  add column if not exists open_to_campaign boolean not null default false,
  add column if not exists is_read_only boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.characters'::regclass
      and conname = 'characters_life_state_check'
  ) then
    alter table public.characters
      add constraint characters_life_state_check
      check (life_state in ('alive', 'dead'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.chat_rooms'::regclass
      and conname = 'chat_rooms_room_type_check'
  ) then
    alter table public.chat_rooms
      add constraint chat_rooms_room_type_check
      check (room_type in ('flood', 'character', 'scene'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.chat_rooms'::regclass
      and conname = 'chat_rooms_character_room_check'
  ) then
    alter table public.chat_rooms
      add constraint chat_rooms_character_room_check
      check (
        (room_type = 'character' and character_id is not null and category = 'game')
        or (room_type <> 'character' and character_id is null)
      );
  end if;
end $$;

update public.chat_rooms
set room_type = case when category = 'flood' then 'flood' else 'scene' end
where room_type is null
   or room_type not in ('flood', 'character', 'scene')
   or (category = 'flood' and room_type <> 'flood');

create unique index if not exists chat_rooms_one_character_room
  on public.chat_rooms(character_id)
  where room_type = 'character';

create index if not exists chat_rooms_campaign_type_position_idx
  on public.chat_rooms(campaign_id, room_type, position, created_at);

-- Character rooms are created automatically for PCs and stay bound to that PC.
create or replace function private.ensure_character_chat_room(p_character_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_character public.characters%rowtype;
  v_room_id uuid;
  v_position integer;
begin
  select * into v_character
  from public.characters c
  where c.id = p_character_id;

  if v_character.id is null or v_character.character_type <> 'pc' then
    return null;
  end if;

  select r.id into v_room_id
  from public.chat_rooms r
  where r.character_id = v_character.id
    and r.room_type = 'character'
  limit 1;

  if v_room_id is not null then
    update public.chat_rooms
    set title = v_character.name,
        is_read_only = (v_character.life_state = 'dead')
    where id = v_room_id;
    return v_room_id;
  end if;

  select coalesce(max(r.position), 0) + 10 into v_position
  from public.chat_rooms r
  where r.campaign_id = v_character.campaign_id
    and r.room_type = 'character';

  insert into public.chat_rooms(
    campaign_id, slug, title, category, position,
    room_type, character_id, open_to_campaign, is_read_only
  ) values (
    v_character.campaign_id,
    'character-' || replace(v_character.id::text, '-', ''),
    v_character.name,
    'game',
    v_position,
    'character',
    v_character.id,
    false,
    v_character.life_state = 'dead'
  )
  returning id into v_room_id;

  return v_room_id;
end;
$$;

revoke all on function private.ensure_character_chat_room(uuid) from public, anon;
grant execute on function private.ensure_character_chat_room(uuid) to authenticated, service_role;

create or replace function private.sync_character_game_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room_id uuid;
  v_changed_to_dead boolean := false;
  v_changed_to_alive boolean := false;
begin
  if new.character_type = 'pc' then
    v_room_id := private.ensure_character_chat_room(new.id);
  end if;

  if tg_op = 'UPDATE' then
    v_changed_to_dead := old.life_state is distinct from new.life_state and new.life_state = 'dead';
    v_changed_to_alive := old.life_state is distinct from new.life_state and new.life_state = 'alive';

    if old.name is distinct from new.name and v_room_id is not null then
      update public.chat_rooms set title = new.name where id = v_room_id;
    end if;

    if v_changed_to_dead then
      update public.campaign_members
      set active_character_id = null
      where campaign_id = new.campaign_id
        and active_character_id = new.id;

      update public.chat_rooms
      set is_read_only = true
      where character_id = new.id and room_type = 'character';

      insert into public.feed_items(
        campaign_id, source_type, source_id, created_by, character_id,
        title, body, media_url, published_at, updated_at
      ) values (
        new.campaign_id, 'update', gen_random_uuid(), auth.uid(), new.id,
        'Погиб: ' || new.name,
        'Персональная история персонажа завершена. Его игровой чат теперь доступен только для чтения.',
        new.avatar_url, now(), now()
      );
    elsif v_changed_to_alive then
      update public.chat_rooms
      set is_read_only = false
      where character_id = new.id and room_type = 'character';

      insert into public.feed_items(
        campaign_id, source_type, source_id, created_by, character_id,
        title, body, media_url, published_at, updated_at
      ) values (
        new.campaign_id, 'update', gen_random_uuid(), auth.uid(), new.id,
        'Вернулся: ' || new.name,
        'Персональный игровой чат персонажа снова открыт.',
        new.avatar_url, now(), now()
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists character_game_lifecycle_sync on public.characters;
create trigger character_game_lifecycle_sync
after insert or update of name, character_type, life_state on public.characters
for each row execute function private.sync_character_game_lifecycle();

-- Backfill personal rooms for all existing PCs.
select private.ensure_character_chat_room(c.id)
from public.characters c
where c.character_type = 'pc';

-- Explicit GM lifecycle action; inactive and dead remain separate concepts.
create or replace function public.set_character_life_state(
  p_character_id uuid,
  p_life_state text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_life_state not in ('alive', 'dead') then raise exception 'Unsupported life state'; end if;

  select c.campaign_id into v_campaign_id
  from public.characters c
  where c.id = p_character_id;

  if v_campaign_id is null then raise exception 'Character not found'; end if;
  if not private.can_manage_character(p_character_id, auth.uid()) then
    raise exception 'Only GM or owner can change character life state';
  end if;

  update public.characters
  set life_state = p_life_state,
      died_at = case when p_life_state = 'dead' then coalesce(died_at, now()) else null end,
      updated_at = now()
  where id = p_character_id;
end;
$$;

revoke all on function public.set_character_life_state(uuid, text) from public, anon;
grant execute on function public.set_character_life_state(uuid, text) to authenticated;

-- A newly selected active PC can never be dead.
create or replace function public.set_campaign_active_character(
  p_campaign_id uuid,
  p_user_id uuid,
  p_character_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_character public.characters%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_manage_campaign(p_campaign_id, auth.uid()) then raise exception 'Only GM or owner can manage active characters'; end if;

  if p_character_id is not null then
    select * into v_character from public.characters c
    where c.id = p_character_id
      and c.campaign_id = p_campaign_id
      and c.assigned_user_id = p_user_id
      and c.character_type = 'pc';
    if v_character.id is null then raise exception 'Character is not assigned to this player'; end if;
    if v_character.life_state = 'dead' then raise exception 'Dead character cannot be active'; end if;
  end if;

  update public.campaign_members
  set active_character_id = p_character_id
  where campaign_id = p_campaign_id and user_id = p_user_id;
end;
$$;

revoke all on function public.set_campaign_active_character(uuid, uuid, uuid) from public, anon;
grant execute on function public.set_campaign_active_character(uuid, uuid, uuid) to authenticated;

-- Room permissions: personal owner, invited visitors, shared scene, managers.
create or replace function private.can_read_chat_room(
  p_room_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.chat_rooms r
    join public.campaign_members cm
      on cm.campaign_id = r.campaign_id
     and cm.user_id = p_user_id
    left join public.characters c on c.id = r.character_id
    where r.id = p_room_id
      and (
        r.room_type = 'flood'
        or cm.is_owner = true
        or cm.role = 'gm'
        or (r.room_type = 'scene' and r.open_to_campaign = true)
        or (r.room_type = 'character' and c.assigned_user_id = p_user_id)
        or exists (
          select 1 from public.chat_room_members crm
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
set search_path = ''
as $$
  select exists (
    select 1
    from public.chat_rooms r
    join public.campaign_members cm
      on cm.campaign_id = r.campaign_id
     and cm.user_id = p_user_id
    left join public.characters c on c.id = r.character_id
    where r.id = p_room_id
      and r.is_read_only = false
      and (
        r.room_type = 'flood'
        or cm.is_owner = true
        or cm.role = 'gm'
        or (r.room_type = 'scene' and r.open_to_campaign = true)
        or (r.room_type = 'character' and c.assigned_user_id = p_user_id)
        or exists (
          select 1 from public.chat_room_members crm
          where crm.room_id = r.id
            and crm.user_id = p_user_id
            and crm.can_write = true
        )
      )
  );
$$;

-- Shared scenes are a different entity from personal character rooms.
drop function if exists public.create_campaign_chat_room(uuid, text);
create function public.create_campaign_chat_room(
  p_campaign_id uuid,
  p_title text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_position integer;
  v_slug text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_manage_campaign(p_campaign_id, auth.uid()) then raise exception 'Only GM or owner can create scenes'; end if;
  if length(trim(coalesce(p_title, ''))) = 0 then raise exception 'Scene title is required'; end if;

  select coalesce(max(position), 0) + 10 into v_position
  from public.chat_rooms
  where campaign_id = p_campaign_id and room_type = 'scene';

  v_slug := 'scene-' || replace(gen_random_uuid()::text, '-', '');
  insert into public.chat_rooms(
    campaign_id, slug, title, category, position,
    room_type, open_to_campaign, is_read_only
  ) values (
    p_campaign_id, v_slug, trim(p_title), 'game', v_position,
    'scene', true, false
  ) returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_campaign_chat_room(uuid, text) from public, anon;
grant execute on function public.create_campaign_chat_room(uuid, text) to authenticated;

-- Null actor for a manager means the GM/owner identity. Explicit character_id means PC/NPC.
create or replace function public.set_chat_message_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign_id uuid;
  v_role text;
  v_is_owner boolean;
  v_player_name text;
  v_active_character_id uuid;
  v_character public.characters%rowtype;
  v_bound boolean := false;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select r.campaign_id, cm.role, cm.is_owner, cm.active_character_id, p.display_name
    into v_campaign_id, v_role, v_is_owner, v_active_character_id, v_player_name
  from public.chat_rooms r
  join public.campaign_members cm on cm.campaign_id = r.campaign_id and cm.user_id = auth.uid()
  join public.profiles p on p.user_id = auth.uid()
  where r.id = new.room_id;

  if v_campaign_id is null then raise exception 'Campaign membership required'; end if;

  if new.character_id is not null then
    select * into v_character from public.characters c
    where c.id = new.character_id and c.campaign_id = v_campaign_id;
    if v_character.id is null then raise exception 'Character is unavailable in this campaign'; end if;
    if v_character.life_state = 'dead' then raise exception 'Dead character cannot act in chat'; end if;

    select exists(
      select 1 from public.chat_actor_bindings b
      where b.user_id = auth.uid()
        and b.character_id = v_character.id
        and b.campaign_id = v_campaign_id
    ) into v_bound;

    if not v_bound and not (
      v_character.character_type = 'pc'
      and v_character.assigned_user_id = auth.uid()
      and v_active_character_id = v_character.id
    ) then raise exception 'This character is not available as your chat actor'; end if;

    new.user_id := auth.uid();
    new.client_id := auth.uid();
    new.character_id := v_character.id;
    new.author_name := v_character.name;
    new.author_avatar_url := v_character.avatar_url;
    return new;
  end if;

  new.user_id := auth.uid();
  new.client_id := auth.uid();

  if v_is_owner then
    new.character_id := null;
    new.author_name := 'Владелец (' || v_player_name || ')';
    new.author_avatar_url := null;
    return new;
  end if;

  if v_role = 'gm' then
    new.character_id := null;
    new.author_name := 'ГМ (' || v_player_name || ')';
    new.author_avatar_url := null;
    return new;
  end if;

  if v_active_character_id is not null then
    select * into v_character from public.characters c
    where c.id = v_active_character_id
      and c.campaign_id = v_campaign_id
      and c.assigned_user_id = auth.uid()
      and c.character_type = 'pc'
      and c.life_state = 'alive';
  end if;

  if v_character.id is not null then
    new.character_id := v_character.id;
    new.author_name := v_character.name;
    new.author_avatar_url := v_character.avatar_url;
    return new;
  end if;

  raise exception 'Active living character must be assigned by GM or owner';
end;
$$;

-- Chronicle events for world locations: every meaningful create/edit remains in history.
create or replace function private.append_location_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign_id uuid;
  v_name text;
  v_summary text;
  v_image text;
  v_title text;
begin
  if tg_op = 'DELETE' then
    v_campaign_id := old.campaign_id;
    v_name := old.name;
    v_summary := old.summary;
    v_image := old.image_url;
    v_title := 'Удалена зона: ' || old.name;
  elsif tg_op = 'INSERT' then
    v_campaign_id := new.campaign_id;
    v_name := new.name;
    v_summary := new.summary;
    v_image := new.image_url;
    v_title := 'Открыта зона: ' || new.name;
  else
    if old.name is not distinct from new.name
       and old.summary is not distinct from new.summary
       and old.image_url is not distinct from new.image_url
       and old.parent_location_id is not distinct from new.parent_location_id then
      return new;
    end if;
    v_campaign_id := new.campaign_id;
    v_name := new.name;
    v_summary := new.summary;
    v_image := new.image_url;
    v_title := 'Обновлена зона: ' || new.name;
  end if;

  insert into public.feed_items(
    campaign_id, source_type, source_id, created_by,
    title, body, media_url, published_at, updated_at
  ) values (
    v_campaign_id, 'update', gen_random_uuid(), auth.uid(),
    v_title, coalesce(v_summary, ''), v_image, now(), now()
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists location_history_append on public.locations;
create trigger location_history_append
after insert or update or delete on public.locations
for each row execute function private.append_location_history();

-- Rich room list used by the game client.
drop function if exists public.get_campaign_chat_rooms(uuid);
create function public.get_campaign_chat_rooms(p_campaign_id uuid)
returns table (
  id uuid,
  slug text,
  title text,
  category text,
  room_type text,
  room_position integer,
  avatar_url text,
  character_id uuid,
  character_life_state text,
  open_to_campaign boolean,
  is_read_only boolean,
  preview text,
  last_message_at timestamptz,
  last_message_id bigint,
  unread_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id,
    r.slug,
    r.title,
    r.category,
    r.room_type,
    r.position,
    coalesce(r.avatar_url, c.avatar_url),
    r.character_id,
    c.life_state,
    r.open_to_campaign,
    r.is_read_only,
    case
      when r.is_read_only and r.room_type = 'character' and c.life_state = 'dead' then 'История завершена · только чтение'
      when lm.id is null and r.room_type = 'flood' then 'Общий разговор кампании'
      when lm.id is null and r.room_type = 'character' then 'Персональная игровая история'
      when lm.id is null and r.room_type = 'scene' then 'Общая игровая сцена'
      when lm.event_kind = 'roll' then lm.author_name || ': бросок · ' || coalesce(lm.event_payload->>'label','кубики')
      when lm.event_kind = 'spell' then lm.author_name || ': ✦ ' || coalesce(lm.event_payload->>'label','заклинание')
      when lm.event_kind = 'action' then lm.author_name || ': ' || coalesce(lm.event_payload->>'label','действие')
      else lm.author_name || ': ' || lm.body
    end,
    lm.created_at,
    lm.id,
    coalesce(unread.value, 0)::integer
  from public.chat_rooms r
  left join public.characters c on c.id = r.character_id
  left join public.chat_read_states rs on rs.room_id = r.id and rs.user_id = auth.uid()
  left join lateral (
    select m.id, m.author_name, m.body, m.created_at, m.event_kind, m.event_payload
    from public.chat_messages m
    where m.room_id = r.id
    order by m.id desc
    limit 1
  ) lm on true
  left join lateral (
    select count(*) value
    from public.chat_messages m
    where m.room_id = r.id
      and m.id > coalesce(rs.last_read_message_id, 0)
      and m.user_id is distinct from auth.uid()
  ) unread on true
  where r.campaign_id = p_campaign_id
    and private.can_read_chat_room(r.id, auth.uid())
  order by
    case r.room_type when 'flood' then 0 when 'character' then 1 else 2 end,
    r.position asc,
    r.created_at asc;
$$;

revoke all on function public.get_campaign_chat_rooms(uuid) from public, anon;
grant execute on function public.get_campaign_chat_rooms(uuid) to authenticated;

commit;
