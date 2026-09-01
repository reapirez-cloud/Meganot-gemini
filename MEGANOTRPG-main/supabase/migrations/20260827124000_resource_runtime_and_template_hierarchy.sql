begin;

-- Rule template hierarchy: race -> subrace, class -> subclass.
alter table public.rule_templates
  add column if not exists parent_template_id uuid references public.rule_templates(id) on delete restrict,
  add column if not exists unlock_level integer;

alter table public.rule_templates drop constraint if exists rule_templates_kind_check;
alter table public.rule_templates add constraint rule_templates_kind_check
  check (kind in ('race','subrace','class','subclass'));

alter table public.rule_templates drop constraint if exists rule_templates_unlock_level_check;
alter table public.rule_templates add constraint rule_templates_unlock_level_check
  check (unlock_level is null or unlock_level between 1 and 30);

create index if not exists rule_templates_parent_idx
  on public.rule_templates(parent_template_id, kind, is_active);

create or replace function private.validate_rule_template_hierarchy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent public.rule_templates%rowtype;
begin
  if new.kind in ('race','class') then
    if new.parent_template_id is not null then
      raise exception 'Root race/class template cannot have a parent';
    end if;
    new.unlock_level := null;
    return new;
  end if;

  if new.parent_template_id is null then
    raise exception 'Subrace/subclass requires a parent template';
  end if;

  select * into v_parent from public.rule_templates where id = new.parent_template_id;
  if v_parent.id is null then raise exception 'Parent template not found'; end if;
  if v_parent.campaign_id <> new.campaign_id then raise exception 'Parent belongs to another campaign'; end if;
  if new.kind = 'subrace' and v_parent.kind <> 'race' then raise exception 'Subrace parent must be a race'; end if;
  if new.kind = 'subclass' and v_parent.kind <> 'class' then raise exception 'Subclass parent must be a class'; end if;
  new.unlock_level := greatest(1, coalesce(new.unlock_level, case when new.kind='subclass' then 3 else 1 end));
  return new;
end;
$$;

drop trigger if exists rule_templates_validate_hierarchy on public.rule_templates;
create trigger rule_templates_validate_hierarchy
before insert or update of campaign_id,kind,parent_template_id,unlock_level on public.rule_templates
for each row execute function private.validate_rule_template_hierarchy();

