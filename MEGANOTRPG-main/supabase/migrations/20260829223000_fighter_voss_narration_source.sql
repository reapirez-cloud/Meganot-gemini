-- CLASS_INTEGRATION_STRICT: class:fighter
-- PRESENTATION ONLY.
-- Fighter feature narration is authored in src/data/classes/fighterVossNarration.ts.
-- This migration removes legacy mechanics-paraphrase authorExplanation values so
-- no other DB consumer can accidentally present them as Voss. Exact rules,
-- comments, choices, resources, actions, effects and spell data are untouched.

begin;

create or replace function private.strip_fighter_legacy_author_explanation(p_mechanics jsonb)
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

update public.rule_templates rt
set mechanics = private.strip_fighter_legacy_author_explanation(rt.mechanics),
    author_description = case rt.catalog_key
      when 'class:fighter' then 'Воин — человек, который приходит в мир чудес с куском хорошо заточенного железа и почему-то остаётся одним из самых опасных существ в комнате. Я таких люблю. Не потому, что они простые, а потому, что за каждым их движением обычно стоят годы работы, несколько плохо сросшихся костей и очень мало надежды на то, что кто-нибудь сверху вмешается вовремя.'
      when 'subclass:fighter:arcane-archer' then 'Лучника я понимаю: стой подальше и делай так, чтобы неприятность умерла прежде, чем добежит. Потом кто-то добавил к стрелам магию. Лишнее, конечно, но если уж чудо обязано существовать, мне нравится, когда оно летит от нас в противоположную сторону.'
      when 'subclass:fighter:battle-master' then 'Мастер боя — редкий человек, которому я охотно доверил бы спину. Он не ждёт вдохновения и не просит силы сверху: смотрит, где стоит враг, где стоят свои, и делает следующую минуту крайне неудобной для нужных людей. Это не магия. Это годы ошибок, желательно чужих.'
      when 'subclass:fighter:cavalier' then 'Кавалер понял старую солдатскую истину: иногда лучший способ защитить остальных — стать самым раздражающим человеком перед врагом. Конь полезен, но суть не в седле. Суть в бойце, который встаёт там, где опаснее всего, и ещё имеет наглость запрещать противнику пройти.'
      when 'subclass:fighter:champion' then 'Чемпион — доказательство, что человека не обязательно проклинать, благословлять или превращать во что-нибудь, чтобы он стал страшным. Иногда достаточно годами становиться быстрее, крепче и точнее остальных. Наконец-то школа, которую можно объяснить без свечей.'
      when 'subclass:fighter:echo-knight' then 'Хороший воин занимает правильное место. Рыцарь эха решил, что одного правильного места ему мало, и притащил на поле боя ещё одну версию себя. Мне это не нравится по философским причинам. По военным, к сожалению, придраться сложнее.'
      when 'subclass:fighter:eldritch-knight' then 'Мистический рыцарь начинал правильно: броня, оружие, дисциплина. Потом открыл книгу заклинаний и решил, что простая жизнь была ошибкой. Хорошая новость — клинок он не бросил. Плохая — теперь даже клинок иногда появляется из ниоткуда.'
      when 'subclass:fighter:psi-warrior' then 'Пси-воин выглядит почти нормально, пока не отбрасывает человека без касания или не останавливает удар одной мыслью. Маги хотя бы машут руками и дают время заподозрить неладное. Этот просто смотрит. Очень невежливая разновидность таланта.'
      when 'subclass:fighter:banneret' then 'Командиров я обычно оцениваю по тому, насколько далеко они стоят от первой линии. Баннерет портит мне удобную систему: он идёт вместе с людьми, умеет говорить так, чтобы они снова вставали, и иногда действительно принимает тот же риск. Приходится уважать. Терпеть это не могу.'
      when 'subclass:fighter:rune-knight' then 'Рунный рыцарь взял хорошее воинское ремесло, добавил язык великанов и начал писать им на оружии. Я бы назвал это лишним, если бы надписи не работали. Когда человек становится размером с осадную башню, спор о вкусе обычно откладывают.'
      when 'subclass:fighter:samurai' then 'Самурай делает то, что большинство бойцов изображает в песнях: держит голову холодной, когда вокруг уже достаточно крови, чтобы поскользнуться. Не ярость, не чудо, не голос предка — дисциплина, доведённая до очень неприятного для врага состояния. Такое я уважаю.'
      else rt.author_description
    end,
    rules_meta = coalesce(rt.rules_meta, '{}'::jsonb)
      || jsonb_build_object(
        'author_narration_source', 'src/data/classes/fighterVossNarration.ts',
        'author_narration_mode', 'in_world_only',
        'author_narration_rule', 'never_derive_from_mechanics'
      ),
    updated_at = now()
where rt.is_active
  and (rt.catalog_key = 'class:fighter' or rt.catalog_key like 'subclass:fighter:%');

update public.rule_template_levels rtl
set mechanics = private.strip_fighter_legacy_author_explanation(rtl.mechanics)
from public.rule_templates rt
where rt.id = rtl.template_id
  and rt.is_active
  and (rt.catalog_key = 'class:fighter' or rt.catalog_key like 'subclass:fighter:%');

-- Guard both template-level and progression-level feature rows. Missing DB
-- narration is intentional: the authoritative authored source is the code
-- registry, while the database keeps exact rules and comments.
do $$
declare v_remaining integer;
begin
  with fighter_features as (
    select m
    from public.rule_templates rt
    cross join lateral jsonb_array_elements(coalesce(rt.mechanics, '[]'::jsonb)) m
    where rt.is_active
      and (rt.catalog_key = 'class:fighter' or rt.catalog_key like 'subclass:fighter:%')
      and m->>'type' = 'grant'
      and m->>'target' = 'feature'

    union all

    select m
    from public.rule_templates rt
    join public.rule_template_levels rtl on rtl.template_id = rt.id
    cross join lateral jsonb_array_elements(coalesce(rtl.mechanics, '[]'::jsonb)) m
    where rt.is_active
      and (rt.catalog_key = 'class:fighter' or rt.catalog_key like 'subclass:fighter:%')
      and m->>'type' = 'grant'
      and m->>'target' = 'feature'
  )
  select count(*) into v_remaining
  from fighter_features
  where nullif(btrim(m->'payload'->>'authorExplanation'), '') is not null
     or nullif(btrim(m->'presentation'->>'authorExplanation'), '') is not null;

  if v_remaining > 0 then
    raise exception 'Fighter legacy Voss explanations remain in % feature rows', v_remaining;
  end if;
end;
$$;

drop function private.strip_fighter_legacy_author_explanation(jsonb);

commit;
