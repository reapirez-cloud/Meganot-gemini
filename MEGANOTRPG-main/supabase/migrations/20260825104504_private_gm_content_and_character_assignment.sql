begin;

-- A private character belongs to the GM/owner who created it. Other managers
-- deliberately cannot inspect or mutate it; an assigned player still owns the
-- player-facing part of their own PC.
create or replace function private.can_manage_character(
  p_character_id uuid,
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
    from public.characters c
    where c.id = p_character_id
      and private.can_manage_campaign(c.campaign_id, p_user_id)
      and (
        c.visibility <> 'private'
        or c.created_by = p_user_id
      )
  );
$$;

create or replace function private.can_view_character(
  p_character_id uuid,
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
    from public.characters c
    where c.id = p_character_id
      and private.is_campaign_member(c.campaign_id, p_user_id)
      and (
        c.assigned_user_id = p_user_id
        or (
          c.visibility = 'private'
          and c.created_by = p_user_id
        )
        or (
          c.visibility <> 'private'
          and private.can_manage_campaign(c.campaign_id, p_user_id)
        )
        or (
          c.visibility <> 'private'
          and c.character_type = 'npc'
        )
        or (
          c.visibility <> 'private'
          and c.character_type = 'pc'
          and exists (
            select 1
            from public.campaign_members active_member
            where active_member.campaign_id = c.campaign_id
              and active_member.user_id = c.assigned_user_id
              and active_member.active_character_id = c.id
          )
        )
      )
  );
$$;

revoke all on function private.can_manage_character(uuid, uuid)
  from public, anon;
revoke all on function private.can_view_character(uuid, uuid)
  from public, anon;
grant execute on function private.can_manage_character(uuid, uuid)
  to authenticated, service_role;
grant execute on function private.can_view_character(uuid, uuid)
  to authenticated, service_role;

drop policy if exists characters_manager_update on public.characters;
create policy characters_manager_update
on public.characters for update to authenticated
using ((select private.can_manage_character(id)))
with check ((select private.can_manage_character(id)));

drop policy if exists characters_manager_delete on public.characters;
create policy characters_manager_delete
on public.characters for delete to authenticated
using ((select private.can_manage_character(id)));

-- Character creation is a GM/owner operation. Players receive an assigned
-- character and can then manage only its player-facing fields.
create or replace function public.create_campaign_character(
  p_campaign_id uuid,
  p_name text,
  p_character_class text default 'Персонаж',
  p_level integer default 1,
  p_bio text default '',
  p_avatar_url text default null,
  p_assigned_user_id uuid default null,
  p_character_type text default 'pc',
  p_visibility text default 'campaign'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_assigned_user_id uuid;
  v_character_type text := lower(trim(coalesce(p_character_type, 'pc')));
  v_visibility text := lower(trim(coalesce(p_visibility, 'campaign')));
  v_level integer := greatest(1, least(coalesce(p_level, 1), 30));
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not private.can_manage_campaign(p_campaign_id, auth.uid()) then
    raise exception 'Only GM or owner can create characters';
  end if;

  if nullif(trim(coalesce(p_name, '')), '') is null then
    raise exception 'Character name is required';
  end if;

  if v_character_type not in ('pc', 'npc') then
    raise exception 'Unsupported character type';
  end if;

  if v_visibility not in ('campaign', 'private') then
    raise exception 'Unsupported character visibility';
  end if;

  v_assigned_user_id := case
    when v_character_type = 'npc' then null
    else p_assigned_user_id
  end;

  if v_assigned_user_id is not null and not exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id = p_campaign_id
      and cm.user_id = v_assigned_user_id
  ) then
    raise exception 'Assigned user is not a campaign member';
  end if;

  insert into public.characters (
    campaign_id,
    assigned_user_id,
    name,
    character_class,
    level,
    bio,
    avatar_url,
    character_type,
    visibility,
    created_by
  ) values (
    p_campaign_id,
    v_assigned_user_id,
    trim(p_name),
    coalesce(nullif(trim(coalesce(p_character_class, '')), ''), 'Персонаж'),
    v_level,
    trim(coalesce(p_bio, '')),
    nullif(trim(coalesce(p_avatar_url, '')), ''),
    v_character_type,
    v_visibility,
    auth.uid()
  )
  returning id into v_id;

  if v_assigned_user_id is not null then
    update public.campaign_members
    set active_character_id = v_id
    where campaign_id = p_campaign_id
      and user_id = v_assigned_user_id
      and active_character_id is null;
  end if;

  return v_id;
