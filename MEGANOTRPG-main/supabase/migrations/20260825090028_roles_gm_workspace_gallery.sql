begin;

-- Roles are independent: a campaign still has exactly one owner, but any
-- number of members may work as game masters.
drop index if exists public.campaign_members_one_gm_per_campaign;

create or replace function public.set_campaign_member_role(
  p_campaign_id uuid,
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_role not in ('gm', 'player') then
    raise exception 'Unsupported role';
  end if;

  if not private.is_campaign_owner(p_campaign_id, auth.uid()) then
    raise exception 'Only campaign owner can change roles';
  end if;

  if not exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id = p_campaign_id
      and cm.user_id = p_user_id
  ) then
    raise exception 'Target user is not a campaign member';
  end if;

  if exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id = p_campaign_id
      and cm.user_id = p_user_id
      and cm.is_owner = true
  ) then
    raise exception 'Owner role is managed separately';
  end if;

  update public.campaign_members
  set role = p_role
  where campaign_id = p_campaign_id
    and user_id = p_user_id;
end;
$$;

revoke all on function public.set_campaign_member_role(uuid, uuid, text)
  from public, anon;
grant execute on function public.set_campaign_member_role(uuid, uuid, text)
  to authenticated;

-- Campaign presentation is real content now, not hard-coded interface copy.
alter table public.campaigns
  add column if not exists summary text not null default '',
  add column if not exists rules_summary text not null default '',
  add column if not exists cover_url text;

