-- CLASS_MIGRATION_SCOPE: infrastructure
-- Generic post-long-rest preparation window. Chat is an input surface; persisted
-- runtime state remains server-authoritative and CE adapters consume the result.

begin;

create table if not exists public.character_preparation_sessions (
  character_id uuid primary key references public.characters(id) on delete cascade,
  generation bigint not null default 0 check (generation >= 0),
  is_open boolean not null default false,
  opened_at timestamptz,
  opened_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  closed_by_message_id bigint,
  updated_at timestamptz not null default now()
);

create table if not exists public.character_preparation_records (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  generation bigint not null check (generation >= 1),
  assignment_id uuid not null references public.character_template_assignments(id) on delete cascade,
  task_key text not null check (length(btrim(task_key)) > 0),
  input_value integer not null,
  resolved_value jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(character_id,generation,assignment_id,task_key)
);

create index if not exists character_preparation_records_character_generation_idx
  on public.character_preparation_records(character_id,generation);

alter table public.character_preparation_sessions enable row level security;
alter table public.character_preparation_records enable row level security;

grant select on public.character_preparation_sessions to authenticated;
grant select on public.character_preparation_records to authenticated;

drop policy if exists character_preparation_sessions_read on public.character_preparation_sessions;
create policy character_preparation_sessions_read
on public.character_preparation_sessions for select to authenticated
using ((select private.can_view_character(character_id)));

drop policy if exists character_preparation_records_read on public.character_preparation_records;
create policy character_preparation_records_read
on public.character_preparation_records for select to authenticated
using ((select private.can_view_character(character_id)));

create or replace function private.is_character_preparation_open(p_character_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select s.is_open
    from public.character_preparation_sessions s
    where s.character_id=p_character_id
  ),false);
$$;

revoke all on function private.is_character_preparation_open(uuid) from public,anon;
grant execute on function private.is_character_preparation_open(uuid) to authenticated,service_role;

create or replace function private.character_has_long_rest_spell_preparation(p_character_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.character_template_assignments a
    join public.rule_templates t on t.id=a.template_id and t.is_active=true
    where a.character_id=p_character_id
      and coalesce(t.rules_meta->>'spell_preparation_refresh','')='long_rest'
  );
$$;

