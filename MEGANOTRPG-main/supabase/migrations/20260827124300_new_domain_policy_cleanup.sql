begin;

-- Discovery tables: keep one SELECT policy and split manager writes by operation.
drop policy if exists character_location_discoveries_manage on public.character_location_discoveries;
create policy character_location_discoveries_insert on public.character_location_discoveries
for insert to authenticated
with check ((select private.can_manage_character(character_id)));
create policy character_location_discoveries_update on public.character_location_discoveries
for update to authenticated
using ((select private.can_manage_character(character_id)))
with check ((select private.can_manage_character(character_id)));
create policy character_location_discoveries_delete on public.character_location_discoveries
for delete to authenticated
using ((select private.can_manage_character(character_id)));

drop policy if exists character_npc_discoveries_manage on public.character_npc_discoveries;
create policy character_npc_discoveries_insert on public.character_npc_discoveries
for insert to authenticated
with check ((select private.can_manage_character(character_id)));
create policy character_npc_discoveries_update on public.character_npc_discoveries
for update to authenticated
using ((select private.can_manage_character(character_id)))
with check ((select private.can_manage_character(character_id)));
create policy character_npc_discoveries_delete on public.character_npc_discoveries
for delete to authenticated
using ((select private.can_manage_character(character_id)));

drop policy if exists character_location_link_discoveries_manage on public.character_location_link_discoveries;
create policy character_location_link_discoveries_insert on public.character_location_link_discoveries
for insert to authenticated
with check ((select private.can_manage_character(character_id)));
create policy character_location_link_discoveries_update on public.character_location_link_discoveries
for update to authenticated
using ((select private.can_manage_character(character_id)))
with check ((select private.can_manage_character(character_id)));
create policy character_location_link_discoveries_delete on public.character_location_link_discoveries
for delete to authenticated
using ((select private.can_manage_character(character_id)));

-- Template assignments: reads are governed by can_view_character; writes by can_manage_character.
drop policy if exists character_template_assignments_manage on public.character_template_assignments;
create policy character_template_assignments_insert on public.character_template_assignments
for insert to authenticated
with check ((select private.can_manage_character(character_id)));
create policy character_template_assignments_update on public.character_template_assignments
for update to authenticated
using ((select private.can_manage_character(character_id)))
with check ((select private.can_manage_character(character_id)));
create policy character_template_assignments_delete on public.character_template_assignments
for delete to authenticated
using ((select private.can_manage_character(character_id)));

-- Rule templates: membership reads remain separate from manager writes.
drop policy if exists rule_templates_manage on public.rule_templates;
create policy rule_templates_insert on public.rule_templates
for insert to authenticated
with check ((select private.can_manage_campaign(campaign_id)));
create policy rule_templates_update on public.rule_templates
for update to authenticated
using ((select private.can_manage_campaign(campaign_id)))
with check ((select private.can_manage_campaign(campaign_id)));
create policy rule_templates_delete on public.rule_templates
for delete to authenticated
using ((select private.can_manage_campaign(campaign_id)));

drop policy if exists rule_template_levels_manage on public.rule_template_levels;
create policy rule_template_levels_insert on public.rule_template_levels
for insert to authenticated
with check (exists(
  select 1 from public.rule_templates t
  where t.id=template_id and (select private.can_manage_campaign(t.campaign_id))
));
create policy rule_template_levels_update on public.rule_template_levels
for update to authenticated
using (exists(
  select 1 from public.rule_templates t
  where t.id=template_id and (select private.can_manage_campaign(t.campaign_id))
))
with check (exists(
  select 1 from public.rule_templates t
  where t.id=template_id and (select private.can_manage_campaign(t.campaign_id))
));
create policy rule_template_levels_delete on public.rule_template_levels
for delete to authenticated
using (exists(
  select 1 from public.rule_templates t
  where t.id=template_id and (select private.can_manage_campaign(t.campaign_id))
));

-- Scene participant reads remain room-access based; writes are campaign-manager only.
drop policy if exists scene_participants_manage on public.scene_participants;
create policy scene_participants_insert on public.scene_participants
for insert to authenticated
with check (exists(
  select 1 from public.chat_rooms r
  where r.id=room_id and (select private.can_manage_campaign(r.campaign_id))
));
create policy scene_participants_update on public.scene_participants
for update to authenticated
using (exists(
  select 1 from public.chat_rooms r
  where r.id=room_id and (select private.can_manage_campaign(r.campaign_id))
))
with check (exists(
  select 1 from public.chat_rooms r
  where r.id=room_id and (select private.can_manage_campaign(r.campaign_id))
));
create policy scene_participants_delete on public.scene_participants
for delete to authenticated
using (exists(
  select 1 from public.chat_rooms r
  where r.id=room_id and (select private.can_manage_campaign(r.campaign_id))
));

commit;
