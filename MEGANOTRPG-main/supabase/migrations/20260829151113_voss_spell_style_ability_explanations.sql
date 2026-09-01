-- CLASS_INTEGRATION_STRICT: class:fighter
-- CLASS_INTEGRATION_STRICT: class:druid
-- CLASS_INTEGRATION_STRICT: class:cleric
-- CLASS_PACKAGE_TEST: tests/vossAbilityExplanations.test.ts
-- CLASS_WORK_STATUS: fighter:text=READY;mechanics=NOT_AUDITED; druid:text=READY;mechanics=NOT_AUDITED; cleric:text=READY;mechanics=NOT_AUDITED
-- CLASS_STATUS_LEDGER: src/rule-templates/CLASS_WORK_STATUS.md
-- PRESENTATION ONLY. Revoices authorExplanation for Fighter, Druid and Cleric
-- abilities to match the concise in-world style used by spell author_description.
-- Exact rule descriptions and all executable mechanics are untouched.

begin;

create or replace function private.voss_spell_style_ability_explanation(p_catalog_key text,p_source_key text,p_label text,p_description text,p_old text)
returns text language plpgsql immutable set search_path = '' as $$
declare
  v_catalog text := lower(coalesce(p_catalog_key,''));
  v_source text := lower(coalesce(p_source_key,''));
  v_label text := coalesce(nullif(btrim(p_label),''),'эта способность');
  v_old text := regexp_replace(coalesce(p_old,''), E'\\s+', ' ', 'g');
  v_description text := regexp_replace(coalesce(p_description,''), E'\\s+', ' ', 'g');
  v_candidate text; v_core text; v_text text;
  v_variant integer := ascii(substr(md5(coalesce(p_catalog_key,'') || ':' || coalesce(p_source_key,'') || ':' || coalesce(p_label,'')),1,1)) % 4;
