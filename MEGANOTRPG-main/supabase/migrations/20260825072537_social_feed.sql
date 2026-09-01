begin;

alter table public.character_diary_posts
  add column if not exists title text not null default '',
  add column if not exists media_url text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.campaign_art_items
  add column if not exists character_id uuid references public.characters(id) on delete set null,
  add column if not exists caption text not null default '',
  add column if not exists updated_at timestamptz not null default now();

create index if not exists campaign_art_items_character_idx
  on public.campaign_art_items (character_id, created_at desc)
  where character_id is not null;

create table if not exists public.feed_items (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  source_type text not null check (
    source_type in ('diary', 'art', 'achievement', 'update', 'moment')
  ),
  source_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  character_id uuid references public.characters(id) on delete set null,
  title text not null default '',
  body text not null default '',
  media_url text,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feed_items_moment_source_check check (
    (source_type = 'moment' and source_id is null)
    or (source_type <> 'moment' and source_id is not null)
  )
);

create unique index if not exists feed_items_source_unique_idx
  on public.feed_items (source_type, source_id)
  where source_id is not null;
create index if not exists feed_items_campaign_published_idx
  on public.feed_items (campaign_id, published_at desc, id desc);
create index if not exists feed_items_character_published_idx
  on public.feed_items (character_id, published_at desc)
  where character_id is not null;
create index if not exists feed_items_created_by_idx
  on public.feed_items (created_by) where created_by is not null;

