revoke execute on function public.use_character_template_resource_action(uuid,text,text) from authenticated;
revoke execute on function public.use_character_template_spell_v1(uuid,text,text,text) from authenticated;
revoke execute on function public.send_chat_template_action_v1(uuid,uuid,text,text,text,jsonb) from authenticated;
revoke execute on function public.send_chat_template_roll_v1(uuid,uuid,text,text,text,text,integer,boolean,integer,integer,integer) from authenticated;
revoke execute on function public.send_chat_template_spell_v1(uuid,uuid,text,text,text,text,jsonb) from authenticated;

grant execute on function public.send_chat_template_action_v2(uuid,uuid,text,text,text,jsonb,uuid) to authenticated;
grant execute on function public.send_chat_template_roll_v2(uuid,uuid,text,text,text,text,integer,boolean,integer,integer,integer,uuid) to authenticated;
grant execute on function public.send_chat_template_spell_v2(uuid,uuid,text,text,text,text,jsonb,uuid) to authenticated;

create index if not exists engine_command_receipts_created_by_idx
  on public.engine_command_receipts(created_by);

drop policy if exists location_npc_habitats_select on public.location_npc_habitats;
create policy location_npc_habitats_select
on public.location_npc_habitats
for select
to authenticated
using (
  private.can_view_location(location_id, (select auth.uid()))
  and private.can_view_character(npc_character_id, (select auth.uid()))
);