begin
  if v_catalog='class:fighter' then
    case v_source
      when 'fighting-style' then return 'Выбираете, каким способом драться умеете особенно хорошо. Удивительно, сколько людей погибло потому, что их противник годами отрабатывал одну скучную вещь.';
      when 'second-wind' then return 'Получили по рёбрам, отдышались и решили, что умирать сегодня неудобно. «Второе дыхание» быстро возвращает часть здоровья, не заставляя прекращать драку надолго.';
      when 'weapon-mastery' then return 'Воин знает у оружия больше одного полезного конца. Выбранные виды начинают давать свои приёмы Мастерства, а с опытом таких привычных инструментов становится больше.';
      when 'action-surge' then return 'Когда одного действия не хватило, воин просто делает ещё одно прямо сейчас. Организм обычно узнаёт об этом решении последним.';
      when 'tactical-mind' then return 'Не вышло силой — на несколько секунд включаем голову. Проваленную проверку можно вытянуть Вторым дыханием; если и это не помогло, хотя бы не тратите его зря.';
      when 'fighter-subclass' then return 'На третьем уровне воин решает, каким именно кошмаром для противника станет дальше. Архетип выбирается один раз, а потом просто продолжает учить новым трюкам.';
      when 'subclass' then return 'Это следующая ступень уже выбранного архетипа. Новый путь искать не надо: старый просто научился ещё одной неприятной вещи.';
      when 'ability-score-improvement' then return 'Становитесь сильнее, ловчее, крепче или осваиваете новый талант. Редкий случай, когда рост персонажа можно объяснить без пророчества и свечей.';
      when 'extra-attack' then return 'Один удар — знакомство. Два подряд — уже рабочий разговор: действие Атака теперь позволяет ударить дважды.';
      when 'tactical-shift' then return 'Воин научился лечиться на ходу буквально. Используете Второе дыхание — и заодно меняете позицию, пока враг ещё надеется, что вы останетесь на месте.';
      when 'indomitable' then return 'Провалили спасбросок? Воин относится к этому как к плохому первому черновику и пробует ещё раз, уже опираясь на собственный опыт.';
      when 'tactical-master' then return 'Освоенное оружие перестаёт быть просто куском железа. Перед конкретной атакой можно выбрать более подходящий приём и испортить противнику именно тот день, который он заслужил.';
      when 'two-extra-attacks' then return 'Две атаки уже казались много? Теперь действие Атака даёт три. Воин просто продолжает разговор, пока собеседник не перестанет отвечать.';
      when 'studied-attacks' then return 'Промах — не трагедия, если вы успели заметить, почему промахнулись. Следующая попытка по той же цели становится заметно убедительнее.';
      when 'three-extra-attacks' then return 'Четыре атаки за одно действие. На этом уровне «я ещё не закончил» перестаёт быть угрозой и становится расписанием.';
      when 'epic-boon' then return 'К этому моменту обычных талантов воину уже мало, поэтому берётся что-нибудь эпическое. Если вы дожили сюда без магического покровителя, спорить с названием поздно.';
      else null;
    end case;
  end if;

  if v_catalog='class:druid' then
    case v_source
      when 'spellcasting' then return 'После отдыха друид решает, какую часть природы сегодня держать наготове. Потом лес, буря и вся остальная подозрительная живность делают вид, будто это совершенно нормальный способ решать бытовые проблемы.';
      when 'druidic' then return 'Друиды знают свой тайный язык и оставляют сообщения там, где остальные видят ветки и грязь. Заодно животные почему-то тоже всегда доступны для разговора. Уже повод насторожиться.';
      when 'primal-order' then return 'В начале друид решает, кем хочет притворяться чаще: учёным магом или человеком, который хотя бы взял броню и оружие. Я за второй вариант, лес переживёт.';
      when 'wild-shape' then return 'Когда человеческое тело перестаёт подходить задаче, друид берёт другое. Зверь даёт своё тело и здоровье, а разум остаётся прежним — именно поэтому я не глажу незнакомых медведей.';
      when 'wild-companion' then return 'Не хочется самому лезть в тёмную дыру — потратьте часть своей магии или превращений и пошлите туда фейского зверька. Наконец-то у друидов появилась привычка, которую я полностью одобряю.';
      when 'subclass' then return 'На третьем уровне друид выбирает, какой именно разновидностью природной неприятности станет дальше. Круг один, последствия обычно многочисленные.';
      when 'wild-resurgence' then return 'Закончились звериные формы — сожгите немного магии. Нужна обратно магия — можно отдать форму за самую скромную ячейку. Природа тоже знает, что такое плохой обменный курс.';
      when 'elemental-fury' then return 'Друид выбирает, чем именно портить чужой день: усиливать заговоры или добавлять стихию прямо в удар. Потому что звериных клыков, видимо, было недостаточно.';
      when 'beast-spells' then return 'Раньше медведь хотя бы не колдовал. Теперь в Дикой форме можно накладывать большую часть заклинаний. Остальное, думаю, понятно.';
      when 'archdruid' then return 'К этому моменту природа почти перестаёт различать, где друид, а где стихийное бедствие: формы возвращаются, формы меняются на магию, а старость приходит в десять раз медленнее.';
      when 'epic-boon' then return 'Друид получает талант из тех, после которых обычные люди начинают пересматривать понятие «естественно». Хотя друид, конечно, назовёт естественным и это.';
      else null;
    end case;
    if v_source like 'asi-%' then return 'Ещё один талант — ещё один способ стать полезнее, опаснее или просто страннее. У друида последнее обычно получается без всякого таланта.'; end if;
  end if;

  if v_catalog='class:cleric' then
    case v_source
      when 'spellcasting' then return 'После отдыха жрец решает, какие молитвы сегодня держать наготове. Мудрость помогает чудесам попадать куда надо, а ячейки напоминают, что даже небеса не собираются отвечать бесконечно.';
      when 'divine-order' then return 'Жрец выбирает, будет ли стоять ближе к драке или продолжит доказывать полезность чудесами и знаниями. Я голосую за вариант, где у него в руках появляется нормальное оружие.';
      when 'channel-divinity' then return 'Есть обычные молитвы, а есть момент, когда жрец требует внимания небес прямо сейчас. «Божественный канал» — общий запас таких больших просьб.';
      when 'cleric-subclass' then return 'На третьем уровне жрец окончательно решает, какой стороне своего бога будет посвящать проблемы окружающих. Домен выбирается один раз; проповедь потом продолжается сама.';
      when 'subclass' then return 'Это следующая способность уже выбранного домена. Нового бога искать не надо — старый просто выдал ещё один способ вмешиваться в чужие дела.';
      when 'ability-score-improvement' then return 'Жрец становится способнее или берёт новый талант. Не чудо, конечно, но иногда обычная тренировка работает даже на людях, привыкших просить помощи сверху.';
      when 'sear-undead' then return 'Нежить, которую уже заставили бежать, заодно начинает гореть сиянием. Редкий случай, когда проповедь действительно оставляет след.';
      when 'blessed-strikes' then return 'Жрец выбирает, чем будет убедительнее — оружием или заговором. Небесам, видимо, тоже надоело смотреть на половинчатую работу.';
      when 'divine-intervention' then return 'Раз за отдых жрец просит небеса сделать работу полноценного заклинания без обычной возни с ячейкой. Иногда наверху действительно слушают.';
      when 'improved-blessed-strikes' then return 'Выбранный раньше способ причинять неприятности становится лучше сам по себе. Даже жрецу не дают второй раз передумать, каким именно чудом он хотел быть полезен.';
      when 'greater-divine-intervention' then return 'На вершине пути просьба превращается в тот сорт чуда, после которого свидетели начинают спорить, что именно они видели. Повторять такое часто не позволяют — видимо, терпение есть предел и у богов.';
      when 'epic-boon' then return 'Жрец получает талант из категории, которую скромно назвали эпической. После стольких лет разговоров от имени богов скромность всё равно уже была потеряна.';
      else null;
    end case;
  end if;

  if v_source like '%hit-die%' then
    if v_catalog like '%fighter%' then return 'Воин живёт достаточно долго, чтобы успеть пожалеть о большинстве хороших идей. Кость здоровья к10 помогает делать это чуть увереннее.'; end if;
    if v_catalog like '%druid%' then return 'Друид не самый толстокожий человек, пока не становится буквально толстокожим. В обычном теле его кость здоровья — к8.'; end if;
    if v_catalog like '%cleric%' then return 'Жрец достаточно живуч, чтобы успеть отойти за человека, которого собирается лечить. Кость здоровья — к8.'; end if;
  end if;

  if v_source like '%saving-throw%' then
    if v_catalog like '%fighter%' then return v_label || ' — одна из тех вещей, которые воин умеет переживать лучше большинства. Полезно, когда мир снова пытается сбить вас с ног или заставить перестать быть собой.'; end if;
    if v_catalog like '%druid%' then return v_label || ' даётся друиду привычнее, чем большинству. Видимо, постоянные разговоры с природой всё-таки чему-то учат, кроме недоверия к мебели.'; end if;
    if v_catalog like '%cleric%' then return v_label || ' — область, где жрец привык держаться увереннее. Хорошо, потому что вера верой, а некоторые неприятности всё равно требуют нормального спасброска.'; end if;
  end if;

  if v_source like '%armor%' or v_source in ('light-armor','shields') then
    if v_catalog like '%fighter%' then return 'С «' || v_label || '» воин умеет обращаться как человек, который действительно тренировался в этом жить. Броня скучна ровно до первого удара, который достался ей вместо вас.'; end if;
    if v_catalog like '%druid%' then return 'Друид умеет пользоваться «' || v_label || '». Приятно знать, что хотя бы иногда он доверяет защите, которая не пытается вырастить шерсть.'; end if;
    if v_catalog like '%cleric%' then return 'Жрец умеет пользоваться «' || v_label || '». Теперь осталось только убедить его проверять эту защиту не исключительно за чужими спинами.'; end if;
  end if;

  if v_source like '%weapon%' and v_source not like '%mastery%' then
    if v_catalog like '%fighter%' then return '«' || v_label || '» для воина — не экзотика, а рабочий инструмент. Никакой тайны: держите правильным концом, бейте другим.'; end if;
    if v_catalog like '%druid%' then return 'Друид умеет обращаться с «' || v_label || '». Иногда природа всё-таки признаёт, что хорошо заточенный металл быстрее длинной беседы с кустом.'; end if;
    if v_catalog like '%cleric%' then return 'Жрец умеет обращаться с «' || v_label || '». Уже неплохо: если чудо не пришло, хотя бы остаётся предмет, которым можно решить проблему лично.'; end if;
  end if;

  if v_source like '%herbalism%' then return 'Травы, настои, припарки — друид умеет обращаться с ними без гадания по запаху. Редкая часть природного ремесла, после которой никто внезапно не превращается в медведя.'; end if;

  if v_source like '%spells%' or v_source='subclass-spells' then
    if v_catalog like 'subclass:fighter:%' then return 'Архетип подсовывает воину ещё немного магии. Значит, теперь кроме оружия появился второй способ всё усложнить — иногда полезный, что особенно раздражает.';
    elsif v_catalog like 'subclass:druid:%' then return 'Круг учит ещё нескольким заклинаниям. Природа большая: в ней нашлось место и для дополнительных способов испортить кому-нибудь день.';
    elsif v_catalog like 'subclass:cleric:%' then return 'Домен добавляет свои чудеса к обычным молитвам жреца. Видимо, стандартного набора способов вмешиваться в мир оказалось недостаточно.'; end if;
  end if;

  v_candidate := nullif(btrim(v_old),'');
  if v_candidate is null or v_candidate ~* '(это постоянное владение|это отдельная активация|эта часть класса или подкласса|точн[^.]{0,30}правил|карточк|здесь учитывается|отдельно активировать|отдельно включать|перечислены в)' then v_candidate := nullif(btrim(v_description),''); end if;
  if v_candidate is null then v_candidate := '«' || v_label || '» даёт вам ещё один способ решить проблему.'; end if;
  v_candidate := regexp_replace(v_candidate, E'\\s+', ' ', 'g');
  if v_candidate ~* '(это постоянное владение|это отдельная активация|эта часть класса или подкласса|точн[^.]{0,30}правил|карточк|здесь учитывается|отдельно активировать|отдельно включать|перечислены в)' then v_candidate := coalesce((regexp_match(v_candidate, E'^(.+?[.!?])'))[1],v_candidate); end if;
  v_core := (regexp_match(v_candidate, E'^(.+?[.!?](?:\\s+.+?[.!?])?)'))[1];
  if v_core is null or btrim(v_core)='' then v_core := left(v_candidate,360); end if;
  if length(v_core)>430 then v_core:=left(v_core,427)||'…'; end if;
  v_text:=lower(v_label||' '||v_source||' '||v_core);

  if v_catalog like 'subclass:fighter:%' then
    if v_text ~ '(заклин|маг|пси|руна|эхо|телепорт|телекин)' then return v_core||' '||case v_variant when 0 then 'Вот тут нормальный воин зачем-то решил добавить магию. Работает. Мне это всё равно не нравится.' when 1 then 'Если мечник начал объяснять, что это «не совсем магия», проверьте, не светятся ли у него руки.' when 2 then 'Хороший приём был бы ещё лучше без сверхъестественной части. Но раз уж она работает, стойте чуть дальше.' else 'Воин и без чудес был опасен. Теперь кто-то решил проверить, можно ли сделать эту профессию ещё менее безопасной для окружающих.' end;
    elsif v_text ~ '(леч|временн.*hp|здоров|выжив|стойк|защит|щит|сопротив|спасброс|помех)' then return v_core||' '||case v_variant when 0 then 'У воина есть редкий талант: переживать собственные решения достаточно долго, чтобы повторить их завтра.' when 1 then 'Иногда мастерство — это не получить по голове там, где менее опытный человек уже получил бы дважды.' when 2 then 'Живой воин полезнее мёртвого. Казалось бы, очевидная мысль, но приключенцам её приходится преподавать уровнями.' else 'Хорошая защита не делает красивых историй. Зато оставляет человека, который потом сможет их соврать.' end;
    elsif v_text ~ '(перемещ|скорост|рывок|прыж|полет|полёт|седл)' then return v_core||' '||case v_variant when 0 then 'Ноги — самая надёжная магия, которую я встречал. Особенно когда ими вовремя пользуются.' when 1 then 'Правильная позиция выигрывает больше боёв, чем героический крик. Просто про неё хуже пишут песни.' when 2 then 'Если противник ожидал вас в другом месте, половина работы уже сделана.' else 'Умение двигаться вовремя обычно ценят после первого раза, когда не успели.' end;
    elsif v_text ~ '(атак|урон|крит|удар|выстрел|манев|манёвр|оруж|натиск|метк)' then return v_core||' '||case v_variant when 0 then 'Вот за это я люблю воинов: проблема ещё стоит — значит, приём можно сделать лучше.' when 1 then 'Никакого откровения свыше. Просто человек достаточно долго учился делать больно правильно.' when 2 then 'Хороший приём отличается от плохого тем, что после него объяснения обычно нужны уже лекарю.' else 'Сложность заканчивается там, где начинается хорошо отработанный удар.' end;
    elsif v_text ~ '(выбир|изуч|талант|владен|стиль|язык|манёвр|маневр)' then return v_core||' '||case v_variant when 0 then 'Воин не обязан знать всё. Достаточно знать несколько вещей настолько хорошо, чтобы остальные перестали иметь значение.' when 1 then 'Это не судьба и не дар богов. Просто ещё один навык, который пришлось нормально выучить.' when 2 then 'Хороший профессионал выбирает инструменты заранее. Плохой обычно выбирает оправдание уже после боя.' else 'Чем меньше в приёме мистики, тем больше я доверяю человеку, который его отрабатывал.' end;
    else return v_core||' '||case v_variant when 0 then 'Воины вообще удивительно хорошо решают сложные проблемы без необходимости назвать это чудом.' when 1 then 'Практично, понятно и с шансом пережить применение. Уже лучше половины магии в этой книге.' when 2 then 'Если способность можно объяснить до того, как загорелась палатка, я уже настроен к ней доброжелательно.' else 'Профессиональная привычка, доведённая до неприятной для врага крайности. Нормальная работа.' end; end if;
  end if;

  if v_catalog like 'subclass:druid:%' then
    if v_text ~ '(звер|форма|превращ|когт|клык|медвед|существ)' then return v_core||' '||case v_variant when 0 then 'Каждый раз напоминаю: если ваш спутник внезапно стал хищником, это не повод гладить его за хорошую работу.' when 1 then 'Друид считает смену тела инструментом. Я считаю это причиной всегда знать, где лежит дверь.' when 2 then 'Полезно, пока помнишь, что зверь рядом всё ещё понимает разговор лучше, чем хотелось бы.' else 'Природа дала зубы существам не для красоты. Друид почему-то решил взять это на заметку.' end;
    elsif v_text ~ '(леч|временн.*hp|здоров|восстанов|защит|сопротив)' then return v_core||' '||case v_variant when 0 then 'Природа умеет чинить живое. Правда, обычно перед этим она неплохо показывает, как именно его можно сломать.' when 1 then 'Полезная часть друидского ремесла: иногда лес не кусает, а действительно помогает.' when 2 then 'Я всё ещё не доверяю источнику, но результатом пользоваться можно. Желательно не спрашивая, что было в настое.' else 'Редкий случай, когда странная природная магия оставляет после себя больше живых людей, чем было до неё.' end;
    elsif v_text ~ '(огн|холод|молн|гром|шторм|урон|атак|спор|яд|стих)' then return v_core||' '||case v_variant when 0 then 'Природа снова напоминает, что красивые пейзажи состоят из тех же вещей, которые способны вас убить.' when 1 then 'Друиды называют это естественным порядком. Человек, которого сейчас бьёт стихия, обычно называет иначе.' when 2 then 'Лес, море, грибы, звёзды — у друида удивительный талант превращать любую декорацию в оружие.' else 'Если природа решила участвовать в драке, лучше заранее выбрать сторону подальше от её представителя.' end;
    elsif v_text ~ '(перемещ|телепорт|скорост|полет|полёт|плав|шаг)' then return v_core||' '||case v_variant when 0 then 'Друид и обычной дорогой пользоваться умеет, просто почему-то считает это недостаточно естественным.' when 1 then 'Когда природа помогает передвигаться быстрее, я предпочитаю не уточнять, что именно у вас выросло для этого.' when 2 then 'Полезно для отступления. Друиды называют это перемещением; я называю хорошей привычкой.' else 'Если человек внезапно оказался там, где секунду назад его не было, сперва проверьте, не стал ли он ещё и зверем.' end;
    else return v_core||' '||case v_variant when 0 then 'Друид скажет, что это совершенно естественно. Обычно именно после этой фразы и начинается странное.' when 1 then 'Работает. Доверять этому всё равно не обязательно.' when 2 then 'Природа большая, старая и очень изобретательная. Друид — причина, по которой это иногда становится нашей проблемой.' else 'Полезная способность, если вас не смущает, что источник пользы разговаривает с деревьями как с коллегами.' end; end if;
  end if;

  if v_catalog like 'subclass:cleric:%' then
    if v_text ~ '(леч|здоров|временн.*hp|восстанов|исцел)' then return v_core||' '||case v_variant when 0 then 'Вот ради этого жрецов и терпят: когда кто-то лежит на земле, спорить с источником лечения становится неудобно.' when 1 then 'Полезно. Даже я признаю. Только не давайте жрецу потом рассказывать, что он в одиночку выиграл бой.' when 2 then 'Жрец снова исправляет последствия чужой храбрости с безопасного расстояния. Работа есть работа.' else 'Если чудо оставляет союзника живым, я готов отложить насмешку до конца перевязки.' end;
    elsif v_text ~ '(нежит|некрот|сияющ|урон|атак|оруж|удар|гром|молн|огн)' then return v_core||' '||case v_variant when 0 then 'Когда проповедь не помогает, жрец наконец переходит к аргументам, которые я понимаю.' when 1 then 'Небесная кара — это обычное насилие, которое успело обзавестись хорошей репутацией.' when 2 then 'Жрец назовёт это волей божества. Цель обычно занята и формулирует короче.' else 'Полезная сторона религии: иногда после молитвы действительно становится тише, потому что враг уже лежит.' end;
    elsif v_text ~ '(защит|брон|щит|сопротив|иммун|спасброс|помех|реакц)' then return v_core||' '||case v_variant when 0 then 'Чудо, которое помогает не получить по голове, я уважаю больше большинства проповедей.' when 1 then 'Жрец любит стоять сзади, но иногда небеса хотя бы помогают тем, кто стоит впереди.' when 2 then 'Защита полезная. Особенно если жрец случайно применил её не только к себе.' else 'Если молитва делает группу труднее убить, продолжайте молиться. Разговоры о смысле оставим на потом.' end;
    elsif v_text ~ '(выбир|домен|язык|владен|талант|знани)' then return v_core||' '||case v_variant when 0 then 'Жрец выбирает специализацию так же уверенно, как будто бог лично прислал список. Возможно, так и было; я не проверял.' when 1 then 'Ещё одна часть профессии, где нужно заранее решить, каким именно святым способом вы будете мешать окружающим.' when 2 then 'Выбор полезный. Главное — не превращать его потом в часовую проповедь у костра.' else 'Боги любят специализацию не меньше смертных. Видимо, даже чудеса удобнее раздавать по направлениям.' end;
    else return v_core||' '||case v_variant when 0 then 'Жрец назовёт это благословением. Я назову полезным эффектом и постараюсь не давать ему повода начать проповедь.' when 1 then 'Небеса снова вмешались. Хорошо, что в этот раз хотя бы в нашу пользу.' when 2 then 'Работает — уже достижение. Уважать профессию целиком для этого необязательно.' else 'Очередное доказательство, что богам проще дать жрецу чудо, чем научить его молчать.' end; end if;
  end if;
  return v_core;