end;
$$;

create or replace function public.update_campaign_character(
  p_character_id uuid,
  p_name text,
  p_character_class text,
  p_level integer,
  p_bio text,
  p_avatar_url text,
  p_assigned_user_id uuid,
  p_character_type text,
  p_visibility text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_character public.characters%rowtype;
  v_can_manage_character boolean;
  v_assigned_user_id uuid;
  v_character_type text := lower(trim(coalesce(p_character_type, 'pc')));
  v_visibility text := lower(trim(coalesce(p_visibility, 'campaign')));
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_character
  from public.characters
  where id = p_character_id
  for update;

  if v_character.id is null then
    raise exception 'Character not found';
  end if;

  if nullif(trim(coalesce(p_name, '')), '') is null then
    raise exception 'Character name is required';
  end if;

  v_can_manage_character := private.can_manage_character(
    p_character_id,
    auth.uid()
  );

  if not v_can_manage_character then
    if v_character.assigned_user_id <> auth.uid()
       or v_character.character_type <> 'pc' then
      raise exception 'Not allowed';
    end if;

    update public.characters
    set name = trim(p_name),
        character_class = coalesce(
          nullif(trim(coalesce(p_character_class, '')), ''),
          character_class
        ),
        bio = trim(coalesce(p_bio, '')),
        avatar_url = nullif(trim(coalesce(p_avatar_url, '')), ''),
        updated_at = now()
    where id = p_character_id;
    return;
  end if;

  if v_character_type not in ('pc', 'npc') then
    raise exception 'Unsupported character type';
  end if;

  if v_visibility not in ('campaign', 'private') then
    raise exception 'Unsupported character visibility';
  end if;

  v_assigned_user_id := case
    when v_character_type = 'npc' then null
    else p_assigned_user_id
  end;

  if v_assigned_user_id is not null and not exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id = v_character.campaign_id
      and cm.user_id = v_assigned_user_id
  ) then
    raise exception 'Assigned user is not a campaign member';
  end if;

  update public.characters
  set assigned_user_id = v_assigned_user_id,
      name = trim(p_name),
      character_class = coalesce(
        nullif(trim(coalesce(p_character_class, '')), ''),
        'Персонаж'
      ),
      level = greatest(1, least(coalesce(p_level, 1), 30)),
      bio = trim(coalesce(p_bio, '')),
      avatar_url = nullif(trim(coalesce(p_avatar_url, '')), ''),
      character_type = v_character_type,
      visibility = v_visibility,
      updated_at = now()
  where id = p_character_id;

  if v_character.assigned_user_id is not null
     and v_character.assigned_user_id is distinct from v_assigned_user_id then
    update public.campaign_members
    set active_character_id = null
    where campaign_id = v_character.campaign_id
      and user_id = v_character.assigned_user_id
      and active_character_id = p_character_id;
  end if;

  if v_assigned_user_id is not null then
    update public.campaign_members
    set active_character_id = p_character_id
    where campaign_id = v_character.campaign_id
      and user_id = v_assigned_user_id
      and active_character_id is null;
  end if;
end;
$$;

