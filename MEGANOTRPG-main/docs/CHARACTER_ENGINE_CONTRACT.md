# Character Engine Integration Contract

> Status: **CLOSED — STABLE BOUNDARY ON `dev`**

This document defines the application boundary between the pure Character Engine (CE), canonical owners, the shared Character Runtime Resolver and character presentation surfaces.

It is mandatory reading before changing character mechanics, Sheet, Chat, action/revolver UI, inventory contributions, classes, spells, resources or GM-granted character effects.

## 1. One character, one mechanical truth

MEGANOTRPG must not have separate mechanical versions of the same character in Chat, Character Sheet, Inventory or class UI.

The canonical flow is:

```text
SHAPOKLYAK character state --------+
CHEBURASHKA inventory projection --+
CHASOVOY definitions --------------+--> Character Runtime Resolver
other explicit canonical inputs ---+             |
                                                  v
                                      CharacterEngineInput
                                                  |
                                                  v
                                                 CE
                                                  |
                                                  v
                                   ResolvedCharacterContract
                                      /          |          \
                                   Sheet        Chat       Revolver
```

`useResolvedCharacterRuntime` is the shared React adapter. `useResolvedChatActor` is only its backward-compatible alias. A UI surface must not invoke CE again to create another character snapshot.

## 2. CE responsibility

CE is a deterministic calculator over an explicit input. It may resolve:

- abilities/modifiers;
- saving throws and skills;
- HP supplied by canonical character state;
- resource maxima/current availability from supplied state;
- actions/attacks;
- spell access/casting methods;
- class/subclass/race/feat/item contributions;
- source provenance and suppressions;
- renderer-facing capabilities/sections;
- explanations of how a resolved value was produced.

CE must not:

- query Supabase, React, browser state, Chat, Inventory or World;
- persist anything;
- own character resources or HP;
- roll dice;
- spend charges/resources;
- mutate inventory;
- publish invalidation;
- decide transient scene legality.

The pure engine under `src/character-engine/**` remains independent of application infrastructure.

## 3. Canonical ownership around CE

### Shapoklyak owns concrete character state

Shapoklyak owns the character/NPC entity and persistent character mechanics/runtime facts, including:

- identity/type/assignment/lifecycle;
- canonical base sheet facts and explicit HP;
- template/class/subclass assignments on the concrete character;
- source suppressions;
- character spells/options/features and preparation state;
- persistent character resource state/recovery bookkeeping.

GENA may orchestrate a normal gameplay command that spends/recovers or changes these facts. Oracle may command a GM override. Neither GENA nor Oracle becomes the owner.

### Chasovoy owns reusable definitions

Chasovoy owns authored reusable definitions:

- classes/subclasses;
- spells;
- item definitions;
- feats/reusable features/conditions;
- revisions/reference metadata.

A character or item instance stores a reference/runtime state, not another private copy of the reusable concept.

### Cheburashka owns inventory instances

Cheburashka owns:

- concrete item existence in inventory;
- holder/quantity;
- equipped state/slot;
- charges and arbitrary per-instance state;
- consume/transfer/remove semantics.

It combines instance state with the referenced definition and exposes only mechanically relevant inventory projection to character resolution. The full backpack does not become CE input.

### Larisa owns world facts

Location/time/scene state is not CE input by default. Only a deliberate future projection may introduce a world fact into character mechanics.

## 4. Inventory and equipment contract

Possession is not mechanical activation.

Examples:

- sword in backpack: instance exists, but equipped-only action/bonus is inactive;
- sword equipped: equipped contributions/actions may become active;
- grenade authored usable while carried: its use action may be active without equipment;
- GM relic with an explicit carried passive: the passive is active because its definition says so, not because UI guessed from its name.

Activation conditions are authored semantics, never display-name heuristics.

When a mechanical inventory mutation occurs:

```text
Cheburashka canonical mutation
→ mechanical projection changes
→ Cheburashka requests character resolution
→ resolver rereads fresh projection
→ CE
→ all surfaces observe the new contract
```

If an item disappears, its contributions disappear by recomputation. Do not reverse old bonuses manually.

## 5. Resource contract

Persistent character resources have one canonical runtime state owned by the character domain.

Normal gameplay:

```text
Player action
→ GENA authoritative execution
→ character resource owner/storage boundary changes canonical state
→ character invalidation
→ shared resolver → CE
```

GM-forced recovery/correction:

```text
GM Cabinet
→ Oracle
→ Shapoklyak
→ canonical resource state changes
→ character invalidation
→ shared resolver → CE
```

Never keep a Chat-only or Sheet-only counter.

Example:

```text
Second Wind 1/1
player uses it → canonical state 0/1
Sheet = 0/1
Chat = 0/1
normal short rest through GENA restores it according to canonical recovery rules
Sheet = 1/1
Chat = 1/1
```

Resource synchronization/reconciliation must compare semantic state and avoid loops caused only by JSON key order or representation differences.

## 6. Chat is presentation + gameplay intention, not a rules engine

Chat:

1. consumes the shared resolved character contract;
2. classifies/sorts it for action UX;
3. sends explicit gameplay intentions through GENA/authoritative server boundaries;
4. renders resulting canonical events/state.

