-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:wizard
-- CLASS_PACKAGE_TEST: tests/wizardArcaneRecoveryRuntime.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: wizard:text=READY;mechanics=IN_PROGRESS
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md

begin;

-- Generic full-caster slot primitive. The class parser owns capacity; mutable
-- current values live only in character_resource_states.
create or replace function private.full_caster_slot_mechanics(
  p_class_key text,
  p_level integer,
  p_source_key text default 'spellcasting'
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_slots jsonb;
begin
  v_slots := case greatest(1,least(20,p_level))
    when 1 then '{"1":2}'::jsonb
    when 2 then '{"1":3}'::jsonb
    when 3 then '{"1":4,"2":2}'::jsonb
    when 4 then '{"1":4,"2":3}'::jsonb
    when 5 then '{"1":4,"2":3,"3":2}'::jsonb
    when 6 then '{"1":4,"2":3,"3":3}'::jsonb
    when 7 then '{"1":4,"2":3,"3":3,"4":1}'::jsonb
    when 8 then '{"1":4,"2":3,"3":3,"4":2}'::jsonb
    when 9 then '{"1":4,"2":3,"3":3,"4":3,"5":1}'::jsonb
    when 10 then '{"1":4,"2":3,"3":3,"4":3,"5":2}'::jsonb
    when 11 then '{"1":4,"2":3,"3":3,"4":3,"5":2,"6":1}'::jsonb
    when 12 then '{"1":4,"2":3,"3":3,"4":3,"5":2,"6":1}'::jsonb
    when 13 then '{"1":4,"2":3,"3":3,"4":3,"5":2,"6":1,"7":1}'::jsonb
    when 14 then '{"1":4,"2":3,"3":3,"4":3,"5":2,"6":1,"7":1}'::jsonb
    when 15 then '{"1":4,"2":3,"3":3,"4":3,"5":2,"6":1,"7":1,"8":1}'::jsonb
    when 16 then '{"1":4,"2":3,"3":3,"4":3,"5":2,"6":1,"7":1,"8":1}'::jsonb
    when 17 then '{"1":4,"2":3,"3":3,"4":3,"5":2,"6":1,"7":1,"8":1,"9":1}'::jsonb
    when 18 then '{"1":4,"2":3,"3":3,"4":3,"5":3,"6":1,"7":1,"8":1,"9":1}'::jsonb
    when 19 then '{"1":4,"2":3,"3":3,"4":3,"5":3,"6":2,"7":1,"8":1,"9":1}'::jsonb
    else '{"1":4,"2":3,"3":3,"4":3,"5":3,"6":2,"7":2,"8":1,"9":1}'::jsonb
  end;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',p_class_key || '-slot-' || e.key || '-l' || p_level::text,
      'type','resource',
      'sourceKey',p_source_key,
      'grantOperation','REPLACE',
      'priority',p_level,
      'key','spell_slot_' || e.key,
      'label','Ячейки ' || e.key || ' уровня',
      'max',(e.value #>> '{}')::integer,
      'recharge',jsonb_build_array('long_rest'),
      'restore','full',
      'initial','full',
      'presentation',jsonb_build_object('tone','violet','icon','✦','display','pips','priority',80)
    ) order by (e.key)::integer)
    from jsonb_each(v_slots) e
  ),'[]'::jsonb);
end;
$function$;

