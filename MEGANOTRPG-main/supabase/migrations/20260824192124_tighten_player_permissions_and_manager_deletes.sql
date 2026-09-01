-- Campaign gallery: only GM/owner may create, edit or delete campaign art.
drop policy if exists campaign_art_items_member_insert on public.campaign_art_items;
drop policy if exists campaign_art_items_owner_or_manager_update on public.campaign_art_items;
drop policy if exists campaign_art_items_owner_or_manager_delete on public.campaign_art_items;

create policy campaign_art_items_manager_insert
on public.campaign_art_items
for insert
to authenticated
with check (
  uploaded_by = auth.uid()
  and private.can_manage_campaign(campaign_id)
);

create policy campaign_art_items_manager_update
on public.campaign_art_items
for update
to authenticated
using (private.can_manage_campaign(campaign_id))
with check (private.can_manage_campaign(campaign_id));

create policy campaign_art_items_manager_delete
on public.campaign_art_items
for delete
to authenticated
using (private.can_manage_campaign(campaign_id));

-- Spells: GM/owner create/delete; assigned player may edit existing spells and prepare them.
drop policy if exists character_spells_player_manage on public.character_spells;

drop policy if exists character_spells_manager_insert on public.character_spells;
drop policy if exists character_spells_player_update on public.character_spells;
drop policy if exists character_spells_manager_delete on public.character_spells;

create policy character_spells_manager_insert
on public.character_spells
for insert
to authenticated
with check (private.can_manage_character(character_id));

create policy character_spells_player_update
on public.character_spells
for update
to authenticated
using (
  private.can_manage_character(character_id)
  or private.is_assigned_character(character_id)
)
with check (
  private.can_manage_character(character_id)
  or private.is_assigned_character(character_id)
);

create policy character_spells_manager_delete
on public.character_spells
for delete
to authenticated
using (private.can_manage_character(character_id));

-- Diary entries/comments can be written by permitted players, but only GM/owner may delete them.
drop policy if exists character_diary_posts_delete on public.character_diary_posts;
create policy character_diary_posts_manager_delete
on public.character_diary_posts
for delete
to authenticated
using (private.can_manage_character(character_id));

drop policy if exists character_diary_comments_delete on public.character_diary_comments;
create policy character_diary_comments_manager_delete
on public.character_diary_comments
for delete
to authenticated
using (private.can_manage_diary_post(post_id));

-- Storage: players may upload only their own character avatars. GM/owner may also upload gallery/location/item art.
drop policy if exists campaign_media_own_folder_insert on storage.objects;
drop policy if exists campaign_media_own_folder_update on storage.objects;
drop policy if exists campaign_media_own_folder_delete on storage.objects;

create policy campaign_media_scoped_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'campaign-media'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1
    from public.campaign_members cm
    where cm.user_id = auth.uid()
      and (
        (storage.foldername(name))[2] = 'character-avatars'
        or cm.is_owner
        or cm.role = 'gm'
      )
  )
);

create policy campaign_media_scoped_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'campaign-media'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1
    from public.campaign_members cm
    where cm.user_id = auth.uid()
      and (
        (storage.foldername(name))[2] = 'character-avatars'
        or cm.is_owner
        or cm.role = 'gm'
      )
  )
)
with check (
  bucket_id = 'campaign-media'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1
    from public.campaign_members cm
    where cm.user_id = auth.uid()
      and (
        (storage.foldername(name))[2] = 'character-avatars'
        or cm.is_owner
        or cm.role = 'gm'
      )
  )
);

create policy campaign_media_scoped_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'campaign-media'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1
    from public.campaign_members cm
    where cm.user_id = auth.uid()
      and (
        (storage.foldername(name))[2] = 'character-avatars'
        or cm.is_owner
        or cm.role = 'gm'
      )
  )
);
