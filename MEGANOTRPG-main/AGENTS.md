# MEGANOTRPG agent instructions

These instructions are for coding agents and developers working in this repository. They are part of the repository contract, not player-facing documentation.

## Branch discipline — mandatory for all work

- **All active development starts and stays on `dev` by default.** This applies to every subsystem.
- Do not implement, patch, refactor, document, or otherwise write active development changes directly to `main`.
- Do not merge, copy, cherry-pick or promote `dev` changes to `main` unless the user explicitly asks for that promotion in the current conversation.
- A request to implement/fix/change something is **not** permission to update `main`.
- A request such as “залей в main”, “слей в main”, “перенеси в main”, or another unambiguous release instruction is required before touching `main`.
- When the user asks to inspect, audit, discuss or implement without explicitly authorizing `main`, work against `dev` and leave `main` unchanged.
- Repository instruction/documentation changes follow the same rule.

This branch rule has priority over older task-specific habits or prior requests to push directly to `main`.

Active class / Character Engine work is done on `dev` unless the user explicitly authorizes promotion to `main`.

## Patch journal — mandatory release ledger

`docs/PATCH_LOG.md` is the canonical journal for the patch currently accumulating on `dev`.

Every coding agent MUST follow this lifecycle:

1. **Any user-requested implementation on `dev` belongs to the current Active patch.** Before finishing the task, update `docs/PATCH_LOG.md` in the same work unit with the meaningful player-facing, runtime, architecture, migration, test, or bug-fix changes that were actually made.
2. Keep the journal concise and outcome-oriented. Group related commits into one patch note instead of dumping commit messages. Do not record plans or claims that are not implemented.
3. If a task is audit/read-only and changes no repository state, it does not need a patch-log entry.
4. Before an explicit promotion to `main`, compare `main...dev` and reconcile the Active patch against the real diff so the journal does not omit work accumulated by earlier agents or conversations.
5. An explicit user instruction to promote/merge/push to `main` means **the current patch is finished**. Before promotion, mark the Active patch `RELEASED`, record the release date and the target `main` commit/release identity when known, and move its notes under `Released patches`.
6. Promote only the closed patch to `main` under the branch-discipline rules above.
7. **After successful promotion**, return to `dev` and immediately create the next empty `Active patch` section with status `OPEN`, a new patch id/date, and the new `main` base SHA. New development must never be appended to the patch that was just released.
8. If promotion fails, do not open a new patch. Keep the current patch open/releasable and record the failure only if it materially affects release state.
9. Never rewrite released patch history to make later work appear as if it shipped earlier. Corrections after release belong to the next Active patch.

The patch journal is part of task completion, not optional documentation. A code change on `dev` that should be user-visible in release history is incomplete until the Active patch reflects it.

## Named engine architecture — read before audits

Before auditing or changing gameplay, classes, resources, rests, preparation, inventory, character/NPC storage, sheets, world data, locations or maps, read:

- `docs/ENGINE_ROADMAP.md`
- `docs/ENGINE_CONTRACTS.md`
- `docs/ENGINE_CLOSURE_DEFINITION.md`
- `docs/ORACLE_ENGINE_CONTRACT.md`

The named-engine ownership boundaries are intentional:

- **CE — Character Engine:** pure deterministic `base + state + contributions -> resolved` calculator. No persistence or I/O.
- **GENA — Game State / Session Engine:** normal player gameplay/session orchestrator and command-correlation boundary. GENA does not own character, inventory, world or definition state and is not the GM control plane.
- **ORACLE — GM Control Engine:** imperative GM hands. `GM Cabinet -> Oracle -> explicit owner`. Oracle stores nothing and MUST NOT call GENA.
- **CHEBURASHKA — Inventory Engine:** owns concrete inventory instances/state and exposes only a mechanical projection to character resolution.
- **SHAPOKLYAK — PC/NPC Character Owner:** owns entity identity, lifecycle, assignment, visibility and canonical character mechanics/runtime state such as explicit HP, template assignments, suppressions, character spells/features and persistent character resources.
- **LARISA — Location / World Engine:** owns world topology, sections/links, discovery, placement, scenes, chronology and NPC habitats. Time has no automatic mechanical consequences.
- **CHASOVOY — Reference / Definition Engine:** owns reusable class/subclass/spell/item/feat/condition definitions and revisions. Concrete instances/state remain with their runtime owner.
- **TOBIK — Roll Engine:** owns authoritative dice planning/resolution and returns structured results; it never applies HP or judges the scene.