create or replace function public.delete_campaign_character(
  p_character_id uuid
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

  if not private.can_manage_character(p_character_id, auth.uid()) then
    raise exception 'Only the responsible GM can delete this character';
  end if;

  delete from public.characters where id = p_character_id;

  if not found then
    raise exception 'Character not found';
  end if;
end;
$$;

-- Switching the active PC must respect the same visibility boundary. This
-- prevents another manager from clearing or replacing a hidden GM character
-- by calling the RPC directly with a known UUID.
create or replace function public.set_campaign_active_character(
  p_campaign_id uuid,
  p_user_id uuid,
  p_character_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_character_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_user_id <> auth.uid()
     and not private.can_manage_campaign(p_campaign_id, auth.uid()) then
    raise exception 'Not allowed';
  end if;

  select cm.active_character_id
  into v_current_character_id
  from public.campaign_members cm
  where cm.campaign_id = p_campaign_id
    and cm.user_id = p_user_id
  for update;

  if not found then
    raise exception 'Campaign member not found';
  end if;

  if v_current_character_id is not null
     and v_current_character_id is distinct from p_character_id
     and not private.can_view_character(v_current_character_id, auth.uid()) then
    raise exception 'The current character is private';
  end if;

  if p_character_id is not null then
    if not private.can_view_character(p_character_id, auth.uid()) then
      raise exception 'Character not found or private';
    end if;

    if not exists (
      select 1
      from public.characters c
      where c.id = p_character_id
        and c.campaign_id = p_campaign_id
        and c.assigned_user_id = p_user_id
        and c.character_type = 'pc'
    ) then
      raise exception 'Character is not assigned to this member';
    end if;
  end if;

  update public.campaign_members
  set active_character_id = p_character_id
  where campaign_id = p_campaign_id
    and user_id = p_user_id;
end;
$$;

revoke all on function public.create_campaign_character(
  uuid, text, text, integer, text, text, uuid, text, text
) from public, anon;
revoke all on function public.update_campaign_character(
  uuid, text, text, integer, text, text, uuid, text, text
) from public, anon;
revoke all on function public.delete_campaign_character(uuid)
  from public, anon;
revoke all on function public.set_campaign_active_character(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.create_campaign_character(
  uuid, text, text, integer, text, text, uuid, text, text
) to authenticated;
grant execute on function public.update_campaign_character(
  uuid, text, text, integer, text, text, uuid, text, text
) to authenticated;
grant execute on function public.delete_campaign_character(uuid)
  to authenticated;
grant execute on function public.set_campaign_active_character(uuid, uuid, uuid)
  to authenticated;

-- Every manager has a genuinely private workspace. The campaign owner keeps
-- the same game tools, but cannot inspect another GM's personal preparation.
create or replace function private.can_access_gm_workspace(
  p_campaign_id uuid,
  p_workspace_user_id uuid,
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
    from public.campaign_members actor
    where actor.campaign_id = p_campaign_id
      and actor.user_id = p_user_id
      and actor.user_id = p_workspace_user_id
      and (actor.is_owner = true or actor.role = 'gm')
  );
$$;

revoke all on function private.can_access_gm_workspace(uuid, uuid, uuid)
  from public, anon;
grant execute on function private.can_access_gm_workspace(uuid, uuid, uuid)
  to authenticated, service_role;

alter table public.gm_npc_notes
  add column if not exists workspace_user_id uuid
    references auth.users(id) on delete cascade;

update public.gm_npc_notes note
set workspace_user_id = coalesce(
  note.updated_by,
  (
    select c.created_by
    from public.characters c
    where c.id = note.character_id
  ),
  (
    select cm.user_id
    from public.campaign_members cm
    where cm.campaign_id = note.campaign_id
      and cm.is_owner = true
    limit 1
  )
)
where note.workspace_user_id is null;

alter table public.gm_npc_notes
  alter column workspace_user_id set not null;

alter table public.gm_npc_notes
  drop constraint if exists gm_npc_notes_pkey;
alter table public.gm_npc_notes
  add constraint gm_npc_notes_pkey
  primary key (character_id, workspace_user_id);

create index if not exists gm_npc_notes_workspace_idx
  on public.gm_npc_notes (campaign_id, workspace_user_id, updated_at desc);

drop policy if exists gm_npc_notes_access on public.gm_npc_notes;
create policy gm_npc_notes_access
on public.gm_npc_notes for select to authenticated
using (
  workspace_user_id = (select auth.uid())
  and (select private.can_manage_campaign(campaign_id))
);

drop policy if exists gm_npc_notes_insert on public.gm_npc_notes;
create policy gm_npc_notes_insert
on public.gm_npc_notes for insert to authenticated
with check (
  workspace_user_id = (select auth.uid())
  and updated_by = (select auth.uid())
  and (select private.can_manage_campaign(campaign_id))
);

drop policy if exists gm_npc_notes_update on public.gm_npc_notes;
create policy gm_npc_notes_update
on public.gm_npc_notes for update to authenticated
using (
  workspace_user_id = (select auth.uid())
  and (select private.can_manage_campaign(campaign_id))
)
with check (
  workspace_user_id = (select auth.uid())
  and updated_by = (select auth.uid())
  and (select private.can_manage_campaign(campaign_id))
);

drop policy if exists gm_npc_notes_delete on public.gm_npc_notes;
create policy gm_npc_notes_delete
on public.gm_npc_notes for delete to authenticated
using (
  workspace_user_id = (select auth.uid())
  and (select private.can_manage_campaign(campaign_id))
);

-- Private GM uploads use campaign/user/gm-private/... and are readable and
-- deletable only by that user, including when another account is the owner.
create or replace function private.can_read_campaign_media(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[] := storage.foldername(p_name);
  v_campaign_id uuid;
  v_owner_id uuid;
begin
  if auth.uid() is null or v_parts is null then
    return false;
  end if;

  if coalesce(array_length(v_parts, 1), 0) >= 3
     and v_parts[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_campaign_id := v_parts[1]::uuid;
    v_owner_id := case
      when v_parts[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then v_parts[2]::uuid
      else null
    end;

    if v_parts[3] = 'gm-private' then
      return v_owner_id = auth.uid()
        and private.can_manage_campaign(v_campaign_id, auth.uid());
    end if;

    return private.is_campaign_member(v_campaign_id, auth.uid());
  end if;

  if coalesce(array_length(v_parts, 1), 0) >= 2
     and v_parts[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_owner_id := v_parts[1]::uuid;
    return v_owner_id = auth.uid()
      or private.shares_campaign(v_owner_id, auth.uid());
  end if;

  return false;
end;
$$;

create or replace function private.can_delete_campaign_media(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[] := storage.foldername(p_name);
  v_campaign_id uuid;
  v_owner_id uuid;
begin
  if auth.uid() is null or v_parts is null then
    return false;
  end if;

  if coalesce(array_length(v_parts, 1), 0) >= 3
     and v_parts[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_campaign_id := v_parts[1]::uuid;
    v_owner_id := case
      when v_parts[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then v_parts[2]::uuid
      else null
    end;

    if v_parts[3] = 'gm-private' then
      return v_owner_id = auth.uid()
        and private.can_manage_campaign(v_campaign_id, auth.uid());
    end if;

    return v_owner_id = auth.uid()
      or private.can_manage_campaign(v_campaign_id, auth.uid());
  end if;

  if coalesce(array_length(v_parts, 1), 0) >= 2
     and v_parts[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_owner_id := v_parts[1]::uuid;
    return v_owner_id = auth.uid()
      or exists (
        select 1
        from public.campaign_members mine
        join public.campaign_members theirs
          on theirs.campaign_id = mine.campaign_id
        where mine.user_id = auth.uid()
          and (mine.is_owner = true or mine.role = 'gm')
          and theirs.user_id = v_owner_id
      );
  end if;

  return false;
end;
$$;

revoke all on function private.can_read_campaign_media(text)
  from public, anon;
revoke all on function private.can_delete_campaign_media(text)
  from public, anon;
grant execute on function private.can_read_campaign_media(text)
  to authenticated, service_role;
grant execute on function private.can_delete_campaign_media(text)
  to authenticated, service_role;

-- Child content follows character visibility, so «Только я» cannot leak via
-- art pages, the social feed, diary comments, or achievements.
create or replace function private.can_view_art_item(
  p_art_item_id uuid,
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
    from public.campaign_art_items item
    where item.id = p_art_item_id
      and private.is_campaign_member(item.campaign_id, p_user_id)
      and (
        item.character_id is null
        or private.can_view_character(item.character_id, p_user_id)
      )
  );
$$;

create or replace function private.can_edit_art_item(
  p_art_item_id uuid,
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
    from public.campaign_art_items item
    where item.id = p_art_item_id
      and (
        item.uploaded_by = p_user_id
        or (
          item.character_id is null
          and private.can_manage_campaign(item.campaign_id, p_user_id)
        )
        or (
          item.character_id is not null
          and private.can_manage_character(item.character_id, p_user_id)
        )
      )
  );
$$;

create or replace function private.can_read_feed_item(
  p_feed_item_id uuid,
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
    from public.feed_items item
    where item.id = p_feed_item_id
      and private.is_campaign_member(item.campaign_id, p_user_id)
      and (
        item.character_id is null
        or private.can_view_character(item.character_id, p_user_id)
      )
  );
$$;

revoke all on function private.can_view_art_item(uuid, uuid)
  from public, anon;
revoke all on function private.can_edit_art_item(uuid, uuid)
  from public, anon;
revoke all on function private.can_read_feed_item(uuid, uuid)
  from public, anon;
grant execute on function private.can_view_art_item(uuid, uuid)
  to authenticated, service_role;
grant execute on function private.can_edit_art_item(uuid, uuid)
  to authenticated, service_role;
grant execute on function private.can_read_feed_item(uuid, uuid)
  to authenticated, service_role;

-- Security-definer deletion RPCs also enforce visibility. An owner/GM cannot
-- delete content hidden by another GM merely by learning its UUID.
create or replace function public.delete_feed_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comment public.feed_comments%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_comment
  from public.feed_comments
  where id = p_comment_id;

  if v_comment.id is null then
    return;
  end if;

  if auth.uid() <> v_comment.user_id
     and not (
       private.can_manage_campaign(v_comment.campaign_id, auth.uid())
       and private.can_read_feed_item(v_comment.feed_item_id, auth.uid())
     ) then
    raise exception 'Not allowed to delete this comment';
  end if;

  delete from public.feed_comments where id = p_comment_id;
end;
$$;

create or replace function public.delete_feed_item(p_feed_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.feed_items%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_item
  from public.feed_items
  where id = p_feed_item_id;

  if v_item.id is null then
    return;
  end if;

  if auth.uid() <> v_item.created_by
     and not (
       private.can_manage_campaign(v_item.campaign_id, auth.uid())
       and private.can_read_feed_item(v_item.id, auth.uid())
     ) then
    raise exception 'Not allowed to delete this publication';
  end if;

  if v_item.source_type = 'diary' then
    delete from public.character_diary_posts where id = v_item.source_id;
  elsif v_item.source_type = 'art' then
    delete from public.campaign_art_items where id = v_item.source_id;
  elsif v_item.source_type = 'moment' then
    delete from public.feed_items where id = p_feed_item_id;
  elsif private.can_manage_campaign(v_item.campaign_id, auth.uid()) then
    if v_item.source_type = 'achievement' then
      delete from public.achievements where id = v_item.source_id;
    elsif v_item.source_type = 'update' then
      delete from public.campaign_updates where id = v_item.source_id;
    end if;
  else
    raise exception 'Only GM or owner can delete this publication';
  end if;
end;
$$;

revoke all on function public.delete_feed_comment(uuid) from public, anon;
revoke all on function public.delete_feed_item(uuid) from public, anon;
grant execute on function public.delete_feed_comment(uuid) to authenticated;
grant execute on function public.delete_feed_item(uuid) to authenticated;

drop policy if exists campaign_art_items_member_read
  on public.campaign_art_items;
create policy campaign_art_items_member_read
on public.campaign_art_items for select to authenticated
using ((select private.can_view_art_item(id)));

drop policy if exists campaign_art_items_author_or_manager_update
  on public.campaign_art_items;
create policy campaign_art_items_author_or_manager_update
on public.campaign_art_items for update to authenticated
using ((select private.can_edit_art_item(id)))
with check (
  (select private.can_edit_art_item(id))
  and (
    character_id is null
    or (select private.can_view_character(character_id))
  )
);

drop policy if exists campaign_art_items_author_or_manager_delete
  on public.campaign_art_items;
create policy campaign_art_items_author_or_manager_delete
on public.campaign_art_items for delete to authenticated
using ((select private.can_edit_art_item(id)));

drop policy if exists feed_items_member_read on public.feed_items;
create policy feed_items_member_read
on public.feed_items for select to authenticated
using ((select private.can_read_feed_item(id)));

drop policy if exists feed_reactions_member_read on public.feed_reactions;
create policy feed_reactions_member_read
on public.feed_reactions for select to authenticated
using ((select private.can_read_feed_item(feed_item_id)));

drop policy if exists feed_comments_member_read on public.feed_comments;
create policy feed_comments_member_read
on public.feed_comments for select to authenticated
using ((select private.can_read_feed_item(feed_item_id)));

drop policy if exists achievements_member_read on public.achievements;
create policy achievements_member_read
on public.achievements for select to authenticated
using (
  (
    character_id is null
    and (select private.is_campaign_member(campaign_id))
  )
  or (
    character_id is not null
    and (select private.can_view_character(character_id))
  )
);

drop policy if exists achievements_manager_insert on public.achievements;
create policy achievements_manager_insert
on public.achievements for insert to authenticated
with check (
  (
    character_id is null
    and (select private.can_manage_campaign(campaign_id))
  )
  or (
    character_id is not null
    and (select private.can_manage_character(character_id))
  )
);

drop policy if exists achievements_manager_update on public.achievements;
create policy achievements_manager_update
on public.achievements for update to authenticated
using (
  (
    character_id is null
    and (select private.can_manage_campaign(campaign_id))
  )
  or (
    character_id is not null
    and (select private.can_manage_character(character_id))
  )
)
with check (
  (
    character_id is null
    and (select private.can_manage_campaign(campaign_id))
  )
  or (
    character_id is not null
    and (select private.can_manage_character(character_id))
  )
);

drop policy if exists achievements_manager_delete on public.achievements;
create policy achievements_manager_delete
on public.achievements for delete to authenticated
using (
  (
    character_id is null
    and (select private.can_manage_campaign(campaign_id))
  )
  or (
    character_id is not null
    and (select private.can_manage_character(character_id))
  )
);

commit;
