# INTERNAL: Class work status ledger

> **REQUIRED MAINTENANCE FILE — developer/agent only. Never render or import this file into player UI.**
>
> This is the canonical checkpoint for class/subclass work. A text pass and a mechanics/runtime pass are separate closures. Never infer one from the other.

## Status rules

Allowed statuses:
- `NOT_STARTED` — work has not begun.
- `NOT_AUDITED` — implementation may exist, but no formal audit has started.
- `IN_PROGRESS` — layer is currently being built/audited or has known blockers.
- `READY` — the declared layer was explicitly audited with no known blockers in scope.
- `BLOCKED` — work cannot proceed until an external blocker is resolved.

When class/subclass content changes, update this file in the same work session. **TEXT READY does not mean MECHANICS READY.**

### Branch discipline

- Active class/runtime cleanup is performed on `dev`.
- Do not write class work directly to `main` unless an explicit merge/release step is requested.
- A mechanics layer is not `READY` merely because it exists in Git: the target deployment/database state must be audited separately.

---

## Canonical Reynar Voss voice

- `source: src/data/vossVoice.ts`
- `class_card_order: authorExplanation ("Восс объясняет") -> exact neutral rule -> authorComment ("Комментарий Восса")`
- `authorExplanation: in-world Voss observation/story; never a simplified mechanics paragraph`
- `authorComment: short personal Voss note after the exact rule; never a second rule block`
- `class_nuances: REMOVED — classes and subclasses do not render or store a separate "Нюансы Восса" layer`
- `exact_rule_boundary: all triggers, costs, targets, dice, ranges, durations, limits and adjudication belong to the exact rule, not narrator copy`
- `spell_boundary: class/subclass cleanup must not silently rewrite spell reference data or spell-specific authoring behavior`

---

## Mechanics/runtime audit contract

A class or subclass mechanic is not considered integrated merely because a feature description exists.

`GM_ADJUDICATION_BOUNDARY.md` is part of this contract. A precise rule can be mechanically complete with GM-adjudicated execution when the app does not own the required scene/action/transaction state. Do not treat missing bespoke automation for such a rule as a mechanics blocker.

For mechanics `READY`, the end-to-end path must be verified:

1. `rule_templates / rule_template_levels / persistent choices` grant the mechanic at the correct effective class level.
2. `characterTemplateContributions()` emits native `CharacterContribution` entries.
3. Character Engine resolves them into the correct contract section:
   - active ability -> `ResolvedAction` when the app has an actionable/rollable surface to expose;
   - finite pool -> `ResolvedResource`;
   - class/subclass spell -> `ResolvedSpellAccess`;
   - passive/triggered behavior -> native numeric/capability contribution or `ResolvedMechanicalRule.integration === "structured"` when CE owns the relevant character-side fact;
   - proficiency/resistance/immunity/sense/language -> corresponding CE capability.
4. `CharacterClassPanel` presents the resolved source without inventing mechanics from prose.
5. Every Class-tab entry has a stable machine category from `ClassMechanicEntryType`; display text never determines sorting type.
6. Resource-backed actions can persist their resource change through the class runtime RPC. Resource-less actions may remain repeatedly invokable; Action/Bonus Action/Reaction and per-turn legality are adjudicated by the GM unless a separate authoritative runtime exists.
7. The deployed Supabase state must contain the same intended mechanical stack as the release target. Git-only implementation is not enough for `READY`.

Current stable presentation categories:
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

`reference_rule` is intentionally not proof of mechanical integration. It means the class tab can show the rule, but CE has no fully structured passive contract for that feature itself.

---

## Fighter (`class:fighter`)

**Text:** `READY`  
**Mechanics/runtime:** `IN_PROGRESS`

- `last_text_audit: 2026-08-29`
- `last_mechanics_audit_started: 2026-08-29`
- `class_tab_source: resolved CE contract through classPresentation.ts`
- `class_tab_type_contract: ENABLED_2026_08_29`
- `current_dev_runtime: substantial native runtime exists for base Fighter and subclasses through precision/completion/choice/Psi migrations and dedicated runtime tests`
- `production_catalog_reset: APPLIED_2026_08_29`
- `production_latest_observed_migration: 20260829184828_remove_legacy_builtin_classes`
- `production_runtime: still not certified as equivalent to the current dev mechanical stack; historical migration ordering drift remains`

### Mechanics audit targets

