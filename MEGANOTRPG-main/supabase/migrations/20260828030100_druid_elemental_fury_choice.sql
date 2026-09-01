begin;

create or replace function private.normalize_druid_elemental_fury(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id uuid;
  v_choice jsonb;
begin
  select id into v_id
  from public.rule_templates
  where campaign_id=p_campaign_id and is_active and catalog_key='class:druid'
  order by version desc limit 1;
  if v_id is null then return; end if;

  v_choice := $choice$
  {
    "key":"druid-elemental-fury",
    "count":1,
    "label":"Стихийная ярость",
    "target":"trait",
    "options":["elemental-fury:potent-spellcasting","elemental-fury:primal-strike"],
    "option_labels":{
      "elemental-fury:potent-spellcasting":"Могущественные заклинания",
      "elemental-fury:primal-strike":"Первобытный удар"
    },
    "option_mechanics":{
      "elemental-fury:potent-spellcasting":[{
        "id":"druid-elemental-fury-potent",
        "type":"grant","target":"feature","key":"class:druid:elemental-fury:potent-spellcasting",
        "payload":{
          "label":"Могущественные заклинания",
          "description":"К урону любого заговора друида добавляется модификатор Мудрости.",
          "mechanic":{"version":1,"kind":"spell_damage_modifier","spellList":"druid","spellLevel":0,"modifier":{"reference":"abilities.wisdom.modifier"}}
        }
      }],
      "elemental-fury:primal-strike":[{
        "id":"druid-elemental-fury-primal",
        "type":"grant","target":"feature","key":"class:druid:elemental-fury:primal-strike",
        "payload":{
          "label":"Первобытный удар",
          "description":"Один раз на каждом своём ходу после попадания оружием или атакой звериной формы цель получает ещё 1к8 урона. При попадании выбери холод, огонь, электричество или звук.",
          "mechanic":{"version":1,"kind":"triggered_extra_damage","frequency":"once_per_turn","trigger":"hit_with_weapon_or_wild_shape_beast_attack","dice":{"count":1,"sides":8},"damageChoice":["cold","fire","lightning","thunder"]}
        }
      }]
    },
    "option_mechanics_by_level":{
      "elemental-fury:potent-spellcasting":{
        "15":[{
          "id":"druid-elemental-fury-potent-l15",
          "type":"grant","target":"feature","key":"class:druid:elemental-fury:potent-spellcasting",
          "grantOperation":"REPLACE","priority":15,
          "payload":{
            "label":"Могущественные заклинания",
            "description":"К урону любого заговора друида добавляется модификатор Мудрости. Если исходная дальность заговора не меньше 10 футов, она увеличивается ещё на 300 футов.",
            "mechanic":{"version":1,"kind":"spell_damage_and_range_modifier","spellList":"druid","spellLevel":0,"damageModifier":{"reference":"abilities.wisdom.modifier"},"rangeIncrease":{"minimumBaseRangeFeet":10,"addFeet":300}}
          }
        }]
      },
      "elemental-fury:primal-strike":{
        "15":[{
          "id":"druid-elemental-fury-primal-l15",
          "type":"grant","target":"feature","key":"class:druid:elemental-fury:primal-strike",
          "grantOperation":"REPLACE","priority":15,
          "payload":{
            "label":"Первобытный удар",
            "description":"Один раз на каждом своём ходу после попадания оружием или атакой звериной формы цель получает ещё 2к8 урона. При попадании выбери холод, огонь, электричество или звук.",
            "mechanic":{"version":1,"kind":"triggered_extra_damage","frequency":"once_per_turn","trigger":"hit_with_weapon_or_wild_shape_beast_attack","dice":{"count":2,"sides":8},"damageChoice":["cold","fire","lightning","thunder"]}
          }
        }]
      }
    }
  }
  $choice$::jsonb;

  update public.rule_template_levels l
  set choices=(
    select coalesce(jsonb_agg(c order by ord) filter(where c->>'key'<>'druid-elemental-fury'),'[]'::jsonb)
    from jsonb_array_elements(coalesce(l.choices,'[]'::jsonb)) with ordinality q(c,ord)
  ) || jsonb_build_array(v_choice)
  where l.template_id=v_id and l.level=7;

  update public.rule_template_levels l
  set mechanics=private.druid_patch_feature(
    l.mechanics,'elemental-fury',
    'На 7 уровне выбери одну ветку Стихийной ярости. Выбор сохраняется. На 15 уровне усиливается именно выбранная ветка, повторно выбирать её не нужно.',
    jsonb_build_object('version',1,'kind','persistent_choice','choiceKey','druid-elemental-fury','upgradeLevel',15)
  )
  where l.template_id=v_id and l.level=7;

  update public.rule_template_levels l
  set mechanics=private.druid_patch_feature(
    l.mechanics,'elemental-fury',
    'На 15 уровне автоматически усиливается ветка Стихийной ярости, выбранная на 7 уровне.',
    jsonb_build_object('version',1,'kind','choice_upgrade','choiceKey','druid-elemental-fury','dependsOnChoiceLevel',7)
  )
  where l.template_id=v_id and l.level=15;
end;
$$;

DO $$
declare r record;
begin
  for r in select id from public.campaigns loop
    perform private.normalize_druid_elemental_fury(r.id);
  end loop;
end $$;

commit;
