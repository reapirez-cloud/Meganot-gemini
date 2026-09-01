create or replace function public.set_my_character_avatar(p_character_id uuid, p_avatar_url text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_allowed boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  v_allowed := private.can_manage_character(p_character_id, auth.uid())
    or exists (
      select 1
      from public.characters c
      where c.id = p_character_id
        and c.assigned_user_id = auth.uid()
        and c.character_type = 'pc'
    );

  if not v_allowed then
    raise exception 'Only GM, owner, or the assigned player can edit the character avatar';
  end if;

  update public.characters
  set avatar_url = nullif(trim(coalesce(p_avatar_url, '')), ''),
      updated_at = now()
  where id = p_character_id;

  if not found then
    raise exception 'Character not found';
  end if;
end;
$function$;

create or replace function public.set_campaign_active_character(p_campaign_id uuid, p_user_id uuid, p_character_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_character public.characters%rowtype;
  v_can_manage boolean := false;
  v_self_member boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  v_can_manage := private.can_manage_campaign(p_campaign_id, auth.uid());
  v_self_member := p_user_id = auth.uid()
    and exists (
      select 1
      from public.campaign_members cm
      where cm.campaign_id = p_campaign_id
        and cm.user_id = auth.uid()
    );

  if not v_can_manage and not v_self_member then
    raise exception 'Only GM, owner, or the player themselves can manage the active character';
  end if;

  if p_character_id is not null then
    select * into v_character
    from public.characters c
    where c.id = p_character_id
      and c.campaign_id = p_campaign_id
      and c.assigned_user_id = p_user_id
      and c.character_type = 'pc';

    if v_character.id is null then
      raise exception 'Character is not assigned to this player';
    end if;
    if v_character.life_state = 'dead' then
      raise exception 'Dead character cannot be active';
    end if;
  end if;

  update public.campaign_members
  set active_character_id = p_character_id
  where campaign_id = p_campaign_id
    and user_id = p_user_id;

  if not found then
    raise exception 'Campaign member not found';
  end if;
end;
$function$;