create or replace function private.character_template_source_level(p_assignment_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_assignment public.character_template_assignments%rowtype;
  v_template public.rule_templates%rowtype;
  v_character_level integer;
  v_parent_level integer;
begin
  select * into v_assignment from public.character_template_assignments where id=p_assignment_id;
  if v_assignment.id is null then return null; end if;
  select * into v_template from public.rule_templates where id=v_assignment.template_id and is_active=true;
  if v_template.id is null then return null; end if;
  select greatest(1,coalesce(c.level,1)) into v_character_level
  from public.characters c where c.id=v_assignment.character_id;

  if v_template.kind='class' then
    return greatest(1,coalesce(v_assignment.template_level,v_character_level,1));
  end if;
  if v_template.kind='subclass' and v_template.parent_template_id is not null then
    select greatest(1,coalesce(a.template_level,v_character_level,1)) into v_parent_level
    from public.character_template_assignments a
    where a.character_id=v_assignment.character_id and a.template_id=v_template.parent_template_id;
    if v_parent_level is null then return null; end if;
    if v_parent_level<greatest(1,coalesce(v_template.unlock_level,1)) then return null; end if;
    return v_parent_level;
  end if;
  return greatest(1,coalesce(v_assignment.template_level,v_character_level,1));
end;
$function$;

create or replace function private.character_post_rest_task(
  p_assignment_id uuid,
  p_task_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_assignment public.character_template_assignments%rowtype;
  v_template public.rule_templates%rowtype;
  v_source_level integer;
  v_task jsonb;
begin
  select * into v_assignment from public.character_template_assignments where id=p_assignment_id;
  if v_assignment.id is null then return null; end if;
  select * into v_template from public.rule_templates where id=v_assignment.template_id and is_active=true;
  if v_template.id is null then return null; end if;
  v_source_level:=private.character_template_source_level(p_assignment_id);
  if v_source_level is null then return null; end if;

  select task into v_task
  from jsonb_array_elements(coalesce(v_template.rules_meta->'post_rest_preparations','[]'::jsonb)) task
  where task->>'key'=p_task_key
    and coalesce(task->>'trigger','long_rest')='long_rest'
    and v_source_level>=greatest(1,coalesce((task->>'unlockLevel')::integer,1))
  limit 1;
  return v_task;
end;
$function$;

create or replace function public.record_character_post_rest_value_v1(
  p_assignment_id uuid,
  p_task_key text,
  p_value integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_assignment public.character_template_assignments%rowtype;
  v_character public.characters%rowtype;
  v_session public.character_preparation_sessions%rowtype;
  v_task jsonb;
  v_input jsonb;
  v_mapping jsonb;
  v_output jsonb;
  v_min integer;
  v_max integer;
  v_count integer;
  v_sides integer;
  v_resolved jsonb;
  v_record public.character_preparation_records%rowtype;
  v_state_key text;
  v_mode text;
  v_resource_max integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if nullif(btrim(coalesce(p_task_key,'')),'') is null then raise exception 'Preparation task key is required'; end if;

  select * into v_assignment from public.character_template_assignments where id=p_assignment_id;
  if v_assignment.id is null then raise exception 'Template assignment not found'; end if;
  select * into v_character from public.characters where id=v_assignment.character_id;
  if v_character.id is null then raise exception 'Character not found'; end if;
  if coalesce(v_character.assigned_user_id,'00000000-0000-0000-0000-000000000000'::uuid)<>auth.uid()
     and not private.can_manage_character(v_character.id,auth.uid()) then
    raise exception 'Only the assigned player or campaign manager can resolve preparation';
  end if;

  select * into v_session
  from public.character_preparation_sessions
  where character_id=v_character.id
  for update;
  if v_session.character_id is null or not v_session.is_open then
    raise exception 'Preparation window is closed until the next long rest';
  end if;

  v_task:=private.character_post_rest_task(p_assignment_id,btrim(p_task_key));
  if v_task is null then raise exception 'Preparation task is not available at the current source level'; end if;
  v_input:=coalesce(v_task->'input','{}'::jsonb);

  if coalesce(v_input->>'kind','')='roll' then
    v_count:=greatest(1,coalesce((v_input->>'count')::integer,1));
    v_sides:=greatest(2,coalesce((v_input->>'sides')::integer,0));
    if v_count>40 or v_sides>1000 then raise exception 'Preparation dice are out of range'; end if;
    v_min:=v_count;
    v_max:=v_count*v_sides;
  elsif coalesce(v_input->>'kind','')='number' then
    v_min:=coalesce((v_input->>'min')::integer,-100000);
    v_max:=coalesce((v_input->>'max')::integer,100000);
  else
    raise exception 'Unsupported preparation input kind';
  end if;
  if p_value<v_min or p_value>v_max then
    raise exception 'Preparation value must be between % and %',v_min,v_max;
  end if;

  v_mapping:=coalesce(v_task->'mapping','{}'::jsonb);
  if coalesce(v_mapping->>'kind','identity')='parity' then
    v_resolved:=to_jsonb(case when mod(abs(p_value),2)=0 then v_mapping->>'even' else v_mapping->>'odd' end);
    if (v_resolved #>> '{}') is null then raise exception 'Preparation parity mapping is incomplete'; end if;
  elsif coalesce(v_mapping->>'kind','identity')='identity' then
    v_resolved:=to_jsonb(p_value);
  else
    raise exception 'Unsupported preparation mapping';
  end if;

  if exists(
    select 1 from public.character_preparation_records r
    where r.character_id=v_character.id
      and r.generation=v_session.generation
      and r.assignment_id=p_assignment_id
      and r.task_key=btrim(p_task_key)
  ) then
    raise exception 'Preparation value is already recorded for this long rest';
  end if;

  insert into public.character_preparation_records(
    character_id,generation,assignment_id,task_key,input_value,resolved_value,created_by
  ) values (
    v_character.id,v_session.generation,p_assignment_id,btrim(p_task_key),p_value,v_resolved,auth.uid()
  ) returning * into v_record;

  -- Numeric preparation may explicitly feed a CE resource snapshot. This is opt-in;
  -- stored die results such as Portent-style values remain records, not fake charges.
  v_output:=coalesce(v_task->'output','{}'::jsonb);
  if coalesce(v_output->>'kind','stored_value')='resource' then
    v_state_key:=nullif(btrim(coalesce(v_output->>'stateKey','')),'');
    v_mode:=coalesce(v_output->>'mode','current');
    if v_state_key is null then raise exception 'Preparation resource output requires stateKey'; end if;
    select max_snapshot into v_resource_max
    from public.character_resource_states
    where character_id=v_character.id and state_key=v_state_key
    for update;
    if v_resource_max is null then raise exception 'Preparation target resource is not initialized'; end if;
    if v_mode='current' then
      update public.character_resource_states
      set current=greatest(0,least(v_resource_max,p_value)),updated_by=auth.uid(),updated_at=now()
      where character_id=v_character.id and state_key=v_state_key;
    elsif v_mode='max_and_current' then
      update public.character_resource_states
      set max_snapshot=greatest(0,p_value),current=greatest(0,p_value),updated_by=auth.uid(),updated_at=now()
      where character_id=v_character.id and state_key=v_state_key;
    else
      raise exception 'Unsupported preparation resource output mode';
    end if;
  end if;

  return jsonb_build_object(
    'id',v_record.id,
    'character_id',v_record.character_id,
    'generation',v_record.generation,
    'assignment_id',v_record.assignment_id,
    'task_key',v_record.task_key,
    'input_value',v_record.input_value,
    'resolved_value',v_record.resolved_value
  );
end;
$function$;

create or replace function public.send_chat_preparation_roll_v1(
  p_room_id uuid,
  p_character_id uuid,
  p_assignment_id uuid,
  p_task_key text,
  p_label text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_assignment public.character_template_assignments%rowtype;
  v_task jsonb;
  v_input jsonb;
  v_count integer;
  v_sides integer;
  v_message_id bigint;
  v_total integer;
  v_record jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v_assignment from public.character_template_assignments where id=p_assignment_id;
  if v_assignment.id is null or v_assignment.character_id<>p_character_id then
    raise exception 'Preparation task belongs to another character';
  end if;
  v_task:=private.character_post_rest_task(p_assignment_id,btrim(p_task_key));
  if v_task is null then raise exception 'Preparation task is unavailable'; end if;
  v_input:=coalesce(v_task->'input','{}'::jsonb);
  if coalesce(v_input->>'kind','')<>'roll' then raise exception 'Preparation task is not a dice roll'; end if;
  v_count:=greatest(1,coalesce((v_input->>'count')::integer,1));
  v_sides:=greatest(2,coalesce((v_input->>'sides')::integer,0));

  v_message_id:=public.send_chat_roll_v3(
    p_room_id,p_character_id,
    coalesce(nullif(btrim(coalesce(p_label,'')),''),coalesce(v_task->>'label',btrim(p_task_key))),
    'preparation',0,false,v_count,v_sides,0,'[]'::jsonb
  );
  select (m.event_payload->'effect'->>'total')::integer into v_total
  from public.chat_messages m where m.id=v_message_id;
  if v_total is null then raise exception 'Preparation roll result was not recorded in chat'; end if;

  v_record:=public.record_character_post_rest_value_v1(p_assignment_id,btrim(p_task_key),v_total);
  update public.chat_messages
  set event_payload=coalesce(event_payload,'{}'::jsonb) || jsonb_build_object(
    'preparationTaskKey',btrim(p_task_key),
    'preparationRecord',v_record
  )
  where id=v_message_id;
  return v_message_id;
end;
$function$;

create or replace function private.close_character_preparation_from_chat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  -- Only ordinary authored speech starts the adventuring day. Dice, spells,
  -- actions, system events and attachment-only posts intentionally do not close it.
  if new.character_id is null
     or new.user_id is null
     or new.event_kind is not null
     or nullif(btrim(coalesce(new.body,'')),'') is null then
    return new;
  end if;
  if not exists(
    select 1 from public.characters c
    where c.id=new.character_id
      and c.character_type='pc'
      and c.assigned_user_id=new.user_id
  ) then
    return new;
  end if;

  update public.character_preparation_sessions s
  set is_open=false,
      closed_at=now(),
      closed_by_message_id=new.id,
      updated_at=now()
  where s.character_id=new.character_id and s.is_open=true;

  if found then
    update public.character_sheets
    set spell_change_unlocked=false,updated_at=now()
    where character_id=new.character_id;
  end if;
  return new;
end;
$function$;

drop trigger if exists close_character_preparation_on_player_text on public.chat_messages;
create trigger close_character_preparation_on_player_text
after insert on public.chat_messages
for each row execute function private.close_character_preparation_from_chat();

-- Long rest now creates a new preparation generation after restoring the same
-- HP, spell-slot and class-resource state as before.
create or replace function public.grant_character_long_rest(p_character_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_campaign_id uuid;
  v_restored_slots jsonb;
  v_spell_preparation boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select c.campaign_id into v_campaign_id from public.characters c where c.id=p_character_id;
  if v_campaign_id is null then raise exception 'Персонаж не найден'; end if;
  if not private.can_manage_campaign(v_campaign_id,auth.uid()) then raise exception 'Только GM или владелец может дать отдых'; end if;

  select coalesce(jsonb_object_agg(key,jsonb_build_object('max',greatest(coalesce((value->>'max')::integer,0),0),'used',0)),'{}'::jsonb)
  into v_restored_slots
  from jsonb_each(coalesce((select cs.spell_slots from public.character_sheets cs where cs.character_id=p_character_id),'{}'::jsonb));

  v_spell_preparation:=private.character_has_long_rest_spell_preparation(p_character_id);
  update public.character_sheets set
    current_hp=max_hp,
    temp_hp=0,
    death_save_successes=0,
    death_save_failures=0,
    spell_slots=coalesce(v_restored_slots,'{}'::jsonb),
    spell_change_unlocked=v_spell_preparation,
    updated_at=now()
  where character_id=p_character_id;

  perform public.recover_character_resources(p_character_id,'long_rest');

  insert into public.character_preparation_sessions(
    character_id,generation,is_open,opened_at,opened_by,closed_at,closed_by_message_id,updated_at
  ) values (
    p_character_id,1,true,now(),auth.uid(),null,null,now()
  )
  on conflict(character_id) do update set
    generation=public.character_preparation_sessions.generation+1,
    is_open=true,
    opened_at=now(),
    opened_by=auth.uid(),
    closed_at=null,
    closed_by_message_id=null,
    updated_at=now();
end;
$function$;

-- Preserve the old explicit GM switch as an override, but prepared casters can
-- now also use the authored long-rest window.
create or replace function private.can_change_character_spells(
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
      join public.character_sheets cs on cs.character_id=c.id
      where c.id=p_character_id
        and c.assigned_user_id=p_user_id
        and c.character_type='pc'
        and cs.spellcasting_enabled=true
        and (
          cs.spell_change_unlocked=true
          or (
            private.is_character_preparation_open(c.id)
            and private.character_has_long_rest_spell_preparation(c.id)
          )
        )
    );
$$;

revoke all on function public.record_character_post_rest_value_v1(uuid,text,integer) from public,anon;
grant execute on function public.record_character_post_rest_value_v1(uuid,text,integer) to authenticated;
revoke all on function public.send_chat_preparation_roll_v1(uuid,uuid,uuid,text,text) from public,anon;
grant execute on function public.send_chat_preparation_roll_v1(uuid,uuid,uuid,text,text) to authenticated;

-- Realtime keeps an already-open chat card in sync when another room performs
-- the roll/choice or when the first ordinary player message closes the window.
do $publication$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
     and not exists(
       select 1 from pg_publication_tables
       where pubname='supabase_realtime'
         and schemaname='public'
         and tablename='character_preparation_sessions'
     ) then
    alter publication supabase_realtime add table public.character_preparation_sessions;
  end if;
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
     and not exists(
       select 1 from pg_publication_tables
       where pubname='supabase_realtime'
         and schemaname='public'
         and tablename='character_preparation_records'
     ) then
    alter publication supabase_realtime add table public.character_preparation_records;
  end if;
end;
$publication$;

commit;
