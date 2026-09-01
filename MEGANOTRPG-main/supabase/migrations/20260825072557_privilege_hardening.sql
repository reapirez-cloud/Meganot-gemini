begin;

revoke create on schema public from public, anon, authenticated;
grant usage on schema public to authenticated, service_role;

revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;
revoke truncate, references, trigger on all tables in schema public
  from authenticated;

alter default privileges in schema public
  revoke all privileges on tables from anon;
alter default privileges in schema public
  revoke all privileges on sequences from anon;
alter default privileges in schema public
  revoke execute on functions from public, anon;

revoke execute on all functions in schema public
  from public, anon, authenticated;

grant execute on function public.cast_prepared_spell(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.roll_chat_dice(uuid, integer, integer, integer)
  to authenticated, service_role;
grant execute on function public.grant_character_long_rest(uuid)
  to authenticated, service_role;
grant execute on function public.edit_chat_message(bigint, text)
  to authenticated, service_role;
grant execute on function public.delete_chat_message(bigint)
  to authenticated, service_role;
grant execute on function public.set_character_inventory_equipped(uuid, boolean, text)
  to authenticated, service_role;
grant execute on function public.set_character_spellcasting_enabled(uuid, boolean)
  to authenticated, service_role;
grant execute on function public.set_my_character_avatar(uuid, text)
  to authenticated, service_role;

grant execute on function public.create_campaign_invite(uuid, integer, integer)
  to authenticated, service_role;
grant execute on function public.join_campaign_by_invite(text)
  to authenticated, service_role;
grant execute on function public.set_campaign_member_role(uuid, uuid, text)
  to authenticated, service_role;

grant execute on function public.create_campaign_moment(uuid, text, text)
  to authenticated, service_role;
grant execute on function public.toggle_feed_reaction(uuid, text)
  to authenticated, service_role;
grant execute on function public.add_feed_comment(uuid, text)
  to authenticated, service_role;
grant execute on function public.delete_feed_comment(uuid)
  to authenticated, service_role;
grant execute on function public.delete_feed_item(uuid)
  to authenticated, service_role;
grant execute on function public.mark_notifications_read(uuid)
  to authenticated, service_role;

grant execute on function public.get_campaign_chat_rooms(uuid)
  to authenticated, service_role;
grant execute on function public.mark_chat_read(uuid, bigint)
  to authenticated, service_role;

commit;
