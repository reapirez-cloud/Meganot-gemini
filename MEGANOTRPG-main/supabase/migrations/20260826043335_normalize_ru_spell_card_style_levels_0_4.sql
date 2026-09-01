-- Normalize early cantrip mechanics to the second-person singular used by the rest of the reference.
update public.spell_catalog
set effect_summary = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(effect_summary,
  'Совершаете','Совершаешь'),
  'Создаёте','Создаёшь'),
  'Выбираете','Выбираешь'),
  'Касаетесь','Касаешься'),
  'Выпускаете','Выпускаешь'),
  'Метаете','Метаешь'),
  'Стреляете','Стреляешь'),
  'Наполняете','Наполняешь'),
  'Запускаете','Запускаешь'),
  'Указываете','Указываешь'),
  'шепчете','шепчешь'),
  'слышите','слышишь'),
  'используете','используешь'),
  'вашего','твоего'),
  'вашему','твоему'),
  'вашей','твоей'),
  'вашу','твою'),
  notes = replace(replace(replace(replace(replace(replace(replace(notes,
  'вашего','твоего'),
  'вашему','твоему'),
  'вашей','твоей'),
  'вашу','твою'),
  'от вас','от тебя'),
  'если вы снова','если ты снова'),
  'если вы накладываете','если ты накладываешь')
where spell_level = 0;

update public.spell_catalog
set effect_summary = replace(effect_summary, 'до конца вашего следующего хода', 'до конца твоего следующего хода')
where spell_level = 0;

update public.spell_catalog
set effect_summary = 'При провале зверь получает состояние Очарованный на 24 часа. Эффект заканчивается, если цель получает урон от тебя или твоего союзника.'
where slug = 'animal-friendship';

update public.spell_catalog
set notes = 'Нельзя предлагать очевидно вредное для цели или её союзников действие. Эффект заканчивается, если цель получает урон от тебя или твоих союзников.'
where slug = 'suggestion';

update public.spell_catalog
set notes = 'Эффект заканчивается, если цель получает урон от тебя или твоих союзников. После окончания цель знает, что была очарована тобой.'
where slug = 'charm-monster';

update public.spell_catalog
set effect_summary = 'При провале Зверь становится Очарованным. Пока ты и цель находитесь на одном плане, у тебя есть телепатическая связь: без действия отдаёшь команды, которые он выполняет. Чтобы приказать цели использовать Реакцию, тратишь собственную Реакцию.'
where slug = 'dominate-beast';

update public.spell_catalog
set notes = replace(notes, 'Для оружия, брони и других изделий высокой сложности нужна владение', 'Для оружия, брони и других изделий высокой сложности нужно владение')
where slug = 'fabricate';
