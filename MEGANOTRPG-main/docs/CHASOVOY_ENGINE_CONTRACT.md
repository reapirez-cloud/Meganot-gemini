# CHASOVOY — Reference / Canonical Definition Engine

> Status: **CLOSED — STABLE BOUNDARY ON `dev`**

## One sentence

**Chasovoy answers “what is this reusable game concept?” and never “what does Vasya currently have?”**

The concrete wording is intentional: “what does Vasya currently have?” is a character/runtime question, not a reusable-definition question.

Chasovoy is the single ownership boundary for reusable canonical definitions. Other engines store stable references and the concrete runtime state they own; they must not create private definition copies for convenience.

## Owns

- class and subclass definitions;
- race/species/background definitions;
- spell definitions and spell reference metadata;
- item definitions, including GM-created reusable items;
- feat, reusable feature and condition definitions;
- reusable rules/reference definitions;
- stable identity (`id`, `kind`, `scope`, `slug`);
- definition revision history;
- definition visibility/status/source metadata;
- duplicate prevention inside a canonical scope.

## Does not own

Chasovoy has no concrete character or inventory-instance runtime state. It does **not** own:

- character identity/assignment/lifecycle;
- whether a character knows/prepared a spell;
- character class assignment/level on a concrete character;
- current character resources or HP;
- current character suppressions/features/state;
- item ownership, quantity, equipment or current charges;
- location, scene or campaign chronology.

Those facts belong to Shapoklyak, Cheburashka or Larisa. GENA may orchestrate a normal gameplay command that changes such state, but orchestration never transfers ownership to GENA.

## Definition versus instance/state

```text
CHASOVOY
item definition D1: Ash Blade
mechanics = +1 attack, conditional fire resistance, active action

CHEBURASHKA
inventory instance I73
holder = character C9
definition = D1
quantity = 1
equipped = true
charges = 2
```

Giving an Ash Blade to a character does not create another Ash Blade definition. It creates another concrete instance referencing D1.

Likewise:

```text
CHASOVOY
class definition F1: Fighter

SHAPOKLYAK
character C9 has template/class assignment → F1 at its canonical character class level
```

A character spell/access row is not a second Fireball definition. It is character state referencing a canonical spell definition.

## Canonical identity and deduplication

Definition identity is stable across revisions. `id`, `kind`, `scope` and `slug` define identity; authored mechanics/text are revision content.

Canonical uniqueness:

- system definition: `(kind, slug)` unique globally;
- campaign definition: `(campaign_id, kind, slug)` unique in that campaign.

A deliberate fork/variant receives a new id/slug. A revision keeps the same id and advances revision history.

## Scopes

- `system`: built-in/global content; ordinary campaign GMs cannot mutate it.
- `campaign`: GM-authored content belonging to one campaign.

Visibility is independent from scope: campaign definitions may still be GM-only.

## Command path

GM definition mutations are game-authoritative writes and therefore use the GM control plane:

```text
GM Cabinet
→ Oracle
→ Chasovoy
→ canonical definition/revision
```

Oracle stores nothing and does not modify definition content itself; Chasovoy remains the owner.

Read/reference UI may query Chasovoy's read contract directly. Reading a definition does not require Oracle or GENA.

Normal player gameplay never authors definitions. GENA may read/resolve a stable definition reference as part of gameplay execution, but it does not mutate Chasovoy definitions.

## Definition invalidation

Chasovoy publishes `definition.*` events after canonical definition mutation. It deliberately does not request a specific character resolution itself because it does not know which concrete characters reference that definition.

Runtime infrastructure bridges definition changes to campaign-level invalidation:

```text
Chasovoy definition event
→ EngineEventBus
→ CharacterResolutionBus(campaign)
→ mounted Character Runtime Resolvers reread fresh definitions/state
→ CE
```

This preserves the ownership boundary: Chasovoy owns definitions; runtime composition owns usage mapping; CE owns calculation only.

## Canonical GM item flow

```text
GM authors Ash Blade
→ GM Cabinet → Oracle → Chasovoy definition.create
→ definition D1 exists

GM gives Ash Blade to Vasya
→ GM Cabinet → Oracle → Cheburashka inventory.create(instance → D1)
→ Cheburashka owns the instance and requests character resolution
→ resolver reads D1 from Chasovoy + instance state from Cheburashka + character state from Shapoklyak
→ CE resolves
```

## Migration rule

Historical `spell_catalog`, `rule_templates` and inline item mechanics may remain physical storage/adapters while the product migrates, but they must not become competing definition owners. New reusable definition behavior must be exposed through the Chasovoy contract rather than creating another catalog.

Presentation code should consume reference/definition contracts and resolved runtime data rather than manufacturing mechanics from prose.
