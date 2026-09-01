# MEGANOTRPG reference authoring contract

## Human layer first

Every class, subclass and feature is written first for the player and GM who must resolve the rule at the table without reading application code. A feature card must answer, in this order:

1. **Что это?** One short plain-language explanation of the capability.
2. **Когда использовать?** Exact action economy, trigger and timing window. If it is passive, say so.
3. **Кого или что выбирают?** Target, self, creature, object, weapon, spell, area and range as applicable.
4. **Какие условия должны быть выполнены?** Prerequisites such as a hit, failed roll, Rage, Concentration, weapon type, visibility, line of effect, state or previous choice.
5. **Что тратится?** Resource, charge, spell slot, Hit Die, class die or `ничего`. State the amount and whether the cost is paid before the GM resolves the outcome.
6. **Что бросают?** Attack, ability check or saving throw; name the ability and DC source when the feature uses one. If no roll is required, say so when that might otherwise be ambiguous.
7. **Что происходит?** Exact result on success and on failure, including damage/healing dice, movement, conditions, bonuses, penalties, granted proficiencies/features and any choice between effects.
8. **Сколько длится и как заканчивается?** Duration, Concentration, end trigger, repeat rule, once-per-turn limit and stacking/replacement rule as applicable.
9. **Когда ресурс вернётся?** Short Rest, Long Rest, Initiative, another rule, or never because the feature is passive.
10. **Пример.** One concrete use case only when the complete rule is still easy to misread.

Not every feature needs ten paragraphs. It does need every applicable fact. A sentence such as “расширяет возможности”, “усиливает способность”, “получает новые варианты” or “развивает направление” is not a rule and must not ship as a feature description.

The character sheet may show a compact summary. Tapping the feature opens the complete GM-resolvable rule.

## Authority boundary: GM text vs Character Engine

MEGANOTRPG deliberately separates **bookkeeping** from **adjudication**.

### Character Engine is bookkeeping

Character Engine may determine and expose things that are objectively machine-trackable:

- whether the character currently has the feature;
- whether a required tracked resource exists and has enough remaining uses;
- whether an action is currently available according to tracked prerequisites;
- how many uses, charges or slots are spent;
- how resources recharge or reset;
- passive numeric contributions already represented by generic engine primitives.

When the player activates an ability that costs a tracked resource, Character Engine spends that resource honestly. It does **not** wait for the GM to approve the outcome.

If the GM later determines that the ability misses, the target succeeds on its save, the target was invalid, a required condition was not met, or the attempted effect otherwise fails according to the rule, the spent resource is **not automatically refunded**. A refund happens only if a separate explicit rule says it does.

### GM-facing text adjudicates the outcome

The complete feature description is the human rules contract for resolving the attempt. The GM uses it to determine:

- what the player must declare and when;
- what target is legal;
- what roll or saving throw is required;
- which DC or modifier is used;
- whether the attempt succeeds;
- what happens on success or failure;
- duration, conditions, movement and secondary effects;
- any interaction the engine intentionally does not adjudicate.

Therefore a feature is **not ready** merely because Character Engine can spend its resource. If the GM cannot resolve the whole ability from its text, the feature is incomplete.

## Three separate rules layers

Keep these technical/reference layers distinct:

- **Sheet summary** — very short player-facing explanation of the loop.
- **Reference rule** — complete, original Russian rule text that lets the GM adjudicate the feature. This is authoritative for human resolution of conditions and outcome.
- **Mechanical definition** — structured Character Engine / Roll Engine data for machine-trackable resources, availability, grants, actions, formulas and rolls.

Do not parse prose to calculate Character Engine numbers. Do not expect Character Engine to infer an unmodeled rule from prose. Conversely, do not replace a complete GM rule with a terse dump of structured metadata.

Changing wording alone must never silently change structured resources or numeric mechanics. If a text audit discovers that structured mechanics disagree with the intended rule, record that as a separate mechanics task instead of “fixing” it through prose.

## Рейнар Восс: три обязательных пользовательских слоя

Любая открываемая карточка способности, подкласса, класса или заклинания показывает материал **строго в одном порядке**:

1. **Восс объясняет (`authorExplanation` / `author_description`)** — простыми словами объясняет человеку, который не понял сухое правило, как этим пользоваться. Сначала момент применения и цена/условие, затем практический результат. Это не пересказ всего абзаца и не место для скрытых исключений.
2. **Точное правило (`description`, `rules_text`, facts)** — полный нейтральный текст, по которому игрок и ГМ реально разрешают механику. Здесь живут числа, Сл, кубы, дальности, длительности, ресурсы, успех/провал и исключения.
3. **Комментарий Восса (`authorComment` / `author_comment`)** — личная полевая реплика после правила. Здесь живут характер, сарказм, ирония, цинизм и чёрный юмор; новых правил здесь быть не может.

Если карточка не имеет отдельного `authorExplanation`, она не считается полностью оформленной. `authorComment` никогда не используется как объяснение механики, а `authorExplanation` никогда не заменяет точное правило.

