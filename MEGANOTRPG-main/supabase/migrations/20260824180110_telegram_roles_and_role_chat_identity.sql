create table if not exists public.telegram_identities (
  user_id uuid primary key references auth.users(id) on delete cascade,
  telegram_user_id bigint not null unique,
  username text,
  first_name text not null default '',
  last_name text,
  photo_url text,
  updated_at timestamptz not null default now()
);

alter table public.telegram_identities enable row level security;

drop policy if exists telegram_identities_campaign_read on public.telegram_identities;
create policy telegram_identities_campaign_read
on public.telegram_identities
for select
to authenticated
using (
  user_id = auth.uid()
  or private.shares_campaign(user_id)
);

grant select on public.telegram_identities to authenticated;

insert into public.telegram_identities (
  user_id,
  telegram_user_id,
  username,
  first_name,
  last_name,
  photo_url,
  updated_at
)
select
  u.id,
  (u.raw_user_meta_data ->> 'telegram_id')::bigint,
  nullif(u.raw_user_meta_data ->> 'telegram_username', ''),
  coalesce(u.raw_user_meta_data ->> 'telegram_first_name', ''),
  nullif(u.raw_user_meta_data ->> 'telegram_last_name', ''),
  nullif(u.raw_user_meta_data ->> 'telegram_photo_url', ''),
  now()
from auth.users u
where u.raw_user_meta_data ->> 'auth_source' = 'telegram'
  and coalesce(u.raw_user_meta_data ->> 'telegram_id', '') ~ '^[0-9]+$'
on conflict (user_id) do update set
  telegram_user_id = excluded.telegram_user_id,
  username = excluded.username,
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  photo_url = excluded.photo_url,
  updated_at = now();

create or replace function public.set_demo_member_role(
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_role not in ('gm', 'player') then
    raise exception 'Unsupported role';
  end if;

  select id into v_campaign_id
  from public.campaigns
  where slug = 'demo';

  if v_campaign_id is null then
    raise exception 'Demo campaign not found';
  end if;

  if not exists (
    select 1
    from public.campaign_members
    where campaign_id = v_campaign_id
      and user_id = auth.uid()
      and is_owner = true
  ) then
    raise exception 'Only campaign owner can change roles';
  end if;

  if not exists (
    select 1
    from public.campaign_members
    where campaign_id = v_campaign_id
      and user_id = p_user_id
  ) then
    raise exception 'Target user is not a campaign member';
  end if;

  if exists (
    select 1
    from public.campaign_members
    where campaign_id = v_campaign_id
      and user_id = p_user_id
      and is_owner = true
  ) then
    raise exception 'Owner is a separate role and cannot be changed here';
  end if;

  if p_role = 'gm' then
    update public.campaign_members
    set role = 'player'
    where campaign_id = v_campaign_id
      and role = 'gm'
      and user_id <> p_user_id;
  end if;

  update public.campaign_members
  set role = p_role
  where campaign_id = v_campaign_id
    and user_id = p_user_id;
end;
$$;

grant execute on function public.set_demo_member_role(uuid, text) to authenticated;

create or replace function public.set_demo_gm(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.set_demo_member_role(p_user_id, 'gm');
end;
$$;

grant execute on function public.set_demo_gm(uuid) to authenticated;

create or replace function public.set_chat_message_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_character_id uuid;
  v_character_name text;
  v_player_name text;
  v_avatar_url text;
  v_role text;
  v_is_owner boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select cm.role, cm.is_owner, p.display_name
    into v_role, v_is_owner, v_player_name
  from public.chat_rooms r
  join public.campaign_members cm
    on cm.campaign_id = r.campaign_id
   and cm.user_id = auth.uid()
  join public.profiles p
    on p.user_id = auth.uid()
  where r.id = new.room_id;

  if v_player_name is null then
    raise exception 'Campaign membership required';
  end if;

  select c.id, c.name, c.avatar_url
    into v_character_id, v_character_name, v_avatar_url
  from public.chat_rooms r
  join public.campaign_members cm
    on cm.campaign_id = r.campaign_id
   and cm.user_id = auth.uid()
  join public.characters c
    on c.id = cm.active_character_id
   and c.campaign_id = r.campaign_id
   and c.assigned_user_id = auth.uid()
  where r.id = new.room_id;

  new.user_id := auth.uid();
  new.client_id := auth.uid();

  if v_character_id is not null then
    new.character_id := v_character_id;
    new.author_name := v_character_name || ' (' || v_player_name || ')';
    new.author_avatar_url := v_avatar_url;
    return new;
  end if;

  if v_is_owner then
    new.character_id := null;
    new.author_name := 'Владелец (' || v_player_name || ')';
    new.author_avatar_url := null;
    return new;
  end if;

  if v_role = 'gm' then
    new.character_id := null;
    new.author_name := 'GM (' || v_player_name || ')';
    new.author_avatar_url := null;
    return new;
  end if;

  raise exception 'Active character must be assigned by GM or owner';
end;
$$;
