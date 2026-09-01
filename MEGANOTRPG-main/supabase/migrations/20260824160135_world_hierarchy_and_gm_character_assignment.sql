create schema if not exists private;

create or replace function private.is_campaign_member(p_campaign_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.campaign_members cm
    where cm.campaign_id = p_campaign_id
      and cm.user_id = p_user_id
  );
$$;

create or replace function private.is_campaign_gm(p_campaign_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.campaign_members cm
    where cm.campaign_id = p_campaign_id
      and cm.user_id = p_user_id
      and cm.role = 'gm'
  );
$$;

create or replace function private.shares_campaign(p_other_user_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.campaign_members mine
    join public.campaign_members theirs
      on theirs.campaign_id = mine.campaign_id
    where mine.user_id = p_user_id
      and theirs.user_id = p_other_user_id
  );
$$;

revoke all on schema private from public;
grant usage on schema private to authenticated;
revoke all on function private.is_campaign_member(uuid, uuid) from public, anon;
revoke all on function private.is_campaign_gm(uuid, uuid) from public, anon;
revoke all on function private.shares_campaign(uuid, uuid) from public, anon;
grant execute on function private.is_campaign_member(uuid, uuid) to authenticated;
grant execute on function private.is_campaign_gm(uuid, uuid) to authenticated;
grant execute on function private.shares_campaign(uuid, uuid) to authenticated;

-- Bootstrap helper for the current demo campaign. It can only succeed while the campaign has no GM.
create or replace function public.claim_demo_gm()
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

  select id into v_campaign_id
  from public.campaigns
  where slug = 'demo';

  if v_campaign_id is null then
    raise exception 'Demo campaign not found';
  end if;

  if exists (
    select 1 from public.campaign_members
    where campaign_id = v_campaign_id and role = 'gm'
  ) then
    raise exception 'GM already exists';
  end if;

  update public.campaign_members
  set role = 'gm'
  where campaign_id = v_campaign_id
    and user_id = auth.uid();

  if not found then
    raise exception 'You are not a campaign member';
  end if;
end;
$$;
revoke all on function public.claim_demo_gm() from public, anon;
grant execute on function public.claim_demo_gm() to authenticated;

-- Campaign title can be edited by GM.
drop policy if exists campaigns_gm_update on public.campaigns;
create policy campaigns_gm_update
on public.campaigns
for update
to authenticated
using (private.is_campaign_gm(id))
with check (private.is_campaign_gm(id));

-- Members: everyone in a campaign may see the roster; only GM may update assignments/roles.
drop policy if exists campaign_members_select_own on public.campaign_members;
drop policy if exists campaign_members_update_own_active on public.campaign_members;
drop policy if exists campaign_members_member_read on public.campaign_members;
drop policy if exists campaign_members_gm_update on public.campaign_members;
create policy campaign_members_member_read
on public.campaign_members
for select
to authenticated
using (private.is_campaign_member(campaign_id));
create policy campaign_members_gm_update
on public.campaign_members
for update
to authenticated
using (private.is_campaign_gm(campaign_id))
with check (private.is_campaign_gm(campaign_id));

-- Players can see names of campaign mates. Each player still edits only their own profile.
drop policy if exists profiles_campaign_member_read on public.profiles;
create policy profiles_campaign_member_read
on public.profiles
for select
to authenticated
using (private.shares_campaign(user_id));

-- Characters are now created/assigned by GM, not by players.
alter table public.characters rename column owner_user_id to assigned_user_id;
alter table public.characters alter column assigned_user_id drop not null;

drop policy if exists characters_owner_insert on public.characters;
drop policy if exists characters_owner_update on public.characters;
drop policy if exists characters_gm_write on public.characters;
create policy characters_gm_write
on public.characters
for all
to authenticated
using (private.is_campaign_gm(campaign_id))
with check (private.is_campaign_gm(campaign_id));

