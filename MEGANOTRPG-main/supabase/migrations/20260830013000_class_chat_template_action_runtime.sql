-- CLASS_MIGRATION_SCOPE: infrastructure
-- Class/subclass chat actions use the same server-authoritative template runtime
-- that owns resource mutations. The mechanic execution and chat message/roll intentionally
-- run in the same PostgreSQL transaction: either both happen or neither.

begin;

create or replace function public.send_chat_template_action_v1(
  p_room_id uuid,
  p_character_id uuid,
  p_mechanic_id text,
  p_option_key text default null,
  p_label text default null,
  p_payload jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message_id bigint;
  v_payload jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(trim(coalesce(p_mechanic_id,'')),'') is null then raise exception 'Mechanic is required'; end if;

  -- Server re-resolves the assigned class/subclass mechanic, validates its
  -- level/choice/suppression state, spends canonical resourceCosts/costOptions,
  -- and applies resource effects. Resource-less actions are valid no-op spends.
  perform public.use_character_template_resource_action(
    p_character_id,
    trim(p_mechanic_id),
    nullif(trim(coalesce(p_option_key,'')),'')
  );

  v_payload := coalesce(p_payload,'{}'::jsonb)
    || jsonb_build_object(
      'templateMechanicId',trim(p_mechanic_id),
      'templateOptionKey',nullif(trim(coalesce(p_option_key,'')),'')
    );

  v_message_id := public.send_chat_event_v3(
    p_room_id,
    p_character_id,
    'action',
    coalesce(nullif(trim(coalesce(p_label,'')),''),trim(p_mechanic_id)),
    v_payload,
    '[]'::jsonb
  );
  return v_message_id;
end;
$$;

create or replace function public.send_chat_template_roll_v1(
  p_room_id uuid,
  p_character_id uuid,
  p_mechanic_id text,
  p_option_key text default null,
  p_label text default null,
  p_kind text default 'action',
  p_modifier integer default 0,
  p_roll_d20 boolean default false,
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
  v_message_id bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(trim(coalesce(p_mechanic_id,'')),'') is null then raise exception 'Mechanic is required'; end if;

  perform public.use_character_template_resource_action(
    p_character_id,
    trim(p_mechanic_id),
    nullif(trim(coalesce(p_option_key,'')),'')
  );

  v_message_id := public.send_chat_roll_v3(
    p_room_id,
    p_character_id,
    coalesce(nullif(trim(coalesce(p_label,'')),''),trim(p_mechanic_id)),
    coalesce(nullif(trim(coalesce(p_kind,'')),''),'action'),
    coalesce(p_modifier,0),
    coalesce(p_roll_d20,false),
    greatest(0,coalesce(p_dice_count,0)),
    greatest(0,coalesce(p_dice_sides,0)),
    coalesce(p_dice_modifier,0),
    '[]'::jsonb
  );
  return v_message_id;
end;
$$;

revoke all on function public.send_chat_template_action_v1(uuid,uuid,text,text,text,jsonb) from public,anon;
grant execute on function public.send_chat_template_action_v1(uuid,uuid,text,text,text,jsonb) to authenticated;

revoke all on function public.send_chat_template_roll_v1(uuid,uuid,text,text,text,text,integer,boolean,integer,integer,integer) from public,anon;
grant execute on function public.send_chat_template_roll_v1(uuid,uuid,text,text,text,text,integer,boolean,integer,integer,integer) to authenticated;

commit;