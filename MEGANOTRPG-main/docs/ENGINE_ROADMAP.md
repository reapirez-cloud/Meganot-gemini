# MEGANOTRPG Engine Roadmap

> Status: **CLOSED — STABLE BOUNDARY ON `dev`**
> Audience: humans and AI agents auditing or extending MEGANOTRPG.
> Branch rule: active development belongs on `dev` until the user explicitly authorizes promotion to `main`.

The named-engine architecture is the stable foundation under continuing product work. Classes, maps, sheets, feats and future UX may keep growing without reopening ownership boundaries by accident.

## Prime laws

1. **The GM is the final scene authority.** The application accounts for explicit machine-owned state; it does not replace the GM with tactical simulation.
2. **One canonical fact has one owner.** UI and orchestration layers never become a second storage authority.
3. **Normal player gameplay enters through GENA. GM reality changes enter through Oracle.** These are parallel control paths.
4. **Oracle never calls GENA.** A GM has already decided what becomes true; Oracle calls the explicit owner directly.
5. **CE is pure.** It receives one explicit fresh input and returns one resolved contract. It performs no I/O and owns no persistence.
6. **Character-affecting owner mutations invalidate the shared character runtime.** Sheet, Chat and Revolver consume that same resolved representation.

## Command paths

Normal gameplay:

```text
Player / gameplay UI
        |
        v
      GENA ---------> TOBIK / authoritative Roll Engine
        |
        +--------> owning domain boundary
                       |
                       v
                 canonical state
                       |
                       v
             character invalidation when mechanical
                       |
                       v
             Character Runtime Resolver
                       |
                       v
                      CE
                       |
                       v
             Resolved Character Contract
                  /       |       \
               Sheet     Chat    Revolver
```

Some explicitly permitted player-owned operations may call the relevant owner facade directly when no session orchestration is required, for example changing the assigned PC's own avatar or an allowed self-owned character setting. Those operations must still be revalidated server-side.

GM authority:

```text
GM
 |
 v
GM Cabinet
 |
 v
ORACLE
 +--------> SHAPOKLYAK
 +--------> CHEBURASHKA
 +--------> LARISA
 +--------> CHASOVOY
                 |
                 v
           canonical state
                 |
                 v
        invalidation/read model
```

Never insert GENA between Oracle and an owner.

## Ownership map

| Engine / control plane | Canonical responsibility |
|---|---|
| **CE — Character Engine** | deterministic `base + state + contributions -> resolved`; no storage |
| **GENA — Game State / Session Engine** | normal gameplay orchestration, declarations/history, command correlation and authoritative execution routing; no domain state ownership |
| **ORACLE — GM Control Engine** | imperative GM command facade; owns no state and performs no gameplay-legality adjudication |
| **TOBIK — Roll Engine** | authoritative dice planning/resolution facade; no HP/resource/world mutations |
| **SHAPOKLYAK — Character Owner** | PC/NPC identity, assignment, lifecycle, visibility and canonical character mechanics/runtime state such as sheet facts, HP, spells, preparation, features, suppressions, template assignments and persistent character resources |
| **CHEBURASHKA — Inventory Owner** | inventory instances, holders, quantities, equipment, charges, transfers and item-instance runtime state |
| **LARISA — World Owner** | location/world topology, sections/links, discovery, positions, scenes, descriptive chronology and NPC habitats |
| **CHASOVOY — Definition Owner** | reusable authored definitions/reference content: classes, subclasses, spells, items, feats, conditions and revisions |

`engine_command_receipts`, event buses and resolution buses are infrastructure. They are not domain owners.

## GM authority is not gameplay simulation

The application must not infer scene legality that was never made canonical. It does not automatically decide:

- action economy;
- valid targets;
- range or line of sight;
- whether an Echo or similar fiction object is currently present;
- aura membership;
- whether a declared action makes narrative/tactical sense;
- damage/healing application to HP merely because dice were rolled.

HP is deliberately GM-authoritative. A roll may say that 12 damage was rolled; that does not mutate HP. If the GM decides a character now has 17 HP, the path is:

```text
GM Cabinet
→ oracle.characters.setHp(...)
→ Shapoklyak persists canonical HP
→ Shapoklyak requests character resolution
→ shared resolver rebuilds
→ CE resolves
→ Sheet / Chat / Revolver refresh
```

## CE — Character Engine

**Architecture status:** stable pure calculation boundary.

CE answers: **“What does this character currently have, given this explicit snapshot?”**

CE may resolve:

- abilities and derived modifiers;
- saves and skills;
- HP supplied by canonical state;
- resources supplied by canonical state and their resolved maxima/availability;
- actions and attacks;
- spell access and casting methods;
- class/subclass/race/feat/item contributions;
- source provenance and suppressions;
- explanations of the resolved result.

CE must not:

- query Supabase, React, chat, inventory or world storage;
- mutate canonical state;
- spend resources;
- roll dice;
- publish invalidation;
- decide scene legality;
- cache another persistent version of the character.

The application has one Character Runtime Resolver that assembles fresh owner state/projections and invokes CE once per resolution.

## GENA — normal gameplay/session engine

**Architecture status:** stable normal-gameplay control plane.

GENA answers: **“What did the player declare, what authoritative gameplay operation must run, and what result/event must be recorded?”**

GENA may coordinate:

- player gameplay declarations;
- chat game events and command correlation;
- authoritative class/action/spell execution;
- resource spending/recovery initiated by normal gameplay;
- item use by calling Cheburashka's authoritative boundary;
- preparation/choice commands through the character-state boundary;
- dice requests through Tobik/the authoritative Roll Engine;
- idempotent command receipts where retries could duplicate a mutation;
- fresh character invalidation after successful mechanical mutations.

