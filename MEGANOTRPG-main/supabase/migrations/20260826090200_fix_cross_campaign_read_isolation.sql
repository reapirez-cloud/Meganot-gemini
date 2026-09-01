begin;

-- Tenant boundary: a user may read campaign-scoped rows only when they are a
-- member of the campaign that owns that exact row. Keep the outer table name
-- explicit so a future nested query cannot accidentally resolve campaign_id
-- to an inner alias (the old policies became cm.campaign_id = cm.campaign_id).

drop policy if exists world_sections_member_read on public.world_sections;
create policy world_sections_member_read
on public.world_sections for select to authenticated
using (
  (select private.is_campaign_member(world_sections.campaign_id))
);

drop policy if exists world_articles_member_read on public.world_articles;
create policy world_articles_member_read
on public.world_articles for select to authenticated
using (
  (select private.is_campaign_member(world_articles.campaign_id))
);

drop policy if exists campaign_updates_member_read on public.campaign_updates;
create policy campaign_updates_member_read
on public.campaign_updates for select to authenticated
using (
  (select private.is_campaign_member(campaign_updates.campaign_id))
);

commit;