-- A short rest is an authoritative GM-granted gameplay window. It exists as a
-- generic primitive because multiple classes can react to finishing one.
create table if not exists public.character_short_rest_sessions (
  character_id uuid primary key references public.characters(id) on delete cascade,
  generation bigint not null default 0,
  is_open boolean not null default false,
  opened_at timestamptz,
  opened_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.character_short_rest_sessions enable row level security;
revoke all on public.character_short_rest_sessions from anon,authenticated;
grant select on public.character_short_rest_sessions to authenticated;

drop policy if exists character_short_rest_sessions_read on public.character_short_rest_sessions;
create policy character_short_rest_sessions_read
on public.character_short_rest_sessions
for select to authenticated
using ((select private.can_view_character(character_id)));

create or replace function private.is_character_short_rest_open(p_character_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((
    select s.is_open
    from public.character_short_rest_sessions s
    where s.character_id=p_character_id
  ),false)
$function$;

revoke all on function private.is_character_short_rest_open(uuid) from public,anon,authenticated;
grant execute on function private.is_character_short_rest_open(uuid) to service_role;

create or replace function public.grant_character_short_rest(p_character_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_campaign_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select c.campaign_id into v_campaign_id from public.characters c where c.id=p_character_id;
  if v_campaign_id is null then raise exception 'Персонаж не найден'; end if;
  if not private.can_manage_campaign(v_campaign_id,auth.uid()) then
    raise exception 'Только GM или владелец может дать отдых';
  end if;

  perform public.recover_character_resources(p_character_id,'short_rest');

  insert into public.character_short_rest_sessions(
    character_id,generation,is_open,opened_at,opened_by,closed_at,updated_at
  ) values (
    p_character_id,1,true,now(),auth.uid(),null,now()
  )
  on conflict(character_id) do update set
    generation=public.character_short_rest_sessions.generation+1,
    is_open=true,
    opened_at=now(),
    opened_by=auth.uid(),
    closed_at=null,
    updated_at=now();
end;
$function$;

revoke all on function public.grant_character_short_rest(uuid) from public,anon;
grant execute on function public.grant_character_short_rest(uuid) to authenticated;

-- Long rest closes any pending short-rest reaction window before opening the
-- normal long-rest preparation generation.
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

  update public.character_short_rest_sessions
  set is_open=false,closed_at=now(),updated_at=now()
  where character_id=p_character_id and is_open=true;

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

create or replace function private.close_character_short_rest_from_chat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
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

  update public.character_short_rest_sessions
  set is_open=false,closed_at=now(),updated_at=now()
  where character_id=new.character_id and is_open=true;
  return new;
end;
$function$;

drop trigger if exists close_character_short_rest_on_player_text on public.chat_messages;
create trigger close_character_short_rest_on_player_text
after insert on public.chat_messages
for each row execute function private.close_character_short_rest_from_chat();

-- Generic atomic spell-slot restoration primitive. Public class wrappers decide
-- when it may be used and how large the recovery budget is.
create or replace function private.restore_spell_slot_resources_v1(
  p_character_id uuid,
  p_recovery jsonb,
  p_budget integer,
  p_max_slot_level integer,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_level_text text;
  v_amount_text text;
  v_level integer;
  v_amount integer;
  v_current integer;
  v_max integer;
  v_total integer := 0;
  v_count integer := 0;
begin
  if p_recovery is null or jsonb_typeof(p_recovery)<>'object' then
    raise exception 'Spell-slot recovery must be an object keyed by slot level';
  end if;
  if p_budget<1 or p_budget>100 then raise exception 'Spell-slot recovery budget is invalid'; end if;
  if p_max_slot_level<1 or p_max_slot_level>9 then raise exception 'Maximum recoverable slot level is invalid'; end if;

  for v_level_text,v_amount_text in select key,value from jsonb_each_text(p_recovery) loop
    if v_level_text !~ '^[1-9]$' then raise exception 'Invalid spell-slot level: %',v_level_text; end if;
    v_level:=v_level_text::integer;
    v_amount:=v_amount_text::integer;
    if v_level>p_max_slot_level then raise exception 'Cannot recover spell slots above level %',p_max_slot_level; end if;
    if v_amount<1 or v_amount>20 then raise exception 'Invalid recovered slot count'; end if;

    select current,max_snapshot into v_current,v_max
    from public.character_resource_states
    where character_id=p_character_id and state_key='spell_slot_'||v_level::text
    for update;
    if v_max is null then raise exception 'Spell-slot resource is not synchronized: %',v_level; end if;
    if v_amount>v_max-v_current then raise exception 'Cannot recover more expended level % slots than exist',v_level; end if;

    v_total:=v_total + v_level*v_amount;
    v_count:=v_count + v_amount;
  end loop;

  if v_count=0 then raise exception 'Recover at least one expended spell slot'; end if;
  if v_total>p_budget then raise exception 'Recovered spell-slot levels exceed budget %',p_budget; end if;

  for v_level_text,v_amount_text in select key,value from jsonb_each_text(p_recovery) loop
    v_level:=v_level_text::integer;
    v_amount:=v_amount_text::integer;
    update public.character_resource_states
    set current=least(max_snapshot,current+v_amount),updated_by=p_user_id,updated_at=now()
    where character_id=p_character_id and state_key='spell_slot_'||v_level::text;
  end loop;

  return jsonb_build_object('budget',p_budget,'spentLevels',v_total,'recovered',p_recovery);
end;
$function$;

revoke all on function private.restore_spell_slot_resources_v1(uuid,jsonb,integer,integer,uuid) from public,anon,authenticated;
grant execute on function private.restore_spell_slot_resources_v1(uuid,jsonb,integer,integer,uuid) to service_role;

create or replace function public.use_wizard_arcane_recovery_v1(
  p_character_id uuid,
  p_assignment_id uuid,
  p_recovery jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_assignment public.character_template_assignments%rowtype;
  v_template public.rule_templates%rowtype;
  v_level integer;
  v_budget integer;
  v_current integer;
  v_max integer;
  v_result jsonb;
begin
  perform private.gena_assert_assigned_player(p_character_id);

  select * into v_assignment
  from public.character_template_assignments
  where id=p_assignment_id and character_id=p_character_id
  for update;
  if v_assignment.id is null then raise exception 'Wizard assignment not found'; end if;

  select * into v_template
  from public.rule_templates
  where id=v_assignment.template_id
    and is_active=true
    and kind='class'
    and catalog_key='class:wizard';
  if v_template.id is null then raise exception 'Arcane Recovery requires the active Wizard class'; end if;

  v_level:=private.character_template_source_level(v_assignment.id);
  if v_level is null then raise exception 'Wizard class level is unavailable'; end if;
  if not private.is_character_short_rest_open(p_character_id) then
    raise exception 'Arcane Recovery is available only immediately after a granted Short Rest';
  end if;

  select current,max_snapshot into v_current,v_max
  from public.character_resource_states
  where character_id=p_character_id and state_key='wizard_arcane_recovery'
  for update;
  if v_max is null then raise exception 'Arcane Recovery resource is not synchronized'; end if;
  if v_current<1 then raise exception 'Arcane Recovery has already been used since the last Long Rest'; end if;

  v_budget:=(v_level+1)/2;
  v_result:=private.restore_spell_slot_resources_v1(
    p_character_id,coalesce(p_recovery,'{}'::jsonb),v_budget,5,auth.uid()
  );

  update public.character_resource_states
  set current=current-1,updated_by=auth.uid(),updated_at=now()
  where character_id=p_character_id and state_key='wizard_arcane_recovery';

  return v_result || jsonb_build_object(
    'characterId',p_character_id,
    'assignmentId',p_assignment_id,
    'wizardLevel',v_level,
    'resourceRemaining',v_current-1
  );
end;
$function$;

revoke all on function public.use_wizard_arcane_recovery_v1(uuid,uuid,jsonb) from public,anon;
grant execute on function public.use_wizard_arcane_recovery_v1(uuid,uuid,jsonb) to authenticated;

create or replace function private.install_wizard_2024_mechanics_v1(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_wizard uuid;
  v_level integer;
  v_clean jsonb;
begin
  select id into v_wizard
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:wizard'
    and is_builtin=true
    and is_active=true
  order by version desc,created_at desc
  limit 1;
  if v_wizard is null then return; end if;

  update public.rule_templates t
  set mechanics=coalesce((
        select jsonb_agg(m order by ord)
        from jsonb_array_elements(coalesce(t.mechanics,'[]'::jsonb)) with ordinality x(m,ord)
        where coalesce(m->>'id','') not in (
          'wizard-save-intelligence','wizard-save-wisdom','wizard-simple-weapons','wizard-arcane-recovery-resource'
        )
      ),'[]'::jsonb) || $base$[
        {"id":"wizard-save-intelligence","type":"grant","sourceKey":"saving-throws","target":"proficiency","key":"savingThrow:intelligence","payload":{"rank":1,"label":"Спасбросок: Интеллект"}},
        {"id":"wizard-save-wisdom","type":"grant","sourceKey":"saving-throws","target":"proficiency","key":"savingThrow:wisdom","payload":{"rank":1,"label":"Спасбросок: Мудрость"}},
        {"id":"wizard-simple-weapons","type":"grant","sourceKey":"weapon-training","target":"proficiency","key":"weapon:simple","payload":{"rank":1,"label":"Простое оружие"}},
        {"id":"wizard-arcane-recovery-resource","type":"resource","sourceKey":"arcane-recovery","key":"wizard_arcane_recovery","label":"Магическое восстановление","max":1,"recharge":["long_rest"],"restore":"full","initial":"full","presentation":{"tone":"violet","icon":"✦","display":"counter","priority":90}}
      ]$base$::jsonb,
      choices=case when exists(
        select 1 from jsonb_array_elements(coalesce(t.choices,'[]'::jsonb)) c where c->>'key'='wizard-skills'
      ) then t.choices else coalesce(t.choices,'[]'::jsonb) || $choices$[
        {"key":"wizard-skills","label":"Навыки волшебника","target":"proficiency","count":2,"options":["skill:arcana","skill:history","skill:insight","skill:investigation","skill:medicine","skill:nature","skill:religion"],"option_labels":{"skill:arcana":"Магия","skill:history":"История","skill:insight":"Проницательность","skill:investigation":"Анализ","skill:medicine":"Медицина","skill:nature":"Природа","skill:religion":"Религия"}}
      ]$choices$::jsonb end,
      rules_meta=coalesce(t.rules_meta,'{}'::jsonb) || jsonb_build_object(
        'mechanics_status','IN_PROGRESS',
        'mechanics_version',1,
        'parser_owns_spell_slots',true,
        'spellcasting_ability','intelligence',
        'spell_list','wizard',
        'arcane_recovery',jsonb_build_object(
          'trigger','short_rest','uses',1,'recharge','long_rest',
          'budget','ceil(class_level/2)','max_slot_level',5
        )
      ),
      updated_at=now()
  where t.id=v_wizard;

  for v_level in 1..20 loop
    insert into public.rule_template_levels(template_id,level,mechanics,choices)
    values(v_wizard,v_level,'[]'::jsonb,'[]'::jsonb)
    on conflict(template_id,level) do nothing;

    select coalesce(jsonb_agg(m order by ord),'[]'::jsonb) into v_clean
    from jsonb_array_elements((select mechanics from public.rule_template_levels where template_id=v_wizard and level=v_level)) with ordinality x(m,ord)
    where coalesce(m->>'id','') not like 'wizard-slot-%';

    update public.rule_template_levels
    set mechanics=coalesce(v_clean,'[]'::jsonb) || private.full_caster_slot_mechanics('wizard',v_level,'spellcasting')
    where template_id=v_wizard and level=v_level;
  end loop;
end;
$function$;

create or replace function private.install_wizard_2024_mechanics_v1_after_campaign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.install_wizard_2024_mechanics_v1(new.id);
  return new;
end;
$function$;

drop trigger if exists zzzzz_campaigns_install_wizard_2024_mechanics_v1 on public.campaigns;
create trigger zzzzz_campaigns_install_wizard_2024_mechanics_v1
after insert on public.campaigns
for each row execute function private.install_wizard_2024_mechanics_v1_after_campaign();

do $block$
declare v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.install_wizard_2024_mechanics_v1(v_campaign.id);
  end loop;
end;
$block$;

do $publication$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
     and not exists(
       select 1 from pg_publication_tables
       where pubname='supabase_realtime'
         and schemaname='public'
         and tablename='character_short_rest_sessions'
     ) then
    alter publication supabase_realtime add table public.character_short_rest_sessions;
  end if;
end;
$publication$;

commit;