GENA does **not** own character resources, spell rows, inventory rows, character identity, world topology or definitions. It orchestrates commands into the owner/storage boundary.

GENA must not:

- accept GM imperative reality edits as its control plane;
- become a tactical rules judge;
- edit another owner's tables as its own state;
- invent dice results outside the authoritative roll boundary;
- ask CE to persist anything;
- rely on a mounted UI component as engine transport.

A normal player consumable flow is:

```text
Player uses item
→ GENA records/correlates the gameplay intention
→ Cheburashka consumes/removes the instance atomically
→ Cheburashka requests character resolution
→ resolver obtains fresh projections
→ CE resolves
→ shared surfaces refresh
```

## Oracle — GM control engine

**Architecture status:** stable GM imperative control plane.

Oracle answers: **“Which explicit owner must make the GM's declared reality canonical?”**

Oracle:

- accepts GM/system authority;
- stores nothing;
- has explicit methods with explicit owners;
- passes the same command correlation context to that owner;
- does not emit a duplicate competing canonical event;
- does not consult GENA for permission.

Examples:

```text
oracle.characters.*  → Shapoklyak
oracle.inventory.*   → Cheburashka
oracle.world.*       → Larisa
oracle.definitions.* → Chasovoy
```

The owner may reject malformed/cross-campaign/impossible persistence requests. That is domain integrity, not a gameplay veto.

## Tobik — Roll Engine

**Architecture status:** stable roll boundary.

Tobik/the authoritative Roll Engine owns requested randomness and structured dice results. Source-specific class/item/spell UI must not invent parallel random logic.

Tobik never:

- applies HP;
- spends inventory/resources;
- decides whether an attack hit as a scene ruling;
- decides whether a roll was narratively allowed.

GENA records/presents the authoritative result for normal gameplay.

## Shapoklyak — PC/NPC and character-state owner

**Architecture status:** stable canonical character owner.

Shapoklyak owns:

- character/NPC existence and identity;
- type, assignment and active/lifecycle state;
- character visibility/source suppression;
- canonical sheet/base mechanics state and explicit HP;
- spells/options/features attached to the character;
- template assignments and selected canonical character sources;
- persistent character resource state and recovery/synchronization boundaries.

Character-affecting commits request fresh resolution. GM writes arrive through Oracle. Explicitly permitted player-owned character commands may reach the owner facade directly and must be checked against assignment/permissions on the server.

## Cheburashka — inventory owner

**Architecture status:** stable inventory instance owner.

Cheburashka owns:

- concrete item instances and holder;
- quantity/stack state;
- equipment and slot state;
- charges and arbitrary item-instance runtime state;
- transfer/consume/remove semantics.

It does **not** own the reusable definition of “Ash Blade”; Chasovoy owns that. Cheburashka supplies only mechanically relevant instance projection to the Character Runtime Resolver. A bottle of beer with no mechanics does not need to enter CE.

Every mechanical inventory diff directly requests fresh character resolution for affected characters.

## Larisa — world owner

**Architecture status:** stable world/topology owner.

Larisa owns:

- locations/zones/world hierarchy;
- location sections and links;
- visibility/discovery;
- character and scene position;
- scene participants/synchronization;
- descriptive campaign/world chronology;
- NPC habitat associations;
- future map topology/runtime state.

GM world changes arrive through Oracle. Larisa time is descriptive by default: changing a date/time does not itself heal, damage, expire effects or move NPCs.

## Chasovoy — definition owner

**Architecture status:** stable reusable-definition owner.

Chasovoy owns one canonical identity/revision chain for reusable definitions. Concrete runtime ownership remains elsewhere.

Examples:

```text
Chasovoy: item definition D1 = Ash Blade
Cheburashka: instance I73 references D1, equipped=true, charges=2

Chasovoy: Fighter definition F1
Shapoklyak: character assignment references F1 at the character's canonical class level
```

A definition revision emits a definition event. Runtime infrastructure maps that campaign-level change to mounted character resolvers; Chasovoy itself does not track which characters use a definition.

GM definition changes use `GM Cabinet → Oracle → Chasovoy`.

## Shared Character Runtime Resolver

There is one read-model assembly boundary for character mechanics.

It reads fresh canonical state/projections, invokes the CE adapter exactly once and returns the resolved snapshot consumed by character surfaces. The shared hook listens to owner invalidation plus Supabase Realtime as a cross-client refresh transport.

Realtime is **not** canonical engine communication. It only tells a client that persisted truth changed and should be reread.

Failure is finite: missing/hung owner reads become an explicit error/stale state rather than indefinite loading.

## Quest Journal — product module, not an engine

Quest Journal remains a lightweight organization feature. GM-authored quests and player personal reminders may link to characters/locations, but changing a journal entry does not automatically mutate character/world/inventory mechanics.

Do not create a new engine unless the feature genuinely owns a canonical rules domain.

## Extension rules

When adding future capabilities:

1. identify the canonical owner first;
2. add the owner command/storage boundary before wiring GM UI;
3. expose GM mutation through Oracle;
4. route normal gameplay orchestration through GENA where session correlation is required;
5. use Chasovoy for reusable definitions and owners for concrete state;
6. request fresh resolution after a character-affecting owner commit;
7. consume the shared resolved contract in Sheet/Chat/Revolver;
8. add an integration/regression test that makes the ownership path auditable.

A feature is not allowed to reopen the old pattern `React → arbitrary Supabase gameplay table → another UI notices later`.
