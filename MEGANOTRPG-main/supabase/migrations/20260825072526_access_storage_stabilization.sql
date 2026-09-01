begin;

-- Secure campaign onboarding without removing any existing member.
create table if not exists public.campaign_invites (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  code text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  max_uses integer not null default 20 check (max_uses between 1 and 500),
  uses_count integer not null default 0 check (uses_count >= 0),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.campaign_invites enable row level security;

drop policy if exists campaign_invites_manager_read on public.campaign_invites;
create policy campaign_invites_manager_read
on public.campaign_invites
for select
to authenticated
using ((select private.can_manage_campaign(campaign_id)));

revoke all on public.campaign_invites from anon, authenticated;
grant select on public.campaign_invites to authenticated;

create index if not exists campaign_invites_campaign_created_idx
  on public.campaign_invites (campaign_id, created_at desc);
create index if not exists campaign_invites_active_code_idx
  on public.campaign_invites (upper(code))
  where revoked_at is null;

create or replace function private.is_verified_app_user(
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
    from auth.users u
    where u.id = p_user_id
      and coalesce(u.is_anonymous, false) = false
  );
$$;

revoke all on function private.is_verified_app_user(uuid) from public, anon;
grant execute on function private.is_verified_app_user(uuid) to authenticated, service_role;

create or replace function public.create_campaign_invite(
  p_campaign_id uuid,
  p_max_uses integer default 20,
  p_expires_days integer default 30
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not private.can_manage_campaign(p_campaign_id, auth.uid()) then
    raise exception 'Only GM or owner can create an invite';
  end if;

  if p_max_uses is null or p_max_uses < 1 or p_max_uses > 500 then
    raise exception 'Invite use limit must be between 1 and 500';
  end if;

  if p_expires_days is null or p_expires_days < 1 or p_expires_days > 365 then
    raise exception 'Invite lifetime must be between 1 and 365 days';
  end if;

  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    exit when not exists (
      select 1 from public.campaign_invites i where i.code = v_code
    );
  end loop;

  insert into public.campaign_invites (
    campaign_id,
    code,
    created_by,
    max_uses,
    expires_at
  ) values (
    p_campaign_id,
    v_code,
    auth.uid(),
    p_max_uses,
    now() + make_interval(days => p_expires_days)
  );

  return v_code;
end;
$$;

revoke all on function public.create_campaign_invite(uuid, integer, integer)
  from public, anon;
grant execute on function public.create_campaign_invite(uuid, integer, integer)
  to authenticated;

create or replace function public.join_campaign_by_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.campaign_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not private.is_verified_app_user(auth.uid()) then
    raise exception 'Telegram account required';
  end if;

  if not exists (
    select 1 from public.profiles p where p.user_id = auth.uid()
  ) then
    raise exception 'Create a profile first';
  end if;

  select i.*
    into v_invite
  from public.campaign_invites i
  where upper(i.code) = upper(trim(coalesce(p_code, '')))
  for update;

  if v_invite.id is null
     or v_invite.revoked_at is not null
     or (v_invite.expires_at is not null and v_invite.expires_at <= now())
     or v_invite.uses_count >= v_invite.max_uses then
    raise exception 'Invite is invalid or expired';
  end if;

  if exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id = v_invite.campaign_id
      and cm.user_id = auth.uid()
  ) then
    return v_invite.campaign_id;
  end if;

  insert into public.campaign_members (campaign_id, user_id, role)
  values (v_invite.campaign_id, auth.uid(), 'player');

  update public.campaign_invites
  set uses_count = uses_count + 1
  where id = v_invite.id;

  return v_invite.campaign_id;
end;
$$;

revoke all on function public.join_campaign_by_invite(text) from public, anon;
grant execute on function public.join_campaign_by_invite(text) to authenticated;

create or replace function public.set_campaign_member_role(
  p_campaign_id uuid,
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_role not in ('gm', 'player') then
    raise exception 'Unsupported role';
  end if;

  if not private.is_campaign_owner(p_campaign_id, auth.uid()) then
    raise exception 'Only campaign owner can change roles';
  end if;

  if not exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id = p_campaign_id
      and cm.user_id = p_user_id
  ) then
    raise exception 'Target user is not a campaign member';
  end if;

  if exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id = p_campaign_id
      and cm.user_id = p_user_id
      and cm.is_owner = true
  ) then
    raise exception 'Owner role is managed separately';
  end if;

  if p_role = 'gm' then
    update public.campaign_members
    set role = 'player'
    where campaign_id = p_campaign_id
      and role = 'gm'
      and user_id <> p_user_id;
  end if;

  update public.campaign_members
  set role = p_role
  where campaign_id = p_campaign_id
    and user_id = p_user_id;
end;
$$;

revoke all on function public.set_campaign_member_role(uuid, uuid, text)
  from public, anon;
