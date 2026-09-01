# Named engine architecture marker

> **ARCHITECTURE MARKER FOR CODE/AI AUDITS**
>
> Status: **CLOSURE CANDIDATE — ACTIVE ON `dev`**.
>
> The historical filename remains for discoverability. Read `../docs/ENGINE_ROADMAP.md`, `../docs/ENGINE_CONTRACTS.md`, `../docs/ENGINE_CLOSURE_DEFINITION.md` and `../docs/ORACLE_ENGINE_CONTRACT.md` before refactoring gameplay state, GM controls, classes, rolls, inventory, character/NPC persistence, world locations, maps or time.

## Named engines / control planes

- **CE — Character Engine**: deterministic character resolution from an explicit input snapshot. CE owns calculation only: no canonical storage, queries, persistence mutations, polling or announcements.
- **GENA — Game State / Session Engine**: normal gameplay/session orchestrator and command-correlation boundary. It records gameplay declarations and invokes authoritative owner/storage boundaries. It does not own character/inventory/world/definition state and is not the GM control plane.
- **ORACLE — GM Control Engine**: the GM's imperative hands. `GM Cabinet → Oracle → explicit owner`. Oracle stores nothing, does not decide gameplay legality and MUST NOT call/depend on GENA.
- **TOBIK — Roll Engine**: shared authoritative dice planning/resolution facade. GENA requests/records normal gameplay rolls; Tobik never applies HP or decides scene legality.
- **CHEBURASHKA — Inventory Engine**: concrete inventory/item-instance owner. It owns quantities, equipment, charges and transfers, exposes mechanically relevant projection and directly requests character resolution after mechanical mutation.
- **SHAPOKLYAK — PC/NPC Character Owner**: owns character/NPC existence, identity, assignment, lifecycle, visibility and canonical character mechanics/runtime state including explicit HP, template assignments, suppressions, character spells/features and persistent resources.
- **LARISA — Location / World Engine**: owns persistent world topology, sections/links, discovery, placement, scenes, descriptive chronology and NPC habitats. Time has no automatic mechanical consequences.
- **CHASOVOY — Reference / Definition Engine**: owns reusable class/subclass/spell/item/feat/condition definitions and revisions. Concrete character/item state stays with its runtime owner.

Not every feature needs an engine. **Quest Journal remains a lightweight product module**, not a rules authority.

## Critical command boundary

Engines communicate through explicit contracts/state, never through another engine's UI.

Bad:

```text
Chat UI → Sheet UI → Inventory UI → CE
```

Normal gameplay:

```text
Player / gameplay UI
→ GENA
→ authoritative owner/storage boundary
→ canonical state
→ invalidation when mechanical
→ Character Runtime Resolver
→ CE
→ shared presentation
```

Explicitly permitted player-owned operations may use a narrow owner facade directly when no gameplay orchestration is needed. Server-side ownership checks are still mandatory.

GM authority:

```text
GM
→ GM Cabinet
→ Oracle
→ Shapoklyak / Cheburashka / Larisa / Chasovoy
→ canonical state
→ invalidation/read model
```

Oracle and GENA are parallel entry points. **Never insert GENA between Oracle and the owner.**

## Critical character runtime boundary

There is one application Character Runtime Resolver. Sheet, Chat and Revolver consume its resolved snapshot/contract.

`useResolvedChatActor` is only a compatibility alias of `useResolvedCharacterRuntime`; it is not another character assembler.

Character-affecting owner mutations request resolution directly. Chasovoy definition mutations publish definition events that runtime infrastructure converts to campaign-level invalidation because Chasovoy deliberately does not know concrete usages.

Supabase Realtime is a cross-client refresh hint, not canonical engine transport.

## GM scene authority

The GM is the final scene rules engine and authoritative source of canonical facts.

The application may account for explicit machine-owned state such as charges, costs, recharge, choices, preparation, levels, ownership and persistent resources. It must not invent tactical truth for transient facts it was never told, such as action economy, target validity, range, line of sight, aura membership or whether a declared action makes sense.

**HP is GM-authoritative.** Attacks, damage/healing rolls, spells and item actions do not automatically mutate HP. GM HP correction is a normal path:

```text
GM Cabinet → Oracle → Shapoklyak → canonical HP → character invalidation → resolver → CE
```

**Larisa time is descriptive by default.** Advancing date/time does not itself restore resources, expire effects, apply damage or move NPCs.

## Definition versus instance

```text
Chasovoy: Ash Blade definition D1
Cheburashka: inventory instance I73 → D1, equipped=true, charges=2

Chasovoy: Fighter definition F1
Shapoklyak: character C9 assignment → F1 at canonical class level
```

Do not copy reusable definitions into owner state. Do not move concrete runtime state into Chasovoy.

## Gameplay examples

Normal player consumable:

```text
Player uses grenade
→ GENA correlates gameplay command
→ Cheburashka consumes/removes item instance
→ Cheburashka requests fresh character resolution
→ resolver rereads projections
→ CE resolves
```

GM destroys four grenades directly:

```text
GM Cabinet
→ Oracle inventory command
→ Cheburashka removes/changes instances
→ Cheburashka requests resolution
```

Class/template action retry:

```text
GENA commandId
→ receipt-aware authoritative RPC
→ transaction lock
→ validate/spend once
→ message/roll
→ engine_command_receipts
```

Old template-v1/internal spend RPCs are not client API. Legacy Shapoklyak assignment helpers are sealed behind the owner facade.

## Extension law

For every new canonical write:

1. identify the owner;
2. add/reuse the owner command/server boundary;
3. expose GM writes through Oracle;
4. route normal gameplay through GENA when orchestration/history is needed;
5. preserve idempotent `commandId` correlation when retry could duplicate a mutation;
6. invalidate shared character runtime after mechanical owner commits;
7. render the shared resolved contract rather than creating a new local truth;
8. add a regression test for the ownership path.
