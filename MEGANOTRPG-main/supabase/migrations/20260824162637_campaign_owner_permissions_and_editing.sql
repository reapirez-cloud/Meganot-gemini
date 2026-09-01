alter table public.campaign_members
  add column if not exists is_owner boolean not null default false;

create unique index if not exists campaign_members_one_owner_per_campaign
  on public.campaign_members(campaign_id)
  where is_owner = true;

create unique index if not exists campaign_members_one_gm_per_campaign
  on public.campaign_members(campaign_id)
  where role = 'gm';

create or replace function private.is_campaign_owner(
  p_campaign_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id = p_campaign_id
      and cm.user_id = p_user_id
      and cm.is_owner = true
  );
$$;

create or replace function private.can_manage_campaign(
  p_campaign_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id = p_campaign_id
      and cm.user_id = p_user_id
      and (cm.is_owner = true or cm.role = 'gm')
  );
$$;

revoke all on function private.is_campaign_owner(uuid, uuid) from public, anon;
revoke all on function private.can_manage_campaign(uuid, uuid) from public, anon;
grant execute on function private.is_campaign_owner(uuid, uuid) to authenticated;
grant execute on function private.can_manage_campaign(uuid, uuid) to authenticated;

create or replace function public.claim_demo_owner()
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
    where campaign_id = v_campaign_id and is_owner = true
  ) then
    raise exception 'Campaign owner already exists';
  end if;

  update public.campaign_members
  set is_owner = true
  where campaign_id = v_campaign_id
    and user_id = auth.uid();

  if not found then
    raise exception 'You are not a campaign member';
  end if;
end;
$$;

create or replace function public.set_demo_gm(p_user_id uuid)
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

  if not exists (
    select 1 from public.campaign_members
    where campaign_id = v_campaign_id
      and user_id = auth.uid()
      and is_owner = true
  ) then
    raise exception 'Only campaign owner can assign GM';
  end if;

  if not exists (
    select 1 from public.campaign_members
    where campaign_id = v_campaign_id
      and user_id = p_user_id
  ) then
    raise exception 'Target user is not a campaign member';
  end if;

  if exists (
    select 1 from public.campaign_members
    where campaign_id = v_campaign_id
      and user_id = p_user_id
      and is_owner = true
  ) then
    raise exception 'Campaign owner and GM must be different users';
  end if;

  update public.campaign_members
  set role = 'player'
  where campaign_id = v_campaign_id
    and role = 'gm';

  update public.campaign_members
  set role = 'gm'
  where campaign_id = v_campaign_id
    and user_id = p_user_id;
end;
$$;

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
    where campaign_id = v_campaign_id and is_owner = true
  ) then
    raise exception 'GM is assigned by the campaign owner';
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

revoke all on function public.claim_demo_owner() from public, anon;
revoke all on function public.set_demo_gm(uuid) from public, anon;
revoke all on function public.claim_demo_gm() from public, anon;
grant execute on function public.claim_demo_owner() to authenticated;
grant execute on function public.set_demo_gm(uuid) to authenticated;
grant execute on function public.claim_demo_gm() to authenticated;

-- Campaign title: owner and GM can edit.
drop policy if exists campaigns_gm_update on public.campaigns;
create policy campaigns_manage_update
on public.campaigns
for update
to authenticated
using (private.can_manage_campaign(id))
with check (private.can_manage_campaign(id));

-- Campaign membership: owner/GM may only update active_character_id directly.
drop policy if exists campaign_members_gm_update on public.campaign_members;
drop policy if exists campaign_members_update_own_active on public.campaign_members;
create policy campaign_members_manage_active_update
on public.campaign_members
for update
to authenticated
using (private.can_manage_campaign(campaign_id))
with check (private.can_manage_campaign(campaign_id));

revoke update on public.campaign_members from authenticated;
grant update(active_character_id) on public.campaign_members to authenticated;

-- Characters: owner/GM see and manage all. Players see only assigned characters.
drop policy if exists characters_campaign_read on public.characters;
drop policy if exists characters_gm_write on public.characters;
drop policy if exists characters_owner_insert on public.characters;
drop policy if exists characters_owner_update on public.characters;
create policy characters_scoped_read
on public.characters
for select
to authenticated
using (
  private.can_manage_campaign(campaign_id)
  or assigned_user_id = auth.uid()
);
create policy characters_manage_write
on public.characters
for all
to authenticated
using (private.can_manage_campaign(campaign_id))
with check (private.can_manage_campaign(campaign_id));

-- World content: owner and GM have the same write rights.
drop policy if exists world_sections_gm_write on public.world_sections;
create policy world_sections_manage_write
on public.world_sections
for all
to authenticated
using (private.can_manage_campaign(campaign_id))
with check (private.can_manage_campaign(campaign_id));

drop policy if exists world_articles_gm_write on public.world_articles;
create policy world_articles_manage_write
on public.world_articles
for all
to authenticated
using (private.can_manage_campaign(campaign_id))
with check (private.can_manage_campaign(campaign_id));

drop policy if exists locations_gm_write on public.locations;
create policy locations_manage_write
on public.locations
for all
to authenticated
using (private.can_manage_campaign(campaign_id))
with check (private.can_manage_campaign(campaign_id));

drop policy if exists location_sections_gm_write on public.location_sections;
create policy location_sections_manage_write
on public.location_sections
for all
to authenticated
using (
  exists (
    select 1 from public.locations l
    where l.id = location_sections.location_id
      and private.can_manage_campaign(l.campaign_id)
  )
)
with check (
  exists (
    select 1 from public.locations l
    where l.id = location_sections.location_id
      and private.can_manage_campaign(l.campaign_id)
  )
);

drop policy if exists location_links_gm_write on public.location_links;
create policy location_links_manage_write
on public.location_links
for all
to authenticated
using (
  exists (
    select 1
    from public.location_sections s
    join public.locations l on l.id = s.location_id
    where s.id = location_links.section_id
      and private.can_manage_campaign(l.campaign_id)
  )
)
with check (
  exists (
    select 1
    from public.location_sections s
    join public.locations l on l.id = s.location_id
    where s.id = location_links.section_id
      and private.can_manage_campaign(l.campaign_id)
  )
);

drop policy if exists achievements_gm_write on public.achievements;
create policy achievements_manage_write
on public.achievements
for all
to authenticated
using (private.can_manage_campaign(campaign_id))
with check (private.can_manage_campaign(campaign_id));

drop policy if exists campaign_updates_gm_write on public.campaign_updates;
create policy campaign_updates_manage_write
on public.campaign_updates
for all
to authenticated
using (private.can_manage_campaign(campaign_id))
with check (private.can_manage_campaign(campaign_id));
