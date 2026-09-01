# Oracle Engine Contract

> Status: **CLOSED — STABLE BOUNDARY ON `dev`**

## Purpose

Oracle is the GM's imperative control plane: the GM sees the world through the GM Cabinet and changes it through Oracle.

Oracle does not own game state. It does not decide what the rules allow. It does not route gameplay through Gena.

The governing model is:

```text
GM
├─ sees through GM Cabinet
└─ changes through Oracle
      ├─ Shapoklyak — characters/entities
      ├─ Cheburashka — inventory instances
      ├─ Larisa — runtime world state and topology
      └─ Chasovoy — definitions/reference content
```

## Core law

**The GM declares the new reality. Oracle tells the owning engine to make that reality canonical.**

Examples:

- "The character now has 3 HP" → Oracle calls Shapoklyak directly.
- "Those grenades are gone from the backpack" → Oracle calls Cheburashka directly.
- "This location is destroyed" → Oracle calls Larisa directly.
- "This custom item definition now exists" → Oracle calls Chasovoy directly.

Oracle does not ask Gena whether the change is legal under gameplay rules.

## Oracle is not Gena

Gena handles gameplay execution and orchestration: what happens when the game system resolves a normal player action.

Oracle handles GM authority: what is true now because the GM said so.

These are parallel entry points. Oracle must never depend on Gena.

```text
normal gameplay                  GM authority

player/gameplay UI               GM Cabinet
       │                             │
       ▼                             ▼
     Gena                          Oracle
       │                             │
       ▼                             ▼
 domain engines                  domain engines
```

A normal player rest may therefore run through Gena. A GM pressing "grant long rest" or forcing a resource recovery runs through Oracle → Shapoklyak. Same canonical state, different authority path.

## Direct-owner rule

Every Oracle method has one explicit domain owner. Oracle does not dynamically choose an engine at runtime.

Examples:

```text
oracle.characters.setHp(...)       → Shapoklyak
oracle.characters.recover(...)     → Shapoklyak
oracle.inventory.remove(...)       → Cheburashka
oracle.world.moveCharacter(...)    → Larisa
oracle.world.createLocation(...)   → Larisa
oracle.world.setNpcHabitat(...)    → Larisa
oracle.definitions.create(...)     → Chasovoy
```

The owner engine remains responsible for:

- persistence;
- technical/domain invariants;
- canonical engine events;
- Character Engine invalidation/resolution requests when its canonical state affects mechanics.

Oracle does **not** emit a duplicate orchestration event. The command keeps the same `commandId`, so the owning engine event remains the durable/correlatable record of the GM change.

## What Oracle may reject

Oracle only accepts `gm` or `system` authority.

After that, Oracle does not enforce gameplay permission rules. Domain engines may still reject technically impossible or structurally invalid requests, for example:

- missing entity id;
- entity from another campaign;
- malformed data;
- impossible persistence operation;
- missing inventory item.

This is a domain integrity failure, not a gameplay-rule veto.

## State ownership

Oracle stores nothing.

- Character/entity canonical state → Shapoklyak.
- Character sheet mechanics, template assignments, suppressions, spells/features and persistent resource state → Shapoklyak.
- Inventory item instances/equipment/runtime → Cheburashka.
- Runtime world positions/discovery/scenes, location topology, sections/links and NPC habitats → Larisa.
- Class/subclass/item/spell/feat/etc. reusable definitions → Chasovoy.
- Derived mechanics → Character Engine, recomputed from canonical inputs.

## Current surface

The Oracle surface exposes the current GM mutation capabilities of all four owners:

- characters: create, update, delete, active assignment, avatar, life state, visibility, NPC reveal, HP, sheet mechanics, spellcasting access, spell/options/features, resources, recovery, template assignment/removal and source suppression;
- inventory: create, update, remove, equip, consume and transfer;
- world: discovery, character position, scene position, participants/sync, location CRUD/visibility/archive/events, location section CRUD, location link CRUD and NPC habitat attachment;
- definitions: create, revise and archive.

A new GM mutation is not added directly to React first. Its owner gets the command and persistence boundary first; Oracle then exposes that owner command to the GM Cabinet.

## GM Cabinet rule

The GM Cabinet should be organized around what the GM sees and wants to change, not around backend engine names.

A character screen may show HP, inventory, position and abilities in one place. Its controls can call different Oracle surfaces under the hood. The GM does not need to know which engine owns each field.
