drop policy if exists characters_owner_update on public.characters;
create policy characters_owner_update
on public.characters for update
to authenticated
using (owner_user_id = auth.uid())
with check (
  owner_user_id = auth.uid()
  and exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id = characters.campaign_id
      and cm.user_id = auth.uid()
  )
);

revoke update on public.characters from authenticated;
grant update(name, character_class, level, bio, avatar_url, updated_at) on public.characters to authenticated;