### Mandatory command-path split

Normal gameplay:

```text
Player / gameplay UI -> GENA -> authoritative owner/storage boundary -> canonical state
```

Explicitly permitted self-owned player operations may call a narrow owner facade directly when no gameplay/session orchestration is needed; server-side assignment/permission checks remain mandatory.

GM canonical writes:

```text
GM -> GM Cabinet -> Oracle -> explicit owner -> canonical state
```

**Never route a GM reality mutation through GENA. Never let React write canonical gameplay state directly because a button is hidden.**

### Account role and authority model — do not collapse these concepts

Campaign membership has two independent dimensions:

- `role` is the member's ordinary campaign role: `player` or `gm`;
- `is_owner` is the campaign owner/admin authority flag.

**Owner/admin is not a third mutually exclusive role.** A member may be `role = "player"` and `is_owner = true` at the same time. That person must be able to own/activate/play an assigned PC exactly like a player while also having manager authority equivalent to a GM for campaign administration and GM control surfaces.

The application permission invariant is:

```text
isGm = member.role === "gm"
isOwner = member.is_owner === true
canManage = isGm || isOwner
```

The server invariant is the same: campaign-management permission is granted when `is_owner = true OR role = 'gm'`.

Do not:

- turn owner/admin into an exclusive `admin` role that erases player identity;
- assume a manager cannot have an assigned or active PC;
- gate GM-management UI only on `isGm` when `canManage` is the intended permission;
- use character assignment to infer account authority;
- use account role to infer which PC a member may own.

Only owner/admin may change another member's campaign role. Being a GM does not automatically make someone the owner. Private `Только я` data must continue to respect its separate creator/visibility rules even between managers.

### Mandatory character-resolution path

Character-affecting owner commit:

```text
owner canonical state
-> CharacterResolutionBus / cross-client refresh hint
-> one Character Runtime Resolver
-> CE
-> one ResolvedCharacterContract
-> Sheet / Chat / Revolver
```

Do not create a second CE assembly path in a UI surface. `useResolvedChatActor` is a compatibility alias of the shared runtime, not a second resolver. Supabase Realtime is refresh transport, not canonical engine communication.

**The GM is the final scene rules engine.** Application engines handle bookkeeping and explicit machine-owned state; they do not enforce transient scene legality such as turn economy, target validity, range, line of sight, Echo position/presence, aura membership, or whether a declared action makes tactical/narrative sense. Do not report missing scene simulation as a mechanics defect unless the application explicitly owns that state.

For class audits, focus on machine-owned correctness: resource counts/costs/recharge, stored choices and refresh cadence, preparation results, class/subclass ownership and level semantics, canonical mutations, action/resource survival through migrations, and fresh CE reconstruction after mutations.

## Before touching character mechanics

If a task affects any of the following, read `docs/CHARACTER_ENGINE_CONTRACT.md` first:

- `src/character-engine/**`
- character sheet / character profile
- chat actions or chat character data
- inventory, equipment, item actions or item effects
- classes / subclasses / class features
- spells / spell slots / casting
- resources, rests, HP, saves, skills or derived stats
- GM-granted character features/effects

Also read `src/character-engine/README.md` before modifying the pure engine itself.

## Character Engine boundary

Character Engine (CE) is the calculation source of truth for one supplied character snapshot. Canonical state remains in its owning engines; UI consumes resolved CE data instead of re-parsing rule prose.

CE is a calculator, not a persistent resource ledger, virtual GM or world-state simulator. Persistent character mechanics/runtime facts belong to Shapoklyak; inventory-instance facts belong to Cheburashka; reusable definitions belong to Chasovoy; world facts belong to Larisa. GENA may orchestrate normal gameplay commands that change those facts but does not become their owner.