end;
$$;

create or replace function private.voss_revoice_ability_node(p_node jsonb,p_catalog_key text)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare v_result jsonb; v_type text; v_target text; v_source text; v_label text; v_description text; v_old text; v_new text; v_payload jsonb; v_presentation jsonb;
begin
  if p_node is null then return p_node; end if;
  if jsonb_typeof(p_node)='array' then select coalesce(jsonb_agg(private.voss_revoice_ability_node(value,p_catalog_key) order by ord),'[]'::jsonb) into v_result from jsonb_array_elements(p_node) with ordinality a(value,ord); return v_result; end if;
  if jsonb_typeof(p_node)<>'object' then return p_node; end if;
  v_type:=p_node->>'type';
  if v_type in ('grant','resource','action','spell','numeric') and (p_node ? 'id' or p_node ? 'sourceKey') then
    v_target:=p_node->>'target'; v_source:=coalesce(nullif(p_node->>'sourceKey',''),p_node->>'id','unknown');
    v_label:=coalesce(nullif(p_node#>>'{payload,label}',''),nullif(p_node->>'label',''),nullif(p_node#>>'{payload,spell,name}',''),nullif(p_node->>'key',''),'Способность'); v_description:=coalesce(p_node#>>'{payload,description}','');
    if v_type='grant' and v_target='feature' then v_old:=coalesce(p_node#>>'{payload,authorExplanation}',''); v_new:=private.voss_spell_style_ability_explanation(p_catalog_key,v_source,v_label,v_description,v_old); v_payload:=coalesce(p_node->'payload','{}'::jsonb)||jsonb_build_object('authorExplanation',v_new); return jsonb_set(p_node,'{payload}',v_payload,true); end if;
    v_old:=coalesce(p_node#>>'{presentation,authorExplanation}',''); v_new:=private.voss_spell_style_ability_explanation(p_catalog_key,v_source,v_label,v_description,v_old); v_presentation:=coalesce(p_node->'presentation','{}'::jsonb)||jsonb_build_object('authorExplanation',v_new); return jsonb_set(p_node,'{presentation}',v_presentation,true);
  end if;
  select coalesce(jsonb_object_agg(key,private.voss_revoice_ability_node(value,p_catalog_key)),'{}'::jsonb) into v_result from jsonb_each(p_node); return v_result;
end;
$$;

create or replace function private.apply_voss_spell_style_ability_explanations(p_campaign_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.rule_templates t set mechanics=private.voss_revoice_ability_node(t.mechanics,t.catalog_key),choices=private.voss_revoice_ability_node(t.choices,t.catalog_key),rules_meta=coalesce(t.rules_meta,'{}'::jsonb)||jsonb_build_object('voss_ability_explanation_voice','spell_author_description_v1','voss_ability_explanation_scope','presentation_only'),updated_at=now()
  where t.campaign_id=p_campaign_id and t.is_active and (t.catalog_key in ('class:fighter','class:druid','class:cleric') or t.catalog_key like 'subclass:fighter:%' or t.catalog_key like 'subclass:druid:%' or t.catalog_key like 'subclass:cleric:%');
  update public.rule_template_levels l set mechanics=private.voss_revoice_ability_node(l.mechanics,t.catalog_key),choices=private.voss_revoice_ability_node(l.choices,t.catalog_key) from public.rule_templates t
  where t.id=l.template_id and t.campaign_id=p_campaign_id and t.is_active and (t.catalog_key in ('class:fighter','class:druid','class:cleric') or t.catalog_key like 'subclass:fighter:%' or t.catalog_key like 'subclass:druid:%' or t.catalog_key like 'subclass:cleric:%');
end;
$$;

do $$ declare r record; begin for r in select id from public.campaigns loop perform private.apply_voss_spell_style_ability_explanations(r.id); end loop; end $$;

create or replace function private.apply_voss_spell_style_ability_explanations_after_campaign()
returns trigger language plpgsql security definer set search_path = '' as $$ begin perform private.apply_voss_spell_style_ability_explanations(new.id); return new; end; $$;

drop trigger if exists zzzzzzzzzzzzzz_campaigns_voss_spell_style_ability_explanations on public.campaigns;
create trigger zzzzzzzzzzzzzz_campaigns_voss_spell_style_ability_explanations after insert on public.campaigns for each row execute function private.apply_voss_spell_style_ability_explanations_after_campaign();

commit;
