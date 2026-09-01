# MEGANOTRPG Character Engine v1.0

Character Engine is a standalone deterministic mechanics layer.

> **AI / integration note:** before changing CE integrations, Chat, Character Sheet, Inventory/equipment, classes, spells, resources, or GM-granted mechanics, read the repository root `AGENTS.md` and `docs/CHARACTER_ENGINE_CONTRACT.md`. The latter defines the application-level ownership, synchronization, equipment, chat-classification, and resource-flow invariants that consumers of this engine must follow.

## Boundary

Canonical input:

```ts
CharacterEngineInput = { base, state, contributions }
```

Canonical renderer-facing output:

```ts
resolveCharacterContract(input) -> ResolvedCharacterContract
```

The engine does not read or write Supabase, React state, browser storage, campaign tables, or UI components. Persistence adapters translate external data into `CharacterEngineInput` and persist explicit immutable state transitions outside this directory.

## Truth model

- **Base**: manually supplied raw character skeleton.
- **State**: mutable runtime facts such as current HP, current resources, preparation, rest/dawn counters.
- **Contributions**: source-described mechanical effects using generic numeric/formula/grant/suppression commands.
- **Resolved**: fully recomputed output. Derived values are never stored as independent truth.

Removing or suppressing a source means resolving again without its active contributions. No reverse mutation is required.

## Stable v1 capabilities

v1 includes numeric resolution and conflicts, conditions, formulas, grants, suppression/replace, resources, actions/attacks, spell access and casting methods, temporary expiration by deterministic events, provenance/explain, and the renderer-facing resolved contract.

Dynamic renderer sections are content-driven. Empty feats/features/resources/actions/spells/etc. must not create placeholder UI sections; use `resolvedDynamicSections()`.

## Versioning

`CHARACTER_ENGINE_VERSION` is semantic engine versioning and is independent from the MEGANOTRPG application package version.

`RESOLVED_CHARACTER_CONTRACT_VERSION` versions the serialized/renderer-facing contract shape.

Breaking changes to v1 public mechanics or contract semantics require an explicit version change. Additive internal refactors that preserve public behavior do not.

## Integration after v1

External systems should follow:

```text
Supabase / other persistence
        -> adapter
        -> CharacterEngineInput
        -> Character Engine
        -> ResolvedCharacterContract
        -> UI
```

The UI renders resolved data and may request `explainCharacter()` output, but it does not perform game math.