-- PCs and NPCs share the same profile/sheet system, while visibility and
-- assignment remain explicit.
alter table public.characters
  add column if not exists character_type text not null default 'pc',
  add column if not exists visibility text not null default 'campaign',
  add column if not exists created_by uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'characters_character_type_check'
      and conrelid = 'public.characters'::regclass
  ) then
    alter table public.characters
      add constraint characters_character_type_check
      check (character_type in ('pc', 'npc'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'characters_visibility_check'
      and conrelid = 'public.characters'::regclass
  ) then
    alter table public.characters
      add constraint characters_visibility_check
      check (visibility in ('campaign', 'private'));
  end if;
end;
$$;

create index if not exists characters_campaign_type_idx
  on public.characters (campaign_id, character_type, created_at);
create index if not exists characters_created_by_idx
  on public.characters (created_by)
  where created_by is not null;

create or replace function private.can_view_character(
  p_character_id uuid,
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
    from public.characters c
    where c.id = p_character_id
      and (
        private.can_manage_campaign(c.campaign_id, p_user_id)
        or c.assigned_user_id = p_user_id
        or (
          c.character_type = 'npc'
          and c.visibility = 'campaign'
          and private.is_campaign_member(c.campaign_id, p_user_id)
        )
        or (
          c.character_type = 'pc'
          and private.is_campaign_member(c.campaign_id, p_user_id)
          and exists (
            select 1
            from public.campaign_members cm_owner
            where cm_owner.campaign_id = c.campaign_id
              and cm_owner.user_id = c.assigned_user_id
              and cm_owner.active_character_id = c.id
          )
        )
      )
  );
$$;

create or replace function public.create_campaign_character(
  p_campaign_id uuid,
  p_name text,
  p_character_class text default 'Персонаж',
  p_level integer default 1,
  p_bio text default '',
  p_avatar_url text default null,
  p_assigned_user_id uuid default null,
  p_character_type text default 'pc',
  p_visibility text default 'campaign'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_is_manager boolean;
  v_assigned_user_id uuid;
  v_character_type text := lower(trim(coalesce(p_character_type, 'pc')));
  v_visibility text := lower(trim(coalesce(p_visibility, 'campaign')));
  v_level integer := greatest(1, least(coalesce(p_level, 1), 30));
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not private.is_campaign_member(p_campaign_id, auth.uid()) then
    raise exception 'Campaign membership required';
  end if;

  if nullif(trim(coalesce(p_name, '')), '') is null then
    raise exception 'Character name is required';
  end if;

  if v_character_type not in ('pc', 'npc') then
    raise exception 'Unsupported character type';
  end if;

  if v_visibility not in ('campaign', 'private') then
    raise exception 'Unsupported character visibility';
  end if;

  v_is_manager := private.can_manage_campaign(p_campaign_id, auth.uid());

  if v_is_manager then
    v_assigned_user_id := case
      when v_character_type = 'npc' then null
      else p_assigned_user_id
    end;

    if v_assigned_user_id is not null and not exists (
      select 1
      from public.campaign_members cm
      where cm.campaign_id = p_campaign_id
        and cm.user_id = v_assigned_user_id
    ) then
      raise exception 'Assigned user is not a campaign member';
    end if;
  else
    if v_character_type <> 'pc' then
      raise exception 'Players can create only their own player characters';
    end if;
    v_assigned_user_id := auth.uid();
    v_visibility := 'campaign';
    v_level := 1;
  end if;

  insert into public.characters (
    campaign_id,
    assigned_user_id,
    name,
    character_class,
    level,
    bio,
    avatar_url,
    character_type,
    visibility,
    created_by
  ) values (
    p_campaign_id,
    v_assigned_user_id,
    trim(p_name),
    coalesce(nullif(trim(coalesce(p_character_class, '')), ''), 'Персонаж'),
    v_level,
    trim(coalesce(p_bio, '')),
    nullif(trim(coalesce(p_avatar_url, '')), ''),
    v_character_type,
    v_visibility,
    auth.uid()
  )
  returning id into v_id;

  if v_assigned_user_id is not null then
    update public.campaign_members
    set active_character_id = v_id
    where campaign_id = p_campaign_id
      and user_id = v_assigned_user_id
      and active_character_id is null;
  end if;

  return v_id;
end;
$$;

create or replace function public.update_campaign_character(
  p_character_id uuid,
  p_name text,
  p_character_class text,
  p_level integer,
  p_bio text,
  p_avatar_url text,
  p_assigned_user_id uuid,
  p_character_type text,
  p_visibility text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_character public.characters%rowtype;
  v_is_manager boolean;
  v_assigned_user_id uuid;
  v_character_type text := lower(trim(coalesce(p_character_type, 'pc')));
  v_visibility text := lower(trim(coalesce(p_visibility, 'campaign')));
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_character
  from public.characters
  where id = p_character_id
  for update;

  if v_character.id is null then
    raise exception 'Character not found';
  end if;

  if nullif(trim(coalesce(p_name, '')), '') is null then
    raise exception 'Character name is required';
  end if;

  v_is_manager := private.can_manage_campaign(v_character.campaign_id, auth.uid());

  if not v_is_manager then
    if v_character.assigned_user_id <> auth.uid()
       or v_character.character_type <> 'pc' then
      raise exception 'Not allowed';
    end if;

    update public.characters
    set name = trim(p_name),
        character_class = coalesce(
          nullif(trim(coalesce(p_character_class, '')), ''),
          character_class
        ),
        bio = trim(coalesce(p_bio, '')),
        avatar_url = nullif(trim(coalesce(p_avatar_url, '')), ''),
        updated_at = now()
    where id = p_character_id;
    return;
  end if;

  if v_character_type not in ('pc', 'npc') then
    raise exception 'Unsupported character type';
  end if;

  if v_visibility not in ('campaign', 'private') then
    raise exception 'Unsupported character visibility';
  end if;

  v_assigned_user_id := case
    when v_character_type = 'npc' then null
    else p_assigned_user_id
  end;

  if v_assigned_user_id is not null and not exists (
    select 1
    from public.campaign_members cm
    where cm.campaign_id = v_character.campaign_id
      and cm.user_id = v_assigned_user_id
  ) then
    raise exception 'Assigned user is not a campaign member';
  end if;

  update public.characters
  set assigned_user_id = v_assigned_user_id,
      name = trim(p_name),
      character_class = coalesce(
        nullif(trim(coalesce(p_character_class, '')), ''),
        'Персонаж'
      ),
      level = greatest(1, least(coalesce(p_level, 1), 30)),
      bio = trim(coalesce(p_bio, '')),
      avatar_url = nullif(trim(coalesce(p_avatar_url, '')), ''),
      character_type = v_character_type,
      visibility = v_visibility,
      updated_at = now()
  where id = p_character_id;

  if v_character.assigned_user_id is not null
     and v_character.assigned_user_id is distinct from v_assigned_user_id then
    update public.campaign_members
    set active_character_id = null
    where campaign_id = v_character.campaign_id
      and user_id = v_character.assigned_user_id
      and active_character_id = p_character_id;
  end if;

  if v_assigned_user_id is not null then
    update public.campaign_members
    set active_character_id = p_character_id
    where campaign_id = v_character.campaign_id
      and user_id = v_assigned_user_id
      and active_character_id is null;
  end if;
end;
$$;

create or replace function public.set_campaign_active_character(
  p_campaign_id uuid,
  p_user_id uuid,
  p_character_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_user_id <> auth.uid()
     and not private.can_manage_campaign(p_campaign_id, auth.uid()) then
    raise exception 'Not allowed';
  end if;

  if not exists (
    select 1 from public.campaign_members cm
    where cm.campaign_id = p_campaign_id
      and cm.user_id = p_user_id
  ) then
    raise exception 'Campaign member not found';
  end if;

  if p_character_id is not null and not exists (
    select 1 from public.characters c
    where c.id = p_character_id
      and c.campaign_id = p_campaign_id
      and c.assigned_user_id = p_user_id
      and c.character_type = 'pc'
  ) then
    raise exception 'Character is not assigned to this member';
  end if;

  update public.campaign_members
  set active_character_id = p_character_id
  where campaign_id = p_campaign_id
    and user_id = p_user_id;
end;
$$;

revoke all on function public.create_campaign_character(
  uuid, text, text, integer, text, text, uuid, text, text
) from public, anon;
revoke all on function public.update_campaign_character(
  uuid, text, text, integer, text, text, uuid, text, text
) from public, anon;
revoke all on function public.set_campaign_active_character(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.create_campaign_character(
  uuid, text, text, integer, text, text, uuid, text, text
) to authenticated;
grant execute on function public.update_campaign_character(
  uuid, text, text, integer, text, text, uuid, text, text
) to authenticated;
grant execute on function public.set_campaign_active_character(uuid, uuid, uuid)
  to authenticated;

-- Membership rows contain authorization data. Browser clients may read them,
-- but all mutations now go through checked RPCs.
revoke insert, update, delete on public.campaign_members from authenticated;
grant select on public.campaign_members to authenticated;

-- Character mutations also go through the RPCs above so a player cannot alter
-- assignment, level, visibility, or NPC status by crafting a raw request.
revoke insert, update, delete on public.characters from authenticated;
grant select on public.characters to authenticated;

-- Players may edit the narrative part of their own sheet. Mechanical values
-- and resource maxima remain under GM/owner control.
create or replace function public.update_character_narrative(
  p_character_id uuid,
  p_race text,
  p_background text,
  p_alignment text,
  p_proficiencies text,
  p_languages text,
  p_senses text,
  p_personality_traits text,
  p_ideals text,
  p_bonds text,
  p_flaws text,
  p_backstory text,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not (
    private.is_assigned_character(p_character_id, auth.uid())
    or private.can_manage_character(p_character_id, auth.uid())
  ) then
    raise exception 'Not allowed';
  end if;

  insert into public.character_sheets (
    character_id,
    race,
    background,
    alignment,
    proficiencies,
    languages,
    senses,
    personality_traits,
    ideals,
    bonds,
    flaws,
    backstory,
    notes
  ) values (
    p_character_id,
    trim(coalesce(p_race, '')),
    trim(coalesce(p_background, '')),
    trim(coalesce(p_alignment, '')),
    trim(coalesce(p_proficiencies, '')),
    trim(coalesce(p_languages, '')),
    trim(coalesce(p_senses, '')),
    trim(coalesce(p_personality_traits, '')),
    trim(coalesce(p_ideals, '')),
    trim(coalesce(p_bonds, '')),
    trim(coalesce(p_flaws, '')),
    trim(coalesce(p_backstory, '')),
    trim(coalesce(p_notes, ''))
  )
  on conflict (character_id) do update
  set race = excluded.race,
      background = excluded.background,
      alignment = excluded.alignment,
      proficiencies = excluded.proficiencies,
      languages = excluded.languages,
      senses = excluded.senses,
      personality_traits = excluded.personality_traits,
      ideals = excluded.ideals,
      bonds = excluded.bonds,
      flaws = excluded.flaws,
      backstory = excluded.backstory,
      notes = excluded.notes,
      updated_at = now();
end;
$$;

revoke all on function public.update_character_narrative(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text
) from public, anon;
grant execute on function public.update_character_narrative(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text
) to authenticated;

create or replace function public.set_character_spellcasting_enabled(
  p_character_id uuid,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not private.can_manage_character(p_character_id, auth.uid()) then
    raise exception 'Only GM or owner can change spell access';
  end if;

  insert into public.character_sheets (character_id, spellcasting_enabled)
  values (p_character_id, p_enabled)
  on conflict (character_id)
  do update set
    spellcasting_enabled = excluded.spellcasting_enabled,
    updated_at = now();
end;
$$;

-- GM grants create a curated pool; assigned players can learn from that pool.
create table if not exists public.character_spell_options (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
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
  cast_mode text not null default 'slot' check (cast_mode in ('slot', 'cantrip')),
  slot_level integer check (slot_level between 1 and 9),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists character_spell_options_character_idx
  on public.character_spell_options (character_id, spell_level, sort_order, name);
create unique index if not exists character_spell_options_character_name_key
  on public.character_spell_options (character_id, lower(btrim(name)));
create index if not exists character_spell_options_granted_by_idx
  on public.character_spell_options (granted_by)
  where granted_by is not null;

alter table public.character_spell_options enable row level security;
drop policy if exists character_spell_options_read on public.character_spell_options;
create policy character_spell_options_read
on public.character_spell_options for select to authenticated
using ((select private.can_view_character(character_id)));
drop policy if exists character_spell_options_manager_insert on public.character_spell_options;
create policy character_spell_options_manager_insert
on public.character_spell_options for insert to authenticated
with check (
  (select private.can_manage_character(character_id))
  and granted_by = (select auth.uid())
);
drop policy if exists character_spell_options_manager_update on public.character_spell_options;
create policy character_spell_options_manager_update
on public.character_spell_options for update to authenticated
using ((select private.can_manage_character(character_id)))
with check ((select private.can_manage_character(character_id)));
drop policy if exists character_spell_options_manager_delete on public.character_spell_options;
create policy character_spell_options_manager_delete
on public.character_spell_options for delete to authenticated
using ((select private.can_manage_character(character_id)));

revoke all on public.character_spell_options from anon;
grant select, insert, update, delete on public.character_spell_options to authenticated;
grant select, insert, update, delete on public.character_spell_options to service_role;

drop policy if exists character_spells_assigned_or_manager_insert on public.character_spells;
drop policy if exists character_spells_assigned_or_manager_delete on public.character_spells;
drop policy if exists character_spells_player_update on public.character_spells;
drop policy if exists character_spells_manager_insert on public.character_spells;
drop policy if exists character_spells_manager_update on public.character_spells;
drop policy if exists character_spells_manager_delete on public.character_spells;
create policy character_spells_manager_insert
on public.character_spells for insert to authenticated
with check ((select private.can_manage_character(character_id)));
create policy character_spells_manager_update
on public.character_spells for update to authenticated
using ((select private.can_manage_character(character_id)))
with check ((select private.can_manage_character(character_id)));
create policy character_spells_manager_delete
on public.character_spells for delete to authenticated
using ((select private.can_manage_character(character_id)));

create or replace function public.learn_character_spell(p_option_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_option public.character_spell_options%rowtype;
  v_spell_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_option
  from public.character_spell_options
  where id = p_option_id;

  if v_option.id is null then
    raise exception 'Spell option not found';
  end if;

  if not (
    private.is_assigned_character(v_option.character_id, auth.uid())
    or private.can_manage_character(v_option.character_id, auth.uid())
  ) then
    raise exception 'Not allowed';
  end if;

  if exists (
    select 1 from public.character_spells s
    where s.character_id = v_option.character_id
      and lower(trim(s.name)) = lower(trim(v_option.name))
  ) then
    raise exception 'Spell is already learned';
  end if;

  insert into public.character_spells (
    character_id, name, spell_level, school, casting_time, spell_range,
    duration, components, concentration, ritual, prepared, description,
    source, sort_order, cast_mode, slot_level
  ) values (
    v_option.character_id, v_option.name, v_option.spell_level,
    v_option.school, v_option.casting_time, v_option.spell_range,
    v_option.duration, v_option.components, v_option.concentration,
    v_option.ritual, v_option.prepared, v_option.description,
    v_option.source, v_option.sort_order, v_option.cast_mode,
    v_option.slot_level
  )
  returning id into v_spell_id;

  return v_spell_id;
end;
$$;

create or replace function public.forget_character_spell(p_spell_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_character_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select character_id into v_character_id
  from public.character_spells
  where id = p_spell_id;

  if v_character_id is null then
    raise exception 'Spell not found';
  end if;

  if not (
    private.is_assigned_character(v_character_id, auth.uid())
    or private.can_manage_character(v_character_id, auth.uid())
  ) then
    raise exception 'Not allowed';
  end if;

  delete from public.character_spells where id = p_spell_id;
end;
$$;

create or replace function public.set_character_spell_prepared(
  p_spell_id uuid,
  p_prepared boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_character_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select character_id into v_character_id
  from public.character_spells
  where id = p_spell_id;

  if v_character_id is null then
    raise exception 'Spell not found';
  end if;

  if not (
    private.is_assigned_character(v_character_id, auth.uid())
    or private.can_manage_character(v_character_id, auth.uid())
  ) then
    raise exception 'Not allowed';
  end if;

  update public.character_spells
  set prepared = p_prepared,
      updated_at = now()
  where id = p_spell_id;
end;
$$;

revoke all on function public.learn_character_spell(uuid) from public, anon;
revoke all on function public.forget_character_spell(uuid) from public, anon;
revoke all on function public.set_character_spell_prepared(uuid, boolean)
  from public, anon;
grant execute on function public.learn_character_spell(uuid) to authenticated;
grant execute on function public.forget_character_spell(uuid) to authenticated;
grant execute on function public.set_character_spell_prepared(uuid, boolean)
  to authenticated;

-- Each GM has a private working profile and personal folders/files. Campaign
-- owners can inspect every workspace as part of their administrative role.
create or replace function private.can_access_gm_workspace(
  p_campaign_id uuid,
  p_workspace_user_id uuid,
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
    from public.campaign_members actor
    where actor.campaign_id = p_campaign_id
      and actor.user_id = p_user_id
      and (
        actor.is_owner = true
        or (
          actor.user_id = p_workspace_user_id
          and actor.role = 'gm'
        )
      )
  );
$$;

create table if not exists public.gm_profiles (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Ведущий',
  bio text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

create table if not exists public.gm_workspace_folders (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  workspace_user_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references public.gm_workspace_folders(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gm_workspace_files (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  workspace_user_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid references public.gm_workspace_folders(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'note' check (kind in ('note', 'upload')),
  title text not null,
  body text not null default '',
  file_url text,
  original_name text,
  mime_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gm_npc_notes (
  character_id uuid primary key references public.characters(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  body text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gm_workspace_folders_owner_idx
  on public.gm_workspace_folders (campaign_id, workspace_user_id, sort_order);
create index if not exists gm_workspace_folders_parent_idx
  on public.gm_workspace_folders (parent_id)
  where parent_id is not null;
create index if not exists gm_workspace_files_owner_idx
  on public.gm_workspace_files (campaign_id, workspace_user_id, updated_at desc);
create index if not exists gm_workspace_files_folder_idx
  on public.gm_workspace_files (folder_id)
  where folder_id is not null;
create index if not exists gm_workspace_files_created_by_idx
  on public.gm_workspace_files (created_by);
create index if not exists gm_npc_notes_campaign_idx
  on public.gm_npc_notes (campaign_id, updated_at desc);
create index if not exists gm_npc_notes_updated_by_idx
  on public.gm_npc_notes (updated_by)
  where updated_by is not null;

alter table public.gm_profiles enable row level security;
alter table public.gm_workspace_folders enable row level security;
alter table public.gm_workspace_files enable row level security;
alter table public.gm_npc_notes enable row level security;

drop policy if exists gm_profiles_access on public.gm_profiles;
create policy gm_profiles_access
on public.gm_profiles for select to authenticated
using ((select private.can_access_gm_workspace(campaign_id, user_id)));
drop policy if exists gm_profiles_insert on public.gm_profiles;
create policy gm_profiles_insert
on public.gm_profiles for insert to authenticated
with check (
  (select private.can_access_gm_workspace(campaign_id, user_id))
  and (
    user_id = (select auth.uid())
    or (select private.is_campaign_owner(campaign_id))
  )
);
drop policy if exists gm_profiles_update on public.gm_profiles;
create policy gm_profiles_update
on public.gm_profiles for update to authenticated
using ((select private.can_access_gm_workspace(campaign_id, user_id)))
with check ((select private.can_access_gm_workspace(campaign_id, user_id)));
drop policy if exists gm_profiles_delete on public.gm_profiles;
create policy gm_profiles_delete
on public.gm_profiles for delete to authenticated
using ((select private.can_access_gm_workspace(campaign_id, user_id)));

drop policy if exists gm_workspace_folders_access
  on public.gm_workspace_folders;
create policy gm_workspace_folders_access
on public.gm_workspace_folders for select to authenticated
using ((select private.can_access_gm_workspace(campaign_id, workspace_user_id)));
drop policy if exists gm_workspace_folders_insert
  on public.gm_workspace_folders;
create policy gm_workspace_folders_insert
on public.gm_workspace_folders for insert to authenticated
with check ((select private.can_access_gm_workspace(campaign_id, workspace_user_id)));
drop policy if exists gm_workspace_folders_update
  on public.gm_workspace_folders;
create policy gm_workspace_folders_update
on public.gm_workspace_folders for update to authenticated
using ((select private.can_access_gm_workspace(campaign_id, workspace_user_id)))
with check ((select private.can_access_gm_workspace(campaign_id, workspace_user_id)));
drop policy if exists gm_workspace_folders_delete
  on public.gm_workspace_folders;
create policy gm_workspace_folders_delete
on public.gm_workspace_folders for delete to authenticated
using ((select private.can_access_gm_workspace(campaign_id, workspace_user_id)));

drop policy if exists gm_workspace_files_access on public.gm_workspace_files;
create policy gm_workspace_files_access
on public.gm_workspace_files for select to authenticated
using ((select private.can_access_gm_workspace(campaign_id, workspace_user_id)));
drop policy if exists gm_workspace_files_insert on public.gm_workspace_files;
create policy gm_workspace_files_insert
on public.gm_workspace_files for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (select private.can_access_gm_workspace(campaign_id, workspace_user_id))
);
drop policy if exists gm_workspace_files_update on public.gm_workspace_files;
create policy gm_workspace_files_update
on public.gm_workspace_files for update to authenticated
using ((select private.can_access_gm_workspace(campaign_id, workspace_user_id)))
with check ((select private.can_access_gm_workspace(campaign_id, workspace_user_id)));
drop policy if exists gm_workspace_files_delete on public.gm_workspace_files;
create policy gm_workspace_files_delete
on public.gm_workspace_files for delete to authenticated
using ((select private.can_access_gm_workspace(campaign_id, workspace_user_id)));

drop policy if exists gm_npc_notes_access on public.gm_npc_notes;
create policy gm_npc_notes_access
on public.gm_npc_notes for select to authenticated
using ((select private.can_manage_campaign(campaign_id)));
drop policy if exists gm_npc_notes_insert on public.gm_npc_notes;
create policy gm_npc_notes_insert
on public.gm_npc_notes for insert to authenticated
with check ((select private.can_manage_campaign(campaign_id)));
drop policy if exists gm_npc_notes_update on public.gm_npc_notes;
create policy gm_npc_notes_update
on public.gm_npc_notes for update to authenticated
using ((select private.can_manage_campaign(campaign_id)))
with check ((select private.can_manage_campaign(campaign_id)));
drop policy if exists gm_npc_notes_delete on public.gm_npc_notes;
create policy gm_npc_notes_delete
on public.gm_npc_notes for delete to authenticated
using ((select private.can_manage_campaign(campaign_id)));

revoke all on public.gm_profiles from anon;
revoke all on public.gm_workspace_folders from anon;
revoke all on public.gm_workspace_files from anon;
revoke all on public.gm_npc_notes from anon;
grant select, insert, update, delete on public.gm_profiles to authenticated;
grant select, insert, update, delete on public.gm_workspace_folders to authenticated;
grant select, insert, update, delete on public.gm_workspace_files to authenticated;
grant select, insert, update, delete on public.gm_npc_notes to authenticated;
grant select, insert, update, delete on public.gm_profiles to service_role;
grant select, insert, update, delete on public.gm_workspace_folders to service_role;
grant select, insert, update, delete on public.gm_workspace_files to service_role;
grant select, insert, update, delete on public.gm_npc_notes to service_role;

-- General gallery keeps character art, but adds explicit media categories and
-- ordered pages for comics.
alter table public.campaign_art_items
  add column if not exists kind text not null default 'art';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'campaign_art_items_kind_check'
      and conrelid = 'public.campaign_art_items'::regclass
  ) then
    alter table public.campaign_art_items
      add constraint campaign_art_items_kind_check
      check (kind in ('art', 'comic', 'map', 'sketch'));
  end if;
end;
$$;

create index if not exists campaign_art_items_campaign_kind_idx
  on public.campaign_art_items (campaign_id, kind, created_at desc);

create table if not exists public.campaign_art_pages (
  id uuid primary key default gen_random_uuid(),
  art_item_id uuid not null references public.campaign_art_items(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  page_number integer not null check (page_number > 0),
  image_url text not null,
  created_at timestamptz not null default now(),
  unique (art_item_id, page_number)
);

create index if not exists campaign_art_pages_created_by_idx
  on public.campaign_art_pages (created_by);

create or replace function private.can_view_art_item(
  p_art_item_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.campaign_art_items item
    where item.id = p_art_item_id
      and private.is_campaign_member(item.campaign_id, p_user_id)
  );
$$;

create or replace function private.can_edit_art_item(
  p_art_item_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.campaign_art_items item
    where item.id = p_art_item_id
      and (
        item.uploaded_by = p_user_id
        or private.can_manage_campaign(item.campaign_id, p_user_id)
      )
  );
$$;

alter table public.campaign_art_pages enable row level security;
drop policy if exists campaign_art_pages_member_read
  on public.campaign_art_pages;
create policy campaign_art_pages_member_read
on public.campaign_art_pages for select to authenticated
using ((select private.can_view_art_item(art_item_id)));
drop policy if exists campaign_art_pages_author_insert
  on public.campaign_art_pages;
create policy campaign_art_pages_author_insert
on public.campaign_art_pages for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (select private.can_edit_art_item(art_item_id))
);
drop policy if exists campaign_art_pages_author_update
  on public.campaign_art_pages;
create policy campaign_art_pages_author_update
on public.campaign_art_pages for update to authenticated
using ((select private.can_edit_art_item(art_item_id)))
with check ((select private.can_edit_art_item(art_item_id)));
drop policy if exists campaign_art_pages_author_delete
  on public.campaign_art_pages;
create policy campaign_art_pages_author_delete
on public.campaign_art_pages for delete to authenticated
using ((select private.can_edit_art_item(art_item_id)));

revoke all on public.campaign_art_pages from anon;
grant select, insert, update, delete on public.campaign_art_pages to authenticated;
grant select, insert, update, delete on public.campaign_art_pages to service_role;

-- Files stored under campaign/user/gm-private stay private to that GM and the
-- campaign owner; ordinary campaign media remains visible to campaign members.
create or replace function private.can_read_campaign_media(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[] := storage.foldername(p_name);
  v_campaign_id uuid;
  v_owner_id uuid;
begin
  if auth.uid() is null or v_parts is null then
    return false;
  end if;

  if coalesce(array_length(v_parts, 1), 0) >= 3
     and v_parts[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_campaign_id := v_parts[1]::uuid;
    v_owner_id := case
      when v_parts[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then v_parts[2]::uuid
      else null
    end;

    if v_parts[3] = 'gm-private' then
      return v_owner_id = auth.uid()
        or private.is_campaign_owner(v_campaign_id, auth.uid());
    end if;

    return private.is_campaign_member(v_campaign_id, auth.uid());
  end if;

  if coalesce(array_length(v_parts, 1), 0) >= 2
     and v_parts[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_owner_id := v_parts[1]::uuid;
    return v_owner_id = auth.uid()
      or private.shares_campaign(v_owner_id, auth.uid());
  end if;

  return false;
end;
$$;

create or replace function private.can_delete_campaign_media(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[] := storage.foldername(p_name);
  v_campaign_id uuid;
  v_owner_id uuid;
begin
  if auth.uid() is null or v_parts is null then
    return false;
  end if;

  if coalesce(array_length(v_parts, 1), 0) >= 3
     and v_parts[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_campaign_id := v_parts[1]::uuid;
    v_owner_id := case
      when v_parts[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then v_parts[2]::uuid
      else null
    end;

    if v_parts[3] = 'gm-private' then
      return v_owner_id = auth.uid()
        or private.is_campaign_owner(v_campaign_id, auth.uid());
    end if;

    return v_owner_id = auth.uid()
      or private.can_manage_campaign(v_campaign_id, auth.uid());
  end if;

  if coalesce(array_length(v_parts, 1), 0) >= 2
     and v_parts[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_owner_id := v_parts[1]::uuid;
    return v_owner_id = auth.uid()
      or exists (
        select 1
        from public.campaign_members mine
        join public.campaign_members theirs
          on theirs.campaign_id = mine.campaign_id
        where mine.user_id = auth.uid()
          and (mine.is_owner = true or mine.role = 'gm')
          and theirs.user_id = v_owner_id
      );
  end if;

  return false;
end;
$$;

update storage.buckets
set file_size_limit = 20971520,
    allowed_mime_types = array[
      'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
      'image/heic', 'image/heif', 'application/pdf', 'text/plain',
      'text/markdown', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/zip'
    ]::text[]
where id = 'campaign-media';

commit;
