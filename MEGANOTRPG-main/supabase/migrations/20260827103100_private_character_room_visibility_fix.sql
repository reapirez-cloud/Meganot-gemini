begin;

-- Character-room access must preserve "Только я" visibility even between managers.
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
        or (r.room_type = 'scene' and r.open_to_campaign = true)
        or (r.room_type = 'character' and c.assigned_user_id = p_user_id)
        or exists (
          select 1 from public.chat_room_members crm
          where crm.room_id = r.id
            and crm.user_id = p_user_id
            and crm.can_read = true
        )
      )
  );
$$;

create or replace function private.can_write_chat_room(
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
      and r.is_read_only = false
      and (
        r.room_type = 'flood'
        or (
          (cm.is_owner = true or cm.role = 'gm')
          and (
            r.room_type <> 'character'
            or private.can_manage_character(r.character_id, p_user_id)
          )
        )
        or (r.room_type = 'scene' and r.open_to_campaign = true)
        or (r.room_type = 'character' and c.assigned_user_id = p_user_id)
        or exists (
          select 1 from public.chat_room_members crm
          where crm.room_id = r.id
            and crm.user_id = p_user_id
            and crm.can_write = true
        )
      )
  );
$$;

commit;