- Base Fighter: Second Wind, Action Surge, Tactical Mind, Tactical Shift, Indomitable, weapon mastery branches, Extra Attack scaling and ASI/feat choices.
- Arcane Archer: Arcane Shot choice options and shared use pool.
- Battle Master: superiority dice, maneuver selection, maneuver actions/effects and recovery.
- Cavalier: mark/protection/reaction behavior and finite uses where applicable.
- Echo Knight: echo creation/state, Unleash Incarnation and echo-dependent actions.
- Eldritch Knight: class spell access, preparation/replacement and shared slot accounting.
- Psi Warrior: Psionic Energy pool plus Protective Field, Psionic Strike, Telekinetic Movement and later actions.
- Rune Knight: rune choices, activations, Giant's Might resources and scaling.
- Samurai: Fighting Spirit uses and later action economy.
- Champion/Banneret: passive/numeric and shared-resource riders must resolve as CE mechanics rather than prose only.

Action/Bonus Action/Reaction availability, per-turn attack counts and other turn-economy legality in Fighter features are GM-adjudicated under `GM_ADJUDICATION_BOUNDARY.md`; they are not reasons to add a turn tracker.

Do not promote Fighter mechanics to `READY` until dev and the intended deployed state pass the same audit.

---

## Druid (`class:druid`)

**Text:** `READY`  
**Mechanics/runtime:** `IN_PROGRESS`

- `last_text_audit: 2026-08-29`
- `last_mechanics_audit_started: 2026-08-29`
- `class_tab_source: resolved CE contract through classPresentation.ts`
- `class_tab_type_contract: ENABLED_2026_08_29`
- `current_dev_runtime: native Druid runtime/resource completion migrations and dedicated runtime tests exist`
- `production_catalog_reset: APPLIED_2026_08_29`
- `production_latest_observed_migration: 20260829184828_remove_legacy_builtin_classes`
- `production_runtime: still not certified as equivalent to the current dev mechanical stack; historical migration ordering drift remains`

### Mechanics audit targets

- Wild Shape: pool, recovery, transformation state, beast HP/stat replacement, overflow damage, duration, equipment and retained features.
- Wild Companion: alternative cost through Wild Shape or spell slot and class-tab action visibility.
- Spellcasting/preparation and class spell access.
- Primal Order, Elemental Fury and persistent branch choices.
- Wild Resurgence and Archdruid resource conversions.
- Circle of Land: daily land choice, always-prepared spells, Land's Aid and Nature's Ward.
- Circle of Stars: Star Map, Starry Form, Cosmic Omen and mode/resource state.
- Circle of Sea: Wrath of the Sea, aura ownership/radius and later upgrades.
- Circle of Wildfire: spirit creation/control/stat block and spirit-dependent actions.
- Dreams/Shepherd/Spores/Moon: finite pools, summoned/created creature hooks, reaction limits, temporary HP/aura behavior and subclass unlock compatibility.
- Legacy 2/6/10/14 rows must remain gated by the actual parent subclass unlock until deliberately normalized.

Scene legality, reaction/action availability and `once per turn` execution remain GM-adjudicated unless the application later gains an explicit authoritative turn/runtime system.

Do not promote Druid mechanics to `READY` until dev and the intended deployed state pass the same audit.

---

## Cleric (`class:cleric`)

**Text:** `READY`  
**Mechanics/runtime:** `IN_PROGRESS`

- `last_text_audit: 2026-08-29`
- `last_mechanics_audit_started: 2026-08-29`
- `class_tab_source: resolved CE contract through classPresentation.ts`
- `class_tab_type_contract: ENABLED_2026_08_29`
- `current_dev_runtime: exact rules and spell/resource structure exist, but full fourteen-domain runtime coverage is not yet certified`
- `production_catalog_reset: APPLIED_2026_08_29`
- `production_latest_observed_migration: 20260829184828_remove_legacy_builtin_classes`
- `production_runtime: still not certified as equivalent to the current dev mechanical stack; historical migration ordering drift remains`

### Mechanics audit targets

- Base Cleric: cantrips/prepared spells/slots, Divine Order choice, Channel Divinity pool/recovery, Divine Spark, Turn/Sear Undead, Blessed Strikes persistent branch, Divine Intervention recovery.
- Domain spell groups: always-prepared source identity and shared slot spending.
- Nested Divine Order/Blessed Strikes choices: persistence and level gating.
- Every Wisdom/PB-scaled finite pool and reaction must have a real CE resource when uses are finite.
- Every Channel Divinity domain action must consume the shared canonical Channel Divinity resource.
- Arcana/Death/Forge/Grave/Knowledge/Life/Light/Nature/Order/Peace/Tempest/Trickery/Twilight/War must each be audited source-group by source-group.
- Legacy domain rows below class level 3 must be blocked by subclass unlock and must never grant early mechanics.

Reaction/action availability and scene-trigger validity remain GM-adjudicated; CE owns the finite pools and durable character-side results it can actually know.