grant execute on function public.set_campaign_member_role(uuid, uuid, text)
  to authenticated;

-- New profiles no longer join a hard-coded campaign automatically.
drop trigger if exists profiles_add_demo_membership on public.profiles;

revoke all on function public.claim_demo_owner() from public, anon, authenticated;
revoke all on function public.claim_demo_gm() from public, anon, authenticated;
revoke all on function public.set_demo_gm(uuid) from public, anon, authenticated;
revoke all on function public.set_demo_member_role(uuid, text)
  from public, anon, authenticated;

-- Harden public RPC grants while preserving authenticated gameplay.
revoke all on function public.cast_prepared_spell(uuid, uuid) from public, anon;
revoke all on function public.roll_chat_dice(uuid, integer, integer, integer)
  from public, anon;
revoke all on function public.grant_character_long_rest(uuid) from public, anon;
revoke all on function public.edit_chat_message(bigint, text) from public, anon;
revoke all on function public.delete_chat_message(bigint) from public, anon;
grant execute on function public.cast_prepared_spell(uuid, uuid) to authenticated;
grant execute on function public.roll_chat_dice(uuid, integer, integer, integer)
  to authenticated;
grant execute on function public.grant_character_long_rest(uuid) to authenticated;
grant execute on function public.edit_chat_message(bigint, text) to authenticated;
grant execute on function public.delete_chat_message(bigint) to authenticated;

-- Align visible player controls with database permissions.
drop policy if exists character_diary_posts_manager_delete
  on public.character_diary_posts;
create policy character_diary_posts_author_or_manager_delete
on public.character_diary_posts
for delete
to authenticated
using (
  created_by = (select auth.uid())
  or (select private.can_manage_character(character_id))
);

drop policy if exists character_diary_comments_manager_delete
  on public.character_diary_comments;
create policy character_diary_comments_author_or_manager_delete
on public.character_diary_comments
for delete
to authenticated
using (
  created_by = (select auth.uid())
  or (select private.can_manage_diary_post(post_id))
);

drop policy if exists character_spells_manager_insert on public.character_spells;
create policy character_spells_assigned_or_manager_insert
on public.character_spells
for insert
to authenticated
with check (
  (select private.can_manage_character(character_id))
  or (select private.is_assigned_character(character_id))
);

drop policy if exists character_spells_manager_delete on public.character_spells;
create policy character_spells_assigned_or_manager_delete
on public.character_spells
for delete
to authenticated
using (
  (select private.can_manage_character(character_id))
  or (select private.is_assigned_character(character_id))
);

-- Remove per-row auth function re-evaluation in the hottest policies.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
on public.profiles for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists chat_messages_scoped_insert on public.chat_messages;
create policy chat_messages_scoped_insert
on public.chat_messages for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (select private.can_write_chat_room(room_id))
);

drop policy if exists chat_room_members_scoped_read on public.chat_room_members;
create policy chat_room_members_scoped_read
on public.chat_room_members for select to authenticated
using (
  user_id = (select auth.uid())
  or (select private.can_manage_chat_room(room_id))
);

drop policy if exists telegram_identities_campaign_read
  on public.telegram_identities;
create policy telegram_identities_campaign_read
on public.telegram_identities for select to authenticated
using (
  user_id = (select auth.uid())
  or (select private.shares_campaign(user_id))
);

-- Index every foreign key used by joins, cascades, RLS, and social lookups.
create index if not exists achievements_character_id_idx
  on public.achievements (character_id) where character_id is not null;
create index if not exists campaign_art_items_uploaded_by_idx
  on public.campaign_art_items (uploaded_by) where uploaded_by is not null;
create index if not exists campaign_members_user_id_idx
  on public.campaign_members (user_id, campaign_id);
create index if not exists campaign_members_active_character_id_idx
  on public.campaign_members (active_character_id)
  where active_character_id is not null;
create index if not exists campaign_updates_created_by_idx
  on public.campaign_updates (created_by) where created_by is not null;
create index if not exists character_diary_comments_created_by_idx
  on public.character_diary_comments (created_by);
create index if not exists character_diary_posts_created_by_idx
  on public.character_diary_posts (created_by);
create index if not exists chat_messages_character_id_idx
  on public.chat_messages (character_id) where character_id is not null;
create index if not exists chat_messages_user_id_idx
  on public.chat_messages (user_id) where user_id is not null;
create index if not exists location_links_target_location_id_idx
  on public.location_links (target_location_id);
create index if not exists location_sections_location_id_idx
  on public.location_sections (location_id);
create index if not exists locations_parent_location_id_idx
  on public.locations (parent_location_id) where parent_location_id is not null;
create index if not exists world_articles_campaign_id_idx
  on public.world_articles (campaign_id, sort_order);

commit;
