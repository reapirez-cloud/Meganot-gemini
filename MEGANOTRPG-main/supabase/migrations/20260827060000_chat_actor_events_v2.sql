begin;

alter table public.chat_rooms
  add column if not exists avatar_url text;

alter table public.chat_messages
  add column if not exists event_kind text,
  add column if not exists event_payload jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chat_messages_event_kind_check') then
    alter table public.chat_messages add constraint chat_messages_event_kind_check
      check (event_kind is null or event_kind in ('roll','action','spell'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chat_messages_event_payload_object') then
    alter table public.chat_messages add constraint chat_messages_event_payload_object
      check (event_payload is null or jsonb_typeof(event_payload) = 'object');
  end if;
end $$;

create table if not exists public.chat_actor_bindings (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, character_id)
);
create index if not exists chat_actor_bindings_campaign_user_idx on public.chat_actor_bindings(campaign_id, user_id);
alter table public.chat_actor_bindings enable row level security;

drop policy if exists chat_actor_bindings_own_read on public.chat_actor_bindings;
create policy chat_actor_bindings_own_read on public.chat_actor_bindings for select to authenticated
using (user_id = (select auth.uid()));
revoke all on public.chat_actor_bindings from anon, authenticated;
grant select on public.chat_actor_bindings to authenticated;

create or replace function public.set_chat_actor_binding(p_character_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign_id uuid;
  v_visibility text;
  v_created_by uuid;
  v_assigned uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select c.campaign_id, c.visibility, c.created_by, c.assigned_user_id
  into v_campaign_id, v_visibility, v_created_by, v_assigned
  from public.characters c where c.id = p_character_id;
  if v_campaign_id is null then raise exception 'Character not found'; end if;
  if not private.can_manage_campaign(v_campaign_id, auth.uid()) then raise exception 'Only GM or owner can bind chat actors'; end if;
  if v_visibility = 'private' and v_created_by is distinct from auth.uid() and v_assigned is distinct from auth.uid() then
    raise exception 'Private character belongs to another GM';
  end if;
  if p_enabled then
    insert into public.chat_actor_bindings(campaign_id, user_id, character_id)
    values (v_campaign_id, auth.uid(), p_character_id)
    on conflict (user_id, character_id) do update set campaign_id = excluded.campaign_id;
  else
    delete from public.chat_actor_bindings where user_id = auth.uid() and character_id = p_character_id;
  end if;
end;
$$;
revoke all on function public.set_chat_actor_binding(uuid, boolean) from public, anon;
grant execute on function public.set_chat_actor_binding(uuid, boolean) to authenticated;

create or replace function public.set_chat_message_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign_id uuid;
  v_role text;
  v_is_owner boolean;
  v_player_name text;
  v_active_character_id uuid;
  v_character public.characters%rowtype;
  v_bound boolean := false;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select r.campaign_id, cm.role, cm.is_owner, cm.active_character_id, p.display_name
    into v_campaign_id, v_role, v_is_owner, v_active_character_id, v_player_name
  from public.chat_rooms r
  join public.campaign_members cm on cm.campaign_id = r.campaign_id and cm.user_id = auth.uid()
  join public.profiles p on p.user_id = auth.uid()
  where r.id = new.room_id;
  if v_campaign_id is null then raise exception 'Campaign membership required'; end if;

  if new.character_id is not null then
    select * into v_character from public.characters c
    where c.id = new.character_id and c.campaign_id = v_campaign_id;
    if v_character.id is null then raise exception 'Character is unavailable in this campaign'; end if;
    select exists(select 1 from public.chat_actor_bindings b where b.user_id = auth.uid() and b.character_id = v_character.id and b.campaign_id = v_campaign_id) into v_bound;
    if not v_bound and not (
      v_character.character_type = 'pc'
      and v_character.assigned_user_id = auth.uid()
      and v_active_character_id = v_character.id
    ) then raise exception 'This character is not available as your chat actor'; end if;

    new.user_id := auth.uid(); new.client_id := auth.uid();
    new.character_id := v_character.id; new.author_name := v_character.name; new.author_avatar_url := v_character.avatar_url;
    return new;
  end if;

  if v_active_character_id is not null then
    select * into v_character from public.characters c
    where c.id = v_active_character_id and c.campaign_id = v_campaign_id and c.assigned_user_id = auth.uid() and c.character_type = 'pc';
  end if;
  new.user_id := auth.uid(); new.client_id := auth.uid();
  if v_character.id is not null then
    new.character_id := v_character.id; new.author_name := v_character.name; new.author_avatar_url := v_character.avatar_url; return new;
  end if;
  if v_is_owner then
    new.character_id := null; new.author_name := 'Владелец (' || v_player_name || ')'; new.author_avatar_url := null; return new;
  end if;
  if v_role = 'gm' then
    new.character_id := null; new.author_name := 'ГМ (' || v_player_name || ')'; new.author_avatar_url := null; return new;
  end if;
  raise exception 'Active character must be assigned by GM or owner';
end;
$$;

create or replace function public.send_chat_roll_v2(
  p_room_id uuid,
  p_character_id uuid,
  p_label text,
  p_kind text,
  p_modifier integer default 0,
  p_roll_d20 boolean default true,
  p_dice_count integer default 0,
  p_dice_sides integer default 0,
  p_dice_modifier integer default 0
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_d20 integer;
  v_total integer;
  v_roll integer;
  v_rolls integer[] := '{}';
  v_dice_total integer := 0;
  v_id bigint;
  i integer;
  v_payload jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_write_chat_room(p_room_id, auth.uid()) then raise exception 'Нет права писать в этот чат'; end if;
  if length(trim(coalesce(p_label,''))) = 0 then raise exception 'Roll label is required'; end if;
  if p_modifier < -500 or p_modifier > 500 or p_dice_modifier < -500 or p_dice_modifier > 500 then raise exception 'Modifier is out of range'; end if;
  if p_dice_count < 0 or p_dice_count > 40 then raise exception 'Dice count is out of range'; end if;
  if p_dice_count > 0 and p_dice_sides not in (4,6,8,10,12,20,100) then raise exception 'Unsupported die'; end if;

  if p_roll_d20 then v_d20 := floor(random() * 20 + 1)::integer; v_total := v_d20 + p_modifier; end if;
  if p_dice_count > 0 then
    for i in 1..p_dice_count loop v_roll := floor(random() * p_dice_sides + 1)::integer; v_rolls := array_append(v_rolls, v_roll); v_dice_total := v_dice_total + v_roll; end loop;
    v_dice_total := v_dice_total + p_dice_modifier;
  end if;
  v_payload := jsonb_build_object('label', trim(p_label), 'kind', coalesce(nullif(trim(p_kind),''),'roll'), 'modifier', p_modifier, 'rollD20', p_roll_d20)
    || case when p_roll_d20 then jsonb_build_object('d20', v_d20, 'total', v_total) else '{}'::jsonb end
    || case when p_dice_count > 0 then jsonb_build_object('effect', jsonb_build_object('count',p_dice_count,'sides',p_dice_sides,'rolls',to_jsonb(v_rolls),'modifier',p_dice_modifier,'total',v_dice_total)) else '{}'::jsonb end;
  insert into public.chat_messages(room_id, character_id, body, event_kind, event_payload)
  values (p_room_id, p_character_id, '', 'roll', v_payload) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.send_chat_event_v2(
  p_room_id uuid,
  p_character_id uuid,
  p_event_kind text,
  p_label text,
  p_payload jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_id bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_write_chat_room(p_room_id, auth.uid()) then raise exception 'Нет права писать в этот чат'; end if;
  if p_event_kind not in ('action','spell') then raise exception 'Unsupported event type'; end if;
  insert into public.chat_messages(room_id, character_id, body, event_kind, event_payload)
  values (p_room_id, p_character_id, '', p_event_kind, jsonb_build_object('label', trim(p_label)) || coalesce(p_payload,'{}'::jsonb)) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.send_chat_roll_v2(uuid,uuid,text,text,integer,boolean,integer,integer,integer) from public, anon;
revoke all on function public.send_chat_event_v2(uuid,uuid,text,text,jsonb) from public, anon;
grant execute on function public.send_chat_roll_v2(uuid,uuid,text,text,integer,boolean,integer,integer,integer) to authenticated;
grant execute on function public.send_chat_event_v2(uuid,uuid,text,text,jsonb) to authenticated;

-- Return chat art together with unread/preview metadata.
drop function if exists public.get_campaign_chat_rooms(uuid);
create function public.get_campaign_chat_rooms(p_campaign_id uuid)
returns table (
  id uuid, slug text, title text, category text, room_position integer, avatar_url text,
  preview text, last_message_at timestamptz, last_message_id bigint, unread_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.slug, r.title, r.category, r.position, r.avatar_url,
    case
      when lm.id is null and r.category = 'flood' then 'Общий разговор кампании'
      when lm.id is null then 'Пока без сообщений'
      when lm.event_kind = 'roll' then lm.author_name || ': бросок · ' || coalesce(lm.event_payload->>'label','кубики')
      when lm.event_kind = 'spell' then lm.author_name || ': ✦ ' || coalesce(lm.event_payload->>'label','заклинание')
      when lm.event_kind = 'action' then lm.author_name || ': ' || coalesce(lm.event_payload->>'label','действие')
      else lm.author_name || ': ' || lm.body
    end,
    lm.created_at, lm.id, coalesce(unread.value,0)::integer
  from public.chat_rooms r
  left join public.chat_read_states rs on rs.room_id = r.id and rs.user_id = auth.uid()
  left join lateral (
    select m.id,m.author_name,m.body,m.created_at,m.event_kind,m.event_payload from public.chat_messages m where m.room_id=r.id order by m.id desc limit 1
  ) lm on true
  left join lateral (
    select count(*) value from public.chat_messages m where m.room_id=r.id and m.id > coalesce(rs.last_read_message_id,0) and m.user_id is distinct from auth.uid()
  ) unread on true
  where r.campaign_id = p_campaign_id and private.can_read_chat_room(r.id, auth.uid())
  order by case when r.category='flood' then 0 else 1 end, r.position asc;
$$;
revoke all on function public.get_campaign_chat_rooms(uuid) from public, anon;
grant execute on function public.get_campaign_chat_rooms(uuid) to authenticated;

commit;