Never invent authoritative state for scene facts the application does not track (weather, line of sight, whether a hit occurred, whether a corpse is nearby, once-per-turn without real turn tracking, and similar fiction/runtime facts).

## Generic mechanics before source-specific mechanics

Before adding a class, subclass, race, feat, item or other source-specific subsystem, check whether the behavior belongs in a generic CE/template/runtime primitive.

Do not create a second choice runtime for feats, a class-specific resource engine, or UI-only mechanical truth when the same behavior can be represented through shared rule-template / CE infrastructure.

If a needed generic primitive does not exist, add the primitive first, document it beside the implementation, and then bind sources to it.

## Persistent choices

The canonical persistent choice runtime is `RuleChoiceDefinition.selection_mode = "player_once"` plus `resolveTemplateChoiceStates()` and the server RPC `commit_character_template_choice_v1`.

- `player_once` is opt-in. Existing choices remain manager-owned unless explicitly migrated.
- Player confirmation is explicit; selecting an option in UI must not silently lock it.
- Confirmed player selections are append-only. A later `count_by_level` increase may open only the missing slots; previous selections remain fixed.
- `requires_choice`, option unlock levels, counts, source levels and option membership are server-validated.
- GM/admin correction is an explicit administrative override, not ordinary player respec.
- Future feats and other sources with “choose one / choose N” clauses must reuse this runtime rather than inventing another selection system.

Before changing choices, read `src/rule-templates/AGENTS.md` and `src/rule-templates/CHOICE_RUNTIME.md`.

## Generic primitives still expected before large feat expansion

When a rule requires one of these behaviors, implement it generically rather than hardcoding the first feat/class that needs it:

1. **Dynamic option providers** — options derived from resolved CE state/catalog data, e.g. “choose a skill you are proficient in” or a spell from a specific list.
2. **Structured prerequisites** — character-owned requirements such as level, ability score, proficiency, spellcasting, an owned feature/source, or another feat. Scene/fiction requirements remain prose.
3. **Uniqueness / exclusion constraints** — “cannot choose an option already owned”, mutually exclusive selections, repeatable-vs-nonrepeatable sources, and cross-source duplicate policy.
4. **Allocation choices** — bounded numeric allocation such as `+2 to one ability` or `+1/+1 to two different abilities`, without enumerating fake combination options.
5. **Explicit change policy** — permanent, GM-only correction, or a real rule-defined respec cadence. Do not make choices freely mutable just because UI can edit JSON.
6. **Multi-stage dependent choices** — later selections may depend on earlier selections while using the same generic choice state/runtime.
7. **Feat source integration** — feats should become first-class CE/template sources and emit the same native contributions as classes/subclasses; do not model them as unrelated ad-hoc UI features.

Do not prebuild speculative mechanics that no rule needs yet. Add these primitives when the first real rule requires them, but add them generically at that time.

## Class/subclass work

Before changing class/subclass mechanics or presentation, read:

- `src/rule-templates/AGENTS.md`
- `src/rule-templates/CLASS_INTEGRATION_NOTES.md`
- `src/rule-templates/CLASS_WORK_STATUS.md`

Class mechanics are not READY merely because code exists. Follow the package quality gate, source-level semantics, server-authoritative resource mutation rules, and deployed-state verification defined there.

## New canonical mutation checklist

Before adding a write path:

1. identify the canonical owner;
2. add or reuse the owner command/server boundary;
3. for GM writes, expose it through Oracle rather than calling Supabase from GM React;
4. for normal gameplay, route through GENA when correlation/history is needed;
5. preserve a stable `commandId` when retries could duplicate mutation/resource spending;
6. request fresh character resolution after a mechanical owner commit;
7. verify reload reconstructs the same canonical result;
8. add a regression test that prevents the old bypass from returning.

## Keep instructions discoverable

Architecture rules that materially affect future implementation must live in repository instructions/docs adjacent to the relevant code, not only in chat, commit messages or temporary plans. Keep short pointer comments in central implementation files so an agent opening the code is directed to the full contract.
