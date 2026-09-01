begin;

create or replace function public.send_chat_roll_v2(
  p_room_id uuid,
  p_character_id uuid,
  p_label text,
  p_kind text,
  p_modifier integer default 0,
  p_roll_d20 boolean default true,
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
  v_d20 integer;
  v_total integer;
  v_roll integer;
  v_rolls integer[] := '{}';
  v_dice_total integer := 0;
  v_id bigint;
  i integer;
  v_payload jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_write_chat_room(p_room_id, auth.uid()) then raise exception 'Нет права писать в этот чат'; end if;
  if length(trim(coalesce(p_label,''))) = 0 then raise exception 'Roll label is required'; end if;
  if p_modifier < -500 or p_modifier > 500 or p_dice_modifier < -500 or p_dice_modifier > 500 then raise exception 'Modifier is out of range'; end if;
  if p_dice_count < 0 or p_dice_count > 40 then raise exception 'Dice count is out of range'; end if;
  if p_dice_count > 0 and (p_dice_sides < 2 or p_dice_sides > 1000) then raise exception 'Die sides are out of range'; end if;
  if not p_roll_d20 and p_dice_count = 0 then raise exception 'Roll must contain at least one die'; end if;

  if p_roll_d20 then
    v_d20 := floor(random() * 20 + 1)::integer;
    v_total := v_d20 + p_modifier;
  end if;

  if p_dice_count > 0 then
    for i in 1..p_dice_count loop
      v_roll := floor(random() * p_dice_sides + 1)::integer;
      v_rolls := array_append(v_rolls, v_roll);
      v_dice_total := v_dice_total + v_roll;
    end loop;
    v_dice_total := v_dice_total + p_dice_modifier;
  end if;

  v_payload := jsonb_build_object(
      'label', trim(p_label),
      'kind', coalesce(nullif(trim(p_kind),''),'roll'),
      'modifier', p_modifier,
      'rollD20', p_roll_d20
    )
    || case when p_roll_d20 then jsonb_build_object('d20', v_d20, 'total', v_total) else '{}'::jsonb end
    || case when p_dice_count > 0 then jsonb_build_object(
      'effect', jsonb_build_object(
        'count', p_dice_count,
        'sides', p_dice_sides,
        'rolls', to_jsonb(v_rolls),
        'modifier', p_dice_modifier,
        'total', v_dice_total
      )
    ) else '{}'::jsonb end;

  insert into public.chat_messages(room_id, character_id, body, event_kind, event_payload)
  values (p_room_id, p_character_id, '', 'roll', v_payload)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.send_chat_roll_v2(uuid,uuid,text,text,integer,boolean,integer,integer,integer) from public, anon;
grant execute on function public.send_chat_roll_v2(uuid,uuid,text,text,integer,boolean,integer,integer,integer) to authenticated;

commit;
