create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (char_length(trim(display_name)) between 2 and 40)
);

create unique index if not exists profiles_display_name_unique_ci
  on public.profiles (lower(trim(display_name)));

create table if not exists public.campaign_members (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'player',
  created_at timestamptz not null default now(),
  primary key (campaign_id, user_id),
  constraint campaign_members_role_check check (role in ('gm', 'player'))
);

alter table public.chat_messages
  add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table public.profiles enable row level security;
alter table public.campaign_members enable row level security;
alter table public.campaigns enable row level security;
alter table public.chat_rooms enable row level security;
alter table public.chat_messages enable row level security;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

create or replace function public.add_demo_membership_for_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.campaign_members (campaign_id, user_id, role)
  select c.id, new.user_id, 'player'
  from public.campaigns c
  where c.slug = 'demo'
  on conflict (campaign_id, user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists profiles_add_demo_membership on public.profiles;
create trigger profiles_add_demo_membership
after insert on public.profiles
for each row execute function public.add_demo_membership_for_profile();

create or replace function public.set_chat_message_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select p.display_name
  into v_name
  from public.profiles p
  where p.user_id = auth.uid();

  if v_name is null then
    raise exception 'Profile required';
  end if;

  new.user_id := auth.uid();
  new.client_id := auth.uid();
  new.author_name := v_name;
  return new;
end;
$$;

drop trigger if exists chat_messages_set_identity on public.chat_messages;
create trigger chat_messages_set_identity
before insert on public.chat_messages
for each row execute function public.set_chat_message_identity();

-- Remove the temporary public development policies.
drop policy if exists dev_public_read_campaigns on public.campaigns;
drop policy if exists dev_public_read_rooms on public.chat_rooms;
drop policy if exists dev_public_read_messages on public.chat_messages;
drop policy if exists dev_public_insert_messages on public.chat_messages;

-- Profiles: a signed-in user can read and edit only their own profile.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles for select
to authenticated
using (user_id = auth.uid());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
on public.profiles for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Memberships: users can see their own campaign memberships.
drop policy if exists campaign_members_select_own on public.campaign_members;
create policy campaign_members_select_own
on public.campaign_members for select
to authenticated
using (user_id = auth.uid());

-- Campaign data is visible only to members.
drop policy if exists campaigns_member_read on public.campaigns;
create policy campaigns_member_read
on public.campaigns for select
to authenticated
using (
  exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id = campaigns.id
      and cm.user_id = auth.uid()
  )
);

drop policy if exists chat_rooms_member_read on public.chat_rooms;
create policy chat_rooms_member_read
on public.chat_rooms for select
to authenticated
using (
  exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id = chat_rooms.campaign_id
      and cm.user_id = auth.uid()
  )
);

-- Messages are visible only to campaign members.
drop policy if exists chat_messages_member_read on public.chat_messages;
create policy chat_messages_member_read
on public.chat_messages for select
to authenticated
using (
  exists (
    select 1
    from public.chat_rooms r
    join public.campaign_members cm on cm.campaign_id = r.campaign_id
    where r.id = chat_messages.room_id
      and cm.user_id = auth.uid()
  )
);

-- The trigger fills user_id/client_id/author_name from the authenticated profile.
drop policy if exists chat_messages_member_insert on public.chat_messages;
create policy chat_messages_member_insert
on public.chat_messages for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.chat_rooms r
    join public.campaign_members cm on cm.campaign_id = r.campaign_id
    where r.id = chat_messages.room_id
      and cm.user_id = auth.uid()
  )
);