-- Location hierarchy.
alter table public.locations
  add column if not exists parent_location_id uuid null references public.locations(id) on delete cascade;

create table if not exists public.location_sections (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  title text not null,
  body text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.location_links (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.location_sections(id) on delete cascade,
  target_location_id uuid not null references public.locations(id) on delete cascade,
  label text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique(section_id, target_location_id)
);

alter table public.location_sections enable row level security;
alter table public.location_links enable row level security;

drop policy if exists location_sections_member_read on public.location_sections;
drop policy if exists location_sections_gm_write on public.location_sections;
create policy location_sections_member_read
on public.location_sections
for select
to authenticated
using (
  exists (
    select 1 from public.locations l
    where l.id = location_sections.location_id
      and private.is_campaign_member(l.campaign_id)
  )
);
create policy location_sections_gm_write
on public.location_sections
for all
to authenticated
using (
  exists (
    select 1 from public.locations l
    where l.id = location_sections.location_id
      and private.is_campaign_gm(l.campaign_id)
  )
)
with check (
  exists (
    select 1 from public.locations l
    where l.id = location_sections.location_id
      and private.is_campaign_gm(l.campaign_id)
  )
);

drop policy if exists location_links_member_read on public.location_links;
drop policy if exists location_links_gm_write on public.location_links;
create policy location_links_member_read
on public.location_links
for select
to authenticated
using (
  exists (
    select 1
    from public.location_sections s
    join public.locations l on l.id = s.location_id
    where s.id = location_links.section_id
      and private.is_campaign_member(l.campaign_id)
  )
);
create policy location_links_gm_write
on public.location_links
for all
to authenticated
using (
  exists (
    select 1
    from public.location_sections s
    join public.locations l on l.id = s.location_id
    where s.id = location_links.section_id
      and private.is_campaign_gm(l.campaign_id)
  )
)
with check (
  exists (
    select 1
    from public.location_sections s
    join public.locations l on l.id = s.location_id
    where s.id = location_links.section_id
      and private.is_campaign_gm(l.campaign_id)
  )
);

grant select, insert, update, delete on public.location_sections to authenticated;
grant select, insert, update, delete on public.location_links to authenticated;

-- Rewrite existing content policies using GM/member helpers.
drop policy if exists locations_member_read on public.locations;
drop policy if exists locations_gm_write on public.locations;
create policy locations_member_read on public.locations for select to authenticated
using (private.is_campaign_member(campaign_id));
create policy locations_gm_write on public.locations for all to authenticated
using (private.is_campaign_gm(campaign_id))
with check (private.is_campaign_gm(campaign_id));

-- Chat author is always the active character assigned by GM + player name in parentheses.
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
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select c.id, c.name, p.display_name, c.avatar_url
    into v_character_id, v_character_name, v_player_name, v_avatar_url
  from public.chat_rooms r
  join public.campaign_members cm
    on cm.campaign_id = r.campaign_id
   and cm.user_id = auth.uid()
  join public.profiles p
    on p.user_id = auth.uid()
  join public.characters c
    on c.id = cm.active_character_id
   and c.campaign_id = r.campaign_id
   and c.assigned_user_id = auth.uid()
  where r.id = new.room_id;

  if v_character_id is null then
    raise exception 'Active character must be assigned by GM';
  end if;

  new.user_id := auth.uid();
  new.client_id := auth.uid();
  new.character_id := v_character_id;
  new.author_name := v_character_name || ' (' || v_player_name || ')';
  new.author_avatar_url := v_avatar_url;
  return new;
end;
$$;
revoke all on function public.set_chat_message_identity() from public, anon, authenticated;

-- Empty the invented demo lore so the world starts clean.
delete from public.location_links;
delete from public.location_sections;
delete from public.achievements;
delete from public.world_articles;
delete from public.world_sections;
delete from public.locations;
delete from public.campaign_updates;
update public.campaigns set title = 'Новая кампания' where slug = 'demo' and title = 'Проклятые земли';
