create table if not exists public.character_sheets (
  character_id uuid primary key references public.characters(id) on delete cascade,
  race text not null default '',
  background text not null default '',
  alignment text not null default '',
  experience integer not null default 0 check (experience >= 0),
  strength integer not null default 10 check (strength between 1 and 30),
  dexterity integer not null default 10 check (dexterity between 1 and 30),
  constitution integer not null default 10 check (constitution between 1 and 30),
  intelligence integer not null default 10 check (intelligence between 1 and 30),
  wisdom integer not null default 10 check (wisdom between 1 and 30),
  charisma integer not null default 10 check (charisma between 1 and 30),
  armor_class integer not null default 10 check (armor_class >= 0),
  initiative_bonus integer not null default 0,
  speed integer not null default 30 check (speed >= 0),
  proficiency_bonus integer not null default 2,
  max_hp integer not null default 1 check (max_hp >= 0),
  current_hp integer not null default 1 check (current_hp >= 0),
  temp_hp integer not null default 0 check (temp_hp >= 0),
  hit_dice text not null default '',
  death_save_successes integer not null default 0 check (death_save_successes between 0 and 3),
  death_save_failures integer not null default 0 check (death_save_failures between 0 and 3),
  passive_perception integer not null default 10,
  saving_throw_proficiencies jsonb not null default '[]'::jsonb,
  skill_proficiencies jsonb not null default '{}'::jsonb,
  proficiencies text not null default '',
  languages text not null default '',
  senses text not null default '',
  personality_traits text not null default '',
  ideals text not null default '',
  bonds text not null default '',
  flaws text not null default '',
  backstory text not null default '',
  notes text not null default '',
  spellcasting_enabled boolean not null default false,
  spellcasting_ability text,
  spell_save_dc integer,
  spell_attack_bonus integer,
  spell_slots jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.character_inventory_items (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  name text not null,
  quantity integer not null default 1 check (quantity >= 0),
  weight numeric(10,2),
  equipped boolean not null default false,
  image_url text,
  description text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists character_inventory_items_character_idx
  on public.character_inventory_items(character_id, sort_order, created_at);

create table if not exists public.character_spells (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  name text not null,
  spell_level integer not null default 0 check (spell_level between 0 and 9),
  school text not null default '',
  casting_time text not null default '',
  spell_range text not null default '',
  duration text not null default '',
  components text not null default '',
  concentration boolean not null default false,
  ritual boolean not null default false,
  prepared boolean not null default false,
  description text not null default '',
  source text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists character_spells_character_idx
  on public.character_spells(character_id, spell_level, sort_order, name);

create table if not exists public.character_features (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  kind text not null default 'feature' check (kind in ('feat','class_feature','racial_trait','feature','other')),
  name text not null,
  description text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists character_features_character_idx
  on public.character_features(character_id, sort_order, created_at);

create table if not exists public.character_diary_posts (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index if not exists character_diary_posts_character_idx
  on public.character_diary_posts(character_id, created_at desc);

create table if not exists public.character_diary_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.character_diary_posts(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1500),
  created_at timestamptz not null default now()
);

create index if not exists character_diary_comments_post_idx
  on public.character_diary_comments(post_id, created_at);

create or replace function private.can_manage_character(
  p_character_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.characters c
    where c.id = p_character_id
      and private.can_manage_campaign(c.campaign_id, p_user_id)
  );
$$;

create or replace function private.is_assigned_character(
  p_character_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.characters c
    where c.id = p_character_id
      and c.assigned_user_id = p_user_id
  );
$$;

create or replace function private.can_view_character(
  p_character_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.can_manage_character(p_character_id, p_user_id)
      or private.is_assigned_character(p_character_id, p_user_id);
$$;

create or replace function private.is_character_campaign_member(
  p_character_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.characters c
    join public.campaign_members cm on cm.campaign_id = c.campaign_id
    where c.id = p_character_id
      and cm.user_id = p_user_id
  );
$$;

create or replace function private.can_read_diary_post(
  p_post_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.character_diary_posts p
    where p.id = p_post_id
      and private.is_character_campaign_member(p.character_id, p_user_id)
  );
$$;

create or replace function private.can_manage_diary_post(
  p_post_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.character_diary_posts p
    where p.id = p_post_id
      and private.can_manage_character(p.character_id, p_user_id)
  );
$$;

create or replace function public.ensure_character_sheet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.character_sheets(character_id)
  values (new.id)
  on conflict (character_id) do nothing;
  return new;
end;
$$;

revoke all on function public.ensure_character_sheet() from public, anon, authenticated;

drop trigger if exists character_create_sheet on public.characters;
create trigger character_create_sheet
after insert on public.characters
for each row execute function public.ensure_character_sheet();

insert into public.character_sheets(character_id)
select c.id from public.characters c
on conflict (character_id) do nothing;

create or replace function public.set_my_character_avatar(
  p_character_id uuid,
  p_avatar_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not (
    private.is_assigned_character(p_character_id, auth.uid())
    or private.can_manage_character(p_character_id, auth.uid())
  ) then
    raise exception 'You cannot edit this character avatar';
  end if;

  update public.characters
  set avatar_url = nullif(trim(p_avatar_url), ''),
      updated_at = now()
  where id = p_character_id;
end;
$$;

revoke all on function public.set_my_character_avatar(uuid, text) from public, anon;
grant execute on function public.set_my_character_avatar(uuid, text) to authenticated;

alter table public.character_sheets enable row level security;
alter table public.character_inventory_items enable row level security;
alter table public.character_spells enable row level security;
alter table public.character_features enable row level security;
alter table public.character_diary_posts enable row level security;
alter table public.character_diary_comments enable row level security;

drop policy if exists character_sheets_read on public.character_sheets;
create policy character_sheets_read on public.character_sheets
for select to authenticated
using (private.can_view_character(character_id));

drop policy if exists character_sheets_manage_write on public.character_sheets;
create policy character_sheets_manage_write on public.character_sheets
for all to authenticated
using (private.can_manage_character(character_id))
with check (private.can_manage_character(character_id));

drop policy if exists character_inventory_read on public.character_inventory_items;
create policy character_inventory_read on public.character_inventory_items
for select to authenticated
using (private.can_view_character(character_id));

drop policy if exists character_inventory_manage_write on public.character_inventory_items;
create policy character_inventory_manage_write on public.character_inventory_items
for all to authenticated
using (private.can_manage_character(character_id))
with check (private.can_manage_character(character_id));

drop policy if exists character_spells_read on public.character_spells;
create policy character_spells_read on public.character_spells
for select to authenticated
using (private.can_view_character(character_id));

drop policy if exists character_spells_player_manage on public.character_spells;
create policy character_spells_player_manage on public.character_spells
for all to authenticated
using (
  private.can_manage_character(character_id)
  or private.is_assigned_character(character_id)
)
with check (
  private.can_manage_character(character_id)
  or private.is_assigned_character(character_id)
);

drop policy if exists character_features_read on public.character_features;
create policy character_features_read on public.character_features
for select to authenticated
using (private.can_view_character(character_id));

drop policy if exists character_features_manage_write on public.character_features;
create policy character_features_manage_write on public.character_features
for all to authenticated
using (private.can_manage_character(character_id))
with check (private.can_manage_character(character_id));

drop policy if exists character_diary_posts_read on public.character_diary_posts;
create policy character_diary_posts_read on public.character_diary_posts
for select to authenticated
using (private.is_character_campaign_member(character_id));

drop policy if exists character_diary_posts_insert on public.character_diary_posts;
create policy character_diary_posts_insert on public.character_diary_posts
for insert to authenticated
with check (
  created_by = auth.uid()
  and (
    private.is_assigned_character(character_id)
    or private.can_manage_character(character_id)
  )
);

drop policy if exists character_diary_posts_delete on public.character_diary_posts;
create policy character_diary_posts_delete on public.character_diary_posts
for delete to authenticated
using (
  created_by = auth.uid()
  or private.can_manage_character(character_id)
);

drop policy if exists character_diary_comments_read on public.character_diary_comments;
create policy character_diary_comments_read on public.character_diary_comments
for select to authenticated
using (private.can_read_diary_post(post_id));

drop policy if exists character_diary_comments_insert on public.character_diary_comments;
create policy character_diary_comments_insert on public.character_diary_comments
for insert to authenticated
with check (
  created_by = auth.uid()
  and private.can_read_diary_post(post_id)
);

drop policy if exists character_diary_comments_delete on public.character_diary_comments;
create policy character_diary_comments_delete on public.character_diary_comments
for delete to authenticated
using (
  created_by = auth.uid()
  or private.can_manage_diary_post(post_id)
);
