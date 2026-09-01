begin;

create or replace function private.sync_character_class_progression(p_character_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total_level integer := 0;
  v_primary_class text := '';
begin
  -- A subclass has no independent level. Keep the stored read-model aligned
  -- with its parent class while the parser still resolves from the parent.
  update public.character_template_assignments child
  set template_level = greatest(1, coalesce(parent.template_level, 1)),
      updated_at = now()
  from public.rule_templates subclass_template,
       public.character_template_assignments parent
  where child.character_id = p_character_id
    and subclass_template.id = child.template_id
    and subclass_template.kind = 'subclass'
    and parent.character_id = p_character_id
    and parent.template_id = subclass_template.parent_template_id
    and child.template_level is distinct from greatest(1, coalesce(parent.template_level, 1));

  select coalesce(sum(greatest(1, coalesce(a.template_level, 1))), 0)
  into v_total_level
  from public.character_template_assignments a
  join public.rule_templates t on t.id = a.template_id
  where a.character_id = p_character_id
    and t.kind = 'class';

  select t.name
  into v_primary_class
  from public.character_template_assignments a
  join public.rule_templates t on t.id = a.template_id
  where a.character_id = p_character_id
    and t.kind = 'class'
  order by a.assigned_at, a.id
  limit 1;

  update public.characters
  set level = greatest(1, v_total_level),
      character_class = coalesce(v_primary_class, ''),
      updated_at = now()
  where id = p_character_id;
end;
$$;

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
  if not private.can_manage_character(p_character_id, auth.uid()) then raise exception 'Not allowed'; end if;

  select campaign_id into v_character_campaign
  from public.characters
  where id = p_character_id;

  select * into v_template
  from public.rule_templates
  where id = p_template_id and is_active = true;

  if v_character_campaign is null or v_template.id is null or v_character_campaign <> v_template.campaign_id then
    raise exception 'Template belongs to another campaign';
  end if;

  if v_template.kind = 'race' then
    delete from public.character_template_assignments a
    using public.rule_templates t
    where a.character_id = p_character_id
      and a.template_id = t.id
      and t.kind in ('race', 'subrace');
    p_template_level := null;

  elsif v_template.kind = 'subrace' then
    select a.* into v_parent_assignment
    from public.character_template_assignments a
    where a.character_id = p_character_id
      and a.template_id = v_template.parent_template_id;
    if v_parent_assignment.id is null then raise exception 'Assign the parent race first'; end if;

    delete from public.character_template_assignments a
    using public.rule_templates t
    where a.character_id = p_character_id
      and a.template_id = t.id
      and t.kind = 'subrace';
    p_template_level := null;

  elsif v_template.kind = 'class' then
    p_template_level := greatest(1, least(30, coalesce(p_template_level, 1)));

  elsif v_template.kind = 'subclass' then
    select a.* into v_parent_assignment
    from public.character_template_assignments a
    where a.character_id = p_character_id
      and a.template_id = v_template.parent_template_id;
    if v_parent_assignment.id is null then raise exception 'Assign the parent class first'; end if;
    if coalesce(v_parent_assignment.template_level, 1) < coalesce(v_template.unlock_level, 1) then
      raise exception 'Parent class level is below subclass unlock level';
    end if;

    delete from public.character_template_assignments a
    using public.rule_templates t
    where a.character_id = p_character_id
      and a.template_id = t.id
      and t.kind = 'subclass'
      and t.parent_template_id = v_template.parent_template_id;

    -- Stored only as a synchronized read-model. CE resolves subclass level
    -- from the parent class assignment and never treats this as an own level.
    p_template_level := greatest(1, coalesce(v_parent_assignment.template_level, 1));
  end if;

  insert into public.character_template_assignments(
    character_id, template_id, template_level, selected_choices, assigned_by
  ) values (
    p_character_id, p_template_id, p_template_level, coalesce(p_selected_choices, '{}'::jsonb), auth.uid()
  )
  on conflict(character_id, template_id) do update
    set template_level = excluded.template_level,
        selected_choices = excluded.selected_choices,
        assigned_by = auth.uid(),
        updated_at = now()
  returning id into v_id;

  if v_template.kind in ('class', 'subclass') then
    perform private.sync_character_class_progression(p_character_id);
  end if;

  return v_id;
end;
$$;

create or replace function public.remove_character_template_assignment_v2(
  p_character_id uuid,
  p_assignment_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_template public.rule_templates%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_manage_character(p_character_id, auth.uid()) then raise exception 'Not allowed'; end if;

  select t.* into v_template
  from public.character_template_assignments a
  join public.rule_templates t on t.id = a.template_id
  where a.id = p_assignment_id
    and a.character_id = p_character_id;

  if v_template.id is null then raise exception 'Assignment not found'; end if;

  if v_template.kind = 'class' then
    delete from public.character_template_assignments child
    using public.rule_templates child_template
    where child.character_id = p_character_id
      and child.template_id = child_template.id
      and child_template.kind = 'subclass'
      and child_template.parent_template_id = v_template.id;
  elsif v_template.kind = 'race' then
    delete from public.character_template_assignments child
    using public.rule_templates child_template
    where child.character_id = p_character_id
      and child.template_id = child_template.id
      and child_template.kind = 'subrace'
      and child_template.parent_template_id = v_template.id;
  end if;

  delete from public.character_template_assignments
  where id = p_assignment_id
    and character_id = p_character_id;

  if v_template.kind in ('class', 'subclass') then
    perform private.sync_character_class_progression(p_character_id);
  end if;
end;
$$;

revoke all on function public.remove_character_template_assignment_v2(uuid, uuid) from public;
grant execute on function public.remove_character_template_assignment_v2(uuid, uuid) to authenticated;

-- Normalize existing characters once so the base CE level and subclass read-model
-- agree with their currently assigned class levels.
do $$
declare
  v_character_id uuid;
begin
  for v_character_id in
    select distinct a.character_id
    from public.character_template_assignments a
    join public.rule_templates t on t.id = a.template_id
    where t.kind in ('class', 'subclass')
  loop
    perform private.sync_character_class_progression(v_character_id);
  end loop;
end;
$$;

commit;
