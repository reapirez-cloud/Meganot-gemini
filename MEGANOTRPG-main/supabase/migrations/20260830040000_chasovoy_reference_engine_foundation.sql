-- CLASS_MIGRATION_SCOPE: infrastructure
-- Chasovoy is reference-engine infrastructure; this migration does not change class mechanics.
begin;

create table if not exists public.reference_definitions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('class','subclass','race','subrace','spell','item','feat','feature','condition','background','species','reference')),
  scope text not null check (scope in ('system','campaign')),
  campaign_id uuid references public.campaigns(id) on delete cascade,
  slug text not null,
  visibility text not null default 'campaign' check (visibility in ('campaign','gm')),
  status text not null default 'active' check (status in ('draft','active','archived')),
  source_kind text not null default 'custom' check (source_kind in ('system','srd','official','third_party','custom','legacy')),
  source_label text,
  external_id text,
  current_revision integer not null default 1 check (current_revision >= 1),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope='system' and campaign_id is null) or (scope='campaign' and campaign_id is not null))
);

create unique index if not exists reference_definitions_system_slug_unique
  on public.reference_definitions(kind, slug) where scope='system';
create unique index if not exists reference_definitions_campaign_slug_unique
  on public.reference_definitions(campaign_id, kind, slug) where scope='campaign';
create index if not exists reference_definitions_campaign_kind_idx
  on public.reference_definitions(campaign_id, kind, status, slug);

create table if not exists public.reference_definition_revisions (
  definition_id uuid not null references public.reference_definitions(id) on delete cascade,
  revision integer not null check (revision >= 1),
  name text not null,
  summary text not null default '',
  rules_text text not null default '',
  mechanics jsonb not null default '[]'::jsonb,
  data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (definition_id, revision)
);

alter table public.reference_definitions enable row level security;
alter table public.reference_definition_revisions enable row level security;

grant select on public.reference_definitions to authenticated;
grant select on public.reference_definition_revisions to authenticated;

drop policy if exists reference_definitions_read on public.reference_definitions;
create policy reference_definitions_read on public.reference_definitions for select to authenticated
using (
  scope='system'
  or (
    campaign_id is not null
    and (select private.is_campaign_member(campaign_id))
    and (visibility='campaign' or (select private.can_manage_campaign(campaign_id)))
  )
);

drop policy if exists reference_definition_revisions_read on public.reference_definition_revisions;
create policy reference_definition_revisions_read on public.reference_definition_revisions for select to authenticated
using (exists (
  select 1 from public.reference_definitions d
  where d.id=definition_id
    and (d.scope='system' or (
      d.campaign_id is not null
      and (select private.is_campaign_member(d.campaign_id))
      and (d.visibility='campaign' or (select private.can_manage_campaign(d.campaign_id)))
    ))
));

create or replace function public.create_reference_definition_v1(
  p_campaign_id uuid,
  p_kind text,
  p_slug text,
  p_visibility text,
  p_status text,
  p_source_kind text,
  p_source_label text,
  p_external_id text,
  p_name text,
  p_summary text,
  p_rules_text text,
  p_mechanics jsonb,
  p_data jsonb
)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_campaign_id is null or not private.can_manage_campaign(p_campaign_id,auth.uid()) then raise exception 'Not allowed'; end if;
  if nullif(trim(coalesce(p_slug,'')),'') is null then raise exception 'Definition slug is required'; end if;
  if nullif(trim(coalesce(p_name,'')),'') is null then raise exception 'Definition name is required'; end if;
  insert into public.reference_definitions(kind,scope,campaign_id,slug,visibility,status,source_kind,source_label,external_id,created_by)
  values(p_kind,'campaign',p_campaign_id,lower(trim(p_slug)),coalesce(p_visibility,'campaign'),coalesce(p_status,'active'),coalesce(p_source_kind,'custom'),nullif(trim(coalesce(p_source_label,'')),''),nullif(trim(coalesce(p_external_id,'')),''),auth.uid())
  returning id into v_id;
  insert into public.reference_definition_revisions(definition_id,revision,name,summary,rules_text,mechanics,data,created_by)
  values(v_id,1,trim(p_name),trim(coalesce(p_summary,'')),trim(coalesce(p_rules_text,'')),coalesce(p_mechanics,'[]'::jsonb),coalesce(p_data,'{}'::jsonb),auth.uid());
  return v_id;
end;
$$;

create or replace function public.revise_reference_definition_v1(
  p_definition_id uuid,
  p_name text,
  p_summary text,
  p_rules_text text,
  p_mechanics jsonb,
  p_data jsonb
)
returns integer language plpgsql security definer set search_path='' as $$
declare v_campaign_id uuid; v_scope text; v_revision integer;
begin
  select campaign_id,scope,current_revision into v_campaign_id,v_scope,v_revision
  from public.reference_definitions where id=p_definition_id for update;
  if not found then raise exception 'Definition not found'; end if;
  if v_scope='system' then raise exception 'System definitions are immutable through campaign API'; end if;
  if not private.can_manage_campaign(v_campaign_id,auth.uid()) then raise exception 'Not allowed'; end if;
  v_revision:=v_revision+1;
  insert into public.reference_definition_revisions(definition_id,revision,name,summary,rules_text,mechanics,data,created_by)
  values(p_definition_id,v_revision,trim(p_name),trim(coalesce(p_summary,'')),trim(coalesce(p_rules_text,'')),coalesce(p_mechanics,'[]'::jsonb),coalesce(p_data,'{}'::jsonb),auth.uid());
  update public.reference_definitions set current_revision=v_revision,updated_at=now() where id=p_definition_id;
  return v_revision;
end;
$$;

create or replace function public.archive_reference_definition_v1(p_definition_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_campaign_id uuid; v_scope text;
begin
  select campaign_id,scope into v_campaign_id,v_scope from public.reference_definitions where id=p_definition_id for update;
  if not found then raise exception 'Definition not found'; end if;
  if v_scope='system' then raise exception 'System definitions are immutable through campaign API'; end if;
  if not private.can_manage_campaign(v_campaign_id,auth.uid()) then raise exception 'Not allowed'; end if;
  update public.reference_definitions set status='archived',updated_at=now() where id=p_definition_id;
end;
$$;

revoke all on function public.create_reference_definition_v1(uuid,text,text,text,text,text,text,text,text,text,text,jsonb,jsonb) from public,anon;
revoke all on function public.revise_reference_definition_v1(uuid,text,text,text,jsonb,jsonb) from public,anon;
revoke all on function public.archive_reference_definition_v1(uuid) from public,anon;
grant execute on function public.create_reference_definition_v1(uuid,text,text,text,text,text,text,text,text,text,text,jsonb,jsonb) to authenticated;
grant execute on function public.revise_reference_definition_v1(uuid,text,text,text,jsonb,jsonb) to authenticated;
grant execute on function public.archive_reference_definition_v1(uuid) to authenticated;

-- Transitional pointer: Cheburashka instances may now reference a Chasovoy item
-- without removing legacy inline fields until the runtime migration is complete.
alter table public.character_inventory_items
  add column if not exists definition_id uuid references public.reference_definitions(id) on delete restrict,
  add column if not exists definition_revision integer;

alter table public.character_inventory_items
  drop constraint if exists character_inventory_items_definition_revision_fkey;
alter table public.character_inventory_items
  add constraint character_inventory_items_definition_revision_fkey
  foreign key (definition_id, definition_revision)
  references public.reference_definition_revisions(definition_id, revision)
  on delete restrict;

create index if not exists character_inventory_items_definition_idx
  on public.character_inventory_items(definition_id);

commit;
