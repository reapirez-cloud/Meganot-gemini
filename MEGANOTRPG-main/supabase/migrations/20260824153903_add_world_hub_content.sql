create table if not exists public.world_sections (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  slug text not null,
  title text not null,
  description text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, slug)
);

create table if not exists public.world_articles (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  section_id uuid not null references public.world_sections(id) on delete cascade,
  title text not null,
  summary text not null default '',
  body text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  summary text not null default '',
  description text not null default '',
  image_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.achievements (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  character_id uuid references public.characters(id) on delete set null,
  title text not null,
  description text not null default '',
  icon text not null default '★',
  awarded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_updates (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  kind text not null default 'change' check (kind in ('change','announcement')),
  title text not null,
  body text not null default '',
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists world_sections_campaign_idx on public.world_sections(campaign_id, sort_order);
create index if not exists world_articles_section_idx on public.world_articles(section_id, sort_order);
create index if not exists locations_campaign_recent_idx on public.locations(campaign_id, updated_at desc);
create index if not exists achievements_campaign_recent_idx on public.achievements(campaign_id, awarded_at desc);
create index if not exists campaign_updates_campaign_recent_idx on public.campaign_updates(campaign_id, published_at desc);

alter table public.world_sections enable row level security;
alter table public.world_articles enable row level security;
alter table public.locations enable row level security;
alter table public.achievements enable row level security;
alter table public.campaign_updates enable row level security;

grant select, insert, update, delete on public.world_sections to authenticated;
grant select, insert, update, delete on public.world_articles to authenticated;
grant select, insert, update, delete on public.locations to authenticated;
grant select, insert, update, delete on public.achievements to authenticated;
grant select, insert, update, delete on public.campaign_updates to authenticated;

create policy "world_sections_member_read" on public.world_sections
for select to authenticated
using (exists (
  select 1 from public.campaign_members cm
  where cm.campaign_id = world_sections.campaign_id and cm.user_id = auth.uid()
));

create policy "world_sections_gm_write" on public.world_sections
for all to authenticated
using (exists (
  select 1 from public.campaign_members cm
  where cm.campaign_id = world_sections.campaign_id and cm.user_id = auth.uid() and cm.role = 'gm'
))
with check (exists (
  select 1 from public.campaign_members cm
  where cm.campaign_id = world_sections.campaign_id and cm.user_id = auth.uid() and cm.role = 'gm'
));

create policy "world_articles_member_read" on public.world_articles
for select to authenticated
using (exists (
  select 1 from public.campaign_members cm
  where cm.campaign_id = world_articles.campaign_id and cm.user_id = auth.uid()
));

create policy "world_articles_gm_write" on public.world_articles
for all to authenticated
using (exists (
  select 1 from public.campaign_members cm
  where cm.campaign_id = world_articles.campaign_id and cm.user_id = auth.uid() and cm.role = 'gm'
))
with check (exists (
  select 1 from public.campaign_members cm
  where cm.campaign_id = world_articles.campaign_id and cm.user_id = auth.uid() and cm.role = 'gm'
));

create policy "locations_member_read" on public.locations
for select to authenticated
using (exists (
  select 1 from public.campaign_members cm
  where cm.campaign_id = locations.campaign_id and cm.user_id = auth.uid()
));

create policy "locations_gm_write" on public.locations
for all to authenticated
using (exists (
  select 1 from public.campaign_members cm
  where cm.campaign_id = locations.campaign_id and cm.user_id = auth.uid() and cm.role = 'gm'
))
with check (exists (
  select 1 from public.campaign_members cm
  where cm.campaign_id = locations.campaign_id and cm.user_id = auth.uid() and cm.role = 'gm'
));

create policy "achievements_member_read" on public.achievements
for select to authenticated
using (exists (
  select 1 from public.campaign_members cm
  where cm.campaign_id = achievements.campaign_id and cm.user_id = auth.uid()
));

create policy "achievements_gm_write" on public.achievements
for all to authenticated
using (exists (
  select 1 from public.campaign_members cm
  where cm.campaign_id = achievements.campaign_id and cm.user_id = auth.uid() and cm.role = 'gm'
))
with check (exists (
  select 1 from public.campaign_members cm
  where cm.campaign_id = achievements.campaign_id and cm.user_id = auth.uid() and cm.role = 'gm'
));

create policy "campaign_updates_member_read" on public.campaign_updates
for select to authenticated
using (exists (
  select 1 from public.campaign_members cm
  where cm.campaign_id = campaign_updates.campaign_id and cm.user_id = auth.uid()
));

create policy "campaign_updates_gm_write" on public.campaign_updates
for all to authenticated
using (exists (
  select 1 from public.campaign_members cm
  where cm.campaign_id = campaign_updates.campaign_id and cm.user_id = auth.uid() and cm.role = 'gm'
))
with check (exists (
  select 1 from public.campaign_members cm
  where cm.campaign_id = campaign_updates.campaign_id and cm.user_id = auth.uid() and cm.role = 'gm'
));

with campaign as (
  select id from public.campaigns where slug = 'demo'
)
insert into public.world_sections (campaign_id, slug, title, description, sort_order)
select campaign.id, v.slug, v.title, v.description, v.sort_order
from campaign
cross join (values
  ('rules', 'Правила мира', 'Законы сеттинга, ограничения и важные договорённости кампании.', 10),
  ('history', 'История мира', 'События прошлого, эпохи и то, что уже известно игрокам.', 20),
  ('factions', 'Фракции', 'Дома, ордена, государства и другие силы мира.', 30),
  ('lore', 'Лор и особенности', 'Обычаи, термины и детали, которые помогают держать мир цельным.', 40)
) as v(slug, title, description, sort_order)
on conflict (campaign_id, slug) do nothing;

insert into public.world_articles (campaign_id, section_id, title, summary, body, sort_order)
select ws.campaign_id, ws.id, x.title, x.summary, x.body, x.sort_order
from public.world_sections ws
join (values
  ('rules', 'Что считается каноном', 'Короткие правила того, как фиксируются события кампании.', 'Каноном считается то, что произошло в игре и было подтверждено ведущим. Спорные трактовки можно вынести в отдельную заметку.', 10),
  ('history', 'Старая северная война', 'Война, последствия которой всё ещё влияют на северные земли.', 'Северная война закончилась много лет назад, но границы, долги и старые союзы до сих пор определяют отношения между городами.', 10),
  ('factions', 'Дом Вейлов', 'Старый дворянский дом северных земель.', 'Дом Вейлов удерживает несколько важных трактов и формально подчиняется короне, хотя фактически действует довольно самостоятельно.', 10),
  ('lore', 'Дороги и путешествия', 'Что игроки знают о дорогах, постоялых дворах и безопасности пути.', 'Главные дороги патрулируются нерегулярно. Вдали от крупных городов путешественники чаще полагаются на караваны и собственную охрану.', 10)
) as x(slug, title, summary, body, sort_order)
  on ws.slug = x.slug
where not exists (
  select 1 from public.world_articles wa where wa.section_id = ws.id and wa.title = x.title
);

with campaign as (
  select id from public.campaigns where slug = 'demo'
)
insert into public.locations (campaign_id, name, summary, description, sort_order, updated_at)
select campaign.id, v.name, v.summary, v.description, v.sort_order, now() - v.age
from campaign
cross join (values
  ('Северная башня', 'Пограничная башня на старой дороге.', 'Каменная башня стоит над трактом и видна за несколько миль. Сейчас игрокам известно только то, что гарнизон здесь недавно сменился.', 40, interval '2 hours'),
  ('Порт Рейвен', 'Торговый порт западного побережья.', 'Порт живёт за счёт каботажной торговли и нескольких крупных складов. Здесь легко найти работу и почти так же легко найти неприятности.', 30, interval '1 day'),
  ('Чернолесье', 'Большой лес к востоку от тракта.', 'Чернолесье занимает несколько дней пути и редко встречает путников прямой дорогой.', 20, interval '3 days'),
  ('Астэр', 'Столица и главный политический центр региона.', 'Астэр — большой город, в котором пересекаются интересы короны, купцов и старых домов.', 10, interval '7 days')
) as v(name, summary, description, sort_order, age)
where not exists (
  select 1 from public.locations l where l.campaign_id = campaign.id and l.name = v.name
);

with campaign as (
  select id from public.campaigns where slug = 'demo'
), ranked_chars as (
  select c.id, c.campaign_id, row_number() over (order by c.created_at) as rn
  from public.characters c
  join campaign on campaign.id = c.campaign_id
)
insert into public.achievements (campaign_id, character_id, title, description, icon, awarded_at)
select campaign.id, rc.id, v.title, v.description, v.icon, now() - v.age
from campaign
join (values
  (1, 'Первый след', 'Первым заметил важную деталь на северной дороге.', '✦', interval '1 day'),
  (2, 'Тот ещё переговорщик', 'Закрыл сложный разговор без драки.', '◆', interval '2 days')
) as v(rn, title, description, icon, age) on true
left join ranked_chars rc on rc.rn = v.rn
where not exists (
  select 1 from public.achievements a where a.campaign_id = campaign.id and a.title = v.title
);

with campaign as (
  select id from public.campaigns where slug = 'demo'
)
insert into public.campaign_updates (campaign_id, kind, title, body, published_at)
select campaign.id, v.kind, v.title, v.body, now() - v.age
from campaign
cross join (values
  ('announcement', 'Следующая игра', 'Собираемся в субботу вечером. Если время поменяется — ведущий напишет здесь.', interval '4 hours'),
  ('change', 'Добавлен раздел «Правила мира»', 'Ведущий вынес основные договорённости кампании в отдельный раздел.', interval '1 day')
) as v(kind, title, body, age)
where not exists (
  select 1 from public.campaign_updates cu where cu.campaign_id = campaign.id and cu.title = v.title
);
