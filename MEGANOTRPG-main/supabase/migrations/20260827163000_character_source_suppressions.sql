begin;

create table if not exists public.character_source_suppressions (
  character_id uuid not null references public.characters(id) on delete cascade,
  source_id text not null,
  disabled_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(character_id,source_id),
  check(length(trim(source_id)) between 1 and 512)
);

create index if not exists character_source_suppressions_character_idx
  on public.character_source_suppressions(character_id,updated_at desc);

alter table public.character_source_suppressions enable row level security;
revoke all on public.character_source_suppressions from anon,authenticated;
grant select on public.character_source_suppressions to authenticated;

drop policy if exists character_source_suppressions_read on public.character_source_suppressions;
create policy character_source_suppressions_read on public.character_source_suppressions
for select to authenticated
using ((select private.can_view_character(character_id)));

drop policy if exists character_source_suppressions_manage on public.character_source_suppressions;
create policy character_source_suppressions_manage on public.character_source_suppressions
for all to authenticated
using ((select private.can_manage_character(character_id)))
with check ((select private.can_manage_character(character_id)));

create or replace function public.set_character_source_suppressed(
  p_character_id uuid,
  p_source_id text,
  p_suppressed boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_source_id text := trim(coalesce(p_source_id,''));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_manage_character(p_character_id,auth.uid()) then raise exception 'Not allowed'; end if;
  if length(v_source_id)<1 or length(v_source_id)>512 then raise exception 'Invalid source id'; end if;

  if coalesce(p_suppressed,false) then
    insert into public.character_source_suppressions(character_id,source_id,disabled_by)
    values(p_character_id,v_source_id,auth.uid())
    on conflict(character_id,source_id) do update set
      disabled_by=auth.uid(),
      updated_at=now();
  else
    delete from public.character_source_suppressions
    where character_id=p_character_id and source_id=v_source_id;
  end if;
end;
$$;

revoke all on function public.set_character_source_suppressed(uuid,text,boolean) from public,anon;
grant execute on function public.set_character_source_suppressed(uuid,text,boolean) to authenticated;

-- Parser groups several mechanical contributions under one stable GM switch.
-- This is intentionally metadata on stored mechanics; CE never branches on it.
create or replace function private.apply_builtin_druid_source_groups(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_druid uuid;
begin
  select id into v_druid
  from public.rule_templates
  where campaign_id=p_campaign_id
    and kind='class'
    and catalog_key='class:druid'
    and is_builtin
    and is_active
  order by version desc,updated_at desc
  limit 1;
  if v_druid is null then return; end if;

  update public.rule_templates t set mechanics=(
    select coalesce(jsonb_agg(
      case m->>'id'
        when 'druid-save-int' then m || '{"sourceKey":"saving-throw:intelligence"}'::jsonb
        when 'druid-save-wis' then m || '{"sourceKey":"saving-throw:wisdom"}'::jsonb
        when 'druid-simple-weapons' then m || '{"sourceKey":"proficiency:simple-weapons"}'::jsonb
        when 'druid-herbalism' then m || '{"sourceKey":"proficiency:herbalism-kit"}'::jsonb
        when 'druid-light-armor' then m || '{"sourceKey":"proficiency:light-armor"}'::jsonb
        when 'druid-shields' then m || '{"sourceKey":"proficiency:shields"}'::jsonb
        when 'druid-druidic' then m || '{"sourceKey":"druidic"}'::jsonb
        when 'druid-spellcasting' then m || '{"sourceKey":"spellcasting"}'::jsonb
        when 'druid-primal-order' then m || '{"sourceKey":"primal-order"}'::jsonb
        else m
      end order by ord
    ),'[]'::jsonb)
    from jsonb_array_elements(t.mechanics) with ordinality as e(m,ord)
  ),updated_at=now()
  where t.id=v_druid;

  update public.rule_template_levels l set mechanics=(
    select coalesce(jsonb_agg(
      case
        when m->>'id' like 'druid-wild-shape-%' then m || '{"sourceKey":"wild-shape"}'::jsonb
        when m->>'id'='druid-wild-companion' then m || '{"sourceKey":"wild-companion"}'::jsonb
        when m->>'id'='druid-subclass-unlock' then m || '{"sourceKey":"subclass"}'::jsonb
        when m->>'id' like 'druid-asi-%' then m || jsonb_build_object('sourceKey','asi:' || l.level::text)
        when m->>'id'='druid-wild-resurgence' then m || '{"sourceKey":"wild-resurgence"}'::jsonb
        when m->>'id'='druid-elemental-fury' then m || '{"sourceKey":"elemental-fury"}'::jsonb
        when m->>'id'='druid-improved-elemental-fury' then m || '{"sourceKey":"elemental-fury"}'::jsonb
        when m->>'id'='druid-beast-spells' then m || '{"sourceKey":"beast-spells"}'::jsonb
        when m->>'id'='druid-epic-boon' then m || '{"sourceKey":"epic-boon"}'::jsonb
        when m->>'id'='druid-archdruid' then m || '{"sourceKey":"archdruid"}'::jsonb
        else m
      end order by ord
    ),'[]'::jsonb)
    from jsonb_array_elements(l.mechanics) with ordinality as e(m,ord)
  )
  where l.template_id=v_druid;
end;
$$;

-- Future campaigns get parser grouping immediately after the built-in catalog.
create or replace function private.install_builtin_rule_catalog_after_campaign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.install_builtin_rule_catalog(new.id);
  perform private.apply_builtin_druid_source_groups(new.id);
  return new;
end;
$$;

do $$
declare v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.apply_builtin_druid_source_groups(v_campaign.id);
  end loop;
end;
$$;

commit;