Do not promote Cleric mechanics to `READY` until dev and the intended deployed state pass the same audit.

---

## Wizard (`class:wizard`)

**Text:** `READY`  
**Mechanics/runtime:** `IN_PROGRESS`

- `last_text_audit: 2026-08-31`
- `last_mechanics_audit_started: 2026-08-31`
- `last_dev_runtime_audit: 2026-08-31`
- `rules_revision: Player's Handbook 2024 base class`
- `subclasses: WAVE_0_CONTRACT_READY_CONTENT_NOT_INCLUDED`
- `subclass_wave_0: READY_2026_08_31`
- `subclass_supported_count: 13`
- `subclass_contract: src/rule-templates/wizardSubclasses.ts`
- `subclass_contract_regression: tests/wizardSubclassWave0.test.ts`
- `dev_base_class_runtime: READY_PENDING_TARGET_DEPLOYMENT`
- `dev_ci: GREEN_RUN_1152`
- `current_dev_text: clean Russian base-class package with exact rules and separately authored Voss narration for every openable feature card`
- `current_dev_runtime: physical spellbook and book-gated preparation are implemented; authoritative spellbook progression, parser-owned full-caster slots, prepared-cast enforcement, Ritual Adept, Arcane Recovery, Memorize Spell, Spell Mastery, Signature Spells and the agreed Gena/manual-choice boundaries are implemented and regression-gated in dev`
- `spellbook_regression: tests/wizardSpellbookRuntime.test.ts`
- `spellbook_progression_regression: tests/wizardSpellbookProgressionRuntime.test.ts`
- `arcane_recovery_regression: tests/wizardArcaneRecoveryRuntime.test.ts`
- `completion_regression: tests/wizardCompletionRuntime.test.ts`
- `production_runtime: NOT_DEPLOYED_OR_CERTIFIED`
- `catalog_bootstrap: dev migration preserves class:wizard and installs the clean base class for new campaigns`
- `gm_adjudication_policy: FOUND_SPELL_TRANSCRIPTION_AND_SIMPLE_SHEET_CHOICES_ARE_MANUAL_BY_DESIGN`

### Dev base-class closure

- Spellbook as authoritative owned-spell state: physical item identity, held-book access, six starting level-1 spells and two additional eligible Wizard spells per later Wizard level are implemented and regression-gated.
- Prepared Wizard spells are selected only from the actual held spellbook and obey the fixed 2024 prepared-spell progression. Spell Mastery and Signature Spells remain always prepared and are excluded from the ordinary Gena preparation quota.
- Full-caster spell-slot capacity is emitted as native CE resources through the shared parser-owned slot primitive. Ordinary Wizard slot casting now requires preparation and uses the canonical slot-resource path.
- Ritual Adept is implemented in dev: an eligible ritual in the currently held physical Wizard spellbook exposes a no-preparation, no-slot ritual method; losing access to that book removes the ritual access from the next CE snapshot.
- Arcane Recovery: implemented in dev with one long-rest resource, GM-authoritative Short Rest window, `ceil(Wizard level / 2)` weighted recovery budget, level-5 ceiling, spent-slot validation and shared `spell_slot_N` persistence.
- Memorize Spell is implemented in dev through the authoritative Short Rest window and can replace one eligible prepared level-1+ Wizard spell with another eligible spell from the actual held spellbook.
- Spell Mastery is implemented in dev with one level-1 and one level-2 held-book selection, Action casting-time validation, always-prepared access, true no-resource lowest-level casting and at most one mastered-spell replacement after each Long Rest.
- Signature Spells are implemented in dev with two level-3 held-book selections, always-prepared access, separate free-cast resources and independent Short/Long Rest recovery. Player replacement after the initial selection is not allowed.
- Long-rest cantrip replacement and cantrip progression use the agreed Gena notice → player tells GM → normal sheet edit path. This durable result is stored in the ordinary character spell state; no Wizard-specific choice engine is required.
- Scholar uses the agreed informational path: Gena tells the player that Scholar is available; the player chooses an eligible already-proficient skill and asks the GM to raise it to Expertise through the ordinary sheet editor. No dynamic Wizard option provider or feature-specific RPC is required.
- ASI and Epic Boon do not receive a Wizard-specific picker. They use the generic feat/allocation contract when available or the normal GM sheet-edit path; lack of Wizard-specific automation is not a base-class runtime blocker.
- Found-spell/scroll transcription, its gold/time procedure, consuming/removing the source, replacement of a lost book and backup-book narrative handling are **GM-adjudicated by design**. The GM uses normal inventory/currency/spellbook tools and CE/Gena stores the durable result.
- Action/Bonus Action/Reaction legality and per-turn cadence inside Wizard rules remain GM-adjudicated under `GM_ADJUDICATION_BOUNDARY.md`; CE exposes real resources/access but does not create a turn tracker.
- The rebuilt base class remains independent of subclass content; Wizard subclass infrastructure and package gates are tracked separately below.