create table if not exists public.feed_reactions (
  id uuid primary key default gen_random_uuid(),
  feed_item_id uuid not null references public.feed_items(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id uuid references public.characters(id) on delete set null,
  emoji text not null default '♥' check (char_length(emoji) between 1 and 12),
  created_at timestamptz not null default now(),
  unique (feed_item_id, user_id)
);

create index if not exists feed_reactions_campaign_idx
  on public.feed_reactions (campaign_id, created_at desc);
create index if not exists feed_reactions_user_idx
  on public.feed_reactions (user_id, created_at desc);
create index if not exists feed_reactions_character_idx
  on public.feed_reactions (character_id) where character_id is not null;

create table if not exists public.feed_comments (
  id uuid primary key default gen_random_uuid(),
  feed_item_id uuid not null references public.feed_items(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id uuid references public.characters(id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists feed_comments_item_created_idx
  on public.feed_comments (feed_item_id, created_at asc);
create index if not exists feed_comments_campaign_idx
  on public.feed_comments (campaign_id, created_at desc);
create index if not exists feed_comments_user_idx
  on public.feed_comments (user_id, created_at desc);
create index if not exists feed_comments_character_idx
  on public.feed_comments (character_id) where character_id is not null;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_character_id uuid references public.characters(id) on delete set null,
  feed_item_id uuid references public.feed_items(id) on delete cascade,
  kind text not null check (kind in ('reaction', 'comment', 'achievement')),
  body text not null default '',
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_user_id, created_at desc);
create index if not exists notifications_recipient_unread_idx
  on public.notifications (recipient_user_id, created_at desc)
  where read_at is null;
create index if not exists notifications_campaign_idx
  on public.notifications (campaign_id, created_at desc);
create index if not exists notifications_actor_user_idx
  on public.notifications (actor_user_id) where actor_user_id is not null;
create index if not exists notifications_actor_character_idx
  on public.notifications (actor_character_id)
  where actor_character_id is not null;

alter table public.feed_items enable row level security;
alter table public.feed_reactions enable row level security;
alter table public.feed_comments enable row level security;
alter table public.notifications enable row level security;

create or replace function private.feed_actor_character(
  p_campaign_id uuid,
  p_user_id uuid default auth.uid()
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select cm.active_character_id
  from public.campaign_members cm
  join public.characters c
    on c.id = cm.active_character_id
   and c.campaign_id = cm.campaign_id
   and c.assigned_user_id = cm.user_id
  where cm.campaign_id = p_campaign_id
    and cm.user_id = p_user_id
  limit 1;
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
    from public.feed_items f
    where f.id = p_feed_item_id
      and private.is_campaign_member(f.campaign_id, p_user_id)
  );
$$;

create or replace function private.feed_recipient(p_feed_item_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(c.assigned_user_id, f.created_by)
  from public.feed_items f
  left join public.characters c on c.id = f.character_id
  where f.id = p_feed_item_id;
$$;

revoke all on function private.feed_actor_character(uuid, uuid) from public, anon;
revoke all on function private.can_read_feed_item(uuid, uuid) from public, anon;
revoke all on function private.feed_recipient(uuid) from public, anon;
grant execute on function private.feed_actor_character(uuid, uuid) to authenticated, service_role;
grant execute on function private.can_read_feed_item(uuid, uuid) to authenticated, service_role;
grant execute on function private.feed_recipient(uuid) to authenticated, service_role;

drop policy if exists feed_items_member_read on public.feed_items;
create policy feed_items_member_read
on public.feed_items for select to authenticated
using ((select private.is_campaign_member(campaign_id)));

drop policy if exists feed_reactions_member_read on public.feed_reactions;
create policy feed_reactions_member_read
on public.feed_reactions for select to authenticated
using ((select private.is_campaign_member(campaign_id)));

drop policy if exists feed_comments_member_read on public.feed_comments;
create policy feed_comments_member_read
on public.feed_comments for select to authenticated
using ((select private.is_campaign_member(campaign_id)));

drop policy if exists notifications_recipient_read on public.notifications;
create policy notifications_recipient_read
on public.notifications for select to authenticated
using (recipient_user_id = (select auth.uid()));

drop policy if exists notifications_recipient_update on public.notifications;
create policy notifications_recipient_update
on public.notifications for update to authenticated
using (recipient_user_id = (select auth.uid()))
with check (recipient_user_id = (select auth.uid()));

revoke all on public.feed_items, public.feed_reactions, public.feed_comments,
  public.notifications from anon, authenticated;
grant select on public.feed_items, public.feed_reactions, public.feed_comments
  to authenticated;
grant select, update on public.notifications to authenticated;

drop policy if exists character_diary_posts_author_update
  on public.character_diary_posts;
create policy character_diary_posts_author_update
on public.character_diary_posts for update to authenticated
using (
  created_by = (select auth.uid())
  or (select private.can_manage_character(character_id))
)
with check (
  (
    created_by = (select auth.uid())
    and (
      (select private.is_assigned_character(character_id))
      or (select private.can_manage_character(character_id))
    )
  )
  or (select private.can_manage_character(character_id))
);

drop policy if exists campaign_art_items_manager_insert
  on public.campaign_art_items;
create policy campaign_art_items_member_insert
on public.campaign_art_items for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and (select private.is_campaign_member(campaign_id))
  and (
    character_id is null
    or (select private.is_assigned_character(character_id))
    or (select private.can_manage_character(character_id))
  )
);

drop policy if exists campaign_art_items_manager_update
  on public.campaign_art_items;
create policy campaign_art_items_author_or_manager_update
on public.campaign_art_items for update to authenticated
using (
  uploaded_by = (select auth.uid())
  or (select private.can_manage_campaign(campaign_id))
)
with check (
  (
    uploaded_by = (select auth.uid())
    and (select private.is_campaign_member(campaign_id))
    and (
      character_id is null
      or (select private.is_assigned_character(character_id))
      or (select private.can_manage_character(character_id))
    )
  )
  or (select private.can_manage_campaign(campaign_id))
);

drop policy if exists campaign_art_items_manager_delete
  on public.campaign_art_items;
create policy campaign_art_items_author_or_manager_delete
on public.campaign_art_items for delete to authenticated
using (
  uploaded_by = (select auth.uid())
  or (select private.can_manage_campaign(campaign_id))
);

create or replace function private.sync_diary_feed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign_id uuid;
begin
  if tg_op = 'DELETE' then
    delete from public.feed_items
    where source_type = 'diary' and source_id = old.id;
    return old;
  end if;

  select c.campaign_id into v_campaign_id
  from public.characters c where c.id = new.character_id;

  insert into public.feed_items (
    campaign_id, source_type, source_id, created_by, character_id,
    title, body, media_url, published_at, updated_at
  ) values (
    v_campaign_id, 'diary', new.id, new.created_by, new.character_id,
    new.title, new.body, new.media_url, new.created_at, new.updated_at
  )
  on conflict (source_type, source_id) where source_id is not null
  do update set
    title = excluded.title,
    body = excluded.body,
    media_url = excluded.media_url,
    updated_at = excluded.updated_at;
  return new;
end;
$$;

create or replace function private.sync_art_feed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.feed_items
    where source_type = 'art' and source_id = old.id;
    return old;
  end if;

  insert into public.feed_items (
    campaign_id, source_type, source_id, created_by, character_id,
    title, body, media_url, published_at, updated_at
  ) values (
    new.campaign_id, 'art', new.id, new.uploaded_by, new.character_id,
    new.title, new.caption, new.image_url, new.created_at, new.updated_at
  )
  on conflict (source_type, source_id) where source_id is not null
  do update set
    created_by = excluded.created_by,
    character_id = excluded.character_id,
    title = excluded.title,
    body = excluded.body,
    media_url = excluded.media_url,
    updated_at = excluded.updated_at;
  return new;
end;
$$;

create or replace function private.sync_achievement_feed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_feed_id uuid;
  v_recipient uuid;
begin
  if tg_op = 'DELETE' then
    delete from public.feed_items
    where source_type = 'achievement' and source_id = old.id;
    return old;
  end if;

  insert into public.feed_items (
    campaign_id, source_type, source_id, character_id,
    title, body, published_at, updated_at
  ) values (
    new.campaign_id, 'achievement', new.id, new.character_id,
    new.icon || ' ' || new.title, new.description, new.awarded_at, now()
  )
  on conflict (source_type, source_id) where source_id is not null
  do update set
    character_id = excluded.character_id,
    title = excluded.title,
    body = excluded.body,
    published_at = excluded.published_at,
    updated_at = excluded.updated_at
  returning id into v_feed_id;

  if tg_op = 'INSERT' and new.character_id is not null then
    select c.assigned_user_id into v_recipient
    from public.characters c where c.id = new.character_id;

    if v_recipient is not null and v_recipient <> auth.uid() then
      insert into public.notifications (
        campaign_id, recipient_user_id, actor_user_id,
        feed_item_id, kind, body
      ) values (
        new.campaign_id, v_recipient, auth.uid(),
        v_feed_id, 'achievement', new.title
      );
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.sync_campaign_update_feed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.feed_items
    where source_type = 'update' and source_id = old.id;
    return old;
  end if;

  insert into public.feed_items (
    campaign_id, source_type, source_id, created_by,
    title, body, published_at, updated_at
  ) values (
    new.campaign_id, 'update', new.id, new.created_by,
    new.title, new.body, new.published_at, now()
  )
  on conflict (source_type, source_id) where source_id is not null
  do update set
    created_by = excluded.created_by,
    title = excluded.title,
    body = excluded.body,
    published_at = excluded.published_at,
    updated_at = excluded.updated_at;
  return new;
end;
$$;

drop trigger if exists character_diary_feed_sync on public.character_diary_posts;
create trigger character_diary_feed_sync
after insert or update or delete on public.character_diary_posts
for each row execute function private.sync_diary_feed();

drop trigger if exists campaign_art_feed_sync on public.campaign_art_items;
create trigger campaign_art_feed_sync
after insert or update or delete on public.campaign_art_items
for each row execute function private.sync_art_feed();

drop trigger if exists achievement_feed_sync on public.achievements;
create trigger achievement_feed_sync
after insert or update or delete on public.achievements
for each row execute function private.sync_achievement_feed();

drop trigger if exists campaign_update_feed_sync on public.campaign_updates;
create trigger campaign_update_feed_sync
after insert or update or delete on public.campaign_updates
for each row execute function private.sync_campaign_update_feed();

insert into public.feed_items (
  campaign_id, source_type, source_id, created_by, character_id,
  title, body, media_url, published_at, updated_at
)
select
  c.campaign_id, 'diary', p.id, p.created_by, p.character_id,
  p.title, p.body, p.media_url, p.created_at, p.updated_at
from public.character_diary_posts p
join public.characters c on c.id = p.character_id
on conflict (source_type, source_id) where source_id is not null do nothing;

insert into public.feed_items (
  campaign_id, source_type, source_id, created_by, character_id,
  title, body, media_url, published_at, updated_at
)
select
  a.campaign_id, 'art', a.id, a.uploaded_by, a.character_id,
  a.title, a.caption, a.image_url, a.created_at, a.updated_at
from public.campaign_art_items a
on conflict (source_type, source_id) where source_id is not null do nothing;

insert into public.feed_items (
  campaign_id, source_type, source_id, character_id,
  title, body, published_at, updated_at
)
select
  a.campaign_id, 'achievement', a.id, a.character_id,
  a.icon || ' ' || a.title, a.description, a.awarded_at, a.created_at
from public.achievements a
on conflict (source_type, source_id) where source_id is not null do nothing;

insert into public.feed_items (
  campaign_id, source_type, source_id, created_by,
  title, body, published_at, updated_at
)
select
  u.campaign_id, 'update', u.id, u.created_by,
  u.title, u.body, u.published_at, u.created_at
from public.campaign_updates u
on conflict (source_type, source_id) where source_id is not null do nothing;

create or replace function public.create_campaign_moment(
  p_campaign_id uuid,
  p_body text,
  p_media_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null
     or not private.is_campaign_member(p_campaign_id, auth.uid()) then
    raise exception 'Campaign membership required';
  end if;

  if char_length(btrim(coalesce(p_body, ''))) = 0 and p_media_url is null then
    raise exception 'Moment cannot be empty';
  end if;

  if char_length(coalesce(p_body, '')) > 5000 then
    raise exception 'Moment is too long';
  end if;

  insert into public.feed_items (
    campaign_id, source_type, created_by, character_id, body, media_url
  ) values (
    p_campaign_id, 'moment', auth.uid(),
    private.feed_actor_character(p_campaign_id, auth.uid()),
    btrim(coalesce(p_body, '')), nullif(btrim(coalesce(p_media_url, '')), '')
  ) returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.toggle_feed_reaction(
  p_feed_item_id uuid,
  p_emoji text default '♥'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.feed_items%rowtype;
  v_recipient uuid;
begin
  if auth.uid() is null
     or not private.can_read_feed_item(p_feed_item_id, auth.uid()) then
    raise exception 'Feed item is unavailable';
  end if;

  select * into v_item from public.feed_items where id = p_feed_item_id;

  if exists (
    select 1 from public.feed_reactions
    where feed_item_id = p_feed_item_id and user_id = auth.uid()
  ) then
    delete from public.feed_reactions
    where feed_item_id = p_feed_item_id and user_id = auth.uid();
    return false;
  end if;

  insert into public.feed_reactions (
    feed_item_id, campaign_id, user_id, character_id, emoji
  ) values (
    p_feed_item_id, v_item.campaign_id, auth.uid(),
    private.feed_actor_character(v_item.campaign_id, auth.uid()),
    left(coalesce(nullif(p_emoji, ''), '♥'), 12)
  );

  v_recipient := private.feed_recipient(p_feed_item_id);
  if v_recipient is not null and v_recipient <> auth.uid() then
    insert into public.notifications (
      campaign_id, recipient_user_id, actor_user_id, actor_character_id,
      feed_item_id, kind, body
    ) values (
      v_item.campaign_id, v_recipient, auth.uid(),
      private.feed_actor_character(v_item.campaign_id, auth.uid()),
      p_feed_item_id, 'reaction', 'отреагировал на публикацию'
    );
  end if;
  return true;
end;
$$;

create or replace function public.add_feed_comment(
  p_feed_item_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.feed_items%rowtype;
  v_id uuid;
  v_recipient uuid;
begin
  if auth.uid() is null
     or not private.can_read_feed_item(p_feed_item_id, auth.uid()) then
    raise exception 'Feed item is unavailable';
  end if;

  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 2000 then
    raise exception 'Comment must contain 1 to 2000 characters';
  end if;

  select * into v_item from public.feed_items where id = p_feed_item_id;
  insert into public.feed_comments (
    feed_item_id, campaign_id, user_id, character_id, body
  ) values (
    p_feed_item_id, v_item.campaign_id, auth.uid(),
    private.feed_actor_character(v_item.campaign_id, auth.uid()),
    btrim(p_body)
  ) returning id into v_id;

  v_recipient := private.feed_recipient(p_feed_item_id);
  if v_recipient is not null and v_recipient <> auth.uid() then
    insert into public.notifications (
      campaign_id, recipient_user_id, actor_user_id, actor_character_id,
      feed_item_id, kind, body
    ) values (
      v_item.campaign_id, v_recipient, auth.uid(),
      private.feed_actor_character(v_item.campaign_id, auth.uid()),
      p_feed_item_id, 'comment', left(btrim(p_body), 180)
    );
  end if;
  return v_id;
end;
$$;

create or replace function public.delete_feed_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comment public.feed_comments%rowtype;
begin
  select * into v_comment from public.feed_comments where id = p_comment_id;
  if v_comment.id is null then return; end if;
  if auth.uid() <> v_comment.user_id
     and not private.can_manage_campaign(v_comment.campaign_id, auth.uid()) then
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
  select * into v_item from public.feed_items where id = p_feed_item_id;
  if v_item.id is null then return; end if;
  if auth.uid() <> v_item.created_by
     and not private.can_manage_campaign(v_item.campaign_id, auth.uid()) then
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

create or replace function public.mark_notifications_read(p_campaign_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.notifications
  set read_at = now()
  where campaign_id = p_campaign_id
    and recipient_user_id = auth.uid()
    and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.create_campaign_moment(uuid, text, text)
  from public, anon;
revoke all on function public.toggle_feed_reaction(uuid, text)
  from public, anon;
revoke all on function public.add_feed_comment(uuid, text)
  from public, anon;
revoke all on function public.delete_feed_comment(uuid) from public, anon;
revoke all on function public.delete_feed_item(uuid) from public, anon;
revoke all on function public.mark_notifications_read(uuid) from public, anon;
grant execute on function public.create_campaign_moment(uuid, text, text)
  to authenticated;
grant execute on function public.toggle_feed_reaction(uuid, text)
  to authenticated;
grant execute on function public.add_feed_comment(uuid, text)
  to authenticated;
grant execute on function public.delete_feed_comment(uuid) to authenticated;
grant execute on function public.delete_feed_item(uuid) to authenticated;
grant execute on function public.mark_notifications_read(uuid) to authenticated;

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    begin
      alter publication supabase_realtime add table public.feed_items;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.feed_reactions;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.feed_comments;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.notifications;
    exception when duplicate_object then null;
    end;
  end if;
end;
$$;

commit;
