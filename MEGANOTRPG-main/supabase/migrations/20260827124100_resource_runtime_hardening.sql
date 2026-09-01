begin;

-- Tighten resource visibility to the canonical character visibility helper.
drop policy if exists character_resource_states_read on public.character_resource_states;
create policy character_resource_states_read on public.character_resource_states
for select to authenticated
using ((select private.can_view_character(character_id, auth.uid())));

-- Removing a root assignment also removes its dependent child assignment.
create or replace function private.cleanup_child_template_assignments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_kind text;
begin
  select kind into v_kind from public.rule_templates where id=old.template_id;
  if v_kind='race' then
    delete from public.character_template_assignments a
    using public.rule_templates t
    where a.character_id=old.character_id
      and a.template_id=t.id
      and t.kind='subrace'
      and t.parent_template_id=old.template_id;
  elsif v_kind='class' then
    delete from public.character_template_assignments a
    using public.rule_templates t
    where a.character_id=old.character_id
      and a.template_id=t.id
      and t.kind='subclass'
      and t.parent_template_id=old.template_id;
  end if;
  return old;
end;
$$;

drop trigger if exists character_template_assignments_cleanup_children on public.character_template_assignments;
create trigger character_template_assignments_cleanup_children
after delete on public.character_template_assignments
for each row execute function private.cleanup_child_template_assignments();

-- Preserve a human-readable resource label when reporting insufficient state.
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
        spell_slots=jsonb_set(coalesce(spell_slots,'{}'::jsonb),array[v_level::text],jsonb_build_object('max',v_max,'used',v_used+v_amount),true),
        updated_at=now()
      where character_id=p_character_id;
      continue;
    end if;

    select current,max_snapshot,label,recharge into v_current,v_max,v_label,v_recharge
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
      select current,max_snapshot,label,recharge into v_current,v_max,v_label,v_recharge
      from public.character_resource_states
      where character_id=p_character_id and state_key=v_state_key
      for update;
    end if;

    if v_current < v_amount then raise exception 'Недостаточно ресурса: %',coalesce(nullif(v_label,''),v_state_key); end if;
    update public.character_resource_states
    set current=current-v_amount,updated_by=p_user_id,updated_at=now()
    where character_id=p_character_id and state_key=v_state_key;
  end loop;
end;
$$;

-- Both generic resource changes and legacy spell-slot changes must propagate to clients.
do $$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='character_sheets') then
      alter publication supabase_realtime add table public.character_sheets;
    end if;
  end if;
end $$;

commit;
