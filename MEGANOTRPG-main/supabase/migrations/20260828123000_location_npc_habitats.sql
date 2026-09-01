begin;

create table if not exists public.location_npc_habitats (
  location_id uuid not null references public.locations(id) on delete cascade,
  npc_character_id uuid not null references public.characters(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (location_id, npc_character_id)
);

create index if not exists location_npc_habitats_campaign_idx
  on public.location_npc_habitats(campaign_id);
create index if not exists location_npc_habitats_npc_idx
  on public.location_npc_habitats(npc_character_id);

alter table public.location_npc_habitats enable row level security;

drop policy if exists location_npc_habitats_select on public.location_npc_habitats;
create policy location_npc_habitats_select
on public.location_npc_habitats
for select
to authenticated
using (
  private.can_view_location(location_id, auth.uid())
  and private.can_view_character(npc_character_id, auth.uid())
);

create or replace function public.set_npc_zone_habitat(
  p_npc_character_id uuid,
  p_location_id uuid,
  p_attached boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_npc_campaign uuid;
  v_location_campaign uuid;
  v_character_type text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select c.campaign_id, c.character_type
    into v_npc_campaign, v_character_type
  from public.characters c
  where c.id = p_npc_character_id;

  select l.campaign_id
    into v_location_campaign
  from public.locations l
  where l.id = p_location_id;

  if v_npc_campaign is null or v_location_campaign is null then
    raise exception 'NPC or zone not found';
  end if;
  if v_npc_campaign <> v_location_campaign then
    raise exception 'NPC and zone belong to different campaigns';
  end if;
  if v_character_type <> 'npc' then
    raise exception 'Only NPC characters can be attached to zone habitats';
  end if;
  if not private.can_manage_campaign(v_npc_campaign, auth.uid()) then
    raise exception 'Not allowed';
  end if;
  if not private.can_manage_character(p_npc_character_id, auth.uid()) then
    raise exception 'Not allowed';
  end if;
  if not private.can_view_location(p_location_id, auth.uid()) then
    raise exception 'Not allowed';
  end if;

  if p_attached then
    insert into public.location_npc_habitats(location_id, npc_character_id, campaign_id, created_by)
    values(p_location_id, p_npc_character_id, v_npc_campaign, auth.uid())
    on conflict(location_id, npc_character_id) do nothing;
  else
    delete from public.location_npc_habitats h
    where h.location_id = p_location_id
      and h.npc_character_id = p_npc_character_id
      and h.campaign_id = v_npc_campaign;
  end if;
end;
$function$;

revoke all on function public.set_npc_zone_habitat(uuid, uuid, boolean) from public;
grant execute on function public.set_npc_zone_habitat(uuid, uuid, boolean) to authenticated;

-- Preserve NPCs that were previously visible inside zones through the live
-- world-state table. This is a one-time compatibility backfill only: from now
-- on habitat membership and current position are independent concepts.
insert into public.location_npc_habitats(location_id, npc_character_id, campaign_id, created_by)
select s.location_id, c.id, c.campaign_id, coalesce(s.updated_by, c.created_by)
from public.character_world_state s
join public.characters c on c.id = s.character_id
join public.locations l on l.id = s.location_id and l.campaign_id = c.campaign_id
where c.character_type = 'npc'
  and s.location_id is not null
on conflict(location_id, npc_character_id) do nothing;

commit;
