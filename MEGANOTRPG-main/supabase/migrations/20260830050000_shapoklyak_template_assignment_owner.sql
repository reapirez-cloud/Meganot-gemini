-- CLASS_MIGRATION_SCOPE: infrastructure
-- Character assignment ownership only; class mechanics and presentation content are unchanged.
begin;

-- Concrete template assignments belong to the character/entity owner (Shapoklyak).
-- Definitions remain owned by Chasovoy. This owner RPC deliberately composes the
-- existing assignment and legacy sheet-profile projections inside one PostgreSQL
-- transaction so the application can never observe "class assigned, sheet profile failed".
create or replace function public.set_character_template_assignment_owner_v1(
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
  v_kind text;
  v_assignment_id uuid;
  v_effective_level integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_manage_character(p_character_id, auth.uid()) then raise exception 'Not allowed'; end if;

  select kind into v_kind
  from public.rule_templates
  where id = p_template_id
    and is_active = true;

  if v_kind is null then raise exception 'Template not found'; end if;

  v_assignment_id := public.assign_character_template_v2(
    p_character_id,
    p_template_id,
    p_template_level,
    coalesce(p_selected_choices, '{}'::jsonb)
  );

  -- Sheet profile is a transitional projection. Keep it in the same transaction
  -- as the canonical class assignment until the legacy character sheet is retired.
  if v_kind = 'class' then
    select greatest(1, coalesce(template_level, 1))
      into v_effective_level
    from public.character_template_assignments
    where id = v_assignment_id;

    perform public.apply_class_template_sheet_profile(
      p_character_id,
      p_template_id,
      coalesce(v_effective_level, 1)
    );
  end if;

  return v_assignment_id;
end;
$$;

create or replace function public.remove_character_template_assignment_owner_v1(
  p_character_id uuid,
  p_assignment_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_manage_character(p_character_id, auth.uid()) then raise exception 'Not allowed'; end if;

  perform public.remove_character_template_assignment_v2(
    p_character_id,
    p_assignment_id
  );
end;
$$;

revoke all on function public.set_character_template_assignment_owner_v1(uuid,uuid,integer,jsonb) from public,anon;
revoke all on function public.remove_character_template_assignment_owner_v1(uuid,uuid) from public,anon;
grant execute on function public.set_character_template_assignment_owner_v1(uuid,uuid,integer,jsonb) to authenticated;
grant execute on function public.remove_character_template_assignment_owner_v1(uuid,uuid) to authenticated;

commit;
