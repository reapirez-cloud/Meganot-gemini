begin;

-- World time is narrative and character-local: Day N + broad day period.
alter table public.character_world_state
  add column if not exists campaign_day integer not null default 1,
  add column if not exists day_period text not null default 'day';

alter table public.character_world_state
  drop constraint if exists character_world_state_campaign_day_check,
  add constraint character_world_state_campaign_day_check check (campaign_day >= 1),
  drop constraint if exists character_world_state_day_period_check,
  add constraint character_world_state_day_period_check
    check (day_period in ('dawn','morning','day','late_day','evening','night','deep_night'));

create index if not exists character_world_state_presence_idx
  on public.character_world_state(campaign_id, location_id, campaign_day, day_period)
  where location_id is not null;

-- Visibility modes are independent from the legacy campaign/private flag so old
-- clients stay compatible while the game gains per-character discoveries.
alter table public.characters add column if not exists visibility_mode text;
update public.characters
set visibility_mode = case
  when visibility = 'private' then 'private'
  when character_type = 'npc' then 'discover'
  else 'always'
end
where visibility_mode is null;

alter table public.characters
  alter column visibility_mode set not null,
  drop constraint if exists characters_visibility_mode_check,
  add constraint characters_visibility_mode_check
    check (visibility_mode in ('always','discover','private'));

create or replace function private.normalize_character_visibility_mode()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.visibility = 'private' then
    new.visibility_mode := 'private';
  elsif tg_op = 'INSERT' and new.visibility_mode is null then
    new.visibility_mode := case when new.character_type = 'npc' then 'discover' else 'always' end;
  elsif tg_op = 'UPDATE' and old.visibility = 'private' and new.visibility <> 'private'
        and new.visibility_mode = 'private' then
    new.visibility_mode := case when new.character_type = 'npc' then 'discover' else 'always' end;
  elsif new.visibility_mode is null then
    new.visibility_mode := case when new.character_type = 'npc' then 'discover' else 'always' end;
  end if;

  if new.visibility_mode = 'private' then new.visibility := 'private';
  elsif new.visibility = 'private' then new.visibility := 'campaign';
  end if;
  return new;
end;
$$;

drop trigger if exists characters_visibility_mode_normalize on public.characters;
create trigger characters_visibility_mode_normalize
before insert or update of character_type, visibility, visibility_mode on public.characters
for each row execute function private.normalize_character_visibility_mode();

-- Dynamic World visibility. Existing locations/links remain known; newly created
-- ones default to discovery-based visibility.
alter table public.locations
  add column if not exists visibility_mode text,
  add column if not exists lifecycle_state text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists archived_at timestamptz;
update public.locations set visibility_mode = 'always' where visibility_mode is null;
update public.locations set lifecycle_state = 'active' where lifecycle_state is null;
alter table public.locations
  alter column visibility_mode set default 'discover',
  alter column visibility_mode set not null,
  alter column lifecycle_state set default 'active',
  alter column lifecycle_state set not null,
  drop constraint if exists locations_visibility_mode_check,
  add constraint locations_visibility_mode_check check (visibility_mode in ('always','discover','private')),
  drop constraint if exists locations_lifecycle_state_check,
  add constraint locations_lifecycle_state_check check (lifecycle_state in ('active','archived'));

alter table public.location_links
  add column if not exists visibility_mode text,
  add column if not exists created_by uuid references auth.users(id) on delete set null;
update public.location_links set visibility_mode = 'always' where visibility_mode is null;
alter table public.location_links
  alter column visibility_mode set default 'discover',
  alter column visibility_mode set not null,
  drop constraint if exists location_links_visibility_mode_check,
  add constraint location_links_visibility_mode_check check (visibility_mode in ('always','discover','private'));

create or replace function private.stamp_world_creator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is null then new.created_by := auth.uid(); end if;
  return new;
end;
$$;

