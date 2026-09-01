# Class / Subclass → Character Engine runtime audit

Date: 2026-08-29

This is an internal engineering audit. It is not player-facing rules text.

## Question being audited

For every class/subclass ability, verify the full path:

`class/subclass rule template → character assignment + effective class level → CharacterContribution → Character Engine resolved contract → CharacterClassPanel → persisted class resource runtime when applicable`

A human-readable feature description is **not** proof that CE understands the mechanic.

## Verified shared architecture

### 1. Class/subclass templates really feed Character Engine

`characterTemplateContributions(characterId, characterLevel)` resolves the registered class package and subclass package into native `CharacterContribution[]`.

The resolver:
- applies class base mechanics;
- applies level rows only up to effective source level;
- applies persisted choices and option mechanics;
- gates subclass contributions behind the parent subclass unlock level;
- preserves template provenance in source ids.

The ordinary character engine adapter includes those template contributions in the same CE input as inventory/effects/etc. Therefore class mechanics are not a parallel decorative system.

Status: **VERIFIED**.

### 2. Class tab reads the resolved CE contract

`CharacterClassPanel` receives `ResolvedCharacterContract` and calls `presentClassPackages(...)`. It does not independently infer class mechanics from reference prose.

Status: **VERIFIED**.

### 3. Class tab now has stable machine types

`src/rule-templates/classPresentation.ts` exposes `PresentedTemplateMechanics.entries` with `ClassMechanicEntryType`:

- `special_action`
- `class_spell`
- `resource`
- `passive_rule`
- `reference_rule`
- `proficiency`
- `resistance`
- `immunity`
- `sense`
- `language`

Each entry also has `sourceKind: class | subclass`, `templateId`, label and integration state.

The category is derived from resolved CE output, never from the translated display label. This is the contract future sorting/filtering must use.

Status: **IMPLEMENTED IN MAIN**.

### 4. Class tab no longer hides resolved CE capabilities

Before this audit, the Class tab only surfaced feature/trait grants, resources, actions and spells. CE-resolved proficiencies, resistances, immunities, senses and languages could affect the character while being invisible on the tab.

The tab now presents these as permanent class/subclass effects with explicit type badges.

Status: **FIXED IN MAIN**.

### 5. Class spell vs special action is explicit

Actions resolved by CE are labeled `Особое действие` and typed `special_action`.

Spell accesses granted by a class/subclass are typed `class_spell` and visibly labeled `Заклинание класса` or `Заклинание подкласса` according to source provenance.

This remains separate from manually learned spell ownership.

Status: **FIXED IN MAIN**.

### 6. Runtime button semantics are honest

The existing persisted Class-tab runtime only performs resource-state mutations through the server RPC. It does not pretend to adjudicate target selection, enemy damage, movement, scene geometry or arbitrary conditions.

Therefore:
- a special action with CE-tracked resource costs/effects receives the `Использовать` runtime control;
- a resource-less special action is still shown and typed as an action, but the UI explicitly states that there is no state to spend and the external effect is resolved by the exact rule;
- the UI does not render a fake no-op `Использовать` button.

Status: **FIXED/CLARIFIED IN MAIN**.

## Integration-quality distinction

Feature grants are now classified separately from executable actions/spells/resources.

For passive/triggered feature rules:
- `passive_rule + structured` means CE received an explicit semantic `mechanic.kind` rule contract;
- `reference_rule + summary` means only legacy mechanical summary metadata exists;
- `reference_rule + display` means the feature is currently human-readable reference/provenance only.

This distinction is required for future audits. A `reference_rule` must never be counted as mechanically complete merely because the exact prose is good.

## Current class-family result

### Fighter

Text: **READY**  
Mechanics/runtime: **IN_PROGRESS**

Current `main` contains substantial native Fighter mechanics work:
- base resource/action runtime for Second Wind / Action Surge / Indomitable and related riders;
- Fighter precision/completion migrations;
- persisted selectable option mechanics for archetype choices;
- Psi Warrior runtime finalization;
- dedicated Fighter runtime tests.

However production Supabase observed during this audit does not contain the later mechanical migration stack. The live catalog therefore still exposes several archetype groups as feature prose where current `main` contains or expects additional native choice/action/resource wiring.

Not mechanically READY until main and production are synchronized and all ten archetypes pass source-group audit.

### Druid

Text: **READY**  
Mechanics/runtime: **IN_PROGRESS**

Current `main` contains dedicated native Druid runtime/resource completion migrations and runtime tests, including Wild Shape/Wild Companion oriented resource semantics and modern Circle actions.

The live production catalog observed during this audit is older and still contains several composite Circle features that cannot yet be certified from live CE output as complete native action/resource/structured-rule packages.

Not mechanically READY until main and production are synchronized and Wild Shape plus every Circle passes source-group audit.

### Cleric

Text: **READY**  
Mechanics/runtime: **IN_PROGRESS**

The Cleric catalog has strong exact rule text, spell/resource structure and domain data, but the fourteen domains are not yet proven end-to-end as native runtime packages. Live audit found many domain abilities represented as composite feature rules, and some finite-use actions do not yet prove a canonical matching CE resource pool.

High-priority checks:
- shared Channel Divinity pool and every domain spend;
- Wisdom/PB-scaled finite-use resources;
- Divine Order and Blessed Strikes persisted branch choices;
- always-prepared domain spell source identity and slot spending;
- domain reactions/actions and rest recovery;
- legacy early domain rows remaining gated by the level-3 subclass unlock.

Not mechanically READY.

## Production migration drift found

Observed production Supabase project: `MEGANOTRPG`.

At audit time the newest row in `supabase_migrations.schema_migrations` was:

`20260829151113_voss_spell_style_ability_explanations`

Current `main` contains later/current mechanical work that was not represented in the observed production migration journal, including relevant files such as:

- `20260828180500_druid_native_runtime_completion.sql`
- `20260828184500_druid_resource_runtime_finalization.sql`
- `20260828211500_fighter_precision_pack.sql`
- `20260829060000_fighter_completion_and_ru_audit.sql`
- `20260829061000_selected_choice_template_actions.sql`
- `20260829062000_fighter_psi_runtime_finalization.sql`

Several of these files have version timestamps numerically *older* than the newest migration already recorded in production even though they were added later in repository history. This is a deployment-history problem, not evidence that their logic is absent from `main`.

Do **not** blindly replay or manually mark historical migrations as applied. Production synchronization needs a deliberate migration-history repair or a fresh forward-only consolidation path, followed by CE contract verification.

## Mechanical READY gate

A class family may be changed from `IN_PROGRESS` to `READY` only when all of the following are true:

1. Every active source group is classified as one or more of:
   - executable special action;
   - finite resource;
   - class/subclass spell access;
   - native numeric/capability grant;
   - structured passive/triggered rule;
   - intentionally reference-only rule with an explicit reason why no executable state exists.
2. Every finite-use active ability has a canonical resource and recovery model.
3. Every action resource cost references a resource CE actually resolves.
4. Every persistent choice survives reload and only selected mechanics apply.
5. Class and subclass level gates are verified.
6. Class tab presents all resolved source-owned mechanics and the correct stable type.
7. Resource-backed actions/spells persist resource spending correctly.
8. Production Supabase resolves the same contract as current `main`.
9. Regression tests exist for the package and pass in an environment capable of running them.

Until then, text may be READY while mechanics remain IN_PROGRESS.