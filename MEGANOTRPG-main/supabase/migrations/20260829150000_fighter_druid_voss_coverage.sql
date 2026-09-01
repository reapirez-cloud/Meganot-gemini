begin;

-- CLASS_WORK_STATUS: fighter:text=READY;mechanics=NOT_AUDITED; druid:text=READY;mechanics=NOT_AUDITED
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
-- PRESENTATION ONLY.
-- This migration writes Reynar Voss author copy to feature payloads and to
-- mechanic.presentation.authorComment for source groups that have no feature grant.
-- It does not change choices, resources, actions, formulas, effects, levels or CE behavior.

create temporary table voss_feature_comments (
  catalog_key text not null,
  source_key text not null,
  comment text not null,
  primary key (catalog_key, source_key)
) on commit drop;

insert into voss_feature_comments (catalog_key, source_key, comment) values
  ('class:fighter','ability-score-improvement','Редкая способность, где никто не светится и не призывает предков. Просто становишься лучше. Подозрительно здраво.'),
  ('class:fighter','action-surge','Маги называют это нарушением экономики времени. Воин называет это «я ещё не закончил».'),
  ('class:fighter','epic-boon','Когда обычного мастерства уже мало, судьба выдаёт что-то эпическое. Видимо, предыдущие попытки убить вас её не убедили.'),
  ('class:fighter','extra-attack','Один удар — просьба. Два — уже аргумент.'),
  ('class:fighter','fighter-subclass','Воинский архетип — момент, когда человек с оружием выбирает, каким именно способом будет пугать остальных.'),
  ('class:fighter','fighting-style','Правильная техника не выглядит волшебно. Она просто оставляет меньше работы лекарю и больше — могильщику.'),
  ('class:fighter','indomitable','Провалился — попробуй ещё раз и добавь годы боевого упрямства. Наконец-то характер официально полезнее здравого смысла.'),
  ('class:fighter','second-wind','Если после серьёзной раны человек выдыхает и продолжает драться, не спрашивайте как. Радуйтесь, что он на вашей стороне.'),
  ('class:fighter','studied-attacks','Промах — это разведка боем. Очень удобная философия, пока стрела не была последней.'),
  ('class:fighter','subclass','Профессиональная деформация продолжается. Хорошо, когда она хотя бы даёт преимущества.'),
  ('class:fighter','tactical-master','Оружие то же. Проблема противника в том, что воин теперь выбирает, какой именно неприятностью оно станет.'),
  ('class:fighter','tactical-mind','Иногда второе дыхание полезнее потратить на мысль, чем на кровь. Редкое доказательство, что шлем не полностью изолирует мозг.'),
  ('class:fighter','tactical-shift','Подлечился и сразу ушёл оттуда, где тебя били. Наконец-то тактика, понятная даже здоровому человеку.'),
  ('class:fighter','three-extra-attacks','К этому моменту щит противника уже больше напоминает коллективную просьбу прекратить.'),
  ('class:fighter','two-extra-attacks','После второго удара обычно всё ясно. Третий — это уже редактура.'),
  ('class:fighter','weapon-mastery','Хороший воин знает не только какой стороной держать оружие, но и какую именно проблему каждой стороной создавать.'),

  ('subclass:fighter:arcane-archer','additional-arcane-shot-option-l7-3','Ещё один способ испортить кому-то день стрелой. Некоторые коллекционируют марки, но у каждого свои недостатки.'),
  ('subclass:fighter:arcane-archer','additional-arcane-shot-option-l10-1','Ещё один способ испортить кому-то день стрелой. Некоторые коллекционируют марки, но у каждого свои недостатки.'),
  ('subclass:fighter:arcane-archer','additional-arcane-shot-option-l15-2','Ещё один способ испортить кому-то день стрелой. Некоторые коллекционируют марки, но у каждого свои недостатки.'),
  ('subclass:fighter:arcane-archer','additional-arcane-shot-option-l18-1','Коллекция магических стрел почти закончена. Выжившие мишени, если такие остались, могут оценить ассортимент.'),
  ('subclass:fighter:arcane-archer','arcane-archer-l3-1','Лук, магия и достаточно вариантов, чтобы каждый выстрел выглядел как заранее подготовленная неприятность. Эльфы, наверное, довольны.'),
  ('subclass:fighter:arcane-archer','curving-shot-l7-2','Стрела промахнулась и получила второй шанс. Людям такой сервис обычно не предоставляют.'),
  ('subclass:fighter:arcane-archer','ever-ready-shot-l15-1','Если бой начался, а магические стрелы закончились, одна всё равно находится. У хорошего лучника всегда есть заначка и плохое объяснение.'),
  ('subclass:fighter:arcane-archer','magic-arrow-l7-1','Обычная стрела перестаёт быть обычной сразу после выстрела. Очень удобно для лучника и очень неудобно для призраков.'),

  ('subclass:fighter:banneret','banneret-l3-1','Говорит на языках, лечит людей и выглядит убедительно. Командирская работа почти всегда держится на этих трёх мошенничествах.'),
  ('subclass:fighter:banneret','team-tactics-l7-1','Люди дерутся лучше, когда кто-то рядом уверенно делает вид, что всё идёт по плану.'),
  ('subclass:fighter:banneret','rallying-surge-l10-1','Воин ускоряется — и почему-то работать начинают ещё и окружающие. Настоящее лидерство: перераспределить усталость.'),
  ('subclass:fighter:banneret','shared-resilience-l15-1','Если союзник провалился, командир одолжит ему собственное упрямство. Выживете — сочтёмся.'),
  ('subclass:fighter:banneret','inspiring-commander-l18-1','Рядом с хорошим командиром люди меньше боятся и хуже поддаются чужому влиянию. Рядом с плохим обычно просто боятся его.'),

  ('subclass:fighter:battle-master','battle-master-l3-1','Манёвр — это обычный удар, которому дали образование и отдельную бухгалтерию.'),
  ('subclass:fighter:battle-master','know-your-enemy-l7-1','Смотреть на врага и сразу спрашивать, чем его лучше убивать, — редкий полезный вид любознательности.'),
  ('subclass:fighter:battle-master','improved-combat-superiority-l10-1','Манёвров больше, опыт тяжелее. Теория насилия наконец переходит к продвинутому курсу.'),
  ('subclass:fighter:battle-master','relentless-l15-1','Когда обычный запас закончился, мастер боя всё равно находит ещё один приём. Упрямство снова обошло экономику.'),
  ('subclass:fighter:battle-master','ultimate-combat-superiority-l18-1','На этой стадии профессионализм уже приходится носить в отдельном мешке. Желательно вместе с костями врагов не путать.'),

  ('subclass:fighter:cavalier','cavalier-l3-1','Пометил врага, сел в седло и убедил его смотреть только на себя. Некоторые называют это рыцарством, я — управляемой проблемой.'),
  ('subclass:fighter:cavalier','warding-maneuver-l7-1','Иногда щит — это предмет. Иногда это человек рядом, который вовремя сказал чужому попаданию «нет».'),
  ('subclass:fighter:cavalier','hold-the-line-l10-1','Пройти мимо такого воина можно. Далеко пройти — уже отдельная задача.'),
  ('subclass:fighter:cavalier','ferocious-charger-l15-1','Хороший разбег превращает аргумент в лежачего оппонента. Физика всё ещё работает, слава богам.'),
  ('subclass:fighter:cavalier','vigilant-defender-l18-1','Обычной бдительности ему стало мало. Паранойя, доведённая до профессионального стандарта.'),

  ('subclass:fighter:champion','champion-l3-1','Некоторые ищут сложные комбинации. Чемпион просто чаще попадает туда, откуда потом выносят.'),
  ('subclass:fighter:champion','additional-fighting-style-l7-1','Ещё один правильный способ драться. Спорить с человеком, который знает два, о методологии особенно бессмысленно.'),
  ('subclass:fighter:champion','heroic-warrior-l10-1','Каждый бой начинается с вдохновения. Большинство людей получает его только после того, как уже поздно.'),
  ('subclass:fighter:champion','superior-critical-l15-1','Критические удары становятся привычкой. Могильщики любят стабильный рост показателей.'),
  ('subclass:fighter:champion','survivor-l18-1','Он лучше умирает, лучше не умирает и понемногу чинится сам. На этом этапе лекарь начинает воспринимать это лично.'),

  ('subclass:fighter:echo-knight','echo-knight-l3-1','Один воин — неприятность. Тот же воин, который оставляет рядом ещё одну версию себя, — уже спор с геометрией.'),
  ('subclass:fighter:echo-knight','echo-avatar-l7-1','Разведчик, которого можно отправить вперёд без собственного тела. Командиры мечтали об этом задолго до магии.'),
  ('subclass:fighter:echo-knight','shadow-martyr-l10-1','Эхо принимает удар вместо другого. Наконец-то жертвенный герой, которого не надо хоронить.'),
  ('subclass:fighter:echo-knight','reclaim-potential-l15-1','Уничтожили копию — настоящий воин почему-то становится крепче. Даже собственная версия у него работает расходным материалом.'),
  ('subclass:fighter:echo-knight','legion-of-one-l18-1','Теперь копий две. Формально это всё ещё один человек. Практически охрана уже пишет заявление.'),

  ('subclass:fighter:eldritch-knight','eldritch-knight-l3-1','Воин выучил магию, но не перестал носить оружие. Разумный компромисс: если чары подведут, сталь обычно менее принципиальна.'),
  ('subclass:fighter:eldritch-knight','war-magic-l7-1','Один удар уступает место заговору. Волшебники назовут это смешением дисциплин, воин — экономией времени.'),
  ('subclass:fighter:eldritch-knight','eldritch-strike-l10-1','Сначала ударить, потом заставить цель хуже сопротивляться магии. Академия бы написала трактат. Воин уже закончил.'),
  ('subclass:fighter:eldritch-knight','arcane-charge-l15-1','Когда человек слишком быстро решает проблемы, расстояние остаётся последней надеждой. Теперь и её отобрали.'),
  ('subclass:fighter:eldritch-knight','improved-war-magic-l18-1','Иногда лучший способ продолжить махать мечом — на несколько секунд признать, что заклинание тоже сойдёт.'),

  ('subclass:fighter:psi-warrior','psi-warrior-l3-1','Воин научился бить мыслью, защищать мыслью и двигать вещи мыслью. Хорошая новость: меч он почему-то всё ещё носит.'),
  ('subclass:fighter:psi-warrior','telekinetic-adept-l7-1','Теперь можно летать рывком и швырять людей силой мысли. Психическое взросление у всех проходит по-разному.'),
  ('subclass:fighter:psi-warrior','guarded-mind-l10-1','Его разум трудно сломать, напугать и отравить чужими мыслями. Свои мысли, к сожалению, остаются без гарантии.'),
  ('subclass:fighter:psi-warrior','bulwark-of-force-l15-1','Стена из чистой силы, которую не надо таскать. Редкая победа магии над логистикой.'),
  ('subclass:fighter:psi-warrior','telekinetic-master-l18-1','Когда человек способен двигать врага силой мысли и одновременно бить оружием, переговоры обычно становятся очень короткими.'),

  ('subclass:fighter:rune-knight','rune-knight-l3-1','Руны делают воина большим, сильным и магическим. Великаны наконец придумали письменность, от которой можно получить по лицу.'),
  ('subclass:fighter:rune-knight','additional-rune-known-l7-2','Ещё одна руна. Коллекция символов растёт, а окружающие почему-то всё меньше хотят читать надписи на его снаряжении.'),
  ('subclass:fighter:rune-knight','additional-rune-known-l10-2','Ещё одна руна. Коллекция символов растёт, а окружающие почему-то всё меньше хотят читать надписи на его снаряжении.'),
  ('subclass:fighter:rune-knight','additional-rune-known-l15-2','Ещё одна руна. Коллекция символов растёт, а окружающие почему-то всё меньше хотят читать надписи на его снаряжении.'),
  ('subclass:fighter:rune-knight','runic-shield-l7-1','Руна заставляет врага пересмотреть удачный удар. Ничто так не укрепляет веру в письменность, как отменённая рана.'),
  ('subclass:fighter:rune-knight','great-stature-l10-1','Стал выше и бьёт сильнее. Иногда развитие человека действительно можно измерить рулеткой.'),
  ('subclass:fighter:rune-knight','master-of-runes-l15-1','Руны теперь готовы работать сверхурочно. В отличие от людей, жалоб они не пишут.'),
  ('subclass:fighter:rune-knight','runic-juggernaut-l18-1','Огромный воин с ещё большей досягаемостью. Дверные проёмы официально переходят в список противников.'),

  ('subclass:fighter:samurai','samurai-l3-1','Точность, выдержка и запас прочности. У некоторых это называется дисциплиной, у наёмников — хорошим днём.'),
  ('subclass:fighter:samurai','elegant-courtier-l7-1','Воин, который одинаково опасен и за столом переговоров, и рядом с ним. Вот это уже действительно тревожно.'),
  ('subclass:fighter:samurai','tireless-spirit-l10-1','Если бой начался, а дух закончился, один всё равно находится. Стыд перед предками — удивительно надёжное топливо.'),
  ('subclass:fighter:samurai','rapid-strike-l15-1','Отказаться от хорошего шанса ради ещё одного удара. Очень воинский способ решить, что одной возможности недостаточно.'),
  ('subclass:fighter:samurai','strength-before-death-l18-1','Упал и решил сначала закончить дело. Смерть, как обычно, вынуждена ждать, пока воин занят.'),

  -- Druid comments that were mechanically accurate but sounded like developer notes.
  ('class:druid','wild-shape','Сегодня лекарь, через мгновение — волк. Если после драки кто-то спрашивает, куда делись штаны, значит всё прошло лучше обычного.'),
  ('class:druid','wild-resurgence','Друид умеет менять магию на зверя и обратно. Обменный курс настолько честный, что рядом явно где-то сидит банкир.'),
  ('class:druid','asi-16','Ещё одно повышение квалификации. В лесу диплом не выдают, зато ошибки обычно сразу пытаются вас съесть.'),
  ('class:druid','epic-boon','На такой стадии карьеры подарки обычно либо легендарные, либо посмертные. Хорошо, если этот первый.'),
  ('class:druid','archdruid','Если природа держит друида настолько долго, увольнение, похоже, уже не предусмотрено.'),
  ('subclass:druid:moon','circle-forms','Лунный друид становится зверем лучше остальных. Если медведь выглядит слишком уверенно, переговоры уже провалились.'),
  ('subclass:druid:stars','starry-form','Созвездия наконец нашли практическое применение. Астрологи будут оскорблены, что для этого понадобился друид.');