### Канонический характер Восса

Восс — **саркастичный, ироничный, циничный** бывший приключенец, наёмник, проводник и полевой лекарь с привычкой к **чёрному юмору**. Он пишет как человек, который ночевал в мокрых доспехах, зашивал людей у костра и видел достаточно плохих планов, чтобы перестать удивляться. Его сравнения — бой, поход, оружие, кровь, звери, дорога, таверна, могила, костёр и люди, которых пришлось вытаскивать живыми.

Его мировоззрение фиксировано:

- **магия:** полезный результат не делает магию хорошей идеей. Восс считает её опасной, капризной и часто нелепо сложной; признаёт, когда она сработала, но не восхищается самим колдовством;
- **немагические профессионалы:** уважает людей, которые выживают за счёт навыка, оружия, выдержки и подготовки;
- **Воин:** один из любимых типов приключенцев Восса — редкий человек, которому не нужен покровитель или чудо, чтобы остаться в строю;
- **Жрец:** Восс считает жрецов трусоватыми тыловыми проповедниками — любят чужой щит перед собой и слишком быстро вспоминают дорогу к выходу, когда чудеса заканчиваются. Полезность лечения признаёт, уважение к профессии из этого автоматически не следует;
- **Друид:** не доверяет людям, которые могут закончить разговор зверем. **Круг Луны** считает особенно двуличным и опасным: сейчас он милый и его хочется погладить, через минуту он ест вашу руку. Отдельную от вас;
- **чёрный юмор:** раны, смерть, могилы, оторванные конечности и провальные решения допустимы, если шутка звучит как полевая привычка Восса, а не как попытка шокировать.

### Что Восс никогда не говорит

Восс **не бухгалтер, не адвокат, не чиновник, не кадровик, не менеджер и не современный интернет-комментатор**. Его голосу запрещены офисные/юридические/коммерческие шутки и современный игровой сленг вроде:

- профсоюзов, страховок, лицензий, отдела кадров, бухгалтерии, маркетинга, банков, налогов, зарплат, офисов, трудовых договоров, должностных инструкций;
- «баффов», «билдов», «боссов», «статблоков», «слотов», «меню настроек», «продукта», «бренда» и подобных сравнений;
- Character Engine, CE, runtime, миграций, парсера, реализации, интерфейса, редакций правил, совместимости и любой другой истории разработки.

Восс не говорит «в этой кампании», «мы используем» или «мы изменили». Техническая история проекта не существует в его мире.

### Граница авторского комментария

`authorComment` не сообщает новые числа, кубы, Сл, дальности, длительности, ресурсы, уровни или исключения. Если комментарий противоречит точному правилу, комментарий неверен и должен быть переписан. Если объяснение Восса упрощает правило так, что теряется важное условие, неверно объяснение — точное правило остаётся авторитетным.

## Rulesets

- The class baseline is **D&D 2024**.
- Official subclasses/options from supplements are added to the same catalog and normalized into the same format.
- Proprietary book prose is not copied verbatim. Mechanical facts, numbers and conditions are stored structurally where appropriate; reference explanations are original Russian paraphrases.
- Every mechanical definition has a stable `feature_key` and a `ruleset`/source identity so one feature can be replaced without copying a whole class.

### Campaign override already required

For the current campaign:

- **Druid class:** 2024.
- **Wild Shape:** 2014 mechanics.

This is a campaign rules override of the Wild Shape feature, not an `if (class === "druid")` branch in Character Engine.

## Engine contract

Class content describes machine-trackable parts through generic Character Engine primitives: numeric contributions, formulas, grants, resources, actions, conditions, suppression/replacement and spell access. Rollable class actions additionally provide generic Roll Recipes where the application needs a roll button.

Examples:

- Channel Divinity = resource + one or more actions that spend it; the GM-facing text still explains targets, saves and outcome.
- Monk Focus = resource + actions that spend it; spending Focus does not make the GM’s ruling automatic.
- Second Wind = resource + healing action.
- Action Surge = resource + action/feature.
- Bardic Inspiration = resource + action and a level-scaled die.
- Wild Shape = resource/action plus the transformation data represented by the selected ruleset; the reference rule explains how the form is adjudicated.

If a genuinely machine-trackable capability cannot be expressed by the existing primitives, add a **generic reusable engine capability**. Never add behavior named after one class, subclass or spell merely to make Character Engine act like a GM.

## UI rule

The sheet consumes `ResolvedCharacterContract`. It does not recalculate ability modifiers, proficiency, skills, saves, AC formulas, resources or spellcasting DC in React. Optional mechanical sections are rendered only when the resolved contract contains them.

The human loop must remain obvious:

> Восс объясняет → точное правило → комментарий Восса

Inside the exact rule, the adjudication loop remains:

> what I have → when I may try it → what I spend → what the GM checks → what happens → when the resource comes back
