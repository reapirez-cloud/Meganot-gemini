begin;

create table if not exists public.rule_templates (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  kind text not null check(kind in ('race','class')),
  slug text not null,
  name text not null,
  description text not null default '',
  version integer not null default 1 check(version >= 1),
  mechanics jsonb not null default '[]'::jsonb,
  choices jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(campaign_id, kind, slug, version)
);

create table if not exists public.rule_template_levels (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.rule_templates(id) on delete cascade,
  level integer not null check(level between 1 and 30),
  mechanics jsonb not null default '[]'::jsonb,
  choices jsonb not null default '[]'::jsonb,
  unique(template_id, level)
);

create table if not exists public.character_template_assignments (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  template_id uuid not null references public.rule_templates(id) on delete cascade,
  template_level integer check(template_level between 1 and 30),
  selected_choices jsonb not null default '{}'::jsonb,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(character_id, template_id)
);

create index if not exists rule_templates_campaign_kind_idx on public.rule_templates(campaign_id,kind,is_active,name);
create index if not exists character_template_assignments_character_idx on public.character_template_assignments(character_id);

alter table public.rule_templates enable row level security;
alter table public.rule_template_levels enable row level security;
alter table public.character_template_assignments enable row level security;

grant select,insert,update,delete on public.rule_templates to authenticated;
grant select,insert,update,delete on public.rule_template_levels to authenticated;
grant select,insert,update,delete on public.character_template_assignments to authenticated;

drop policy if exists rule_templates_read on public.rule_templates;
create policy rule_templates_read on public.rule_templates for select to authenticated
using ((select private.is_campaign_member(campaign_id)));
drop policy if exists rule_templates_manage on public.rule_templates;
create policy rule_templates_manage on public.rule_templates for all to authenticated
using ((select private.can_manage_campaign(campaign_id)))
with check ((select private.can_manage_campaign(campaign_id)));

drop policy if exists rule_template_levels_read on public.rule_template_levels;
create policy rule_template_levels_read on public.rule_template_levels for select to authenticated
using (exists(select 1 from public.rule_templates t where t.id=template_id and (select private.is_campaign_member(t.campaign_id))));
drop policy if exists rule_template_levels_manage on public.rule_template_levels;
create policy rule_template_levels_manage on public.rule_template_levels for all to authenticated
using (exists(select 1 from public.rule_templates t where t.id=template_id and (select private.can_manage_campaign(t.campaign_id))))
with check (exists(select 1 from public.rule_templates t where t.id=template_id and (select private.can_manage_campaign(t.campaign_id))));

drop policy if exists character_template_assignments_read on public.character_template_assignments;
create policy character_template_assignments_read on public.character_template_assignments for select to authenticated
using ((select private.can_view_character(character_id)));
drop policy if exists character_template_assignments_manage on public.character_template_assignments;
create policy character_template_assignments_manage on public.character_template_assignments for all to authenticated
using ((select private.can_manage_character(character_id)))
with check ((select private.can_manage_character(character_id)));

create or replace function public.save_rule_template(
  p_campaign_id uuid,
  p_template_id uuid,
  p_kind text,
  p_name text,
  p_slug text,
  p_description text,
  p_mechanics jsonb,
  p_choices jsonb,
  p_version integer default 1
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_manage_campaign(p_campaign_id,auth.uid()) then raise exception 'Not allowed'; end if;
  if p_kind not in ('race','class') then raise exception 'Unsupported template kind'; end if;
  if nullif(trim(coalesce(p_name,'')),'') is null then raise exception 'Template name is required'; end if;
  if p_template_id is null then
    insert into public.rule_templates(campaign_id,kind,slug,name,description,version,mechanics,choices,created_by)
    values(p_campaign_id,p_kind,coalesce(nullif(trim(p_slug),''),replace(lower(trim(p_name)),' ','-')),trim(p_name),trim(coalesce(p_description,'')),greatest(1,p_version),coalesce(p_mechanics,'[]'::jsonb),coalesce(p_choices,'[]'::jsonb),auth.uid())
    returning id into v_id;
  else
    update public.rule_templates set name=trim(p_name),slug=coalesce(nullif(trim(p_slug),''),slug),description=trim(coalesce(p_description,'')),mechanics=coalesce(p_mechanics,'[]'::jsonb),choices=coalesce(p_choices,'[]'::jsonb),is_active=true,updated_at=now()
    where id=p_template_id and campaign_id=p_campaign_id and kind=p_kind
    returning id into v_id;
  end if;
  if v_id is null then raise exception 'Template not found'; end if;
  return v_id;
end;
$$;

create or replace function public.save_rule_template_level(
  p_template_id uuid,
  p_level integer,
  p_mechanics jsonb,
  p_choices jsonb default '[]'::jsonb
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_campaign_id uuid; v_id uuid;
begin
  select campaign_id into v_campaign_id from public.rule_templates where id=p_template_id;
  if v_campaign_id is null or not private.can_manage_campaign(v_campaign_id,auth.uid()) then raise exception 'Not allowed'; end if;
  if p_level<1 or p_level>30 then raise exception 'Unsupported level'; end if;
  insert into public.rule_template_levels(template_id,level,mechanics,choices)
  values(p_template_id,p_level,coalesce(p_mechanics,'[]'::jsonb),coalesce(p_choices,'[]'::jsonb))
  on conflict(template_id,level) do update set mechanics=excluded.mechanics,choices=excluded.choices
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.assign_character_template(
  p_character_id uuid,
  p_template_id uuid,
  p_template_level integer default null,
  p_selected_choices jsonb default '{}'::jsonb
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_character_campaign uuid; v_template_campaign uuid; v_id uuid;
begin
  if not private.can_manage_character(p_character_id,auth.uid()) then raise exception 'Not allowed'; end if;
  select campaign_id into v_character_campaign from public.characters where id=p_character_id;
  select campaign_id into v_template_campaign from public.rule_templates where id=p_template_id and is_active=true;
  if v_character_campaign is null or v_template_campaign is null or v_character_campaign<>v_template_campaign then raise exception 'Template belongs to another campaign'; end if;
  insert into public.character_template_assignments(character_id,template_id,template_level,selected_choices,assigned_by)
  values(p_character_id,p_template_id,p_template_level,coalesce(p_selected_choices,'{}'::jsonb),auth.uid())
  on conflict(character_id,template_id) do update set template_level=excluded.template_level,selected_choices=excluded.selected_choices,assigned_by=auth.uid(),updated_at=now()
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.save_rule_template(uuid,uuid,text,text,text,text,jsonb,jsonb,integer) from public,anon;
revoke all on function public.save_rule_template_level(uuid,integer,jsonb,jsonb) from public,anon;
revoke all on function public.assign_character_template(uuid,uuid,integer,jsonb) from public,anon;
grant execute on function public.save_rule_template(uuid,uuid,text,text,text,text,jsonb,jsonb,integer) to authenticated;
grant execute on function public.save_rule_template_level(uuid,integer,jsonb,jsonb) to authenticated;
grant execute on function public.assign_character_template(uuid,uuid,integer,jsonb) to authenticated;

commit;
