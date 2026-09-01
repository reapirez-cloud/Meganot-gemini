begin;

alter table public.chat_messages
  add column if not exists attachment_url text,
  add column if not exists attachment_kind text
    check (attachment_kind is null or attachment_kind in ('image'));

create index if not exists chat_messages_room_id_desc_idx
  on public.chat_messages (room_id, id desc);

create table if not exists public.chat_read_states (
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_message_id bigint,
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index if not exists chat_read_states_user_idx
  on public.chat_read_states (user_id, updated_at desc);

alter table public.chat_read_states enable row level security;

drop policy if exists chat_read_states_own_read on public.chat_read_states;
create policy chat_read_states_own_read
on public.chat_read_states for select to authenticated
using (user_id = (select auth.uid()));

revoke all on public.chat_read_states from anon, authenticated;
grant select on public.chat_read_states to authenticated;

create or replace function public.get_campaign_chat_rooms(p_campaign_id uuid)
returns table (
  id uuid,
  slug text,
  title text,
  category text,
  room_position integer,
  preview text,
  last_message_at timestamptz,
  last_message_id bigint,
  unread_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id,
    r.slug,
    r.title,
    r.category,
    r.position as room_position,
    case
      when lm.id is not null then lm.author_name || ': ' || lm.body
      when r.category = 'flood' then 'Общий разговор кампании'
      else 'Пока без сообщений'
    end as preview,
    lm.created_at as last_message_at,
    lm.id as last_message_id,
    coalesce(unread.value, 0)::integer as unread_count
  from public.chat_rooms r
  left join public.chat_read_states rs
    on rs.room_id = r.id and rs.user_id = auth.uid()
  left join lateral (
    select m.id, m.author_name, m.body, m.created_at
    from public.chat_messages m
    where m.room_id = r.id
    order by m.id desc
    limit 1
  ) lm on true
  left join lateral (
    select count(*) as value
    from public.chat_messages m
    where m.room_id = r.id
      and m.id > coalesce(rs.last_read_message_id, 0)
      and m.user_id is distinct from auth.uid()
  ) unread on true
  where r.campaign_id = p_campaign_id
    and private.can_read_chat_room(r.id, auth.uid())
  order by
    case when r.category = 'flood' then 0 else 1 end,
    r.position asc;
$$;

create or replace function public.mark_chat_read(
  p_room_id uuid,
  p_message_id bigint default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message_id bigint;
begin
  if auth.uid() is null
     or not private.can_read_chat_room(p_room_id, auth.uid()) then
    raise exception 'Chat room is unavailable';
  end if;

  if p_message_id is not null and not exists (
    select 1 from public.chat_messages m
    where m.id = p_message_id and m.room_id = p_room_id
  ) then
    raise exception 'Message does not belong to this room';
  end if;

  select coalesce(
    p_message_id,
    (select max(m.id) from public.chat_messages m where m.room_id = p_room_id)
  ) into v_message_id;

  insert into public.chat_read_states (
    room_id, user_id, last_read_message_id, updated_at
  ) values (
    p_room_id, auth.uid(), v_message_id, now()
  )
  on conflict (room_id, user_id) do update
  set last_read_message_id = greatest(
        coalesce(public.chat_read_states.last_read_message_id, 0),
        coalesce(excluded.last_read_message_id, 0)
      ),
      updated_at = now();
end;
$$;

revoke all on function public.get_campaign_chat_rooms(uuid) from public, anon;
revoke all on function public.mark_chat_read(uuid, bigint) from public, anon;
grant execute on function public.get_campaign_chat_rooms(uuid) to authenticated;
grant execute on function public.mark_chat_read(uuid, bigint) to authenticated;

commit;
