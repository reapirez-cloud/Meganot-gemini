create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  character_class text not null default 'Персонаж' check (char_length(character_class) between 1 and 80),
  level integer not null default 1 check (level between 1 and 30),
  bio text not null default '' check (char_length(bio) <= 600),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists characters_campaign_idx on public.characters(campaign_id);
create index if not exists characters_owner_idx on public.characters(owner_user_id);

alter table public.campaign_members
  add column if not exists active_character_id uuid references public.characters(id) on delete set null;

alter table public.chat_messages
  add column if not exists character_id uuid references public.characters(id) on delete set null,
  add column if not exists author_avatar_url text;

alter table public.characters enable row level security;

drop policy if exists characters_campaign_read on public.characters;
create policy characters_campaign_read
on public.characters for select
to authenticated
using (
  exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id = characters.campaign_id
      and cm.user_id = auth.uid()
  )
);

drop policy if exists characters_owner_insert on public.characters;
create policy characters_owner_insert
on public.characters for insert
to authenticated
with check (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id = characters.campaign_id
      and cm.user_id = auth.uid()
  )
);

drop policy if exists characters_owner_update on public.characters;
create policy characters_owner_update
on public.characters for update
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

grant select, insert, update on public.characters to authenticated;
revoke all on public.characters from anon;

insert into public.characters (campaign_id, owner_user_id, name, character_class, level, bio)
select cm.campaign_id, cm.user_id, p.display_name, 'Персонаж', 1, ''
from public.campaign_members cm
join public.profiles p on p.user_id = cm.user_id
where not exists (
  select 1 from public.characters ch
  where ch.campaign_id = cm.campaign_id
    and ch.owner_user_id = cm.user_id
);

update public.campaign_members cm
set active_character_id = (
  select ch.id
  from public.characters ch
  where ch.campaign_id = cm.campaign_id
    and ch.owner_user_id = cm.user_id
  order by ch.created_at, ch.id
  limit 1
)
where cm.active_character_id is null
  and exists (
    select 1
    from public.characters ch
    where ch.campaign_id = cm.campaign_id
      and ch.owner_user_id = cm.user_id
  );

create or replace function public.validate_active_character()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.active_character_id is not null and not exists (
    select 1
    from public.characters ch
    where ch.id = new.active_character_id
      and ch.campaign_id = new.campaign_id
      and ch.owner_user_id = new.user_id
  ) then
    raise exception 'Active character must belong to this campaign member';
  end if;

  return new;
end;
$$;

revoke execute on function public.validate_active_character() from public, anon, authenticated;

drop trigger if exists campaign_members_validate_active_character on public.campaign_members;
create trigger campaign_members_validate_active_character
before insert or update of active_character_id on public.campaign_members
for each row execute function public.validate_active_character();

drop policy if exists campaign_members_update_own_active on public.campaign_members;
create policy campaign_members_update_own_active
on public.campaign_members for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

revoke update on public.campaign_members from authenticated;
grant update(active_character_id) on public.campaign_members to authenticated;

create or replace function public.set_chat_message_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_character public.characters%rowtype;
  v_campaign_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select r.campaign_id
  into v_campaign_id
  from public.chat_rooms r
  where r.id = new.room_id;

  if v_campaign_id is null then
    raise exception 'Room not found';
  end if;

  select ch.*
  into v_character
  from public.campaign_members cm
  join public.characters ch on ch.id = cm.active_character_id
  where cm.campaign_id = v_campaign_id
    and cm.user_id = auth.uid()
    and ch.owner_user_id = auth.uid()
    and ch.campaign_id = v_campaign_id;

  if v_character.id is null then
    raise exception 'Choose an active character before sending messages';
  end if;

  new.user_id := auth.uid();
  new.client_id := auth.uid();
  new.character_id := v_character.id;
  new.author_name := v_character.name;
  new.author_avatar_url := v_character.avatar_url;
  return new;
end;
$$;

revoke execute on function public.set_chat_message_identity() from public, anon, authenticated;

create or replace function public.add_demo_membership_for_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_id uuid;
  v_character_id uuid;
begin
  select c.id into v_campaign_id
  from public.campaigns c
  where c.slug = 'demo'
  limit 1;

  if v_campaign_id is null then
    return new;
  end if;

  insert into public.campaign_members (campaign_id, user_id, role)
  values (v_campaign_id, new.user_id, 'player')
  on conflict (campaign_id, user_id) do nothing;

  select ch.id into v_character_id
  from public.characters ch
  where ch.campaign_id = v_campaign_id
    and ch.owner_user_id = new.user_id
  order by ch.created_at, ch.id
  limit 1;

  if v_character_id is null then
    insert into public.characters (
      campaign_id, owner_user_id, name, character_class, level, bio
    ) values (
      v_campaign_id, new.user_id, new.display_name, 'Персонаж', 1, ''
    ) returning id into v_character_id;
  end if;

  update public.campaign_members
  set active_character_id = coalesce(active_character_id, v_character_id)
  where campaign_id = v_campaign_id
    and user_id = new.user_id;

  return new;
end;
$$;

revoke execute on function public.add_demo_membership_for_profile() from public, anon, authenticated;
