# Rule-template / Character Engine agent contract

This file applies to `src/rule-templates/**` and to work that changes class/subclass/feat choice behavior. Read it before editing the resolver, choice state, template types, class packages, or related migrations.

Also read `CLASS_INTEGRATION_NOTES.md` and `GM_ADJUDICATION_BOUNDARY.md`. For persistent choices, read `CHOICE_RUNTIME.md`.

## Do not fork the architecture per source

Classes, subclasses, future feats, races and other rule sources should converge on the same CE primitives. A new source type may add provenance/lifecycle semantics, but it must not receive a parallel choice engine, resource engine, spell engine or rules parser merely because it is a different source category.

If a real rule exposes a missing capability, extend the generic type/resolver/server contract first. Then express the class/feat through that capability.

## Do not automate the GM

The default boundary is mandatory and lives in `GM_ADJUDICATION_BOUNDARY.md`.

Short version:

- CE/Gena owns durable authoritative character state and deterministic bookkeeping;
- the human GM owns scene legality, action economy and narrative transactions;
- `action`, `bonus_action`, `reaction`, `once per turn`, attack-count legality and similar turn cadence do not justify a turn tracker or runtime blocker by themselves;
- if an action has no separate finite resource, the player may invoke/send it repeatedly and the GM adjudicates which attempts are legal;
- if an action also spends a real finite resource, CE enforces the resource but still does not need to enforce the turn's action economy;
- narrative transactions such as copying a found Wizard spell/scroll, paying gold, consuming the scroll and spending in-world time are GM-adjudicated by default; the GM uses normal tools to mutate the durable result such as inventory, currency or spellbook state;
- exact rules text remains mandatory even when execution is GM-adjudicated;
- lack of bespoke automation for a GM-adjudicated rule is **not** a mechanics gap.

Never create source-specific combat tracking, fake scene flags, transaction mini-systems, or automatic inventory/currency flows merely to make a class feature look more automatic.

## Persistent choice contract

`RuleChoiceDefinition.selection_mode = "player_once"` is the current player-facing permanent-choice primitive.

Canonical path:

1. definition lives in template data;
2. `resolveTemplateChoiceStates()` derives `hidden | pending | locked`;
3. UI drafts selections but does not persist on option tap;
4. user explicitly confirms;
5. `commit_character_template_choice_v1` validates and persists;
6. assignment update flows back into the shared registry;
7. ordinary resolver emits mechanics from the persisted choice into CE.

Required semantics:

- opt-in only; omitted `selection_mode` means manager-owned;
- server validates assignment/source ownership, source level, `count`, `count_by_level`, `requires_choice`, option membership and `option_unlock_level`;
- previously confirmed options cannot be removed or replaced by the player;
- when required count grows, only missing slots reopen;
- dependent stale selections may remain stored but must be inert while dependency is unsatisfied;
- UI and server must resolve the same highest unlocked definition for a repeated choice key;
- stable option identities are stored; UI labels are not mechanical keys.

Do not implement a special "feat choice", "spell choice", "druid choice", or "cleric choice" runtime. Reuse this contract.

## What the next generic choice work should cover

Do not hardcode these inside the first feat/class that needs them. Add a reusable primitive when the first actual rule arrives:

### Dynamic option providers

Static `options[]` is insufficient for rules like:
- choose a skill in which the character is already proficient;
- choose a spell from a catalog/class/list subject to level/school filters;
- choose one currently owned weapon/tool/language/source capability.

The option provider must derive options from authoritative CE/catalog state. The server must reproduce/validate the same eligibility; client filtering alone is not authoritative.

### Structured prerequisites

Support prerequisites only for facts CE actually owns: source/class level, total level when appropriate, ability score, proficiency, spellcasting access, owned feature/source, persisted choice, etc.

Never turn scene fiction into a prerequisite flag just to make UI look automatic.

### Uniqueness and exclusions

Rules need explicit policy for:
- cannot select something already owned;
- selections inside one choice must be distinct;
- mutually exclusive options/sources;
- feat/source repeatability;
- duplicate mechanical grants across independent sources.

Do not infer these rules from display labels or silently rely on Set de-duplication when the rule itself cares about eligibility.

### Allocation choices

Rules such as ability score increases need a bounded allocation model rather than fake enumerated combinations. The model must express budget, per-target cap, distinct-target requirements, and option-specific allowed targets where needed.

### Change policy

Choice mutability must be explicit. Current `player_once` means permanent for the player, with manager correction. If a future rule permits respec on level-up/rest/etc., add a named generic policy with a real authoritative trigger; do not simply make `selected_choices` freely editable.

### Multi-stage choices

Use dependent generic choices for flows like “choose a tradition, then choose spells from that tradition”. Do not build custom wizard components that own mechanics. UI may guide the sequence, but persisted definitions and CE remain authoritative.

## Feats

When feat implementation begins, make feats first-class CE/template sources with provenance and source keys. Feat mechanics should emit ordinary native contributions (numeric grants, proficiencies, spells, resources, actions, choices) through the same resolver path.

A feat is not an excuse to store mechanical behavior only in `features` prose or an isolated UI record.

## Direct code pointer requirement

Central files should retain a short comment pointing here and/or to `CLASS_INTEGRATION_NOTES.md`. Repository architecture decisions must remain discoverable from the code itself, not only from external conversation history.
