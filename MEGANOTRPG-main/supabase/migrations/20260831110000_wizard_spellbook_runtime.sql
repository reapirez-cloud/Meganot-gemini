-- CLASS_MIGRATION_SCOPE: mechanics
-- CLASS_INTEGRATION_STRICT: class:wizard
-- CLASS_PACKAGE_TEST: tests/wizardSpellbookRuntime.test.ts
-- CLASS_RESOURCE_POLICY: short-long-rest-v1
-- CLASS_WORK_STATUS: wizard:text=READY;mechanics=IN_PROGRESS
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
--
-- Physical Wizard spellbooks are Cheburashka inventory instances. Their written
-- spells belong to the exact inventory item, not to a character-wide boolean.
-- GENA and the generic preparation commit both validate the held book on the
-- server before replacing prepared Wizard spells. Already prepared spells are
-- never cleared merely because a book is lost, transferred or destroyed.

begin;

create or replace function private.install_wizard_spellbook_definition(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_definition_id uuid;
  v_revision integer;
  v_data jsonb := jsonb_build_object(
    'quantity',1,
    'weight',3,
    'category','book',
    'equipment_slot',null,
    'usage_mode','none',
    'charges_current',null,
    'charges_max',null,
    'item_state',jsonb_build_object(
      'class_item','wizard_spellbook',
      'class_key','wizard',
      'nonstackable',true
    )
  );
  v_mechanics jsonb := jsonb_build_array(jsonb_build_object(
    'id','wizard-spellbook-presence',
    'type','grant',
    'target','feature',
    'key','wizard_spellbook',
    'sourceKey','wizard-spellbook',
    'payload',jsonb_build_object(
      'label','Книга заклинаний',
      'description','Этот экземпляр хранит записанные заклинания Волшебника. Пока книга находится в инвентаре персонажа, её записи можно использовать для изменения подготовки заклинаний Волшебника.'
    )
  ));
begin
  select id,current_revision
    into v_definition_id,v_revision
  from public.reference_definitions
  where kind='item'
    and scope='campaign'
    and campaign_id=p_campaign_id
    and slug='wizard-spellbook'
  limit 1;

  if v_definition_id is null then
    insert into public.reference_definitions(
      kind,scope,campaign_id,slug,visibility,status,source_kind,source_label,
      external_id,current_revision,created_by,created_at,updated_at
    ) values (
      'item','campaign',p_campaign_id,'wizard-spellbook','campaign','active','official',
      'Player''s Handbook 2024','class:wizard:spellbook',1,null,now(),now()
    ) returning id into v_definition_id;

    insert into public.reference_definition_revisions(
      definition_id,revision,name,summary,rules_text,mechanics,data,created_by,created_at
    ) values (
      v_definition_id,1,
      'Книга заклинаний волшебника',
      'Физическая книга, в которой хранятся известные заклинания конкретного Волшебника.',
      'Книга заклинаний является физическим предметом. Пока этот экземпляр находится в инвентаре Волшебника, персонаж может читать записанные в нём заклинания и менять подготовку, выбирая только из записей имеющихся у него книг. Книгу не требуется экипировать. Если экземпляр потерян, передан или уничтожен, его записи больше не доступны этому персонажу. Уже подготовленные заклинания при этом не исчезают из памяти автоматически; без книги Волшебник лишь не может изменить подготовку через неё.',
      v_mechanics,v_data,null,now()
    );
  else
    update public.reference_definitions
    set visibility='campaign',status='active',source_kind='official',
        source_label='Player''s Handbook 2024',external_id='class:wizard:spellbook',updated_at=now()
    where id=v_definition_id;

    if not exists(
      select 1 from public.reference_definition_revisions
      where definition_id=v_definition_id and revision=v_revision
    ) then
      insert into public.reference_definition_revisions(
        definition_id,revision,name,summary,rules_text,mechanics,data,created_by,created_at
      ) values (
        v_definition_id,v_revision,
        'Книга заклинаний волшебника',
        'Физическая книга, в которой хранятся известные заклинания конкретного Волшебника.',
        'Книга заклинаний является физическим предметом. Пока этот экземпляр находится в инвентаре Волшебника, персонаж может читать записанные в нём заклинания и менять подготовку, выбирая только из записей имеющихся у него книг. Книгу не требуется экипировать. Если экземпляр потерян, передан или уничтожен, его записи больше не доступны этому персонажу. Уже подготовленные заклинания при этом не исчезают из памяти автоматически; без книги Волшебник лишь не может изменить подготовку через неё.',
        v_mechanics,v_data,null,now()
      );
    end if;
  end if;
end;
$function$;

revoke all on function private.install_wizard_spellbook_definition(uuid) from public,anon,authenticated;
grant execute on function private.install_wizard_spellbook_definition(uuid) to service_role;

create table if not exists public.wizard_spellbook_entries (
  spellbook_item_id uuid not null references public.character_inventory_items(id) on delete cascade,
  spell_catalog_id uuid not null references public.spell_catalog(id) on delete restrict,
  added_by uuid references auth.users(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (spellbook_item_id,spell_catalog_id)
);

create index if not exists wizard_spellbook_entries_spell_idx
  on public.wizard_spellbook_entries(spell_catalog_id);

alter table public.wizard_spellbook_entries enable row level security;
grant select on public.wizard_spellbook_entries to authenticated;
revoke insert,update,delete on public.wizard_spellbook_entries from authenticated;

drop policy if exists wizard_spellbook_entries_read on public.wizard_spellbook_entries;
create policy wizard_spellbook_entries_read
on public.wizard_spellbook_entries
for select
to authenticated
using (exists(
  select 1
  from public.character_inventory_items item
  where item.id=spellbook_item_id
    and private.can_view_character(item.character_id,auth.uid())
));

create or replace function private.is_wizard_spellbook_item(
  p_item_id uuid,
  p_character_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists(
    select 1
    from public.character_inventory_items item
    left join public.reference_definitions definition on definition.id=item.definition_id
    where item.id=p_item_id
      and item.quantity>0
      and (p_character_id is null or item.character_id=p_character_id)
      and item.category='book'
      and (
        coalesce(item.item_state->>'class_item','')='wizard_spellbook'
        or (
          definition.kind='item'
          and definition.slug='wizard-spellbook'
        )
      )
  )
$function$;

revoke all on function private.is_wizard_spellbook_item(uuid,uuid) from public,anon,authenticated;
grant execute on function private.is_wizard_spellbook_item(uuid,uuid) to service_role;

create or replace function private.character_wizard_level(p_character_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $function$
  select max(greatest(1,coalesce(a.template_level,c.level,1)))::integer
  from public.character_template_assignments a
  join public.rule_templates t on t.id=a.template_id
  join public.characters c on c.id=a.character_id
  where a.character_id=p_character_id
    and t.kind='class'
    and t.catalog_key='class:wizard'
    and t.is_active=true
$function$;

revoke all on function private.character_wizard_level(uuid) from public,anon,authenticated;
grant execute on function private.character_wizard_level(uuid) to service_role;

create or replace function private.character_wizard_max_spell_level(p_character_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when private.character_wizard_level(p_character_id) is null then null
    else least(9,greatest(1,ceil(private.character_wizard_level(p_character_id)::numeric/2)::integer))
  end
$function$;

revoke all on function private.character_wizard_max_spell_level(uuid) from public,anon,authenticated;
grant execute on function private.character_wizard_max_spell_level(uuid) to service_role;

create or replace function public.get_character_wizard_spellbook_v1(p_character_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_level integer;
  v_max_spell_level integer;
  v_books jsonb;
  v_spells jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_view_character(p_character_id,auth.uid()) then raise exception 'Not allowed'; end if;

  v_level:=private.character_wizard_level(p_character_id);
  v_max_spell_level:=private.character_wizard_max_spell_level(p_character_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'itemId',item.id,
    'name',item.name,
    'definitionId',item.definition_id,
    'definitionRevision',item.definition_revision
  ) order by item.created_at,item.id),'[]'::jsonb)
  into v_books
  from public.character_inventory_items item
  where item.character_id=p_character_id
    and private.is_wizard_spellbook_item(item.id,p_character_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'bookItemId',item.id,
    'bookName',item.name,
    'spellCatalogId',spell.id,
    'characterSpellId',character_spell.id,
    'name',coalesce(nullif(spell.name_ru,''),spell.name_en),
    'nameEn',spell.name_en,
    'level',spell.spell_level,
    'school',spell.school,
    'ritual',spell.ritual
  ) order by spell.spell_level,coalesce(nullif(spell.name_ru,''),spell.name_en),item.created_at,item.id),'[]'::jsonb)
  into v_spells
  from public.character_inventory_items item
  join public.wizard_spellbook_entries entry on entry.spellbook_item_id=item.id
  join public.spell_catalog spell on spell.id=entry.spell_catalog_id
  left join public.character_spells character_spell
    on character_spell.character_id=p_character_id and character_spell.catalog_spell_id=spell.id
  where item.character_id=p_character_id
    and private.is_wizard_spellbook_item(item.id,p_character_id);

  return jsonb_build_object(
    'hasBook',jsonb_array_length(v_books)>0,
    'wizardLevel',v_level,
    'maxSpellLevel',v_max_spell_level,
    'books',v_books,
    'spells',v_spells
  );
end;
$function$;

revoke all on function public.get_character_wizard_spellbook_v1(uuid) from public,anon;
grant execute on function public.get_character_wizard_spellbook_v1(uuid) to authenticated;

create or replace function public.grant_character_wizard_spellbook_spell_v1(
  p_character_id uuid,
  p_spell_catalog_id uuid,
  p_spellbook_item_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_book_id uuid;
  v_spell public.spell_catalog%rowtype;
  v_max_spell_level integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_manage_character(p_character_id,auth.uid()) then
    raise exception 'Only a campaign manager can write spells into a Wizard spellbook';
  end if;

  v_max_spell_level:=private.character_wizard_max_spell_level(p_character_id);
  if v_max_spell_level is null then raise exception 'Character has no active Wizard class assignment'; end if;

  if p_spellbook_item_id is not null then
    if not private.is_wizard_spellbook_item(p_spellbook_item_id,p_character_id) then
      raise exception 'Selected spellbook is not present in this character inventory';
    end if;
    v_book_id:=p_spellbook_item_id;
  else
    select item.id into v_book_id
    from public.character_inventory_items item
    where item.character_id=p_character_id
      and private.is_wizard_spellbook_item(item.id,p_character_id)
    order by item.created_at,item.id
    limit 1;
    if v_book_id is null then raise exception 'Wizard spellbook is not present in inventory'; end if;
  end if;

  select * into v_spell from public.spell_catalog where id=p_spell_catalog_id;
  if v_spell.id is null then raise exception 'Catalog spell not found'; end if;
  if v_spell.spell_level<1 then raise exception 'Cantrips are not written into the Wizard spellbook'; end if;
  if v_spell.spell_level>v_max_spell_level then
    raise exception 'Wizard cannot record a spell above current Wizard spell level %',v_max_spell_level;
  end if;
  if not exists(
    select 1 from public.spell_catalog_classes class_link
    where class_link.spell_id=v_spell.id and class_link.class_key='wizard'
  ) then
    raise exception 'Spell does not belong to the Wizard spell list';
  end if;

  insert into public.wizard_spellbook_entries(spellbook_item_id,spell_catalog_id,added_by,added_at)
  values(v_book_id,v_spell.id,auth.uid(),now())
  on conflict (spellbook_item_id,spell_catalog_id) do nothing;

  -- Character-spell membership remains the shared casting/preparation projection.
  -- The canonical definition still comes only from spell_catalog.
  insert into public.character_spells(character_id,catalog_spell_id,prepared)
  values(p_character_id,v_spell.id,false)
  on conflict (character_id,catalog_spell_id) do nothing;

  return v_book_id;
end;
$function$;

revoke all on function public.grant_character_wizard_spellbook_spell_v1(uuid,uuid,uuid) from public,anon;
grant execute on function public.grant_character_wizard_spellbook_spell_v1(uuid,uuid,uuid) to authenticated;

-- Wizard 2024 prepares only from its physical spellbook. This enables the generic
-- post-rest task and authors the exact class-level quota without creating a
-- Wizard-only preparation engine.
do $block$
declare
  v_prepared_by_level jsonb := '{
    "1":4,"2":5,"3":6,"4":7,"5":9,"6":10,"7":11,"8":12,"9":14,"10":15,
    "11":16,"12":16,"13":17,"14":18,"15":19,"16":21,"17":22,"18":23,"19":24,"20":25
  }'::jsonb;
begin
  update public.rule_templates t
  set rules_meta=coalesce(t.rules_meta,'{}'::jsonb)
      || jsonb_build_object(
        'spell_preparation_refresh','long_rest',
        'wizard_spellbook_required',true,
        'sheet_profile',coalesce(t.rules_meta->'sheet_profile','{}'::jsonb)
          || jsonb_build_object('prepared_spells_by_level',v_prepared_by_level)
      ),
      updated_at=now()
  where t.is_active=true and t.catalog_key='class:wizard';
end;
$block$;

create or replace function public.commit_character_spell_preparation_v1(
  p_character_id uuid,
  p_assignment_id uuid,
  p_prepared_spell_ids uuid[] default array[]::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_character public.characters%rowtype;
  v_assignment public.character_template_assignments%rowtype;
  v_template public.rule_templates%rowtype;
  v_session public.character_preparation_sessions%rowtype;
  v_ids uuid[] := array[]::uuid[];
  v_task_key text;
  v_invalid integer;
  v_prepared jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_character from public.characters where id=p_character_id;
  if v_character.id is null then raise exception 'Character not found'; end if;
  if coalesce(v_character.assigned_user_id,'00000000-0000-0000-0000-000000000000'::uuid)<>auth.uid()
     and not private.can_manage_character(v_character.id,auth.uid()) then
    raise exception 'Only the assigned player or campaign manager can prepare spells';
  end if;

  select * into v_assignment
  from public.character_template_assignments
  where id=p_assignment_id and character_id=p_character_id;
  if v_assignment.id is null then raise exception 'Spell preparation source is not assigned to this character'; end if;

  select * into v_template
  from public.rule_templates
  where id=v_assignment.template_id and is_active=true;
  if v_template.id is null
     or coalesce(v_template.rules_meta->>'spell_preparation_refresh','')<>'long_rest'
     or private.character_template_source_level(v_assignment.id) is null then
    raise exception 'This source does not allow long-rest spell preparation';
  end if;

  select * into v_session
  from public.character_preparation_sessions
  where character_id=p_character_id
  for update;
  if v_session.character_id is null or not v_session.is_open then
    raise exception 'Preparation window is closed until the next long rest';
  end if;

  select coalesce(array_agg(id order by id),array[]::uuid[])
  into v_ids
  from (select distinct value as id from unnest(coalesce(p_prepared_spell_ids,array[]::uuid[])) value) selected;

  if v_template.catalog_key='class:wizard' then
    if not exists(
      select 1 from public.character_inventory_items item
      where item.character_id=p_character_id
        and private.is_wizard_spellbook_item(item.id,p_character_id)
    ) then
      raise exception 'Wizard spell preparation requires a spellbook in inventory';
    end if;

    select count(*) into v_invalid
    from unnest(v_ids) selected(id)
    where not exists(
      select 1
      from public.character_spells s
      join public.wizard_spellbook_entries entry on entry.spell_catalog_id=s.catalog_spell_id
      join public.character_inventory_items item on item.id=entry.spellbook_item_id
      join public.spell_catalog spell on spell.id=s.catalog_spell_id
      where s.id=selected.id
        and s.character_id=p_character_id
        and item.character_id=p_character_id
        and private.is_wizard_spellbook_item(item.id,p_character_id)
        and spell.spell_level between 1 and private.character_wizard_max_spell_level(p_character_id)
        and exists(
          select 1 from public.spell_catalog_classes class_link
          where class_link.spell_id=spell.id and class_link.class_key='wizard'
        )
    );
    if v_invalid>0 then
      raise exception 'Wizard preparation contains a spell that is not written in a held spellbook';
    end if;
  else
    select count(*) into v_invalid
    from unnest(v_ids) selected(id)
    where not exists(
      select 1 from public.character_spells s
      where s.id=selected.id and s.character_id=p_character_id and s.spell_level>0 and s.cast_mode='slot'
    );
    if v_invalid>0 then
      raise exception 'Prepared spell selection contains a spell that cannot be prepared for this character';
    end if;
  end if;

  update public.character_spells s
  set prepared=(s.id=any(v_ids)),updated_at=now()
  where s.character_id=p_character_id
    and s.spell_level>0
    and s.cast_mode='slot'
    and s.prepared is distinct from (s.id=any(v_ids));

  v_task_key:='spells:' || v_template.id::text;
  v_prepared:=to_jsonb(v_ids);
  insert into public.character_preparation_records(
    character_id,generation,assignment_id,task_key,input_value,resolved_value,created_by,created_at
  ) values (
    p_character_id,v_session.generation,v_assignment.id,v_task_key,cardinality(v_ids),v_prepared,auth.uid(),now()
  )
  on conflict (character_id,generation,assignment_id,task_key) do update
  set input_value=excluded.input_value,resolved_value=excluded.resolved_value,
      created_by=excluded.created_by,created_at=now();

  return jsonb_build_object(
    'character_id',p_character_id,'generation',v_session.generation,
    'assignment_id',v_assignment.id,'task_key',v_task_key,'prepared_spell_ids',v_prepared
  );
end;
$function$;

revoke all on function public.commit_character_spell_preparation_v1(uuid,uuid,uuid[]) from public,anon;
grant execute on function public.commit_character_spell_preparation_v1(uuid,uuid,uuid[]) to authenticated;

-- Existing campaigns receive the official item definition immediately.
do $block$
declare v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.install_wizard_spellbook_definition(v_campaign.id);
  end loop;
end;
$block$;

create or replace function private.install_wizard_spellbook_definition_after_campaign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.install_wizard_spellbook_definition(new.id);
  return new;
end;
$function$;

drop trigger if exists zzzzz_campaigns_install_wizard_spellbook_definition on public.campaigns;
create trigger zzzzz_campaigns_install_wizard_spellbook_definition
after insert on public.campaigns
for each row execute function private.install_wizard_spellbook_definition_after_campaign();

commit;
