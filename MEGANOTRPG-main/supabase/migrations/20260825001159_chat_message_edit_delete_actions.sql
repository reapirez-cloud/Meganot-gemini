alter table public.chat_messages add column if not exists edited_at timestamptz;

create or replace function public.edit_chat_message(
  p_message_id bigint,
  p_body text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_room_id uuid;
  v_body text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  v_body := trim(coalesce(p_body, ''));
  if v_body = '' then
    raise exception 'Message cannot be empty';
  end if;
  if char_length(v_body) > 4000 then
    raise exception 'Message is too long';
  end if;

  select user_id, room_id
    into v_user_id, v_room_id
  from public.chat_messages
  where id = p_message_id;

  if v_room_id is null then
    raise exception 'Message not found';
  end if;

  if v_user_id is distinct from auth.uid() then
    raise exception 'Only the author can edit this message';
  end if;

  if not private.can_write_chat_room(v_room_id) then
    raise exception 'You cannot write in this room';
  end if;

  update public.chat_messages
  set body = v_body,
      edited_at = now()
  where id = p_message_id;
end;
$$;

create or replace function public.delete_chat_message(
  p_message_id bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_room_id uuid;
  v_campaign_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select m.user_id, m.room_id, r.campaign_id
    into v_user_id, v_room_id, v_campaign_id
  from public.chat_messages m
  join public.chat_rooms r on r.id = m.room_id
  where m.id = p_message_id;

  if v_room_id is null then
    raise exception 'Message not found';
  end if;

  if not (
    v_user_id = auth.uid()
    or private.can_manage_campaign(v_campaign_id)
  ) then
    raise exception 'Not allowed to delete this message';
  end if;

  if not private.can_read_chat_room(v_room_id)
     and not private.can_manage_campaign(v_campaign_id) then
    raise exception 'You cannot access this room';
  end if;

  delete from public.chat_messages where id = p_message_id;
end;
$$;

grant execute on function public.edit_chat_message(bigint, text) to authenticated;
grant execute on function public.delete_chat_message(bigint) to authenticated;