drop trigger if exists locations_stamp_creator on public.locations;
create trigger locations_stamp_creator before insert or update of visibility_mode on public.locations
for each row execute function private.stamp_world_creator();
drop trigger if exists location_links_stamp_creator on public.location_links;
create trigger location_links_stamp_creator before insert or update of visibility_mode on public.location_links
for each row execute function private.stamp_world_creator();

-- Knowledge belongs to a PC, never to the Telegram account.
create table if not exists public.character_location_discoveries (
  character_id uuid not null references public.characters(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  discovered_at timestamptz not null default now(),
  discovered_by uuid references auth.users(id) on delete set null,
  source text not null default 'manual',
  primary key(character_id, location_id)
);

create table if not exists public.character_npc_discoveries (
  character_id uuid not null references public.characters(id) on delete cascade,
  npc_character_id uuid not null references public.characters(id) on delete cascade,
  discovered_at timestamptz not null default now(),
  discovered_by uuid references auth.users(id) on delete set null,
  source text not null default 'manual',
  source_message_id bigint references public.chat_messages(id) on delete set null,
  last_interaction_at timestamptz not null default now(),
  primary key(character_id, npc_character_id),
  check (character_id <> npc_character_id)
);

create table if not exists public.character_location_link_discoveries (
  character_id uuid not null references public.characters(id) on delete cascade,
  location_link_id uuid not null references public.location_links(id) on delete cascade,
  discovered_at timestamptz not null default now(),
  discovered_by uuid references auth.users(id) on delete set null,
  source text not null default 'manual',
  primary key(character_id, location_link_id)
);

create index if not exists character_npc_discoveries_recent_idx
  on public.character_npc_discoveries(character_id, last_interaction_at desc);

alter table public.character_location_discoveries enable row level security;
alter table public.character_npc_discoveries enable row level security;
alter table public.character_location_link_discoveries enable row level security;
grant select, insert, update, delete on public.character_location_discoveries to authenticated;
grant select, insert, update, delete on public.character_npc_discoveries to authenticated;
grant select, insert, update, delete on public.character_location_link_discoveries to authenticated;

create or replace function private.can_read_character_knowledge(p_character_id uuid, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.characters c
    where c.id = p_character_id
      and private.is_campaign_member(c.campaign_id, p_user_id)
      and (
        c.assigned_user_id = p_user_id
        or private.can_manage_campaign(c.campaign_id, p_user_id)
      )
  );
$$;

revoke all on function private.can_read_character_knowledge(uuid, uuid) from public, anon;
grant execute on function private.can_read_character_knowledge(uuid, uuid) to authenticated, service_role;

-- Explicit policies, intentionally not relying on UI filtering.
drop policy if exists character_location_discoveries_read on public.character_location_discoveries;
create policy character_location_discoveries_read on public.character_location_discoveries
for select to authenticated using ((select private.can_read_character_knowledge(character_id)));
drop policy if exists character_location_discoveries_manage on public.character_location_discoveries;
create policy character_location_discoveries_manage on public.character_location_discoveries
for all to authenticated using ((select private.can_manage_character(character_id)))
with check ((select private.can_manage_character(character_id)));

drop policy if exists character_npc_discoveries_read on public.character_npc_discoveries;
create policy character_npc_discoveries_read on public.character_npc_discoveries
for select to authenticated using ((select private.can_read_character_knowledge(character_id)));
drop policy if exists character_npc_discoveries_manage on public.character_npc_discoveries;
create policy character_npc_discoveries_manage on public.character_npc_discoveries
for all to authenticated using ((select private.can_manage_character(character_id)))
with check ((select private.can_manage_character(character_id)));

drop policy if exists character_location_link_discoveries_read on public.character_location_link_discoveries;
create policy character_location_link_discoveries_read on public.character_location_link_discoveries
for select to authenticated using ((select private.can_read_character_knowledge(character_id)));
drop policy if exists character_location_link_discoveries_manage on public.character_location_link_discoveries;
create policy character_location_link_discoveries_manage on public.character_location_link_discoveries
for all to authenticated using ((select private.can_manage_character(character_id)))
with check ((select private.can_manage_character(character_id)));

-- Current active PC defines what a player knows. Managers see non-private game data;
-- a GM's private content remains visible only to its creator.
create or replace function private.active_character_for_user(p_campaign_id uuid, p_user_id uuid default auth.uid())
returns uuid language sql stable security definer set search_path = '' as $$
  select cm.active_character_id
  from public.campaign_members cm
  where cm.campaign_id = p_campaign_id and cm.user_id = p_user_id
  limit 1;
$$;

create or replace function private.can_view_character(p_character_id uuid, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.characters c
    where c.id = p_character_id
      and private.is_campaign_member(c.campaign_id, p_user_id)
      and (
        c.assigned_user_id = p_user_id
        or (c.visibility_mode = 'private' and c.created_by = p_user_id)
        or (c.visibility_mode <> 'private' and private.can_manage_campaign(c.campaign_id, p_user_id))
        or (
          c.character_type = 'pc'
          and c.visibility_mode <> 'private'
          and exists(
            select 1 from public.campaign_members owner_member
            where owner_member.campaign_id = c.campaign_id
              and owner_member.user_id = c.assigned_user_id
              and owner_member.active_character_id = c.id
          )
        )
        or (c.character_type = 'npc' and c.visibility_mode = 'always')
        or (
          c.character_type = 'npc' and c.visibility_mode = 'discover'
          and exists(
            select 1 from public.character_npc_discoveries d
            where d.character_id = private.active_character_for_user(c.campaign_id, p_user_id)
              and d.npc_character_id = c.id
          )
        )
      )
  );
$$;

create or replace function private.can_view_location(p_location_id uuid, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.locations l
    where l.id = p_location_id
      and private.is_campaign_member(l.campaign_id, p_user_id)
      and (
        (l.visibility_mode = 'private' and l.created_by = p_user_id)
        or (l.visibility_mode <> 'private' and private.can_manage_campaign(l.campaign_id, p_user_id))
        or l.visibility_mode = 'always'
        or (
          l.visibility_mode = 'discover'
          and exists(
            select 1 from public.character_location_discoveries d
            where d.character_id = private.active_character_for_user(l.campaign_id, p_user_id)
              and d.location_id = l.id
          )
        )
      )
  );
$$;

create or replace function private.can_view_location_link(p_link_id uuid, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1
    from public.location_links link
    join public.location_sections s on s.id = link.section_id
    join public.locations l on l.id = s.location_id
    where link.id = p_link_id
      and private.can_view_location(l.id, p_user_id)
      and private.can_view_location(link.target_location_id, p_user_id)
      and (
        (link.visibility_mode = 'private' and link.created_by = p_user_id)
        or (link.visibility_mode <> 'private' and private.can_manage_campaign(l.campaign_id, p_user_id))
        or link.visibility_mode = 'always'
        or (
          link.visibility_mode = 'discover'
          and exists(
            select 1 from public.character_location_link_discoveries d
            where d.character_id = private.active_character_for_user(l.campaign_id, p_user_id)
              and d.location_link_id = link.id
          )
        )
      )
  );
$$;

revoke all on function private.active_character_for_user(uuid, uuid) from public, anon;
revoke all on function private.can_view_location(uuid, uuid) from public, anon;
revoke all on function private.can_view_location_link(uuid, uuid) from public, anon;
grant execute on function private.active_character_for_user(uuid, uuid) to authenticated, service_role;
grant execute on function private.can_view_location(uuid, uuid) to authenticated, service_role;
grant execute on function private.can_view_location_link(uuid, uuid) to authenticated, service_role;

-- Replace permissive World policies with discovery-aware policies.
drop policy if exists locations_member_read on public.locations;
create policy locations_member_read on public.locations for select to authenticated
using ((select private.can_view_location(id)));

drop policy if exists location_sections_member_read on public.location_sections;
create policy location_sections_member_read on public.location_sections for select to authenticated
using ((select private.can_view_location(location_id)));

drop policy if exists location_links_member_read on public.location_links;
create policy location_links_member_read on public.location_links for select to authenticated
using ((select private.can_view_location_link(id)));

-- Entering a discovery-mode location unlocks it for that PC. Presence alone never
-- unlocks NPCs; NPCs are handled only by published dialogue below.
create or replace function private.discover_location_from_position()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_mode text;
begin
  if new.location_id is null then return new; end if;
  if tg_op = 'UPDATE' and old.location_id is not distinct from new.location_id then return new; end if;
  select l.visibility_mode into v_mode from public.locations l where l.id = new.location_id;
  if v_mode = 'discover' then
    insert into public.character_location_discoveries(character_id, location_id, discovered_by, source)
    values(new.character_id, new.location_id, auth.uid(), 'position')
    on conflict(character_id, location_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists character_world_state_discover_location on public.character_world_state;
create trigger character_world_state_discover_location
after insert or update of location_id on public.character_world_state
for each row execute function private.discover_location_from_position();

create or replace function public.set_character_world_position(
  p_character_id uuid,
  p_location_id uuid,
  p_campaign_day integer,
  p_day_period text
)
returns void language plpgsql security definer set search_path = '' as $$
declare v_campaign_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_campaign_day < 1 then raise exception 'Campaign day must be positive'; end if;
  if p_day_period not in ('dawn','morning','day','late_day','evening','night','deep_night') then raise exception 'Unsupported day period'; end if;
  select c.campaign_id into v_campaign_id from public.characters c where c.id = p_character_id;
  if v_campaign_id is null then raise exception 'Character not found'; end if;
  if not private.can_manage_character(p_character_id, auth.uid()) then raise exception 'Only GM or owner can move character'; end if;
  if p_location_id is not null and not exists(select 1 from public.locations l where l.id = p_location_id and l.campaign_id = v_campaign_id) then
    raise exception 'Location belongs to another campaign';
  end if;
  insert into public.character_world_state(character_id,campaign_id,location_id,campaign_day,day_period,updated_at,updated_by)
  values(p_character_id,v_campaign_id,p_location_id,p_campaign_day,p_day_period,now(),auth.uid())
  on conflict(character_id) do update set
    location_id=excluded.location_id,
    campaign_day=excluded.campaign_day,
    day_period=excluded.day_period,
    updated_at=now(),
    updated_by=auth.uid();
end;
$$;
revoke all on function public.set_character_world_position(uuid,uuid,integer,text) from public, anon;
grant execute on function public.set_character_world_position(uuid,uuid,integer,text) to authenticated;

create or replace function public.set_character_visibility_mode(p_character_id uuid, p_visibility_mode text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_visibility_mode not in ('always','discover','private') then raise exception 'Unsupported visibility mode'; end if;
  if not private.can_manage_character(p_character_id, auth.uid()) then raise exception 'Not allowed'; end if;
  update public.characters set
    visibility_mode=p_visibility_mode,
    visibility=case when p_visibility_mode='private' then 'private' else 'campaign' end,
    updated_at=now()
  where id=p_character_id;
end;
$$;
revoke all on function public.set_character_visibility_mode(uuid,text) from public, anon;
grant execute on function public.set_character_visibility_mode(uuid,text) to authenticated;

create or replace function public.set_world_discovery(
  p_character_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_discovered boolean default true
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_manage_character(p_character_id,auth.uid()) then raise exception 'Not allowed'; end if;
  if p_entity_type = 'location' then
    if p_discovered then
      insert into public.character_location_discoveries(character_id,location_id,discovered_by,source)
      values(p_character_id,p_entity_id,auth.uid(),'manual') on conflict do nothing;
    else delete from public.character_location_discoveries where character_id=p_character_id and location_id=p_entity_id;
    end if;
  elsif p_entity_type = 'npc' then
    if p_discovered then
      insert into public.character_npc_discoveries(character_id,npc_character_id,discovered_by,source,last_interaction_at)
      values(p_character_id,p_entity_id,auth.uid(),'manual',now())
      on conflict(character_id,npc_character_id) do update set last_interaction_at=excluded.last_interaction_at;
    else delete from public.character_npc_discoveries where character_id=p_character_id and npc_character_id=p_entity_id;
    end if;
  elsif p_entity_type = 'link' then
    if p_discovered then
      insert into public.character_location_link_discoveries(character_id,location_link_id,discovered_by,source)
      values(p_character_id,p_entity_id,auth.uid(),'manual') on conflict do nothing;
    else delete from public.character_location_link_discoveries where character_id=p_character_id and location_link_id=p_entity_id;
    end if;
  else raise exception 'Unsupported discovery type';
  end if;
end;
$$;
revoke all on function public.set_world_discovery(uuid,text,uuid,boolean) from public, anon;
grant execute on function public.set_world_discovery(uuid,text,uuid,boolean) to authenticated;

-- Scene position and room lifecycle/access.
alter table public.chat_rooms
  add column if not exists room_state text not null default 'open',
  add column if not exists campaign_can_write boolean not null default false,
  add column if not exists location_id uuid references public.locations(id) on delete set null,
  add column if not exists campaign_day integer not null default 1,
  add column if not exists day_period text not null default 'day',
  add column if not exists scene_state text not null default 'active',
  add column if not exists closed_at timestamptz;

update public.chat_rooms set campaign_can_write = true
where room_type in ('scene','flood') and open_to_campaign = true and is_read_only = false;

alter table public.chat_rooms
  drop constraint if exists chat_rooms_room_state_check,
  add constraint chat_rooms_room_state_check check(room_state in ('open','gm_only','closed')),
  drop constraint if exists chat_rooms_scene_state_check,
  add constraint chat_rooms_scene_state_check check(scene_state in ('active','closed')),
  drop constraint if exists chat_rooms_campaign_day_check,
  add constraint chat_rooms_campaign_day_check check(campaign_day >= 1),
  drop constraint if exists chat_rooms_day_period_check,
  add constraint chat_rooms_day_period_check check(day_period in ('dawn','morning','day','late_day','evening','night','deep_night'));

create table if not exists public.scene_participants(
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  added_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key(room_id,character_id)
);
alter table public.scene_participants enable row level security;
grant select,insert,delete on public.scene_participants to authenticated;

drop policy if exists scene_participants_read on public.scene_participants;
create policy scene_participants_read on public.scene_participants for select to authenticated
using ((select private.can_read_chat_room(room_id)));
drop policy if exists scene_participants_manage on public.scene_participants;
create policy scene_participants_manage on public.scene_participants for all to authenticated
using (exists(select 1 from public.chat_rooms r where r.id=room_id and (select private.can_manage_campaign(r.campaign_id))))
with check (exists(select 1 from public.chat_rooms r where r.id=room_id and (select private.can_manage_campaign(r.campaign_id))));

create or replace function private.can_write_chat_room(p_room_id uuid,p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.chat_rooms r
    join public.campaign_members cm on cm.campaign_id=r.campaign_id and cm.user_id=p_user_id
    left join public.characters c on c.id=r.character_id
    where r.id=p_room_id
      and r.is_read_only=false
      and r.room_state<>'closed'
      and (
        (cm.is_owner=true or cm.role='gm')
        or (
          r.room_state='open' and (
            r.room_type='flood'
            or (r.room_type='scene' and r.campaign_can_write=true)
            or (r.room_type='character' and c.assigned_user_id=p_user_id)
            or exists(select 1 from public.chat_room_members crm where crm.room_id=r.id and crm.user_id=p_user_id and crm.can_write=true)
          )
        )
      )
  );
$$;

create or replace function public.set_chat_room_state(p_room_id uuid,p_state text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_campaign_id uuid;
begin
  if p_state not in ('open','gm_only','closed') then raise exception 'Unsupported room state'; end if;
  select campaign_id into v_campaign_id from public.chat_rooms where id=p_room_id;
  if not private.can_manage_campaign(v_campaign_id,auth.uid()) then raise exception 'Not allowed'; end if;
  update public.chat_rooms set room_state=p_state,
    closed_at=case when p_state='closed' then now() else null end,
    scene_state=case when room_type='scene' and p_state='closed' then 'closed' when room_type='scene' then 'active' else scene_state end,
    updated_at=now()
  where id=p_room_id;
end;
$$;

create or replace function public.set_chat_room_campaign_access(p_room_id uuid,p_can_read boolean,p_can_write boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_campaign_id uuid;
begin
  select campaign_id into v_campaign_id from public.chat_rooms where id=p_room_id;
  if not private.can_manage_campaign(v_campaign_id,auth.uid()) then raise exception 'Not allowed'; end if;
  update public.chat_rooms set open_to_campaign=p_can_read or p_can_write,
    campaign_can_write=p_can_write,
    room_state=case when p_can_write then 'open' else room_state end,
    updated_at=now()
  where id=p_room_id and room_type<>'flood';
end;
$$;

create or replace function public.set_scene_position(p_room_id uuid,p_location_id uuid,p_campaign_day integer,p_day_period text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_campaign_id uuid;
begin
  if p_campaign_day<1 or p_day_period not in ('dawn','morning','day','late_day','evening','night','deep_night') then raise exception 'Invalid scene time'; end if;
  select campaign_id into v_campaign_id from public.chat_rooms where id=p_room_id and room_type='scene';
  if v_campaign_id is null or not private.can_manage_campaign(v_campaign_id,auth.uid()) then raise exception 'Not allowed'; end if;
  if p_location_id is not null and not exists(select 1 from public.locations where id=p_location_id and campaign_id=v_campaign_id) then raise exception 'Location belongs to another campaign'; end if;
  update public.chat_rooms set location_id=p_location_id,campaign_day=p_campaign_day,day_period=p_day_period,updated_at=now() where id=p_room_id;
end;
$$;

create or replace function public.set_scene_participants(p_room_id uuid,p_character_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_campaign_id uuid;
begin
  select campaign_id into v_campaign_id from public.chat_rooms where id=p_room_id and room_type='scene';
  if v_campaign_id is null or not private.can_manage_campaign(v_campaign_id,auth.uid()) then raise exception 'Not allowed'; end if;
  if exists(select 1 from unnest(coalesce(p_character_ids,'{}'::uuid[])) x(id) left join public.characters c on c.id=x.id and c.campaign_id=v_campaign_id where c.id is null) then raise exception 'Participant belongs to another campaign'; end if;
  delete from public.scene_participants where room_id=p_room_id;
  insert into public.scene_participants(room_id,character_id,added_by)
  select p_room_id,x.id,auth.uid() from unnest(coalesce(p_character_ids,'{}'::uuid[])) x(id)
  on conflict do nothing;
end;
$$;

create or replace function public.sync_scene_participants(p_room_id uuid,p_sync_location boolean default true,p_sync_time boolean default true)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_room public.chat_rooms%rowtype; v_count integer:=0;
begin
  select * into v_room from public.chat_rooms where id=p_room_id and room_type='scene';
  if v_room.id is null or not private.can_manage_campaign(v_room.campaign_id,auth.uid()) then raise exception 'Not allowed'; end if;
  insert into public.character_world_state(character_id,campaign_id,location_id,campaign_day,day_period,updated_at,updated_by)
  select p.character_id,v_room.campaign_id,
    case when p_sync_location then v_room.location_id else ws.location_id end,
    case when p_sync_time then v_room.campaign_day else coalesce(ws.campaign_day,1) end,
    case when p_sync_time then v_room.day_period else coalesce(ws.day_period,'day') end,
    now(),auth.uid()
  from public.scene_participants p
  left join public.character_world_state ws on ws.character_id=p.character_id
  where p.room_id=p_room_id
  on conflict(character_id) do update set
    location_id=case when p_sync_location then excluded.location_id else public.character_world_state.location_id end,
    campaign_day=case when p_sync_time then excluded.campaign_day else public.character_world_state.campaign_day end,
    day_period=case when p_sync_time then excluded.day_period else public.character_world_state.day_period end,
    updated_at=now(),updated_by=auth.uid();
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

revoke all on function public.set_chat_room_state(uuid,text) from public,anon;
revoke all on function public.set_chat_room_campaign_access(uuid,boolean,boolean) from public,anon;
revoke all on function public.set_scene_position(uuid,uuid,integer,text) from public,anon;
revoke all on function public.set_scene_participants(uuid,uuid[]) from public,anon;
revoke all on function public.sync_scene_participants(uuid,boolean,boolean) from public,anon;
grant execute on function public.set_chat_room_state(uuid,text) to authenticated;
grant execute on function public.set_chat_room_campaign_access(uuid,boolean,boolean) to authenticated;
grant execute on function public.set_scene_position(uuid,uuid,integer,text) to authenticated;
grant execute on function public.set_scene_participants(uuid,uuid[]) to authenticated;
grant execute on function public.sync_scene_participants(uuid,boolean,boolean) to authenticated;

-- Only an actually published, non-empty NPC line creates NPC knowledge.
create or replace function private.discover_npc_from_published_message()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_npc public.characters%rowtype; v_room public.chat_rooms%rowtype;
begin
  if new.character_id is null or nullif(trim(coalesce(new.body,'')),'') is null then return new; end if;
  select * into v_npc from public.characters where id=new.character_id and character_type='npc';
  if v_npc.id is null or v_npc.visibility_mode<>'discover' then return new; end if;
  select * into v_room from public.chat_rooms where id=new.room_id;
  if v_room.id is null or v_room.room_type='flood' or not private.can_manage_campaign(v_room.campaign_id,new.user_id) then return new; end if;

  if v_room.room_type='character' and v_room.character_id is not null then
    insert into public.character_npc_discoveries(character_id,npc_character_id,discovered_by,source,source_message_id,last_interaction_at)
    values(v_room.character_id,v_npc.id,new.user_id,'npc_dialogue',new.id,now())
    on conflict(character_id,npc_character_id) do update set source_message_id=excluded.source_message_id,last_interaction_at=now();
  elsif v_room.room_type='scene' then
    insert into public.character_npc_discoveries(character_id,npc_character_id,discovered_by,source,source_message_id,last_interaction_at)
    select p.character_id,v_npc.id,new.user_id,'npc_dialogue',new.id,now()
    from public.scene_participants p
    join public.characters pc on pc.id=p.character_id and pc.character_type='pc'
    where p.room_id=v_room.id
    on conflict(character_id,npc_character_id) do update set source_message_id=excluded.source_message_id,last_interaction_at=now();
  end if;
  return new;
end;
$$;

drop trigger if exists chat_message_discover_npc on public.chat_messages;
create trigger chat_message_discover_npc
after insert on public.chat_messages
for each row execute function private.discover_npc_from_published_message();

-- Stop automatically publishing every tiny World edit. Chronicle publication becomes intentional.
drop trigger if exists location_history_append on public.locations;
create or replace function public.publish_location_chronicle_event(p_location_id uuid,p_event text default 'updated')
returns void language plpgsql security definer set search_path = '' as $$
declare v_location public.locations%rowtype; v_title text;
begin
  select * into v_location from public.locations where id=p_location_id;
  if v_location.id is null or not private.can_manage_campaign(v_location.campaign_id,auth.uid()) then raise exception 'Not allowed'; end if;
  v_title := case p_event when 'opened' then 'Открыта зона: ' when 'destroyed' then 'Изменена зона: ' else 'Обновлена зона: ' end || v_location.name;
  insert into public.feed_items(campaign_id,source_type,source_id,created_by,title,body,media_url,published_at,updated_at)
  values(v_location.campaign_id,'update',gen_random_uuid(),auth.uid(),v_title,coalesce(v_location.summary,''),v_location.image_url,now(),now());
end;
$$;
revoke all on function public.publish_location_chronicle_event(uuid,text) from public,anon;
grant execute on function public.publish_location_chronicle_event(uuid,text) to authenticated;

-- Enriched room list. Own personal room is always immediately below Flood.
drop function if exists public.get_campaign_chat_rooms(uuid);
create function public.get_campaign_chat_rooms(p_campaign_id uuid)
returns table(
  id uuid, slug text, title text, category text, room_type text, room_position integer,
  avatar_url text, character_id uuid, character_life_state text, open_to_campaign boolean,
  is_read_only boolean, room_state text, campaign_can_write boolean, location_id uuid,
  campaign_day integer, day_period text, scene_state text, is_own_character_room boolean,
  preview text, last_message_at timestamptz, last_message_id bigint, unread_count integer
)
language sql stable security definer set search_path = '' as $$
  select r.id,r.slug,r.title,r.category,r.room_type,r.position,
    coalesce(r.avatar_url,c.avatar_url),r.character_id,c.life_state,r.open_to_campaign,r.is_read_only,
    r.room_state,r.campaign_can_write,r.location_id,r.campaign_day,r.day_period,r.scene_state,
    (r.room_type='character' and c.assigned_user_id=auth.uid()) as is_own_character_room,
    case
      when r.room_type='character' and c.life_state='dead' then 'Мёртв · история доступна для чтения'
      when r.room_state='closed' then 'Сцена закрыта · история сохранена'
      when r.room_state='gm_only' then 'Только ГМ пишет'
      when lm.id is null and r.room_type='flood' then 'Общий разговор кампании'
      when lm.id is null and r.room_type='character' then 'Персональная игровая история'
      when lm.id is null then 'Общая игровая сцена'
      when lm.event_kind='roll' then lm.author_name||': бросок · '||coalesce(lm.event_payload->>'label','кубики')
      when lm.event_kind='spell' then lm.author_name||': ✦ '||coalesce(lm.event_payload->>'label','заклинание')
      when lm.event_kind='action' then lm.author_name||': '||coalesce(lm.event_payload->>'label','действие')
      else lm.author_name||': '||lm.body end,
    lm.created_at,lm.id,coalesce(unread.value,0)::integer
  from public.chat_rooms r
  left join public.characters c on c.id=r.character_id
  left join public.chat_read_states rs on rs.room_id=r.id and rs.user_id=auth.uid()
  left join lateral(select m.id,m.author_name,m.body,m.created_at,m.event_kind,m.event_payload from public.chat_messages m where m.room_id=r.id order by m.id desc limit 1) lm on true
  left join lateral(select count(*) value from public.chat_messages m where m.room_id=r.id and m.id>coalesce(rs.last_read_message_id,0) and m.user_id is distinct from auth.uid()) unread on true
  where r.campaign_id=p_campaign_id and private.can_read_chat_room(r.id,auth.uid())
  order by case when r.room_type='flood' then 0 when r.room_type='character' and c.assigned_user_id=auth.uid() then 1 when r.room_type='scene' and r.scene_state='active' then 2 else 3 end,
    r.position,r.created_at;
$$;
revoke all on function public.get_campaign_chat_rooms(uuid) from public,anon;
grant execute on function public.get_campaign_chat_rooms(uuid) to authenticated;

commit;
