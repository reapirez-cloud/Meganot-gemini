-- CLASS_MIGRATION_SCOPE: infrastructure
revoke execute on function public.assign_character_template(uuid,uuid,integer,jsonb) from authenticated;
revoke execute on function public.assign_character_template_v2(uuid,uuid,integer,jsonb) from authenticated;
revoke execute on function public.apply_class_template_sheet_profile(uuid,uuid,integer) from authenticated;
revoke execute on function public.remove_character_template_assignment_v2(uuid,uuid) from authenticated;

grant execute on function public.set_character_template_assignment_owner_v1(uuid,uuid,integer,jsonb) to authenticated;
grant execute on function public.remove_character_template_assignment_owner_v1(uuid,uuid) to authenticated;
