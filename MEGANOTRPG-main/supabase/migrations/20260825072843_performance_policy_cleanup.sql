begin;

create index if not exists campaign_invites_created_by_idx
  on public.campaign_invites (created_by);
create index if not exists notifications_feed_item_idx
  on public.notifications (feed_item_id)
  where feed_item_id is not null;

-- Keep one read policy per table. Manager write policies are split by command so
-- Postgres does not evaluate a second permissive policy for every SELECT.
drop policy if exists achievements_manage_write on public.achievements;
create policy achievements_manager_insert
on public.achievements for insert to authenticated
with check (private.can_manage_campaign(campaign_id));
create policy achievements_manager_update
on public.achievements for update to authenticated
using (private.can_manage_campaign(campaign_id))
with check (private.can_manage_campaign(campaign_id));
create policy achievements_manager_delete
on public.achievements for delete to authenticated
using (private.can_manage_campaign(campaign_id));

drop policy if exists campaign_updates_manage_write on public.campaign_updates;
create policy campaign_updates_manager_insert
on public.campaign_updates for insert to authenticated
with check (private.can_manage_campaign(campaign_id));
create policy campaign_updates_manager_update
on public.campaign_updates for update to authenticated
using (private.can_manage_campaign(campaign_id))
with check (private.can_manage_campaign(campaign_id));
create policy campaign_updates_manager_delete
on public.campaign_updates for delete to authenticated
using (private.can_manage_campaign(campaign_id));

drop policy if exists character_features_manage_write on public.character_features;
create policy character_features_manager_insert
on public.character_features for insert to authenticated
with check (private.can_manage_character(character_id));
create policy character_features_manager_update
on public.character_features for update to authenticated
using (private.can_manage_character(character_id))
with check (private.can_manage_character(character_id));
create policy character_features_manager_delete
on public.character_features for delete to authenticated
using (private.can_manage_character(character_id));

drop policy if exists character_inventory_manage_write on public.character_inventory_items;
create policy character_inventory_manager_insert
on public.character_inventory_items for insert to authenticated
with check (private.can_manage_character(character_id));
create policy character_inventory_manager_update
on public.character_inventory_items for update to authenticated
using (private.can_manage_character(character_id))
with check (private.can_manage_character(character_id));
create policy character_inventory_manager_delete
on public.character_inventory_items for delete to authenticated
using (private.can_manage_character(character_id));

drop policy if exists character_sheets_manage_write on public.character_sheets;
create policy character_sheets_manager_insert
on public.character_sheets for insert to authenticated
with check (private.can_manage_character(character_id));
create policy character_sheets_manager_update
on public.character_sheets for update to authenticated
using (private.can_manage_character(character_id))
with check (private.can_manage_character(character_id));
create policy character_sheets_manager_delete
on public.character_sheets for delete to authenticated
using (private.can_manage_character(character_id));

drop policy if exists characters_manage_write on public.characters;
create policy characters_manager_insert
on public.characters for insert to authenticated
with check (private.can_manage_campaign(campaign_id));
create policy characters_manager_update
on public.characters for update to authenticated
using (private.can_manage_campaign(campaign_id))
with check (private.can_manage_campaign(campaign_id));
create policy characters_manager_delete
on public.characters for delete to authenticated
using (private.can_manage_campaign(campaign_id));

drop policy if exists chat_room_members_manage on public.chat_room_members;
create policy chat_room_members_manager_insert
on public.chat_room_members for insert to authenticated
with check (private.can_manage_chat_room(room_id));
create policy chat_room_members_manager_update
on public.chat_room_members for update to authenticated
using (private.can_manage_chat_room(room_id))
with check (private.can_manage_chat_room(room_id));
create policy chat_room_members_manager_delete
on public.chat_room_members for delete to authenticated
using (private.can_manage_chat_room(room_id));

drop policy if exists chat_rooms_manage_write on public.chat_rooms;
create policy chat_rooms_manager_insert
on public.chat_rooms for insert to authenticated
with check (private.can_manage_campaign(campaign_id));
create policy chat_rooms_manager_update
on public.chat_rooms for update to authenticated
using (private.can_manage_campaign(campaign_id))
with check (private.can_manage_campaign(campaign_id));
create policy chat_rooms_manager_delete
on public.chat_rooms for delete to authenticated
using (private.can_manage_campaign(campaign_id));

drop policy if exists location_links_manage_write on public.location_links;
create policy location_links_manager_insert
on public.location_links for insert to authenticated
with check (
  exists (
    select 1
    from public.location_sections s
    join public.locations l on l.id = s.location_id
    where s.id = section_id
      and private.can_manage_campaign(l.campaign_id)
  )
);
create policy location_links_manager_update
on public.location_links for update to authenticated
using (
  exists (
    select 1
    from public.location_sections s
    join public.locations l on l.id = s.location_id
    where s.id = section_id
      and private.can_manage_campaign(l.campaign_id)
  )
)
with check (
  exists (
    select 1
    from public.location_sections s
    join public.locations l on l.id = s.location_id
    where s.id = section_id
      and private.can_manage_campaign(l.campaign_id)
  )
);
create policy location_links_manager_delete
on public.location_links for delete to authenticated
using (
  exists (
    select 1
    from public.location_sections s
    join public.locations l on l.id = s.location_id
    where s.id = section_id
      and private.can_manage_campaign(l.campaign_id)
  )
);

