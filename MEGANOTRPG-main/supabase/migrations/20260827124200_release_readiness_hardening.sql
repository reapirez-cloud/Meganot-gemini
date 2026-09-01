begin;

-- Cover foreign keys introduced by World/Discovery/Templates/Resource Runtime.
create index if not exists character_location_discoveries_location_idx
  on public.character_location_discoveries(location_id);
create index if not exists character_location_discoveries_discovered_by_idx
  on public.character_location_discoveries(discovered_by) where discovered_by is not null;

create index if not exists character_location_link_discoveries_link_idx
  on public.character_location_link_discoveries(location_link_id);
create index if not exists character_location_link_discoveries_discovered_by_idx
  on public.character_location_link_discoveries(discovered_by) where discovered_by is not null;

create index if not exists character_npc_discoveries_npc_idx
  on public.character_npc_discoveries(npc_character_id);
create index if not exists character_npc_discoveries_message_idx
  on public.character_npc_discoveries(source_message_id) where source_message_id is not null;
create index if not exists character_npc_discoveries_discovered_by_idx
  on public.character_npc_discoveries(discovered_by) where discovered_by is not null;

create index if not exists character_resource_states_updated_by_idx
  on public.character_resource_states(updated_by) where updated_by is not null;
create index if not exists character_template_assignments_template_idx
  on public.character_template_assignments(template_id);
create index if not exists character_template_assignments_assigned_by_idx
  on public.character_template_assignments(assigned_by) where assigned_by is not null;
create index if not exists character_world_state_updated_by_idx
  on public.character_world_state(updated_by) where updated_by is not null;
create index if not exists chat_actor_bindings_character_idx
  on public.chat_actor_bindings(character_id);
create index if not exists chat_rooms_location_idx
  on public.chat_rooms(location_id) where location_id is not null;
create index if not exists locations_created_by_idx
  on public.locations(created_by) where created_by is not null;
create index if not exists location_links_created_by_idx
  on public.location_links(created_by) where created_by is not null;
create index if not exists rule_templates_created_by_idx
  on public.rule_templates(created_by) where created_by is not null;
create index if not exists scene_participants_character_idx
  on public.scene_participants(character_id);
create index if not exists scene_participants_added_by_idx
  on public.scene_participants(added_by) where added_by is not null;

-- Evaluate auth.uid once per statement rather than once per row.
drop policy if exists character_world_state_read on public.character_world_state;
create policy character_world_state_read on public.character_world_state
for select to authenticated
using ((select private.can_view_character(character_id, (select auth.uid()))));

drop policy if exists character_world_state_insert on public.character_world_state;
create policy character_world_state_insert on public.character_world_state
for insert to authenticated
with check ((select private.can_manage_character(character_id, (select auth.uid()))));

drop policy if exists character_world_state_update on public.character_world_state;
create policy character_world_state_update on public.character_world_state
for update to authenticated
using ((select private.can_manage_character(character_id, (select auth.uid()))))
with check ((select private.can_manage_character(character_id, (select auth.uid()))));

drop policy if exists character_resource_states_read on public.character_resource_states;
create policy character_resource_states_read on public.character_resource_states
for select to authenticated
using ((select private.can_view_character(character_id, (select auth.uid()))));

commit;
