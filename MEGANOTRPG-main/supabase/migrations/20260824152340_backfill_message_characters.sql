update public.chat_messages m
set character_id = cm.active_character_id,
    author_name = ch.name,
    author_avatar_url = ch.avatar_url
from public.chat_rooms r
join public.campaign_members cm on cm.campaign_id = r.campaign_id
join public.characters ch on ch.id = cm.active_character_id
where m.room_id = r.id
  and m.user_id = cm.user_id
  and m.character_id is null;
