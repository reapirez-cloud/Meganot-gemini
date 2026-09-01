-- CLASS_INTEGRATION_STRICT: subclass:fighter
-- CLASS_INTEGRATION_STRICT: subclass:druid
-- CLASS_INTEGRATION_STRICT: subclass:cleric
-- CLASS_PACKAGE_TEST: tests/vossSubclassNuances.test.ts
-- CLASS_WORK_STATUS: fighter:text=READY;mechanics=NOT_AUDITED; druid:text=READY;mechanics=NOT_AUDITED; cleric:text=READY;mechanics=NOT_AUDITED
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
-- PRESENTATION ONLY. Adds authorNuances to subclass reference nodes. Exact rule
-- descriptions, choices, resources, actions, formulas, effects, costs, spell
-- access and Character Engine behavior are not changed.

begin;

create or replace function private.voss_subclass_nuances(
  p_catalog_key text,
  p_source_key text,
  p_label text,
  p_description text
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_source text := lower(coalesce(p_source_key,''));
  v_label text := coalesce(nullif(btrim(p_label),''),'эта способность');
  v_description text := lower(coalesce(p_description,''));
begin
  -- Spell groups are the most common place where theme is mistaken for permission.
  if v_source='subclass-spells' then
    return jsonb_build_array(
      'Получить заклинание от подкласса не значит получить новые эффекты между строк. Делает оно только то, что написано в собственной карточке: название, стихия и красивое описание не выдают дополнительных разрешений.',
      'Если заклинание создаёт ветер ради указанного эффекта, это не превращает ветер в универсальный способ сдувать чужую магию, существ или всё, что показалось достаточно лёгким. «Но ветер же ветер» — довод человека, который однажды попробует тушить огненный шар плащом.'
    );
  end if;

  -- High-risk Fighter interpretations.
  if p_catalog_key='subclass:fighter:arcane-archer' and v_source='arcane-archer-l3-1' then
    return jsonb_build_array(
      'Все изученные Магические выстрелы используют один общий запас. Изучить ещё один вариант — значит получить новый выбор, а не ещё пару спрятанных в рукаве зарядов.',
      'Каждый вариант делает ровно то, что написано у него. «Стрела же магическая» не даёт ей попутно огибать стены, взрываться и изгонять цель, если выбранный выстрел этого не умеет.'
    );
  end if;
  if p_catalog_key='subclass:fighter:arcane-archer' and v_source='curving-shot-l7-2' then
    return jsonb_build_array('Изгибающийся выстрел начинается с промаха и переводит стрелу на другую цель. Это не второй бросок по той же цели и не способ объявить промах попаданием задним числом. Стрела умная, но не настолько, чтобы спорить с костью.');
  end if;
  if p_catalog_key='subclass:fighter:battle-master' and v_source='battle-master-l3-1' then
    return jsonb_build_array('Манёвры делят общий запас костей превосходства. Знать много приёмов не означает носить отдельный мешочек костей для каждого. Было бы удобно; ещё удобнее было бы, если бы враги падали от списка ваших умений.');
  end if;
  if p_catalog_key='subclass:fighter:echo-knight' and v_source='echo-knight-l3-1' then
    return jsonb_build_array(
      'Эхо не получает собственного хода, набора действий или второй личности. Когда атака идёт из его пространства, это всё ещё ваша атака и ваше действие.',
      'То, что эхо похоже на вас, не делает его запасным Воином. Если хочется двух полноценных персонажей, придётся найти близнеца и убедить его тоже лезть в эту дыру.'
    );
  end if;
  if p_catalog_key='subclass:fighter:eldritch-knight' and v_source='war-magic-l7-1' then
    return jsonb_build_array('Боевая магия заменяет одну из атак заговором. Она не даёт полный набор атак и бесплатный заговор сверху. Слово «заменить» обычно замечают сразу после попытки получить лишнее действие.');
  end if;
  if p_catalog_key='subclass:fighter:eldritch-knight' and v_source='improved-war-magic-l18-1' then
    return jsonb_build_array('Здесь две атаки заменяются одним подходящим заклинанием. Они не остаются рядом «потому что Воин высокого уровня». Магия уже забрала две атаки; не пытайтесь продать их ГМу второй раз.');
  end if;
  if p_catalog_key='subclass:fighter:psi-warrior' and v_source='psi-warrior-l3-1' then
    return jsonb_build_array('Пси-приёмы используют общий запас Костей пси-энергии. Защита, удар и телекинез не заводят каждый себе отдельную голову и отдельный кошель с костями.');
  end if;
  if p_catalog_key='subclass:fighter:rune-knight' and v_source='rune-knight-l3-1' then
    return jsonb_build_array('У каждой руны есть написанный пассивный эффект и написанная активация. Руна великанов не означает «могу всё, что когда-нибудь делал великан». Иначе первым делом любой Рунный рыцарь потребовал бы замок и стадо мамонтов.');
  end if;
  if p_catalog_key='subclass:fighter:samurai' and v_source='rapid-strike-l15-1' then
    return jsonb_build_array('Стремительный удар обменивает преимущество одной атаки на дополнительную атаку по той же цели. Оставить преимущество и забрать лишний удар тоже нельзя. Это обмен, а не ограбление формулировки.');
  end if;

  -- High-risk Cleric interpretations.
  if p_catalog_key='subclass:cleric:death-domain' and v_source='inescapable-destruction-l6-1' then
    return jsonb_build_array('Игнорировать сопротивление — не значит игнорировать иммунитет. Если существо вообще не принимает некротический урон, уверенность жреца не превращает ноль во что-то более впечатляющее.');
  end if;
  if p_catalog_key='subclass:cleric:grave-domain' and v_source='grave-domain-l3-1' then
    return jsonb_build_array('В этой карточке несколько отдельных правил с разными триггерами. Они не включаются все разом только потому, что стоят под одним заголовком. Могила тоже одна, а способов туда попасть удивительно много.');
  end if;
  if p_catalog_key='subclass:cleric:life-domain' and v_source='disciple-of-life' then
    return jsonb_build_array('Усиление привязано к лечению заклинанием, сотворённым с тратой ячейки. Любое другое восстановление HP не становится «почти заклинанием» только потому, что жрец очень хочет добавить сверху ещё немного.');
  end if;
  if p_catalog_key='subclass:cleric:light-domain' and v_source='light-domain-l3-1' then
    return jsonb_build_array('Защитная вспышка объявляется на том событии, которое написано в правиле. Нельзя сначала посмотреть, насколько плохо всё закончилось, а потом решить, что свет, оказывается, был там всё это время.');
  end if;
  if p_catalog_key='subclass:cleric:nature-domain' and v_source='dampen-elements-l6-1' then
    return jsonb_build_array('Сопротивление относится к конкретному срабатыванию подходящего урона. Это не постоянный стихийный щит до конца раунда и не повод припомнить рядом стоящий костёр.');
  end if;
  if p_catalog_key='subclass:cleric:order-domain' and v_source='order-domain-l1-1' then
    return jsonb_build_array('Глас власти срабатывает от подходящего заклинания и даёт союзнику именно написанную реакцию. Заклинание, которое просто прошло рядом, не считается приказом. Как и крик жреца «ну давай уже!».');
  end if;
  if p_catalog_key='subclass:cleric:peace-domain' and v_source='protective-bond-l6-1' then
    return jsonb_build_array('Защитная связь не стирает урон. Другое связанное существо добровольно тратит реакцию, телепортируется и принимает его на себя по точному правилу. Мир, как обычно, достигается тем, что кому-то всё равно приходится получить по голове.');
  end if;
  if p_catalog_key='subclass:cleric:tempest-domain' and v_source='channel-divinity-destructive-wrath-l2-1' then
    return jsonb_build_array('Разрушительный гнев делает максимальными уже существующие кости подходящего урона. Он не добавляет новые кости и не превращает другой тип урона в гром только потому, что жрец достаточно выразительно посмотрел на небо.');
  end if;
  if p_catalog_key='subclass:cleric:tempest-domain' and v_source='thunderbolt-strike-l6-1' then
    return jsonb_build_array('Громовой удар смотрит на тот тип урона, который прямо назван в правиле. Похожее название стихии не считается тем же самым. Боги, может, и любят поэзию; правила — заметно меньше.');
  end if;
  if p_catalog_key='subclass:cleric:trickery-domain' and v_source='trickery-domain-l3-1' then
    return jsonb_build_array('Двойник умеет только то, что прямо разрешает его правило. Он не получает отдельный ход, инвентарь и возможность самостоятельно колдовать просто потому, что выглядит убедительно. Иллюзия — это ложь, а не второй персонаж.');
  end if;
  if p_catalog_key='subclass:cleric:twilight-domain' and v_source='channel-divinity-twilight-sanctuary-l2-1' then
    return jsonb_build_array('Святилище проверяет свои эффекты в написанный момент, а не непрерывно каждую долю секунды. Ходить туда-сюда через край сферы ради бесконечных благословений — занятие, достойное человека, которого очень скоро попросят сесть.');
  end if;
  if p_catalog_key='subclass:cleric:war-domain' and v_source='war-domain-l3-1' then
    return jsonb_build_array('Направленный удар меняет результат уже сделанного броска так, как написано; он не даёт бесплатный новый бросок. Иногда бог войны помогает попасть. Иногда он просто прибавляет число и ждёт, когда жрец перестанет усложнять.');
  end if;

  -- High-risk Druid interpretations.
  if p_catalog_key like 'subclass:druid:%moon%' and (v_source='circle-of-the-moon-l2-1' or v_source='combat-wild-shape' or v_source='circle-forms') then
    return jsonb_build_array('Боевая Дикая форма меняет только те пределы и действия, которые перечислены в правиле. Форма медведя не выдаёт право на всё, что когда-либо делал медведь в рассказе пьяного охотника.');
  end if;
  if p_catalog_key like 'subclass:druid:%stars%' and v_description like '%созвезд%' then
    return jsonb_build_array('Выбранная звёздная форма даёт эффекты именно своего созвездия. Названия остальных всё ещё красиво сияют, но их бонусы не просачиваются к вам из соседней строки.');
  end if;
  if p_catalog_key like 'subclass:druid:%wildfire%' and v_description like '%дух%' then
    return jsonb_build_array('Дух дикого огня — отдельное призванное существо с написанными командами и действиями. «Он же разумный огонь» не является универсальной командой делать всё, что удобно прямо сейчас.');
  end if;

  -- Generic common misreadings. These are intentionally conservative: they
  -- narrow interpretation back to the exact wording and never add mechanics.
  if v_description like '%общ%запас%' or v_description like '%общий ресурс%' then
    return jsonb_build_array('Здесь прямо указан общий запас. Разные варианты берут применения из одного места, а не получают каждый собственный запас. Делить один кошель на пять карманов всё ещё не делает монет больше.');
  end if;

  if v_description like '%вместо%' or v_description like '%замен%' then
    return jsonb_build_array('Слова «вместо» и «заменяет» означают именно замену. Старый эффект не остаётся рядом бесплатным довеском. Восс видел достаточно людей, которые пытались читать это слово как «и ещё».');
  end if;

  if v_description like '%когда попада%' or v_description like '%после попад%' or v_description like '%при попад%' then
    return jsonb_build_array('Триггер требует попадания. Промах не считается «почти попаданием», даже если стрела прошла очень убедительно рядом с ухом.');
  end if;

  if v_description like '%реакц%' then
    return jsonb_build_array('Реакция существует только на указанный в правиле триггер. Нельзя придержать её до более удобного момента и объявить, что событие «по смыслу то же самое». По смыслу у Восса тоже много денег. Это не помогает.');
  end if;

  if v_description like '%один раз%ход%' then
    return jsonb_build_array('Ограничение «один раз за ход» относится ко всей способности, а не к каждой атаке, цели или красивой причине попробовать ещё раз. Один раз — редкая формулировка, которую даже магия не делает двусмысленной.');
  end if;

  if v_description like '%сопротивлен%' and v_description not like '%иммун%' then
    return jsonb_build_array('Сопротивление и иммунитет — разные вещи. Правило про одно не получает второе бесплатно, как бы похоже они ни звучали в проповеди.');
  end if;

  return jsonb_build_array(
    'Название, образ и здравый смысл персонажа не дописывают «'||v_label||'» скрытыми действиями, целями или эффектами. Если точное правило чего-то не разрешает, фраза «ну по смыслу же» не открывает тайную вторую страницу. Восс проверял.'
  );
end;
$$;

create or replace function private.voss_patch_subclass_nuance_node(
  p_node jsonb,
  p_catalog_key text
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_result jsonb;
  v_type text;
  v_target text;
  v_source text;
  v_label text;
  v_description text;
  v_nuances jsonb;
  v_payload jsonb;
  v_presentation jsonb;
begin
  if p_node is null then return p_node; end if;

  if jsonb_typeof(p_node)='array' then
    select coalesce(jsonb_agg(private.voss_patch_subclass_nuance_node(value,p_catalog_key) order by ord),'[]'::jsonb)
      into v_result
    from jsonb_array_elements(p_node) with ordinality a(value,ord);
    return v_result;
  end if;

  if jsonb_typeof(p_node)<>'object' then return p_node; end if;

  v_type:=p_node->>'type';
  if v_type in ('grant','resource','action','spell','numeric') and (p_node ? 'id' or p_node ? 'sourceKey') then
    v_target:=p_node->>'target';
    v_source:=coalesce(nullif(p_node->>'sourceKey',''),p_node->>'id','unknown');
    v_label:=coalesce(nullif(p_node#>>'{payload,label}',''),nullif(p_node->>'label',''),nullif(p_node#>>'{payload,spell,name}',''),nullif(p_node->>'key',''),'Способность');
    v_description:=coalesce(p_node#>>'{payload,description}','');
    v_nuances:=private.voss_subclass_nuances(p_catalog_key,v_source,v_label,v_description);

    if v_type='grant' and v_target='feature' then
      v_payload:=coalesce(p_node->'payload','{}'::jsonb)||jsonb_build_object('authorNuances',v_nuances);
      return jsonb_set(p_node,'{payload}',v_payload,true);
    end if;

    v_presentation:=coalesce(p_node->'presentation','{}'::jsonb)||jsonb_build_object('authorNuances',v_nuances);
    return jsonb_set(p_node,'{presentation}',v_presentation,true);
  end if;

  select coalesce(jsonb_object_agg(key,private.voss_patch_subclass_nuance_node(value,p_catalog_key)),'{}'::jsonb)
    into v_result
  from jsonb_each(p_node);
  return v_result;
end;
$$;

create or replace function private.apply_voss_subclass_nuances(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.rule_templates t
  set mechanics=private.voss_patch_subclass_nuance_node(t.mechanics,t.catalog_key),
      choices=private.voss_patch_subclass_nuance_node(t.choices,t.catalog_key),
      rules_meta=coalesce(t.rules_meta,'{}'::jsonb)||jsonb_build_object(
        'voss_subclass_nuances','common_misreads_v1',
        'voss_subclass_nuance_scope','presentation_only'
      ),
      updated_at=now()
  where t.campaign_id=p_campaign_id
    and t.is_active
    and (
      t.catalog_key like 'subclass:fighter:%'
      or t.catalog_key like 'subclass:druid:%'
      or t.catalog_key like 'subclass:cleric:%'
    );

  update public.rule_template_levels l
  set mechanics=private.voss_patch_subclass_nuance_node(l.mechanics,t.catalog_key),
      choices=private.voss_patch_subclass_nuance_node(l.choices,t.catalog_key)
  from public.rule_templates t
  where t.id=l.template_id
    and t.campaign_id=p_campaign_id
    and t.is_active
    and (
      t.catalog_key like 'subclass:fighter:%'
      or t.catalog_key like 'subclass:druid:%'
      or t.catalog_key like 'subclass:cleric:%'
    );
end;
$$;

do $$
declare r record;
begin
  for r in select id from public.campaigns loop
    perform private.apply_voss_subclass_nuances(r.id);
  end loop;
end $$;

create or replace function private.apply_voss_subclass_nuances_after_campaign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.apply_voss_subclass_nuances(new.id);
  return new;
end;
$$;

drop trigger if exists zzzzzzzzzzzzz_campaigns_voss_subclass_nuances on public.campaigns;
create trigger zzzzzzzzzzzzz_campaigns_voss_subclass_nuances
after insert on public.campaigns
for each row execute function private.apply_voss_subclass_nuances_after_campaign();

commit;
