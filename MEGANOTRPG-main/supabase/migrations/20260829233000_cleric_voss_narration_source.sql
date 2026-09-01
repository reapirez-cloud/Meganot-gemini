-- CLASS_INTEGRATION_STRICT: class:cleric
-- PRESENTATION ONLY.
-- Cleric feature narration is authored in src/data/classes/clericVossNarration.ts.
-- This migration removes legacy mechanics-derived authorExplanation values so
-- no other DB consumer can accidentally present them as Voss. Exact rules,
-- comments, choices, resources, actions, effects and spell data are untouched.

begin;

create or replace function private.strip_cleric_legacy_author_explanation(p_mechanics jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    case
      when m->>'type' = 'grant' and m->>'target' = 'feature'
        then (m #- '{payload,authorExplanation}') #- '{presentation,authorExplanation}'
      else m
    end
    order by ord
  ), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_mechanics, '[]'::jsonb)) with ordinality q(m, ord);
$$;

create or replace function private.strip_cleric_legacy_author_explanation_choice(p_choice jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_result jsonb := coalesce(p_choice, '{}'::jsonb);
  v_options jsonb;
  v_levels jsonb;
begin
  if jsonb_typeof(v_result->'option_mechanics') = 'object' then
    select coalesce(jsonb_object_agg(k, private.strip_cleric_legacy_author_explanation(v)), '{}'::jsonb)
      into v_options
    from jsonb_each(v_result->'option_mechanics') q(k, v);
    v_result := jsonb_set(v_result, '{option_mechanics}', v_options, true);
  end if;

  if jsonb_typeof(v_result->'option_mechanics_by_level') = 'object' then
    select coalesce(jsonb_object_agg(option_key, patched_levels), '{}'::jsonb)
      into v_levels
    from (
      select option_key,
        (select coalesce(jsonb_object_agg(level_key, private.strip_cleric_legacy_author_explanation(level_value)), '{}'::jsonb)
         from jsonb_each(option_levels) l(level_key, level_value)) as patched_levels
      from jsonb_each(v_result->'option_mechanics_by_level') o(option_key, option_levels)
    ) s;
    v_result := jsonb_set(v_result, '{option_mechanics_by_level}', v_levels, true);
  end if;

  return v_result;
end;
$$;

create or replace function private.strip_cleric_legacy_author_explanation_choices(p_choices jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(private.strip_cleric_legacy_author_explanation_choice(c) order by ord), '[]'::jsonb)
  from jsonb_array_elements(coalesce(p_choices, '[]'::jsonb)) with ordinality q(c, ord);
$$;

update public.rule_templates rt
set mechanics = private.strip_cleric_legacy_author_explanation(rt.mechanics),
    choices = private.strip_cleric_legacy_author_explanation_choices(rt.choices),
    author_description = case rt.catalog_key
      when 'class:cleric' then 'Жрец — это человек, который идёт в подземелье с уверенностью, что за ним стоит нечто гораздо большее. Я обычно стою чуть в стороне: небеса известны плохой меткостью. Но когда такой человек вытаскивает товарища с края могилы или заставляет нежить вспомнить, что она уже умерла, спорить о пользе профессии становится трудно.'
      when 'subclass:cleric:arcana-domain' then 'Жрец, которому одной разновидности магии оказалось мало, — уже плохой знак. Эти ещё и лезут в волшебные трактаты, спорят с чужими чарами и смотрят на заклинание так, будто хотят разобрать его по косточкам. Полезные люди. Рядом с ними особенно приятно иметь немагическую дверь для выхода.'
      when 'subclass:cleric:death-domain' then 'Служители Смерти говорят о конце жизни слишком спокойно для людей, которые пока сами дышат. Они знают, где тело ломается, как подтолкнуть его к последней черте и что делать с силой, от которой остальные стараются держаться подальше. Я бы не ел с ними из одной миски. Работать — можно.'
      when 'subclass:cleric:forge-domain' then 'Кузнечных жрецов я понимаю лучше большинства их собратьев: молот хотя бы честно объясняет свою работу по вмятине. Эти люди уважают металл, жар и вещь, сделанную руками, хотя всё равно умудряются приплести к хорошей стали небеса. Прощу. Сталь действительно хорошая.'
      when 'subclass:cleric:grave-domain' then 'Хранитель Могилы — редкий священник, которого я предпочту видеть рядом с умирающим. Он не влюблён в смерть и не боится её; просто знает, когда человека ещё надо тащить обратно, а когда уже поздно мучить всех вокруг надеждой. Очень полезная трезвость для профессии, построенной на чудесах.'
      when 'subclass:cleric:knowledge-domain' then 'Служитель Знания — человек, который собирает ответы с той же жадностью, с какой наёмник собирает хорошие ножи. Иногда это спасает от драки, иногда объясняет, почему драка неизбежна, а иногда просто позволяет заранее узнать имя того, кто вас убьёт. Последнее менее полезно, но впечатляет.'
      when 'subclass:cleric:life-domain' then 'К Жизни у меня меньше претензий, чем к большинству доменов. Когда вокруг кровь, крики и человек перестаёт дышать, мне безразлично, чьё имя произносит тот, кто умеет вернуть его обратно. Полевой лекарь быстро учится уважать результат, даже если источник результата подозрительно любит храмы.'
      when 'subclass:cleric:light-domain' then 'Служители Света любят говорить, будто тьма отступает перед истиной. На практике она чаще отступает перед чем-то настолько ярким и горячим, что у истины появляется запах палёной одежды. Не самый тонкий богословский довод. Зато видно его издалека.'
      when 'subclass:cleric:nature-domain' then 'Жрец Природы — это когда храм и лес решили поделить одного человека и оба отказались уступать. Он разговаривает о зверях, растениях и стихиях с тем же выражением лица, с каким обычный священник говорит о чуде. Мне достаточно друидов без алтаря; теперь, значит, есть ещё и с алтарём.'
      when 'subclass:cleric:order-domain' then 'Служители Порядка особенно любят слова вроде «должен» и «подчинись». В обычном человеке это неприятная черта характера; у человека, которому небеса иногда помогают сделать приказ убедительным, — уже угроза. В отряде полезно. Главное заранее договориться, кто именно у нас считается порядком.'
      when 'subclass:cleric:peace-domain' then 'Название «Мир» звучит особенно смешно после первой драки. Но эти жрецы хотя бы понимают вещь, которую проповедники часто забывают: товарищество проверяется не словами, а тем, кто встанет между другом и клинком. Если человек делает именно это, я готов ненадолго перестать издеваться над названием.'
      when 'subclass:cleric:tempest-domain' then 'Буря — честное божество, если такие вообще бывают: сначала грохот, потом молния, потом всем сразу понятно, что разговор закончен. Его жрецы обычно тоже не страдают избытком тонкости. Я уважаю предсказуемость. Особенно когда стою достаточно далеко.'
      when 'subclass:cleric:trickery-domain' then 'Жрец Обмана — прекрасное доказательство, что религии тоже умеют признавать очевидное: иногда святому человеку приходится врать. Эти делают из лжи ремесло, подсовывают врагу не того себя и исчезают ровно тогда, когда становится неудобно. Ужасные люди. Почти профессионалы.'
      when 'subclass:cleric:twilight-domain' then 'Сумеречный жрец больше похож на хорошего ночного дозорного, чем на проповедника, и это уже комплимент. Он знает цену темноте, страху и нескольким спокойным минутам, когда люди рядом могут собраться. Если уж храм полезен в карауле, я не стану жаловаться слишком громко.'
      when 'subclass:cleric:war-domain' then 'Военный жрец хотя бы не притворяется, что любой спор заканчивается примирением. Он надевает железо, идёт туда, где летят стрелы, и просит своего бога помочь с тем, что остальные делают мышцами и плохим характером. Если священник стоит в первой линии, часть моих обычных претензий отпадает сама.'
      else rt.author_description
    end,
    rules_meta = coalesce(rt.rules_meta, '{}'::jsonb)
      || jsonb_build_object(
        'author_narration_source', 'src/data/classes/clericVossNarration.ts',
        'author_narration_mode', 'in_world_only',
        'author_narration_key', 'domain_and_source_key',
        'author_narration_rule', 'never_derive_from_mechanics'
      ),
    updated_at = now()
where rt.is_active
  and (rt.catalog_key = 'class:cleric' or rt.catalog_key like 'subclass:cleric:%');

update public.rule_template_levels rtl
set mechanics = private.strip_cleric_legacy_author_explanation(rtl.mechanics),
    choices = private.strip_cleric_legacy_author_explanation_choices(rtl.choices)
from public.rule_templates rt
where rt.id = rtl.template_id
  and rt.is_active
  and (rt.catalog_key = 'class:cleric' or rt.catalog_key like 'subclass:cleric:%');

-- Guard template-level, progression-level and selectable feature rows. Missing
-- narration in DB is intentional: the authoritative authored source is the
-- source-keyed code registry, while the database keeps exact rules and comments.
do $$
declare v_remaining integer;
begin
  with cleric_templates as (
    select * from public.rule_templates rt
    where rt.is_active
      and (rt.catalog_key = 'class:cleric' or rt.catalog_key like 'subclass:cleric:%')
  ), choice_roots as (
    select choices from cleric_templates
    union all
    select rtl.choices
    from cleric_templates rt
    join public.rule_template_levels rtl on rtl.template_id = rt.id
  ), choices as (
    select c
    from choice_roots r
    cross join lateral jsonb_array_elements(coalesce(r.choices, '[]'::jsonb)) c
  ), nested as (
    select m
    from choices c
    cross join lateral jsonb_each(coalesce(c.c->'option_mechanics', '{}'::jsonb)) o(k, v)
    cross join lateral jsonb_array_elements(v) m
    union all
    select m
    from choices c
    cross join lateral jsonb_each(coalesce(c.c->'option_mechanics_by_level', '{}'::jsonb)) o(k, v)
    cross join lateral jsonb_each(v) lv(lk, lval)
    cross join lateral jsonb_array_elements(lval) m
  ), feature_rows as (
    select m
    from cleric_templates rt
    cross join lateral jsonb_array_elements(coalesce(rt.mechanics, '[]'::jsonb)) m
    union all
    select m
    from cleric_templates rt
    join public.rule_template_levels rtl on rtl.template_id = rt.id
    cross join lateral jsonb_array_elements(coalesce(rtl.mechanics, '[]'::jsonb)) m
    union all
    select m from nested
  )
  select count(*) into v_remaining
  from feature_rows
  where m->>'type' = 'grant'
    and m->>'target' = 'feature'
    and (
      nullif(btrim(m->'payload'->>'authorExplanation'), '') is not null
      or nullif(btrim(m->'presentation'->>'authorExplanation'), '') is not null
    );

  if v_remaining > 0 then
    raise exception 'Cleric legacy Voss explanations remain in % feature rows', v_remaining;
  end if;
end;
$$;

drop function private.strip_cleric_legacy_author_explanation_choices(jsonb);
drop function private.strip_cleric_legacy_author_explanation_choice(jsonb);
drop function private.strip_cleric_legacy_author_explanation(jsonb);

commit;
