create or replace function private.can_view_character(
  p_character_id uuid,
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
    from public.characters c
    where c.id = p_character_id
      and (
        private.can_manage_campaign(c.campaign_id, p_user_id)
        or c.assigned_user_id = p_user_id
        or (
          private.is_campaign_member(c.campaign_id, p_user_id)
          and exists (
            select 1
            from public.campaign_members cm_owner
            where cm_owner.campaign_id = c.campaign_id
              and cm_owner.user_id = c.assigned_user_id
              and cm_owner.active_character_id = c.id
          )
        )
      )
  );
$$;

create or replace function private.can_read_diary_post(
  p_post_id uuid,
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
    from public.character_diary_posts p
    where p.id = p_post_id
      and private.can_view_character(p.character_id, p_user_id)
  );
$$;

drop policy if exists characters_scoped_read on public.characters;
create policy characters_scoped_read
on public.characters
for select
to authenticated
using (private.can_view_character(id));

drop policy if exists character_diary_posts_read on public.character_diary_posts;
create policy character_diary_posts_read
on public.character_diary_posts
for select
to authenticated
using (private.can_view_character(character_id));
