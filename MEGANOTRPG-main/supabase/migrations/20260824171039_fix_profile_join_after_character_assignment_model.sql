create or replace function public.add_demo_membership_for_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_id uuid;
begin
  select c.id into v_campaign_id
  from public.campaigns c
  where c.slug = 'demo'
  limit 1;

  if v_campaign_id is null then
    return new;
  end if;

  insert into public.campaign_members (campaign_id, user_id, role)
  values (v_campaign_id, new.user_id, 'player')
  on conflict (campaign_id, user_id) do nothing;

  -- Characters are no longer auto-created for a new player.
  -- GM/owner creates them and assigns them explicitly later.
  return new;
end;
$$;

create or replace function public.validate_active_character()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.active_character_id is not null and not exists (
    select 1
    from public.characters ch
    where ch.id = new.active_character_id
      and ch.campaign_id = new.campaign_id
      and ch.assigned_user_id = new.user_id
  ) then
    raise exception 'Active character must be assigned to this campaign member';
  end if;

  return new;
end;
$$;