drop policy if exists location_sections_manage_write on public.location_sections;
create policy location_sections_manager_insert
on public.location_sections for insert to authenticated
with check (
  exists (
    select 1 from public.locations l
    where l.id = location_id
      and private.can_manage_campaign(l.campaign_id)
  )
);
create policy location_sections_manager_update
on public.location_sections for update to authenticated
using (
  exists (
    select 1 from public.locations l
    where l.id = location_id
      and private.can_manage_campaign(l.campaign_id)
  )
)
with check (
  exists (
    select 1 from public.locations l
    where l.id = location_id
      and private.can_manage_campaign(l.campaign_id)
  )
);
create policy location_sections_manager_delete
on public.location_sections for delete to authenticated
using (
  exists (
    select 1 from public.locations l
    where l.id = location_id
      and private.can_manage_campaign(l.campaign_id)
  )
);

drop policy if exists locations_manage_write on public.locations;
create policy locations_manager_insert
on public.locations for insert to authenticated
with check (private.can_manage_campaign(campaign_id));
create policy locations_manager_update
on public.locations for update to authenticated
using (private.can_manage_campaign(campaign_id))
with check (private.can_manage_campaign(campaign_id));
create policy locations_manager_delete
on public.locations for delete to authenticated
using (private.can_manage_campaign(campaign_id));

drop policy if exists world_articles_manage_write on public.world_articles;
create policy world_articles_manager_insert
on public.world_articles for insert to authenticated
with check (private.can_manage_campaign(campaign_id));
create policy world_articles_manager_update
on public.world_articles for update to authenticated
using (private.can_manage_campaign(campaign_id))
with check (private.can_manage_campaign(campaign_id));
create policy world_articles_manager_delete
on public.world_articles for delete to authenticated
using (private.can_manage_campaign(campaign_id));

drop policy if exists world_sections_manage_write on public.world_sections;
create policy world_sections_manager_insert
on public.world_sections for insert to authenticated
with check (private.can_manage_campaign(campaign_id));
create policy world_sections_manager_update
on public.world_sections for update to authenticated
using (private.can_manage_campaign(campaign_id))
with check (private.can_manage_campaign(campaign_id));
create policy world_sections_manager_delete
on public.world_sections for delete to authenticated
using (private.can_manage_campaign(campaign_id));

-- Merge the two profile read paths into one policy.
drop policy if exists profiles_campaign_member_read on public.profiles;
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_scoped_read
on public.profiles for select to authenticated
using (
  user_id = (select auth.uid())
  or private.shares_campaign(user_id)
);

-- Cache the current user once per statement in the remaining legacy policies.
drop policy if exists campaigns_member_read on public.campaigns;
create policy campaigns_member_read
on public.campaigns for select to authenticated
using (
  exists (
    select 1 from public.campaign_members cm
    where cm.campaign_id = id
      and cm.user_id = (select auth.uid())
  )
);

drop policy if exists world_sections_member_read on public.world_sections;
create policy world_sections_member_read
on public.world_sections for select to authenticated
using (
  exists (
    select 1 from public.campaign_members cm
    where cm.campaign_id = campaign_id
      and cm.user_id = (select auth.uid())
  )
);

drop policy if exists world_articles_member_read on public.world_articles;
create policy world_articles_member_read
on public.world_articles for select to authenticated
using (
  exists (
    select 1 from public.campaign_members cm
    where cm.campaign_id = campaign_id
      and cm.user_id = (select auth.uid())
  )
);

drop policy if exists achievements_member_read on public.achievements;
create policy achievements_member_read
on public.achievements for select to authenticated
using (
  exists (
    select 1 from public.campaign_members cm
    where cm.campaign_id = campaign_id
      and cm.user_id = (select auth.uid())
  )
);

drop policy if exists campaign_updates_member_read on public.campaign_updates;
create policy campaign_updates_member_read
on public.campaign_updates for select to authenticated
using (
  exists (
    select 1 from public.campaign_members cm
    where cm.campaign_id = campaign_id
      and cm.user_id = (select auth.uid())
  )
);

drop policy if exists character_diary_posts_insert on public.character_diary_posts;
create policy character_diary_posts_insert
on public.character_diary_posts for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (
    (select private.is_assigned_character(character_id))
    or (select private.can_manage_character(character_id))
  )
);

drop policy if exists character_diary_comments_insert on public.character_diary_comments;
create policy character_diary_comments_insert
on public.character_diary_comments for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (select private.can_read_diary_post(post_id))
);

commit;
