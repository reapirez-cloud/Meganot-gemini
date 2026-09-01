-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: subclass:druid:stars
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_PACKAGE_TEST: tests/postRestPreparationRuntime.test.ts
-- CLASS_WORK_STATUS: druid:text=READY;mechanics=IN_PROGRESS
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
-- GENA v2 is the live idempotent chat path. Daily preparation gates must run
-- before a new resource spend while receipt replays remain valid and idempotent.

begin;

create or replace function public.send_chat_template_action_v2(
  p_room_id uuid,
  p_character_id uuid,
  p_mechanic_id text,
  p_option_key text default null,
  p_label text default null,
  p_payload jsonb default '{}'::jsonb,
  p_command_id uuid default gen_random_uuid()
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_campaign_id uuid;
  v_existing public.engine_command_receipts%rowtype;
  v_message_id bigint;
  v_payload jsonb;
  v_fingerprint jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_command_id is null then raise exception 'Command id is required'; end if;
  if nullif(trim(coalesce(p_mechanic_id,'')),'') is null then raise exception 'Mechanic is required'; end if;

  select c.campaign_id into v_campaign_id from public.characters c where c.id=p_character_id;
  if v_campaign_id is null then raise exception 'Character not found'; end if;

  v_fingerprint := jsonb_build_object(
    'roomId',p_room_id,
    'characterId',p_character_id,
    'mechanicId',trim(p_mechanic_id),
    'optionKey',nullif(trim(coalesce(p_option_key,'')),''),
    'label',p_label,
    'payload',coalesce(p_payload,'{}'::jsonb)
  );

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_command_id::text,0));
  select * into v_existing from public.engine_command_receipts where command_id=p_command_id;
  if found then
    if v_existing.created_by is distinct from auth.uid()
      or v_existing.campaign_id is distinct from v_campaign_id
      or v_existing.engine is distinct from 'gena'
      or v_existing.command_kind is distinct from 'template.action'
      or v_existing.aggregate_id is distinct from p_character_id
      or (v_existing.result->'fingerprint') is distinct from v_fingerprint
    then
      raise exception 'Command id is already used by another command';
    end if;
    return (v_existing.result->>'messageId')::bigint;
  end if;

  perform private.assert_character_template_preparation_action(p_character_id,trim(p_mechanic_id));
  perform public.use_character_template_resource_action(
    p_character_id,
    trim(p_mechanic_id),
    nullif(trim(coalesce(p_option_key,'')),'')
  );

  v_payload := coalesce(p_payload,'{}'::jsonb) || jsonb_build_object(
    'templateMechanicId',trim(p_mechanic_id),
    'templateOptionKey',nullif(trim(coalesce(p_option_key,'')),'' )
  );
  v_message_id := public.send_chat_event_v3(
    p_room_id,
    p_character_id,
    'action',
    coalesce(nullif(trim(coalesce(p_label,'')),''),trim(p_mechanic_id)),
    v_payload,
    '[]'::jsonb
  );

  insert into public.engine_command_receipts(command_id,campaign_id,actor_character_id,engine,command_kind,aggregate_id,result,created_by)
  values(
    p_command_id,
    v_campaign_id,
    p_character_id,
    'gena',
    'template.action',
    p_character_id,
    jsonb_build_object('messageId',v_message_id,'fingerprint',v_fingerprint),
    auth.uid()
  );
  return v_message_id;
end;
$function$;

create or replace function public.send_chat_template_roll_v2(
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
  p_dice_modifier integer default 0,
  p_command_id uuid default gen_random_uuid()
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_campaign_id uuid;
  v_existing public.engine_command_receipts%rowtype;
  v_message_id bigint;
  v_fingerprint jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_command_id is null then raise exception 'Command id is required'; end if;
  if nullif(trim(coalesce(p_mechanic_id,'')),'') is null then raise exception 'Mechanic is required'; end if;

  select c.campaign_id into v_campaign_id from public.characters c where c.id=p_character_id;
  if v_campaign_id is null then raise exception 'Character not found'; end if;

  v_fingerprint := jsonb_build_object(
    'roomId',p_room_id,
    'characterId',p_character_id,
    'mechanicId',trim(p_mechanic_id),
    'optionKey',nullif(trim(coalesce(p_option_key,'')),''),
    'label',p_label,
    'kind',p_kind,
    'modifier',coalesce(p_modifier,0),
    'rollD20',coalesce(p_roll_d20,false),
    'diceCount',greatest(0,coalesce(p_dice_count,0)),
    'diceSides',greatest(0,coalesce(p_dice_sides,0)),
    'diceModifier',coalesce(p_dice_modifier,0)
  );

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_command_id::text,0));
  select * into v_existing from public.engine_command_receipts where command_id=p_command_id;
  if found then
    if v_existing.created_by is distinct from auth.uid()
      or v_existing.campaign_id is distinct from v_campaign_id
      or v_existing.engine is distinct from 'gena'
      or v_existing.command_kind is distinct from 'template.roll'
      or v_existing.aggregate_id is distinct from p_character_id
      or (v_existing.result->'fingerprint') is distinct from v_fingerprint
    then
      raise exception 'Command id is already used by another command';
    end if;
    return (v_existing.result->>'messageId')::bigint;
  end if;

  perform private.assert_character_template_preparation_action(p_character_id,trim(p_mechanic_id));
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

  insert into public.engine_command_receipts(command_id,campaign_id,actor_character_id,engine,command_kind,aggregate_id,result,created_by)
  values(
    p_command_id,
    v_campaign_id,
    p_character_id,
    'gena',
    'template.roll',
    p_character_id,
    jsonb_build_object('messageId',v_message_id,'fingerprint',v_fingerprint),
    auth.uid()
  );
  return v_message_id;
end;
$function$;

commit;