### Wizard subclass Wave 0

- Wave 0 defines exactly thirteen supported Wizard subclass identities in `wizardSubclasses.ts`; it does **not** install empty or unfinished subclass rows into the player-visible catalog.
- Every future Wizard subclass package must attach to the active `class:wizard` template, use subclass unlock level 3, and place its compatibility feature rows only at Wizard levels 3/6/10/14.
- The generic template resolver remains authoritative for effective subclass level. A stale/high subclass assignment or high total character level cannot unlock subclass mechanics before the parent Wizard reaches the required level.
- The four PHB 2024 identities (Evoker, Diviner, Illusionist, Abjurer) replace their same-school 2014 variants rather than creating duplicate subclasses.
- Older supported schools and supplement subclasses keep their original rules package but use the Wizard 2024 compatibility schedule: a former level-2 subclass entry feature is exposed at Wizard level 3; later 6/10/14 rows retain their levels.
- Stable catalog keys and visual keys are reserved for all thirteen packages so later migrations/UI do not infer identity from translated display names.
- No Wizard-specific subclass engine, turn tracker, scene-state machine, or bespoke choice runtime was added. Each subclass feature still follows the normal CE-owned vs GM-adjudicated boundary.
- Regression `tests/wizardSubclassWave0.test.ts` guards identity uniqueness, PHB replacement policy, parent linkage, unlock level, allowed feature levels and multiclass/effective-level gating.

### Remaining certification blocker

- Apply the intended `dev` migration stack to the target Supabase deployment and re-audit the deployed database/runtime against the same Wizard regressions and integration contract.

Do not promote Wizard mechanics to `READY` until the target deployed state is applied and audited. There are no known `dev` base-class runtime blockers; subclass content begins with Wave 1 and is not yet claimed complete.

---

## Legacy builtin catalog reset

**Status:** `REMOVED_2026_08_29`

The previous generic implementations of these builtin classes and all of their attached subclasses were deliberately deleted from the live catalog and are not considered reusable implementation state:

- Artificer
- Bard
- Barbarian
- Warlock
- Wizard
- Monk
- Paladin
- Rogue
- Ranger
- Sorcerer

Reason: the old packages mixed useful fragments with generated summaries, vague descriptions and incomplete CE integration. Future work on these classes starts from a clean package and may consult historical migrations only as reference; it must not inherit a completion claim from the removed catalog.

Deletion is represented by the forward-only migration `20260829235500_remove_legacy_builtin_classes.sql`. The production application of that cleanup is recorded as `20260829184828_remove_legacy_builtin_classes`.

Wizard is listed above because that reset is a historical event. Its old generic package remains retired; the clean 2024 base-class text package introduced on 2026-08-31 is a new source and does not revive the removed implementation.

### Historical custom test class

`Жопка` is intentionally **untouched** by this reset. It is a non-builtin historical test/easter-egg class (`is_builtin=false`, no catalog key). Its future visibility/hiding behavior is a separate task and must not be changed as part of legacy builtin cleanup.

---

## Legacy bootstrap garbage audit

**Dev status:** `GUARDED_PENDING_DEPLOYMENT`

Live production inspection on 2026-08-29 found obsolete `campaigns` triggers capable of reinstalling the historical full class/subclass catalog and reapplying superseded Voss layers to newly created campaigns. The dev-only forward migrations now:

- remove duplicate standalone official class/subclass installer triggers;
- retire the removed `Нюансы Восса` trigger;
- retire the rejected mechanics-paraphrase Voss explanation trigger;
- add an assignment-safe final prune that keeps rebuilt builtin Fighter/Druid/Cleric/Wizard;
- install the clean Wizard 2024 base-class text package after the historical seed and before the final prune;
- do not touch custom/non-builtin classes, including `Жопка`.

This guard is **not recorded as applied to production yet**. Do not claim the production bootstrap is clean until that deployment/database step is explicitly completed and re-audited.

---

## Future classes

Removed builtin classes without their own rebuilt section remain `NOT_STARTED` for the new architecture. New implementation must follow `CLASS_INTEGRATION_NOTES.md`, `GM_ADJUDICATION_BOUNDARY.md`, use stable source keys/types, reach CE end-to-end for CE-owned/hybrid state, and pass a package-specific quality/runtime audit before becoming visible as a finished class.