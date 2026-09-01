begin;

-- Structured events and attachment-only messages intentionally have an empty
-- text body. The original vertical-slice constraint predated both features.
alter table public.chat_messages
  drop constraint if exists chat_messages_body_check;

alter table public.chat_messages
  add constraint chat_messages_body_check check (
    char_length(body) <= 4000
    and (
      char_length(btrim(body)) >= 1
      or attachment_url is not null
      or event_kind is not null
    )
  );

alter table public.chat_messages
  drop constraint if exists chat_messages_event_payload_required;

alter table public.chat_messages
  add constraint chat_messages_event_payload_required check (
    event_kind is null or event_payload is not null
  );

-- New game rooms are readable by the campaign unless the GM explicitly hides
-- them. Writing remains opt-in and is controlled independently.
alter table public.chat_rooms
  alter column open_to_campaign set default true;

update public.chat_rooms
set open_to_campaign = true,
    updated_at = now()
where room_type in ('character', 'scene')
  and room_state <> 'closed';

create or replace function private.can_read_chat_room(
  p_room_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.chat_rooms r
    join public.campaign_members cm
      on cm.campaign_id = r.campaign_id
     and cm.user_id = p_user_id
    left join public.characters c on c.id = r.character_id
    where r.id = p_room_id
      and (
        r.room_type = 'flood'
        or (
          (cm.is_owner = true or cm.role = 'gm')
          and (
            r.room_type <> 'character'
            or private.can_view_character(r.character_id, p_user_id)
          )
        )
        or (
          r.room_type in ('scene', 'character')
          and r.open_to_campaign = true
          and (
            r.room_type <> 'character'
            or private.can_view_character(r.character_id, p_user_id)
          )
        )
        or (r.room_type = 'character' and c.assigned_user_id = p_user_id)
        or exists (
          select 1
          from public.chat_room_members crm
          where crm.room_id = r.id
            and crm.user_id = p_user_id
            and crm.can_read = true
        )
      )
  );
$$;

create or replace function private.ensure_character_chat_room(p_character_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_character public.characters%rowtype;
  v_room_id uuid;
  v_position integer;
begin
  select * into v_character
  from public.characters c
  where c.id = p_character_id;

  if v_character.id is null or v_character.character_type <> 'pc' then
    return null;
  end if;

  select r.id into v_room_id
  from public.chat_rooms r
  where r.character_id = v_character.id
    and r.room_type = 'character'
  limit 1;

  if v_room_id is not null then
    update public.chat_rooms
    set title = v_character.name,
        is_read_only = (v_character.life_state = 'dead')
    where id = v_room_id;
    return v_room_id;
  end if;

  select coalesce(max(r.position), 0) + 10 into v_position
  from public.chat_rooms r
  where r.campaign_id = v_character.campaign_id
    and r.room_type = 'character';

  insert into public.chat_rooms(
    campaign_id, slug, title, category, position,
    room_type, character_id, open_to_campaign, campaign_can_write, is_read_only
  ) values (
    v_character.campaign_id,
    'character-' || replace(v_character.id::text, '-', ''),
    v_character.name,
    'game',
    v_position,
    'character',
    v_character.id,
    true,
    false,
    v_character.life_state = 'dead'
  )
  returning id into v_room_id;

  return v_room_id;
end;
$$;

revoke all on function private.ensure_character_chat_room(uuid) from public, anon;
grant execute on function private.ensure_character_chat_room(uuid) to authenticated, service_role;

commit;
