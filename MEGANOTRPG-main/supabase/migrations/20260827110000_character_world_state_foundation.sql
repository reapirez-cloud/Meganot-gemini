begin;

-- World position is stored separately from the character sheet so location,
-- timeline and scene presence can evolve without coupling them to mechanics.
-- Step 1 stores only the dynamic World location. Campaign day / day period are
-- added by the next migration step.
create table if not exists public.character_world_state (
  character_id uuid primary key references public.characters(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  location_id uuid null references public.locations(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete set null
);

create index if not exists character_world_state_campaign_location_idx
  on public.character_world_state(campaign_id, location_id)
  where location_id is not null;

create index if not exists character_world_state_location_idx
  on public.character_world_state(location_id)
  where location_id is not null;

alter table public.character_world_state enable row level security;

-- Keep campaign_id derived from the character and reject cross-campaign
-- locations. A character may intentionally have no location yet.
create or replace function private.validate_character_world_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_character_campaign_id uuid;
  v_location_campaign_id uuid;
begin
  select c.campaign_id
  into v_character_campaign_id
  from public.characters c
  where c.id = new.character_id;

  if v_character_campaign_id is null then
    raise exception 'Character not found';
  end if;

  new.campaign_id := v_character_campaign_id;

  if new.location_id is not null then
    select l.campaign_id
    into v_location_campaign_id
    from public.locations l
    where l.id = new.location_id;

    if v_location_campaign_id is null then
      raise exception 'Location not found';
    end if;

    if v_location_campaign_id <> v_character_campaign_id then
      raise exception 'Character and location must belong to the same campaign';
    end if;
  end if;

  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;

  return new;
end;
$$;

revoke all on function private.validate_character_world_state()
  from public, anon, authenticated;

drop trigger if exists character_world_state_validate
  on public.character_world_state;
create trigger character_world_state_validate
before insert or update of character_id, campaign_id, location_id
on public.character_world_state
for each row execute function private.validate_character_world_state();

-- Every character gets exactly one state row. Existing characters are
-- backfilled with an intentionally unset location; future characters get the
-- row automatically as soon as they are created.
create or replace function private.ensure_character_world_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.character_world_state(character_id, campaign_id)
  values (new.id, new.campaign_id)
  on conflict (character_id) do update
    set campaign_id = excluded.campaign_id,
        location_id = case
          when public.character_world_state.campaign_id = excluded.campaign_id
            then public.character_world_state.location_id
          else null
        end,
        updated_at = now();

  return new;
end;
$$;

revoke all on function private.ensure_character_world_state()
  from public, anon, authenticated;

drop trigger if exists character_world_state_sync_from_character
  on public.characters;
create trigger character_world_state_sync_from_character
after insert or update of campaign_id
on public.characters
for each row execute function private.ensure_character_world_state();

insert into public.character_world_state(character_id, campaign_id)
select c.id, c.campaign_id
from public.characters c
on conflict (character_id) do nothing;

-- Reading follows the character visibility model, including "Только я".
drop policy if exists character_world_state_read on public.character_world_state;
create policy character_world_state_read
on public.character_world_state
for select
to authenticated
using ((select private.can_view_character(character_id, auth.uid())));

-- Only the GM/owner who can manage that character may move it. Assigned
-- players can see their position but cannot edit it themselves.
drop policy if exists character_world_state_insert on public.character_world_state;
create policy character_world_state_insert
on public.character_world_state
for insert
to authenticated
with check ((select private.can_manage_character(character_id, auth.uid())));

drop policy if exists character_world_state_update on public.character_world_state;
create policy character_world_state_update
on public.character_world_state
for update
to authenticated
using ((select private.can_manage_character(character_id, auth.uid())))
with check ((select private.can_manage_character(character_id, auth.uid())));

-- State rows are lifecycle-owned by characters and are removed by cascade.
-- Clients never delete them directly.
revoke all on table public.character_world_state from anon;
revoke delete on table public.character_world_state from authenticated;
grant select, insert, update on table public.character_world_state to authenticated;

commit;
