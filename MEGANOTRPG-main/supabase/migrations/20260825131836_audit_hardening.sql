begin;

-- Allocate game-room positions inside the database so two GMs creating rooms
-- at the same time cannot race on max(position) + 10 in the client.
create or replace function public.create_campaign_chat_room(
  p_campaign_id uuid,
  p_title text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_position integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if v_title is null then
    raise exception 'Room title is required';
  end if;

  if char_length(v_title) > 100 then
    raise exception 'Room title is too long';
  end if;

  if not private.can_manage_campaign(p_campaign_id, auth.uid()) then
    raise exception 'Only GM or owner can create game rooms';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_campaign_id::text, 0)
  );

  select coalesce(max(r.position), 0) + 10
  into v_position
  from public.chat_rooms r
  where r.campaign_id = p_campaign_id
    and r.category = 'game';

  insert into public.chat_rooms (
    campaign_id,
    slug,
    title,
    category,
    position
  ) values (
    p_campaign_id,
    'game-' || replace(gen_random_uuid()::text, '-', ''),
    v_title,
    'game',
    v_position
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_campaign_chat_room(uuid, text)
  from public, anon;
grant execute on function public.create_campaign_chat_room(uuid, text)
  to authenticated;

commit;