create or replace function public.save_rule_template_v2(
  p_campaign_id uuid,
  p_template_id uuid,
  p_kind text,
  p_name text,
  p_slug text,
  p_description text,
  p_mechanics jsonb,
  p_choices jsonb,
  p_version integer default 1,
  p_parent_template_id uuid default null,
  p_unlock_level integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_manage_campaign(p_campaign_id, auth.uid()) then raise exception 'Not allowed'; end if;
  if p_kind not in ('race','subrace','class','subclass') then raise exception 'Unsupported template kind'; end if;
  if nullif(trim(coalesce(p_name,'')),'') is null then raise exception 'Template name is required'; end if;

  if p_template_id is null then
    insert into public.rule_templates(
      campaign_id,kind,slug,name,description,version,mechanics,choices,
      parent_template_id,unlock_level,created_by
    ) values (
      p_campaign_id,p_kind,
      coalesce(nullif(trim(p_slug),''),replace(lower(trim(p_name)),' ','-')),
      trim(p_name),trim(coalesce(p_description,'')),greatest(1,p_version),
      coalesce(p_mechanics,'[]'::jsonb),coalesce(p_choices,'[]'::jsonb),
      p_parent_template_id,p_unlock_level,auth.uid()
    ) returning id into v_id;
  else
    update public.rule_templates set
      name=trim(p_name),
      slug=coalesce(nullif(trim(p_slug),''),slug),
      description=trim(coalesce(p_description,'')),
      mechanics=coalesce(p_mechanics,'[]'::jsonb),
      choices=coalesce(p_choices,'[]'::jsonb),
      parent_template_id=p_parent_template_id,
      unlock_level=p_unlock_level,
      is_active=true,
      updated_at=now()
    where id=p_template_id and campaign_id=p_campaign_id and kind=p_kind
    returning id into v_id;
  end if;

  if v_id is null then raise exception 'Template not found'; end if;
  return v_id;
end;
$$;

revoke all on function public.save_rule_template_v2(uuid,uuid,text,text,text,text,jsonb,jsonb,integer,uuid,integer) from public,anon;
grant execute on function public.save_rule_template_v2(uuid,uuid,text,text,text,text,jsonb,jsonb,integer,uuid,integer) to authenticated;

create or replace function public.assign_character_template_v2(
  p_character_id uuid,
  p_template_id uuid,
  p_template_level integer default null,
  p_selected_choices jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_character_campaign uuid;
  v_template public.rule_templates%rowtype;
  v_parent_assignment public.character_template_assignments%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_manage_character(p_character_id,auth.uid()) then raise exception 'Not allowed'; end if;

  select campaign_id into v_character_campaign from public.characters where id=p_character_id;
  select * into v_template from public.rule_templates where id=p_template_id and is_active=true;
  if v_character_campaign is null or v_template.id is null or v_character_campaign<>v_template.campaign_id then
    raise exception 'Template belongs to another campaign';
  end if;

  if v_template.kind='race' then
    delete from public.character_template_assignments a
    using public.rule_templates t
    where a.character_id=p_character_id and a.template_id=t.id and t.kind in ('race','subrace');
    p_template_level := null;
  elsif v_template.kind='subrace' then
    select a.* into v_parent_assignment
    from public.character_template_assignments a
    where a.character_id=p_character_id and a.template_id=v_template.parent_template_id;
    if v_parent_assignment.id is null then raise exception 'Assign the parent race first'; end if;
    delete from public.character_template_assignments a
    using public.rule_templates t
    where a.character_id=p_character_id and a.template_id=t.id and t.kind='subrace';
    p_template_level := null;
  elsif v_template.kind='class' then
    p_template_level := greatest(1,coalesce(p_template_level,1));
  elsif v_template.kind='subclass' then
    select a.* into v_parent_assignment
    from public.character_template_assignments a
    where a.character_id=p_character_id and a.template_id=v_template.parent_template_id;
    if v_parent_assignment.id is null then raise exception 'Assign the parent class first'; end if;
    if coalesce(v_parent_assignment.template_level,1) < coalesce(v_template.unlock_level,1) then
      raise exception 'Parent class level is below subclass unlock level';
    end if;
    delete from public.character_template_assignments a
    using public.rule_templates t
    where a.character_id=p_character_id
      and a.template_id=t.id
      and t.kind='subclass'
      and t.parent_template_id=v_template.parent_template_id;
    p_template_level := coalesce(v_parent_assignment.template_level,1);
  end if;

  insert into public.character_template_assignments(
    character_id,template_id,template_level,selected_choices,assigned_by
  ) values (
    p_character_id,p_template_id,p_template_level,coalesce(p_selected_choices,'{}'::jsonb),auth.uid()
  )
  on conflict(character_id,template_id) do update set
    template_level=excluded.template_level,
    selected_choices=excluded.selected_choices,
    assigned_by=auth.uid(),
    updated_at=now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.assign_character_template_v2(uuid,uuid,integer,jsonb) from public,anon;
grant execute on function public.assign_character_template_v2(uuid,uuid,integer,jsonb) to authenticated;

-- Persistent runtime state for generic Character Engine resources.
create table if not exists public.character_resource_states (
  character_id uuid not null references public.characters(id) on delete cascade,
  state_key text not null,
  current integer not null default 0 check(current >= 0),
  max_snapshot integer not null default 0 check(max_snapshot >= 0),
  label text not null default '',
  recharge jsonb not null default '{"triggers":["never"],"restore":"full"}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(character_id,state_key),
  check(length(trim(state_key)) between 1 and 180),
  check(current <= max_snapshot),
  check(jsonb_typeof(recharge)='object')
);

create index if not exists character_resource_states_character_idx
  on public.character_resource_states(character_id,updated_at desc);

alter table public.character_resource_states enable row level security;
revoke all on public.character_resource_states from anon,authenticated;
grant select on public.character_resource_states to authenticated;

drop policy if exists character_resource_states_read on public.character_resource_states;
create policy character_resource_states_read on public.character_resource_states
for select to authenticated
using ((select private.can_view_character(character_id)));

create or replace function private.can_operate_character_resources(
  p_character_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.can_manage_character(p_character_id,p_user_id)
    or exists(
      select 1
      from public.characters c
      join public.campaign_members cm
        on cm.campaign_id=c.campaign_id and cm.user_id=p_user_id
      where c.id=p_character_id
        and c.assigned_user_id=p_user_id
        and cm.active_character_id=c.id
        and coalesce(c.life_state,'alive')='alive'
    );
$$;

create or replace function public.sync_character_resource_states(
  p_character_id uuid,
  p_resources jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_state_key text;
  v_current integer;
  v_max integer;
  v_label text;
  v_recharge jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_operate_character_resources(p_character_id,auth.uid()) then raise exception 'Not allowed'; end if;
  if p_resources is null then return; end if;
  if jsonb_typeof(p_resources)<>'array' then raise exception 'Resources must be an array'; end if;

  for v_item in select value from jsonb_array_elements(p_resources) loop
    v_state_key := trim(coalesce(v_item->>'stateKey',''));
    v_max := greatest(0,least(100000,coalesce((v_item->>'max')::integer,0)));
    v_current := greatest(0,least(v_max,coalesce((v_item->>'current')::integer,v_max)));
    v_label := left(trim(coalesce(v_item->>'label',v_state_key)),160);
    v_recharge := coalesce(v_item->'recharge','{"triggers":["never"],"restore":"full"}'::jsonb);
    if v_state_key='' then continue; end if;

    insert into public.character_resource_states(character_id,state_key,current,max_snapshot,label,recharge,updated_by)
    values(p_character_id,v_state_key,v_current,v_max,v_label,v_recharge,auth.uid())
    on conflict(character_id,state_key) do update set
      max_snapshot=excluded.max_snapshot,
      current=least(public.character_resource_states.current,excluded.max_snapshot),
      label=excluded.label,
      recharge=excluded.recharge,
      updated_by=auth.uid(),
      updated_at=now();
  end loop;
end;
$$;

revoke all on function public.sync_character_resource_states(uuid,jsonb) from public,anon;
grant execute on function public.sync_character_resource_states(uuid,jsonb) to authenticated;

create or replace function public.set_character_resource_current(
  p_character_id uuid,
  p_state_key text,
  p_current integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_max integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_manage_character(p_character_id,auth.uid()) then raise exception 'Not allowed'; end if;
  select max_snapshot into v_max from public.character_resource_states
  where character_id=p_character_id and state_key=p_state_key for update;
  if v_max is null then raise exception 'Resource state not found'; end if;
  update public.character_resource_states
  set current=greatest(0,least(v_max,p_current)),updated_by=auth.uid(),updated_at=now()
  where character_id=p_character_id and state_key=p_state_key;
end;
$$;

revoke all on function public.set_character_resource_current(uuid,text,integer) from public,anon;
grant execute on function public.set_character_resource_current(uuid,text,integer) to authenticated;

create or replace function private.consume_character_resource_costs(
  p_character_id uuid,
  p_costs jsonb,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cost jsonb;
  v_state_key text;
  v_amount integer;
  v_current integer;
  v_max integer;
  v_label text;
  v_recharge jsonb;
  v_level integer;
  v_slots jsonb;
  v_used integer;
begin
  if p_costs is null or p_costs='[]'::jsonb then return; end if;
  if p_character_id is null then raise exception 'Character is required for resource costs'; end if;
  if not private.can_operate_character_resources(p_character_id,p_user_id) then raise exception 'Not allowed'; end if;
  if jsonb_typeof(p_costs)<>'array' then raise exception 'Resource costs must be an array'; end if;

  for v_cost in select value from jsonb_array_elements(p_costs) loop
    v_state_key := trim(coalesce(v_cost->>'stateKey',''));
    v_amount := coalesce((v_cost->>'amount')::integer,0);
    if v_state_key='' or v_amount<1 or v_amount>10000 then raise exception 'Invalid resource cost'; end if;

    if v_state_key ~ '^spell_slot_[1-9]$' then
      v_level := substring(v_state_key from '([1-9])$')::integer;
      select spell_slots into v_slots from public.character_sheets where character_id=p_character_id for update;
      if v_slots is null then raise exception 'Spell slots are unavailable'; end if;
      v_max := coalesce((v_slots->v_level::text->>'max')::integer,0);
      v_used := coalesce((v_slots->v_level::text->>'used')::integer,0);
      if v_max-v_used < v_amount then raise exception 'Недостаточно ячеек % уровня',v_level; end if;
      update public.character_sheets set
        spell_slots=jsonb_set(
          coalesce(spell_slots,'{}'::jsonb),
          array[v_level::text],
          jsonb_build_object('max',v_max,'used',v_used+v_amount),
          true
        ),
        updated_at=now()
      where character_id=p_character_id;
      continue;
    end if;

    select current,max_snapshot into v_current,v_max
    from public.character_resource_states
    where character_id=p_character_id and state_key=v_state_key
    for update;

    if v_max is null then
      v_max := greatest(0,least(100000,coalesce((v_cost->>'max')::integer,0)));
      v_current := greatest(0,least(v_max,coalesce((v_cost->>'current')::integer,v_max)));
      v_label := left(trim(coalesce(v_cost->>'label',v_state_key)),160);
      v_recharge := coalesce(v_cost->'recharge','{"triggers":["never"],"restore":"full"}'::jsonb);
      insert into public.character_resource_states(character_id,state_key,current,max_snapshot,label,recharge,updated_by)
      values(p_character_id,v_state_key,v_current,v_max,v_label,v_recharge,p_user_id)
      on conflict(character_id,state_key) do nothing;
      select current,max_snapshot into v_current,v_max
      from public.character_resource_states
      where character_id=p_character_id and state_key=v_state_key
      for update;
    end if;

    if v_current < v_amount then raise exception 'Недостаточно ресурса: %',v_label; end if;
    update public.character_resource_states
    set current=current-v_amount,updated_by=p_user_id,updated_at=now()
    where character_id=p_character_id and state_key=v_state_key;
  end loop;
end;
$$;

create or replace function public.send_chat_roll_v3(
  p_room_id uuid,
  p_character_id uuid,
  p_label text,
  p_kind text,
  p_modifier integer default 0,
  p_roll_d20 boolean default true,
  p_dice_count integer default 0,
  p_dice_sides integer default 0,
  p_dice_modifier integer default 0,
  p_resource_costs jsonb default '[]'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_d20 integer; v_total integer; v_roll integer; v_rolls integer[] := '{}';
  v_dice_total integer := 0; v_id bigint; i integer; v_payload jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_write_chat_room(p_room_id,auth.uid()) then raise exception 'Нет права писать в этот чат'; end if;
  if length(trim(coalesce(p_label,'')))=0 then raise exception 'Roll label is required'; end if;
  if p_modifier < -500 or p_modifier > 500 or p_dice_modifier < -500 or p_dice_modifier > 500 then raise exception 'Modifier is out of range'; end if;
  if p_dice_count < 0 or p_dice_count > 40 then raise exception 'Dice count is out of range'; end if;
  if p_dice_count > 0 and (p_dice_sides < 2 or p_dice_sides > 1000) then raise exception 'Die sides are out of range'; end if;
  if not p_roll_d20 and p_dice_count=0 then raise exception 'Roll must contain at least one die'; end if;

  perform private.consume_character_resource_costs(p_character_id,coalesce(p_resource_costs,'[]'::jsonb),auth.uid());

  if p_roll_d20 then v_d20:=floor(random()*20+1)::integer; v_total:=v_d20+p_modifier; end if;
  if p_dice_count>0 then
    for i in 1..p_dice_count loop
      v_roll:=floor(random()*p_dice_sides+1)::integer; v_rolls:=array_append(v_rolls,v_roll); v_dice_total:=v_dice_total+v_roll;
    end loop;
    v_dice_total:=v_dice_total+p_dice_modifier;
  end if;

  v_payload:=jsonb_build_object('label',trim(p_label),'kind',coalesce(nullif(trim(p_kind),''),'roll'),'modifier',p_modifier,'rollD20',p_roll_d20)
    || case when p_roll_d20 then jsonb_build_object('d20',v_d20,'total',v_total) else '{}'::jsonb end
    || case when p_dice_count>0 then jsonb_build_object('effect',jsonb_build_object('count',p_dice_count,'sides',p_dice_sides,'rolls',to_jsonb(v_rolls),'modifier',p_dice_modifier,'total',v_dice_total)) else '{}'::jsonb end
    || case when jsonb_array_length(coalesce(p_resource_costs,'[]'::jsonb))>0 then jsonb_build_object('resourceCosts',p_resource_costs) else '{}'::jsonb end;

  insert into public.chat_messages(room_id,character_id,body,event_kind,event_payload)
  values(p_room_id,p_character_id,'','roll',v_payload) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.send_chat_event_v3(
  p_room_id uuid,
  p_character_id uuid,
  p_event_kind text,
  p_label text,
  p_payload jsonb default '{}'::jsonb,
  p_resource_costs jsonb default '[]'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_id bigint; v_payload jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_write_chat_room(p_room_id,auth.uid()) then raise exception 'Нет права писать в этот чат'; end if;
  if p_event_kind not in ('action','spell') then raise exception 'Unsupported event type'; end if;
  if length(trim(coalesce(p_label,'')))=0 then raise exception 'Event label is required'; end if;

  perform private.consume_character_resource_costs(p_character_id,coalesce(p_resource_costs,'[]'::jsonb),auth.uid());
  v_payload:=jsonb_build_object('label',trim(p_label)) || coalesce(p_payload,'{}'::jsonb)
    || case when jsonb_array_length(coalesce(p_resource_costs,'[]'::jsonb))>0 then jsonb_build_object('resourceCosts',p_resource_costs) else '{}'::jsonb end;
  insert into public.chat_messages(room_id,character_id,body,event_kind,event_payload)
  values(p_room_id,p_character_id,'',p_event_kind,v_payload) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.send_chat_roll_v3(uuid,uuid,text,text,integer,boolean,integer,integer,integer,jsonb) from public,anon;
revoke all on function public.send_chat_event_v3(uuid,uuid,text,text,jsonb,jsonb) from public,anon;
grant execute on function public.send_chat_roll_v3(uuid,uuid,text,text,integer,boolean,integer,integer,integer,jsonb) to authenticated;
grant execute on function public.send_chat_event_v3(uuid,uuid,text,text,jsonb,jsonb) to authenticated;

create or replace function public.recover_character_resources(
  p_character_id uuid,
  p_trigger text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_manage_character(p_character_id,auth.uid()) then raise exception 'Only GM or owner can restore resources'; end if;
  if p_trigger not in ('short_rest','long_rest','dawn','manual') then raise exception 'Unsupported recovery trigger'; end if;

  update public.character_resource_states s set
    current = case
      when coalesce(s.recharge->>'restore','full')='amount'
        then least(s.max_snapshot,s.current+greatest(0,coalesce((s.recharge->>'amount')::integer,0)))
      else s.max_snapshot
    end,
    updated_by=auth.uid(),updated_at=now()
  where s.character_id=p_character_id
    and exists(
      select 1 from jsonb_array_elements_text(coalesce(s.recharge->'triggers','[]'::jsonb)) t(value)
      where t.value=p_trigger
    );
end;
$$;

create or replace function public.grant_character_short_rest(p_character_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.recover_character_resources(p_character_id,'short_rest');
end;
$$;

create or replace function public.grant_character_long_rest(p_character_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_campaign_id uuid; v_restored_slots jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select c.campaign_id into v_campaign_id from public.characters c where c.id=p_character_id;
  if v_campaign_id is null then raise exception 'Персонаж не найден'; end if;
  if not private.can_manage_campaign(v_campaign_id,auth.uid()) then raise exception 'Только GM или владелец может дать отдых'; end if;

  select coalesce(jsonb_object_agg(key,jsonb_build_object('max',greatest(coalesce((value->>'max')::integer,0),0),'used',0)),'{}'::jsonb)
  into v_restored_slots
  from jsonb_each(coalesce((select cs.spell_slots from public.character_sheets cs where cs.character_id=p_character_id),'{}'::jsonb));

  update public.character_sheets set current_hp=max_hp,temp_hp=0,death_save_successes=0,death_save_failures=0,
    spell_slots=coalesce(v_restored_slots,'{}'::jsonb),updated_at=now()
  where character_id=p_character_id;

  perform public.recover_character_resources(p_character_id,'long_rest');
end;
$$;

revoke all on function public.recover_character_resources(uuid,text) from public,anon;
revoke all on function public.grant_character_short_rest(uuid) from public,anon;
revoke all on function public.grant_character_long_rest(uuid) from public,anon;
grant execute on function public.recover_character_resources(uuid,text) to authenticated;
grant execute on function public.grant_character_short_rest(uuid) to authenticated;
grant execute on function public.grant_character_long_rest(uuid) to authenticated;

do $$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
     and not exists(
       select 1 from pg_publication_tables where pubname='supabase_realtime'
         and schemaname='public' and tablename='character_resource_states'
     ) then
    alter publication supabase_realtime add table public.character_resource_states;
  end if;
end $$;

commit;
