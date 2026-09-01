begin;

alter table public.rule_templates
  add column if not exists catalog_key text,
  add column if not exists catalog_revision text,
  add column if not exists source_kind text,
  add column if not exists source_label text,
  add column if not exists is_builtin boolean not null default false,
  add column if not exists mechanical_summary text not null default '',
  add column if not exists author_description text not null default '',
  add column if not exists author_comment text not null default '',
  add column if not exists rules_meta jsonb not null default '{}'::jsonb;

alter table public.rule_templates drop constraint if exists rule_templates_source_kind_check;
alter table public.rule_templates add constraint rule_templates_source_kind_check
  check (source_kind is null or source_kind in ('official','third_party','custom'));

alter table public.rule_templates drop constraint if exists rule_templates_rules_meta_object_check;
alter table public.rule_templates add constraint rule_templates_rules_meta_object_check
  check (jsonb_typeof(rules_meta)='object');

create unique index if not exists rule_templates_builtin_revision_idx
  on public.rule_templates(campaign_id,catalog_key,catalog_revision)
  where is_builtin and catalog_key is not null and catalog_revision is not null;

create or replace function private.install_builtin_rule_catalog(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_druid uuid;
begin
  insert into public.rule_templates(
    campaign_id,kind,slug,name,description,version,mechanics,choices,
    parent_template_id,unlock_level,catalog_key,catalog_revision,source_kind,source_label,
    is_builtin,mechanical_summary,author_description,author_comment,rules_meta,created_by,is_active
  ) values (
    p_campaign_id,
    'class',
    'druid-core',
    'Друид',
    'Актуальная база друида с намеренно закреплённой Дикой формой редакции 2014.',
    1,
    $mechanics$[
      {"id":"druid-save-int","type":"grant","target":"proficiency","key":"savingThrow:intelligence","payload":{"rank":1,"label":"Спасбросок: Интеллект"}},
      {"id":"druid-save-wis","type":"grant","target":"proficiency","key":"savingThrow:wisdom","payload":{"rank":1,"label":"Спасбросок: Мудрость"}},
      {"id":"druid-simple-weapons","type":"grant","target":"proficiency","key":"weapon:simple","payload":{"rank":1,"label":"Простое оружие"}},
      {"id":"druid-herbalism","type":"grant","target":"proficiency","key":"tool:herbalism-kit","payload":{"rank":1,"label":"Набор травника"}},
      {"id":"druid-light-armor","type":"grant","target":"proficiency","key":"armor:light","payload":{"rank":1,"label":"Лёгкая броня"}},
      {"id":"druid-shields","type":"grant","target":"proficiency","key":"armor:shield","payload":{"rank":1,"label":"Щиты"}},
      {"id":"druid-druidic","type":"grant","target":"language","key":"druidic","payload":{"label":"Друидический"}},
      {"id":"druid-spellcasting","type":"grant","target":"feature","key":"class:druid:spellcasting","payload":{"label":"Заклинания друида","description":"Полный заклинатель природы. Основная характеристика магии — Мудрость; доступ к списку друида и ячейкам задаёт профиль класса."}},
      {"id":"druid-primal-order","type":"grant","target":"feature","key":"class:druid:primal-order","payload":{"label":"Первобытный путь","description":"На 1 уровне выбирается мистическое или боевое направление подготовки."}}
    ]$mechanics$::jsonb,
    $choices$[
      {
        "key":"druid-skills",
        "label":"Навыки друида",
        "target":"proficiency",
        "count":2,
        "options":["skill:arcana","skill:animal_handling","skill:insight","skill:medicine","skill:nature","skill:perception","skill:religion","skill:survival"],
        "option_labels":{
          "skill:arcana":"Магия",
          "skill:animal_handling":"Уход за животными",
          "skill:insight":"Проницательность",
          "skill:medicine":"Медицина",
          "skill:nature":"Природа",
          "skill:perception":"Восприятие",
          "skill:religion":"Религия",
          "skill:survival":"Выживание"
        }
      },
      {
        "key":"druid-primal-order",
        "label":"Первобытный путь",
        "target":"trait",
        "count":1,
        "options":["primal-order:magician","primal-order:warden"],
        "option_labels":{"primal-order:magician":"Маг","primal-order:warden":"Страж"},
        "option_mechanics":{
          "primal-order:magician":[
            {"id":"druid-order-magician-detail","type":"grant","target":"feature","key":"class:druid:primal-order:magician","payload":{"label":"Первобытный путь: Маг","description":"Даёт дополнительный заговор друида и усиливает выбранную интеллектуальную связь с природой. Выбор дополнительного заговора выполняется в книге магии."}}
          ],
          "primal-order:warden":[
            {"id":"druid-order-warden-detail","type":"grant","target":"feature","key":"class:druid:primal-order:warden","payload":{"label":"Первобытный путь: Страж","description":"Боевое направление друида: воинское оружие и средняя броня."}},
            {"id":"druid-order-warden-martial","type":"grant","target":"proficiency","key":"weapon:martial","payload":{"rank":1,"label":"Воинское оружие"}},
            {"id":"druid-order-warden-medium","type":"grant","target":"proficiency","key":"armor:medium","payload":{"rank":1,"label":"Средняя броня"}}
          ]
        }
      }
    ]$choices$::jsonb,
    null,
    null,
    'class:druid',
    '2024-base+2014-wild-shape@1',
    'official',
    'D&D core · Meganot ruleset',
    true,
    'К8, Мудрость, полный заклинатель. База класса 2024. Дикая форма использует только механику 2014: действие, 2 использования, оба возвращаются после короткого или долгого отдыха.',
    $voss$Друиды любят говорить, что слушают природу. На практике природа обычно отвечает дождём, волками и грибами, которые лучше не трогать. За всей этой травой скрывается один из самых универсальных магов: лечит, мешает врагу стоять там, где ему удобно, зовёт стихии и в нужный момент решает, что две ноги были переоценены.$voss$,
    $voss$Я работал с друидами. Хороший друид экономит группе лекарства, еду и время. Плохой друид объясняет, почему мы не имеем права рубить дерево, пока дерево пытается нас убить. В любом случае держите рядом запасную одежду.$voss$,
    $meta${
      "catalog_policy":"latest_wins_with_feature_overrides",
      "base_revision":"2024",
      "feature_overrides":{"wild_shape":"2014"},
      "excluded_features":["wild_shape@2024"],
      "wild_shape_policy":{
        "revision":"2014",
        "core_only":true,
        "uses":2,
        "economy":"action",
        "recharge":["short_rest","long_rest"],
        "uses_scale_with_2024_levels":false,
        "beast_hit_points":"beast_stat_block"
      },
      "sheet_profile":{
        "spellcasting_enabled":true,
        "spellcasting_ability":"wisdom",
        "spell_list":"druid",
        "spell_slots_by_level":{
          "1":{"1":2},
          "2":{"1":3},
          "3":{"1":4,"2":2},
          "4":{"1":4,"2":3},
          "5":{"1":4,"2":3,"3":2},
          "6":{"1":4,"2":3,"3":3},
          "7":{"1":4,"2":3,"3":3,"4":1},
          "8":{"1":4,"2":3,"3":3,"4":2},
          "9":{"1":4,"2":3,"3":3,"4":3,"5":1},
          "10":{"1":4,"2":3,"3":3,"4":3,"5":2},
          "11":{"1":4,"2":3,"3":3,"4":3,"5":2,"6":1},
          "12":{"1":4,"2":3,"3":3,"4":3,"5":2,"6":1},
          "13":{"1":4,"2":3,"3":3,"4":3,"5":2,"6":1,"7":1},
          "14":{"1":4,"2":3,"3":3,"4":3,"5":2,"6":1,"7":1},
          "15":{"1":4,"2":3,"3":3,"4":3,"5":2,"6":1,"7":1,"8":1},
          "16":{"1":4,"2":3,"3":3,"4":3,"5":2,"6":1,"7":1,"8":1},
          "17":{"1":4,"2":3,"3":3,"4":3,"5":2,"6":1,"7":1,"8":1,"9":1},
          "18":{"1":4,"2":3,"3":3,"4":3,"5":3,"6":1,"7":1,"8":1,"9":1},
          "19":{"1":4,"2":3,"3":3,"4":3,"5":3,"6":2,"7":1,"8":1,"9":1},
          "20":{"1":4,"2":3,"3":3,"4":3,"5":3,"6":2,"7":2,"8":1,"9":1}
        },
        "prepared_spells_by_level":{"1":4,"2":5,"3":6,"4":7,"5":9,"6":10,"7":11,"8":12,"9":14,"10":15,"11":16,"12":16,"13":17,"14":17,"15":18,"16":18,"17":19,"18":20,"19":21,"20":22},
        "cantrips_by_level":{"1":2,"2":2,"3":2,"4":3,"5":3,"6":3,"7":3,"8":3,"9":3,"10":4,"11":4,"12":4,"13":4,"14":4,"15":4,"16":4,"17":4,"18":4,"19":4,"20":4}
      }
    }$meta$::jsonb,
    null,
    true
  )
  on conflict(campaign_id,kind,slug,version) do update set
    name=excluded.name,
    description=excluded.description,
    mechanics=excluded.mechanics,
    choices=excluded.choices,
    catalog_key=excluded.catalog_key,
    catalog_revision=excluded.catalog_revision,
    source_kind=excluded.source_kind,
    source_label=excluded.source_label,
    is_builtin=true,
    mechanical_summary=excluded.mechanical_summary,
    author_description=excluded.author_description,
    author_comment=excluded.author_comment,
    rules_meta=excluded.rules_meta,
    is_active=true,
    updated_at=now()
  returning id into v_druid;

  delete from public.rule_template_levels where template_id=v_druid;

  insert into public.rule_template_levels(template_id,level,mechanics,choices) values
  (v_druid,2,$l2$[
    {"id":"druid-wild-shape-resource","type":"resource","key":"wild_shape","label":"Дикая форма","max":2,"recharge":["short_rest","long_rest"],"restore":"full","initial":"full","presentation":{"tone":"green","icon":"🐾","display":"pips","priority":100}},
    {"id":"druid-wild-shape-action","type":"action","key":"wild_shape","label":"Дикая форма","economy":"action","resourceKey":"wild_shape","resourceCost":1,"tags":["unique","class","wild_shape"],"presentation":{"tone":"green","icon":"🐾","display":"counter","priority":100}},
    {"id":"druid-wild-shape-rules","type":"grant","target":"feature","key":"class:druid:wild-shape","payload":{"label":"Дикая форма · 2014","description":"Действием превращается в зверя, которого друид раньше видел. Доступно 2 использования; оба возвращаются после короткого или долгого отдыха. Форма держится до половины уровня друида в часах. В форме используются HP и физические параметры зверя; раньше выйти можно бонусным действием."}},
    {"id":"druid-wild-shape-tier-2","type":"grant","target":"trait","key":"class:druid:wild-shape:tier-2","payload":{"label":"Формы 2 уровня","description":"До CR 1/4; нельзя брать зверя с плаванием или полётом."}},
    {"id":"druid-wild-companion","type":"spell","key":"spell:find-familiar","payload":{"spell":{"name":"Find Familiar","level":1,"school":"Conjuration","ritual":true},"preparation":{"mode":"always_prepared"},"methods":[{"key":"wild-companion","kind":"class_feature","ability":"wisdom","requiresPrepared":false,"resourceOptions":[{"key":"wild-shape","castLevel":1,"costs":[{"key":"wild_shape","amount":1}]},{"key":"slot-1","castLevel":1,"costs":[{"key":"spell_slot_1","amount":1}]},{"key":"slot-2","castLevel":2,"costs":[{"key":"spell_slot_2","amount":1}]},{"key":"slot-3","castLevel":3,"costs":[{"key":"spell_slot_3","amount":1}]},{"key":"slot-4","castLevel":4,"costs":[{"key":"spell_slot_4","amount":1}]},{"key":"slot-5","castLevel":5,"costs":[{"key":"spell_slot_5","amount":1}]},{"key":"slot-6","castLevel":6,"costs":[{"key":"spell_slot_6","amount":1}]},{"key":"slot-7","castLevel":7,"costs":[{"key":"spell_slot_7","amount":1}]},{"key":"slot-8","castLevel":8,"costs":[{"key":"spell_slot_8","amount":1}]},{"key":"slot-9","castLevel":9,"costs":[{"key":"spell_slot_9","amount":1}]}]}]}}
  ]$l2$::jsonb,'[]'::jsonb),
  (v_druid,3,$l3$[
    {"id":"druid-subclass-unlock","type":"grant","target":"feature","key":"class:druid:subclass","payload":{"label":"Круг друида","description":"На 3 уровне открывается выбор подкласса. Подкласс подключается отдельным источником Character Engine."}}
  ]$l3$::jsonb,'[]'::jsonb),
  (v_druid,4,$l4$[
    {"id":"druid-wild-shape-tier-4","type":"grant","target":"trait","key":"class:druid:wild-shape:tier-4","payload":{"label":"Дикая форма · 4 уровень","description":"Максимальный CR формы становится 1/2. Плавание разрешено, полёт ещё нет."}},
    {"id":"druid-asi-4","type":"grant","target":"feature","key":"class:druid:asi:4","payload":{"label":"Улучшение характеристик","description":"На этом уровне доступно улучшение характеристик или другой подходящий талант."}}
  ]$l4$::jsonb,'[]'::jsonb),
  (v_druid,5,$l5$[
    {"id":"druid-wild-resurgence","type":"grant","target":"feature","key":"class:druid:wild-resurgence","payload":{"label":"Дикое возрождение","description":"Позволяет обменивать магическую энергию и расход Дикой формы в предусмотренных классом ситуациях. Автоматический обмен разных ресурсов будет подключён универсальным механизмом конверсии."}}
  ]$l5$::jsonb,'[]'::jsonb),
  (v_druid,7,$l7$[
    {"id":"druid-elemental-fury","type":"grant","target":"feature","key":"class:druid:elemental-fury","payload":{"label":"Стихийная ярость","description":"Выбери усиление заговоров либо собственных атак и атак звериной формы. На 15 уровне выбранное направление улучшается."}}
  ]$l7$::jsonb,$l7choices$[
    {"key":"druid-elemental-fury","label":"Стихийная ярость","target":"trait","count":1,"options":["elemental-fury:potent-spellcasting","elemental-fury:primal-strike"],"option_labels":{"elemental-fury:potent-spellcasting":"Могущественные заговоры","elemental-fury:primal-strike":"Первобытный удар"}}
  ]$l7choices$::jsonb),
  (v_druid,8,$l8$[
    {"id":"druid-wild-shape-tier-8","type":"grant","target":"trait","key":"class:druid:wild-shape:tier-8","payload":{"label":"Дикая форма · 8 уровень","description":"Максимальный CR формы становится 1. Ограничений по плаванию или полёту больше нет."}},
    {"id":"druid-asi-8","type":"grant","target":"feature","key":"class:druid:asi:8","payload":{"label":"Улучшение характеристик","description":"На этом уровне доступно улучшение характеристик или другой подходящий талант."}}
  ]$l8$::jsonb,'[]'::jsonb),
  (v_druid,12,$l12$[
    {"id":"druid-asi-12","type":"grant","target":"feature","key":"class:druid:asi:12","payload":{"label":"Улучшение характеристик","description":"На этом уровне доступно улучшение характеристик или другой подходящий талант."}}
  ]$l12$::jsonb,'[]'::jsonb),
  (v_druid,15,$l15$[
    {"id":"druid-improved-elemental-fury","type":"grant","target":"feature","key":"class:druid:improved-elemental-fury","payload":{"label":"Улучшенная стихийная ярость","description":"Усиливает вариант Стихийной ярости, выбранный на 7 уровне."}}
  ]$l15$::jsonb,'[]'::jsonb),
  (v_druid,16,$l16$[
    {"id":"druid-asi-16","type":"grant","target":"feature","key":"class:druid:asi:16","payload":{"label":"Улучшение характеристик","description":"На этом уровне доступно улучшение характеристик или другой подходящий талант."}}
  ]$l16$::jsonb,'[]'::jsonb),
  (v_druid,18,$l18$[
    {"id":"druid-beast-spells","type":"grant","target":"feature","key":"class:druid:beast-spells","payload":{"label":"Заклинания зверя","description":"Позволяет творить большинство заклинаний, оставаясь в Дикой форме; дорогие или расходуемые материальные компоненты остаются ограничением."}}
  ]$l18$::jsonb,'[]'::jsonb),
  (v_druid,19,$l19$[
    {"id":"druid-epic-boon","type":"grant","target":"feature","key":"class:druid:epic-boon","payload":{"label":"Эпический дар","description":"Открывается эпический талант, требованиям которого соответствует персонаж."}}
  ]$l19$::jsonb,'[]'::jsonb),
  (v_druid,20,$l20$[
    {"id":"druid-archdruid","type":"grant","target":"feature","key":"class:druid:archdruid","payload":{"label":"Архидруид","description":"Верхняя способность базы 2024 работает поверх нашей Дикой формы 2014: помогает вернуть расход формы при пустом запасе, переводить её ресурс в магию и сильно замедляет старение. Число обычных использований формы при этом не получает прогрессию 2024."}}
  ]$l20$::jsonb,'[]'::jsonb);
end;
$$;

create or replace function private.install_builtin_rule_catalog_after_campaign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.install_builtin_rule_catalog(new.id);
  return new;
end;
$$;

drop trigger if exists campaigns_install_builtin_rule_catalog on public.campaigns;
create trigger campaigns_install_builtin_rule_catalog
after insert on public.campaigns
for each row execute function private.install_builtin_rule_catalog_after_campaign();

do $$
declare v_campaign record;
begin
  for v_campaign in select id from public.campaigns loop
    perform private.install_builtin_rule_catalog(v_campaign.id);
  end loop;
end;
$$;

create or replace function public.apply_class_template_sheet_profile(
  p_character_id uuid,
  p_template_id uuid,
  p_template_level integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_template public.rule_templates%rowtype;
  v_profile jsonb;
  v_target_slots jsonb;
  v_existing_slots jsonb;
  v_next_slots jsonb := '{}'::jsonb;
  v_level integer;
  v_max integer;
  v_used integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not private.can_manage_character(p_character_id,auth.uid()) then raise exception 'Not allowed'; end if;

  select t.* into v_template
  from public.rule_templates t
  join public.characters c on c.campaign_id=t.campaign_id
  where t.id=p_template_id and c.id=p_character_id and t.kind='class';
  if v_template.id is null then raise exception 'Class template not found'; end if;

  v_profile := v_template.rules_meta->'sheet_profile';
  if v_profile is null or jsonb_typeof(v_profile)<>'object' then return; end if;
  v_target_slots := v_profile->'spell_slots_by_level'->greatest(1,least(30,p_template_level))::text;
  if v_target_slots is null then v_target_slots := '{}'::jsonb; end if;

  select coalesce(spell_slots,'{}'::jsonb) into v_existing_slots
  from public.character_sheets where character_id=p_character_id;
  if v_existing_slots is null then raise exception 'Character sheet not found'; end if;

  for v_level in 1..9 loop
    v_max := greatest(0,coalesce((v_target_slots->>v_level::text)::integer,0));
    v_used := greatest(0,least(v_max,coalesce((v_existing_slots->v_level::text->>'used')::integer,0)));
    v_next_slots := v_next_slots || jsonb_build_object(v_level::text,jsonb_build_object('max',v_max,'used',v_used));
  end loop;

  update public.character_sheets set
    spellcasting_enabled=coalesce((v_profile->>'spellcasting_enabled')::boolean,spellcasting_enabled),
    spellcasting_ability=coalesce(nullif(v_profile->>'spellcasting_ability',''),spellcasting_ability),
    spell_slots=v_next_slots,
    updated_at=now()
  where character_id=p_character_id;
end;
$$;

revoke all on function public.apply_class_template_sheet_profile(uuid,uuid,integer) from public,anon;
grant execute on function public.apply_class_template_sheet_profile(uuid,uuid,integer) to authenticated;

commit;
