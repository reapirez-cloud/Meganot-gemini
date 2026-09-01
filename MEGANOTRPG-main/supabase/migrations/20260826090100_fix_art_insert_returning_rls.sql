begin;

drop policy if exists campaign_art_items_member_read on public.campaign_art_items;
create policy campaign_art_items_member_read
on public.campaign_art_items for select to authenticated
using (
  (select private.is_campaign_member(campaign_id))
  and (
    character_id is null
    or (select private.can_view_character(character_id))
  )
);

commit;