update public.rule_template_levels rtl
set mechanics = (
  select coalesce(
    jsonb_agg(
      case
        when mechanic->>'type' = 'grant'
          and mechanic->>'target' = 'feature'
          and vc.comment is not null
        then jsonb_set(
          jsonb_set(mechanic, '{payload}', coalesce(mechanic->'payload', '{}'::jsonb), true),
          '{payload,authorComment}', to_jsonb(vc.comment), true
        )
        else mechanic
      end
      order by ord
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(coalesce(rtl.mechanics, '[]'::jsonb)) with ordinality as items(mechanic, ord)
  left join voss_feature_comments vc
    on vc.catalog_key = rt.catalog_key
   and vc.source_key = coalesce(nullif(mechanic->>'sourceKey',''), mechanic->>'id')
)
from public.rule_templates rt
where rtl.template_id = rt.id
  and rt.is_active
  and (
    rt.catalog_key = 'class:fighter'
    or rt.catalog_key like 'subclass:fighter:%'
    or rt.catalog_key = 'class:druid'
    or rt.catalog_key like 'subclass:druid:%'
  );

create temporary table voss_group_comments (
  catalog_key text not null,
  level integer not null,
  source_key text not null,
  comment text not null,
  primary key (catalog_key, level, source_key)
) on commit drop;

insert into voss_group_comments (catalog_key, level, source_key, comment) values
  ('class:fighter',4,'second-wind','Организм понял намёк и начал держать больше сил про запас. Умнее многих новобранцев.'),
  ('class:fighter',10,'second-wind','Если вам снова требуется второе дыхание, название давно врёт. Хорошая новость — тело тоже научилось врать убедительно.'),
  ('subclass:fighter:arcane-archer',3,'subclass-spells','Лучник освоил фокусы и мелкую природную магию. Наконец-то засаду можно не только устроить, но и красиво оформить.'),

  ('class:druid',4,'wild-shape','Сначала разрешают плавать, потом — летать. Природа выдаёт лицензии медленнее бюрократов, зато экзамен обычно с зубами.'),
  ('class:druid',8,'wild-shape','Когда друиду наконец доверяют крылья, часовые внезапно начинают подозрительно смотреть на каждого орла с сумкой.'),

  ('subclass:druid:circle-of-spores',2,'subclass-spells','Грибы начинают с того, что мешают людям нормально лечиться. Очень естественный первый шаг к здоровым отношениям.'),
  ('subclass:druid:circle-of-spores',3,'subclass-spells','Один перестаёт видеть, другой — разлагаться. У грибов странное понимание заботы, но хотя бы последовательное.'),
  ('subclass:druid:circle-of-spores',5,'subclass-spells','На этом этапе споры уже либо поднимают труп, либо помогают самому стать облаком. Здоровая экосистема, ничего подозрительного.'),
  ('subclass:druid:circle-of-spores',7,'subclass-spells','Сначала высушить, потом запутать. Я видел менее токсичные семейные ужины.'),
  ('subclass:druid:circle-of-spores',9,'subclass-spells','Когда грибник приходит с чумой и ядовитым облаком, корзинку для сбора уже можно не искать.'),

  ('subclass:druid:circle-of-wildfire',2,'subclass-spells','Одной рукой лечит, другой поджигает. Хороший полевой лекарь тоже так умеет, просто обычно не одновременно.'),
  ('subclass:druid:circle-of-wildfire',3,'subclass-spells','Если маленького пожара оказалось мало, появляются круглый и дальнобойный. Природа учится масштабированию.'),
  ('subclass:druid:circle-of-wildfire',5,'subclass-spells','После пожара что-то должно вырасти. Иногда растение. Иногда тот, кого не успели похоронить.'),
  ('subclass:druid:circle-of-wildfire',7,'subclass-spells','Рядом с таким друидом труднее умереть и неприятнее ударить. Воспитание через положительное и отрицательное подкрепление.'),
  ('subclass:druid:circle-of-wildfire',9,'subclass-spells','С неба падает огонь, потом все массово лечатся. С опытом начинаешь подозревать, что это один бизнес.'),

  ('subclass:druid:moon',3,'moon-spells','Лунный друид умеет лечить, светить и жечь светом ещё до того, как решил стать медведем. Избыточность бывает полезной.'),
  ('subclass:druid:moon',5,'moon-spells','Если одного зверя мало, всегда можно позвать ещё. Так обычно и заканчивается нормальный строй.'),
  ('subclass:druid:moon',7,'moon-spells','Лунного света становится столько, что даже оружие начинает вести себя религиозно.'),
  ('subclass:druid:moon',9,'moon-spells','Массовое лечение особенно полезно после того, как все выяснили: медведь впереди строя не делает остальных бессмертными.'),

  ('subclass:druid:sea',3,'sea-spells','Туман, ветер, холод и гром. Море умеет испортить день целой погодой, друид просто носит прогноз с собой.'),
  ('subclass:druid:sea',5,'sea-spells','Можно дышать под водой и метать молнии. Главное — не обсуждать с физиками порядок этих пунктов.'),
  ('subclass:druid:sea',7,'sea-spells','Когда друид управляет водой и льдом, фраза «плохая погода» становится персональным обвинением.'),
  ('subclass:druid:sea',9,'sea-spells','Либо зовёт стихию, либо просит чудовище постоять спокойно. Оба варианта звучат как начало отчёта о потерях.');

update public.rule_template_levels rtl
set mechanics = (
  select coalesce(
    jsonb_agg(
      case
        when gc.comment is not null
        then jsonb_set(
          jsonb_set(mechanic, '{presentation}', coalesce(mechanic->'presentation', '{}'::jsonb), true),
          '{presentation,authorComment}', to_jsonb(gc.comment), true
        )
        else mechanic
      end
      order by ord
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(coalesce(rtl.mechanics, '[]'::jsonb)) with ordinality as items(mechanic, ord)
  left join voss_group_comments gc
    on gc.catalog_key = rt.catalog_key
   and gc.level = rtl.level
   and gc.source_key = coalesce(nullif(mechanic->>'sourceKey',''), mechanic->>'id')
)
from public.rule_templates rt
where rtl.template_id = rt.id
  and rt.is_active
  and (
    rt.catalog_key = 'class:fighter'
    or rt.catalog_key like 'subclass:fighter:%'
    or rt.catalog_key = 'class:druid'
    or rt.catalog_key like 'subclass:druid:%'
  );

-- UI-equivalent quality gate: every non-spell-slot source group that can become
-- an openable class/subclass card must resolve a Voss comment either from the
-- feature grant or from renderer-only presentation metadata.
do $$
declare
  v_missing integer;
  v_leaks integer;
begin
  with raw as (
    select
      rt.catalog_key,
      rtl.level,
      coalesce(nullif(m->>'sourceKey',''), m->>'id') as source_key,
      m
    from public.rule_templates rt
    join public.rule_template_levels rtl on rtl.template_id = rt.id
    cross join lateral jsonb_array_elements(coalesce(rtl.mechanics, '[]'::jsonb)) m
    where rt.is_active
      and (
        rt.catalog_key = 'class:fighter'
        or rt.catalog_key like 'subclass:fighter:%'
        or rt.catalog_key = 'class:druid'
        or rt.catalog_key like 'subclass:druid:%'
      )
      and not (m->>'type' = 'resource' and coalesce(m->>'key','') ~ '^spell_slot_[1-9]$')
  ), card_groups as (
    select
      catalog_key,
      level,
      source_key,
      bool_or(
        (m->>'type' = 'grant' and m->>'target' = 'feature' and nullif(btrim(m->'payload'->>'authorComment'),'') is not null)
        or nullif(btrim(m->'presentation'->>'authorComment'),'') is not null
      ) as has_voss
    from raw
    group by catalog_key, level, source_key
  )
  select count(*) into v_missing
  from card_groups
  where not has_voss;

  with comments as (
    select nullif(btrim(m->'payload'->>'authorComment'),'') as comment
    from public.rule_templates rt
    join public.rule_template_levels rtl on rtl.template_id = rt.id
    cross join lateral jsonb_array_elements(coalesce(rtl.mechanics, '[]'::jsonb)) m
    where rt.is_active
      and (rt.catalog_key in ('class:fighter','class:druid') or rt.catalog_key like 'subclass:fighter:%' or rt.catalog_key like 'subclass:druid:%')
      and m->>'type' = 'grant' and m->>'target' = 'feature'
    union all
    select nullif(btrim(m->'presentation'->>'authorComment'),'')
    from public.rule_templates rt
    join public.rule_template_levels rtl on rtl.template_id = rt.id
    cross join lateral jsonb_array_elements(coalesce(rtl.mechanics, '[]'::jsonb)) m
    where rt.is_active
      and (rt.catalog_key in ('class:fighter','class:druid') or rt.catalog_key like 'subclass:fighter:%' or rt.catalog_key like 'subclass:druid:%')
  )
  select count(*) into v_leaks
  from comments
  where comment is not null
    and lower(comment) ~ '(character engine|runtime|парсер|миграц|реализац|интерфейс|в этой кампании|мы используем|мы изменили|совместимост|редакци[яи] правил)';

  if v_missing > 0 then
    raise exception 'Voss coverage failed: % Fighter/Druid reference source groups still have no author comment', v_missing;
  end if;

  if v_leaks > 0 then
    raise exception 'Voss voice failed: % Fighter/Druid comments contain developer-language leaks', v_leaks;
  end if;
end;
$$;

commit;