Chat does not own HP, spell slots, resource counters, equipment state, derived stats or feature-use counters.

Typical flow:

```text
player presses known action
→ Chat identifies canonical resolved action/provenance
→ GENA executes authoritative gameplay command
→ owner/storage boundary commits state if needed
→ invalidation
→ shared runtime resolves again
→ Chat and Sheet render the same result
```

Receipt-aware GENA template action/roll/spell calls use stable `commandId` correlation so a network retry cannot spend twice.

## 7. Chat classification is many-to-many

One resolved entity may appear in multiple presentation groups without duplicating stored mechanics.

Classification uses structured semantics/provenance, not names. Useful dimensions include:

- source kind: class, subclass, race, item, GM feature, other;
- entity kind: spell, action, resource, feature, item action;
- capability/tags: attack, damage, healing, utility, control, movement, social;
- spell level;
- class/subclass provenance;
- item role;
- availability/equipment/suppression state;
- explicit sort order.

A damaging class-granted spell may legitimately appear in Attack, Magic and Class while remaining one canonical spell in the resolved contract.

## 8. Required Chat/action hierarchy

The current action UX keeps deterministic grouped presentation rather than a flat pile.

### Dice / checks

Free dice plus CE-resolved abilities/saves/skills. Chat never recalculates their bonuses independently.

### Attack

May include:

- active weapon attacks;
- damage-capable spells;
- active damaging item actions.

Ordinary equipped weapons belong here as weapon actions, not in a generic item bucket merely because the instance lives in inventory.

### Magic

Spell access/casting is grouped by cantrips/slot channels and uses the canonical resolved casting/resource options. Attack-spell and normal-spell casting must not implement separate slot logic.

### Class

Class and subclass source groups remain mechanically distinct but visually related. Their actions/resources/spells are derived from source provenance in the resolved contract.

### Unique

Race, GM-granted, item and other special sources may be grouped here while still appearing in Attack/Magic if their capabilities also fit those sections.

Stable ordering is equivalent to:

```text
group -> subtype/level -> explicit sort order -> display name
```

Never rely on database row order.

## 9. Multi-action and ambiguous items

If the player selected one specific resolved item action, execute that canonical action.

If the player selected a broad item whose outcome still requires a player/GM choice, Chat should announce/link the item rather than invent a mini rules engine to choose an effect.

The GM remains the scene authority for ambiguous fictional outcomes.

## 10. Character Sheet contract

Character Sheet is another view/editor over canonical state plus the same resolved character contract.

It may organize information differently, but it must not independently rebuild CE mechanics.

Invariant:

> If Chat says a resource is 0/1, Sheet cannot say 1/1 from another local source.

The same applies to HP, equipment effects, spell availability, class feature uses and derived stats.

Editing canonical facts follows ownership:

- GM character edits: `GM Cabinet/UI -> Oracle -> Shapoklyak`;
- GM inventory edits: `Oracle -> Cheburashka`;
- permitted player character edits: narrow player-owner facade with server validation;
- normal gameplay action: GENA when gameplay/session orchestration is required.

## 11. Suppression and recomputation

Suppression is canonical character state, not destructive editing of the source definition.

```text
GM → Oracle → Shapoklyak set source suppressed
→ Shapoklyak persists suppression
→ character invalidation
→ resolver rebuilds
→ CE omits/suppresses affected contributions
```

Removing suppression recomputes from still-existing canonical sources. Do not delete/recreate definitions to simulate disabling mechanics.

## 12. Failure and refresh behavior

Character resolution must terminate. Missing sheet/state or a hung owner read becomes an explicit error/stale condition, never indefinite loading.

Supabase Realtime may tell another client that persisted truth changed. It is a refresh hint only:

```text
Realtime hint → reread canonical owners → shared resolver → CE
```

Realtime payload is not a competing character truth.

## 13. Anti-patterns

Do not introduce:

- name-based mechanical classification;
- one-category-only presentation when semantics are many-to-many;
- entire backpack as active CE mechanics;
- Chat-owned or Sheet-owned resource counters;
- UI-owned derived formulas;
- duplicated casting/roll logic;
- a second CE resolver in a presentation surface;
- GM React code writing canonical gameplay tables directly;
- Oracle calling GENA;
- GENA storing another owner's domain rows as its own truth;
- hidden mount-order registries required to construct character truth.

## 14. Implementation checklist

Before changing CE integration, answer:

1. Who owns the reusable definition?
2. Who owns the concrete mutable state?
3. Does the command enter through GENA, Oracle or an explicitly permitted player-owner facade?
4. What fresh projection must the Character Runtime Resolver read?
5. What belongs in `ResolvedCharacterContract` instead of being recomputed in UI?
6. Does the owner request invalidation after a mechanical commit?
7. Can retry duplicate a spend/mutation, and if so is `commandId` idempotency preserved?
8. Will Sheet, Chat and Revolver observe the same resolved result after reload?
9. Is Realtime only a refresh transport rather than canonical state?
10. Does the change keep CE free of I/O/persistence/outbound commands?

If ownership is unclear, fix the contract/data boundary before patching around it in UI.
