begin;

-- Final runtime normalization for the built-in Druid package.
-- The Character Engine stays class-agnostic: every rule below is expressed only
-- through generic resources, actions, state, permissions, costs and semantic data.
create or replace function private.normalize_builtin_druid_native_runtime(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_druid uuid;
begin
  select id into v_druid
  from public.rule_templates
  where campaign_id = p_campaign_id
    and kind = 'class'
    and catalog_key = 'class:druid'
    and is_builtin
    and is_active
  order by version desc
  limit 1;

  if v_druid is null then return; end if;

  update public.rule_templates
  set catalog_revision = '2024-base+2014-wild-shape@3-native-runtime',
      mechanical_summary = 'К8, Мудрость, полный заклинатель. Ячейки, классовые заклинания, Дикая форма и её действия выдаются парсером как CE-механики; классовые spell-access открываются автоматически по уровню источника.',
      rules_meta = rules_meta || jsonb_build_object(
        'mechanics_version', 3,
        'native_action_runtime', true,
        'class_spell_access_by_source', true,
        'class_spells_use_shared_slots', true
      ),
      updated_at = now()
  where id = v_druid;

  -- Wild Shape: one consumable resource, one action that enters the runtime mode,
  -- and a separate bonus action that exits it. The transformation details stay
  -- semantic so CE does not learn what a beast or a Druid is.
  update public.rule_template_levels l
  set mechanics = coalesce((
      select jsonb_agg(m order by ord)
      from jsonb_array_elements(coalesce(l.mechanics, '[]'::jsonb)) with ordinality a(m, ord)
      where coalesce(m->>'id','') not in ('druid-wild-shape-action','druid-wild-shape-end')
    ), '[]'::jsonb)
    || $native$[
      {
        "id":"druid-wild-shape-action",
        "type":"action",
        "sourceKey":"wild-shape",
        "key":"wild_shape",
        "label":"Дикая форма",
        "economy":"action",
        "resourceCosts":[{"key":"wild_shape","amount":1}],
        "effects":[
          {"kind":"state","key":"wild_shape_active","operation":"SET","value":true},
          {"kind":"semantic","key":"transformation","payload":{"ruleset":"dnd","profile":"druid-wild-shape-2014","physicalStats":"beast","hitPoints":"beast_stat_block","mentalStats":"character","spellcasting":"blocked-until-permission"}}
        ],
        "tags":["unique","class","wild_shape","mode:start"],
        "presentation":{"tone":"green","icon":"🐾","display":"counter","priority":100}
      },
      {
        "id":"druid-wild-shape-end",
        "type":"action",
        "sourceKey":"wild-shape",
        "key":"wild_shape_end",
        "label":"Завершить Дикую форму",
        "economy":"bonus_action",
        "requirements":[{
          "kind":"condition",
          "condition":{"kind":"state","key":"wild_shape_active","operator":"EQUALS","value":true},
          "enforcement":"engine",
          "label":"Нужно находиться в Дикой форме"
        }],
        "effects":[{"kind":"state","key":"wild_shape_active","operation":"UNSET"}],
        "tags":["class","wild_shape","mode:end"],
        "presentation":{"tone":"green","icon":"↩","display":"counter","priority":90}
      }
    ]$native$::jsonb
  where l.template_id = v_druid and l.level = 2;

  -- Wild Resurgence is represented as two explicit conversions. The exact
  -- "only at zero" and once-per-long-rest clauses remain visibly GM-enforced
  -- until the generic persistent usage/event runtime can derive those facts.
  update public.rule_template_levels l
  set mechanics = coalesce((
      select jsonb_agg(m order by ord)
      from jsonb_array_elements(coalesce(l.mechanics, '[]'::jsonb)) with ordinality a(m, ord)
      where coalesce(m->>'id','') not in ('druid-wild-resurgence-refill','druid-wild-resurgence-slot')
    ), '[]'::jsonb)
    || $resurgence$[
      {
        "id":"druid-wild-resurgence-refill",
        "type":"action",
        "sourceKey":"wild-resurgence",
        "key":"wild_resurgence_refill",
        "label":"Дикое возрождение · восстановить форму",
        "economy":"none",
        "costOptions":[
          {"key":"slot-1","label":"Ячейка 1 уровня","costs":[{"key":"spell_slot_1","amount":1}]},
          {"key":"slot-2","label":"Ячейка 2 уровня","costs":[{"key":"spell_slot_2","amount":1}]},
          {"key":"slot-3","label":"Ячейка 3 уровня","costs":[{"key":"spell_slot_3","amount":1}]},
          {"key":"slot-4","label":"Ячейка 4 уровня","costs":[{"key":"spell_slot_4","amount":1}]},
          {"key":"slot-5","label":"Ячейка 5 уровня","costs":[{"key":"spell_slot_5","amount":1}]},
          {"key":"slot-6","label":"Ячейка 6 уровня","costs":[{"key":"spell_slot_6","amount":1}]},
          {"key":"slot-7","label":"Ячейка 7 уровня","costs":[{"key":"spell_slot_7","amount":1}]},
          {"key":"slot-8","label":"Ячейка 8 уровня","costs":[{"key":"spell_slot_8","amount":1}]},
          {"key":"slot-9","label":"Ячейка 9 уровня","costs":[{"key":"spell_slot_9","amount":1}]}
        ],
        "requirements":[{
          "kind":"condition",
          "condition":{"kind":"state","key":"wild_shape_empty_confirmed","operator":"EQUALS","value":true},
          "enforcement":"gm",
          "label":"По правилу используется, когда Дикая форма закончилась"
        }],
        "effects":[{"kind":"resource","key":"wild_shape","operation":"RESTORE","amount":1}],
        "tags":["class","resource_conversion","wild_resurgence"],
        "presentation":{"tone":"green","icon":"↻","display":"counter","priority":80}
      },
      {
        "id":"druid-wild-resurgence-slot",
        "type":"action",
        "sourceKey":"wild-resurgence",
        "key":"wild_resurgence_slot",
        "label":"Дикое возрождение · вернуть ячейку",
        "economy":"none",
        "resourceCosts":[{"key":"wild_shape","amount":1}],
        "requirements":[{
          "kind":"condition",
          "condition":{"kind":"state","key":"wild_resurgence_slot_available","operator":"EQUALS","value":true},
          "enforcement":"gm",
          "label":"Эта сторона обмена доступна 1 раз за долгий отдых"
        }],
        "effects":[{"kind":"resource","key":"spell_slot_1","operation":"RESTORE","amount":1}],
        "tags":["class","resource_conversion","wild_resurgence"],
        "presentation":{"tone":"violet","icon":"✦","display":"counter","priority":80}
      }
    ]$resurgence$::jsonb
  where l.template_id = v_druid and l.level = 5;

  -- Beast Spells becomes an explicit permission tied to the generic Wild Shape
  -- state. Renderers/executors can consume the permission without knowing Druid.
  update public.rule_template_levels l
  set mechanics = coalesce((
      select jsonb_agg(m order by ord)
      from jsonb_array_elements(coalesce(l.mechanics, '[]'::jsonb)) with ordinality a(m, ord)
      where coalesce(m->>'id','') <> 'druid-beast-spells-permission'
    ), '[]'::jsonb)
    || $beast$[
      {
        "id":"druid-beast-spells-permission",
        "type":"grant",
        "sourceKey":"beast-spells",
        "target":"permission",
        "key":"spellcasting:while_transformed",
        "condition":{"kind":"state","key":"wild_shape_active","operator":"EQUALS","value":true},
        "payload":{"label":"Заклинания зверя","scope":"spellcasting","mode":"allow","blockedMaterial":{"hasCost":true,"consumed":true}}
      }
    ]$beast$::jsonb
  where l.template_id = v_druid and l.level = 18;
end;
$$;

create or replace function private.normalize_builtin_druid_native_runtime_after_campaign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.normalize_builtin_druid_native_runtime(new.id);
  return new;
end;
$$;

-- Same-event triggers run by name; zzzz makes this normalization happen after
-- the built-in catalog/base/subclass installers for newly created campaigns.
drop trigger if exists zzzz_campaigns_druid_native_runtime on public.campaigns;
create trigger zzzz_campaigns_druid_native_runtime
after insert on public.campaigns
for each row execute function private.normalize_builtin_druid_native_runtime_after_campaign();

do $$
declare v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.normalize_builtin_druid_native_runtime(v_campaign.id);
  end loop;
end;
$$;

commit;
