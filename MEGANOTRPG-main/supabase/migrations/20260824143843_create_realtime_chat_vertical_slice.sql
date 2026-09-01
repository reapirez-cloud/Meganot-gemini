create extension if not exists pgcrypto;

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  created_at timestamptz not null default now()
);

create table public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  slug text not null,
  title text not null,
  category text not null check (category in ('game', 'flood')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (campaign_id, slug)
);

create table public.chat_messages (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  client_id uuid not null,
  author_name text not null check (char_length(author_name) between 1 and 80),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index chat_rooms_campaign_category_position_idx
  on public.chat_rooms (campaign_id, category, position, created_at);

create index chat_messages_room_created_idx
  on public.chat_messages (room_id, created_at, id);

alter table public.campaigns enable row level security;
alter table public.chat_rooms enable row level security;
alter table public.chat_messages enable row level security;

create policy dev_public_read_campaigns
  on public.campaigns for select
  to anon, authenticated
  using (true);

create policy dev_public_read_rooms
  on public.chat_rooms for select
  to anon, authenticated
  using (true);

create policy dev_public_read_messages
  on public.chat_messages for select
  to anon, authenticated
  using (true);

create policy dev_public_insert_messages
  on public.chat_messages for insert
  to anon, authenticated
  with check (
    char_length(author_name) between 1 and 80
    and char_length(body) between 1 and 4000
  );

grant select on public.campaigns to anon, authenticated;
grant select on public.chat_rooms to anon, authenticated;
grant select, insert on public.chat_messages to anon, authenticated;
grant usage, select on sequence public.chat_messages_id_seq to anon, authenticated;

alter publication supabase_realtime add table public.chat_messages;

insert into public.campaigns (slug, title)
values ('demo', 'Проклятые земли')
on conflict (slug) do nothing;

insert into public.chat_rooms (campaign_id, slug, title, category, position)
select c.id, v.slug, v.title, v.category, v.position
from public.campaigns c
cross join (values
  ('main-scene', 'Основная сцена', 'game', 10),
  ('tavern', 'Таверна', 'game', 20),
  ('north-road', 'Северная дорога', 'game', 30),
  ('general', 'Общий флуд', 'flood', 10),
  ('memes', 'Мемы', 'flood', 20)
) as v(slug, title, category, position)
where c.slug = 'demo'
on conflict (campaign_id, slug) do nothing;

insert into public.chat_messages (room_id, client_id, author_name, body, created_at)
select r.id, gen_random_uuid(), x.author_name, x.body, now() - x.age
from public.chat_rooms r
join public.campaigns c on c.id = r.campaign_id
cross join (values
  ('GM', 'К вечеру таверна почти опустела. За дальним столом остались двое.', interval '14 minutes'),
  ('Вильям Кидд', 'Сажусь ближе к стойке и слушаю разговоры.', interval '12 minutes'),
  ('GM', 'Трактирщик замечает взгляд и молча ставит кружку на стойку.', interval '10 minutes'),
  ('Вильям Кидд', 'Спрашиваю, кто сегодня прибыл с северной дороги.', interval '8 minutes')
) as x(author_name, body, age)
where c.slug = 'demo'
  and r.slug = 'main-scene'
  and not exists (
    select 1 from public.chat_messages m where m.room_id = r.id
  );
