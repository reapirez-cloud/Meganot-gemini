# Engine Runtime Integration

> Status: **CLOSED — STABLE BOUNDARY ON `dev`**
>
> This document describes the production runtime graph after the named-engine integration was consolidated.

## One graph, two command paths

```text
NORMAL GAMEPLAY
Player / gameplay UI
        |
        v
      GENA ----------------------> TOBIK / authoritative Roll Engine
        |
        +--------> explicit owner/storage boundary

GM REALITY CHANGE
GM Cabinet
    |
    v
 ORACLE
    +--------> SHAPOKLYAK
    +--------> CHEBURASHKA
    +--------> LARISA
    +--------> CHASOVOY
```

Oracle is not a GENA facade and GENA is not in the Oracle path. GENA is the normal gameplay/session orchestrator. Oracle is the GM's imperative control plane.

## Shared nervous system

Domain runtimes publish their existing `EngineEvent` contracts into one ephemeral `EngineEventBus`.

```text
SHAPOKLYAK ----+
CHEBURASHKA ---+
LARISA --------+----> EngineEventBus ----> runtime/UI observers
CHASOVOY ------+
GENA -----------+
```

The event bus is **not canonical storage, durable history or a transaction log**. Durable state remains in owner persistence/server boundaries. The bus only distributes already-produced engine events inside the running application.

This removes the old pattern where mounted React components had to act as an engine-to-engine message bus.

## Character invalidation

CE remains pure and has no outbound arrows.

Character-affecting owners request recalculation after committing canonical state:

```text
SHAPOKLYAK ----> CharacterResolutionBus(character) ----+
CHEBURASHKA ---> CharacterResolutionBus(character) ----+--> Character Runtime Resolver --> CE
```

Larisa does not invalidate CE by default because descriptive location/time state is not itself character mechanics.

Chasovoy definition changes are campaign-scoped because Chasovoy deliberately does not know which concrete characters use a definition:

```text
CHASOVOY
  |
  +--> EngineEventBus: definition.*
                |
                v
      CharacterResolutionBus(campaign)
                |
                v
      mounted character resolvers reread fresh owner state/definitions
```

## The single Character Runtime Resolver

`src/engine-runtime/characterRuntimeResolver.ts` is the application read-model assembly boundary for character mechanics.

It obtains fresh canonical inputs/projections, invokes the Character Engine adapter once and returns one snapshot containing the resolved contract plus the canonical CE input needed by presentation/explanation surfaces.

`useResolvedCharacterRuntime` is the shared React adapter over that resolver. `useResolvedChatActor` is only a backward-compatible alias of the same hook.

Therefore:

- Character Sheet consumes the shared runtime snapshot;
- Chat consumes the shared runtime snapshot;
- the Chat action/revolver sheet receives the same resolved contract;
- no UI surface independently invokes CE to create a competing character.

The resolver has finite failure behavior. Missing or hung owner reads end as an explicit error/stale state rather than indefinite loading.

## Cross-client refresh

The shared React adapter listens to the in-process resolution bus and to Supabase Realtime where persisted changes may originate from another client.

Realtime is a **transport-level invalidation hint only**:

```text
Realtime event
→ “persisted truth may have changed”
→ reread owners/projections
→ Character Runtime Resolver
→ CE
```

Realtime does not become an owner, command bus or source of canonical values.

## Composition root

`src/engine-runtime/runtime.ts` exposes the composed runtime graph:

- CE resolver;
- GENA and its durable session gateway;
- Tobik;
- Cheburashka;
- Shapoklyak;
- Larisa;
- Chasovoy;
- Oracle;
- shared event and character-resolution signals.

The composition root is **not another engine**. It stores nothing, decides nothing and owns no canonical fact. Its job is to stop application adapters from rebuilding the graph independently.

## Durable command boundaries

Normal gameplay operations that could be duplicated by retry keep a stable command correlation key through the server boundary.

Class/template action, roll and spell execution use receipt-aware GENA RPCs:

```text
commandId
→ advisory transaction lock
→ authoritative validation/spend
→ message/roll result
→ engine_command_receipts
```

A retry with the same command fingerprint returns the original result and does not spend twice. Old template-v1/internal spend helpers are not executable by authenticated clients.

Similarly, GM class/template assignment reaches the Shapoklyak owner facade through Oracle. Legacy assignment helper RPCs are sealed from direct authenticated execution.

## Runtime ownership laws

1. Oracle never calls GENA.
2. GENA handles normal gameplay intentions; it does not own the domain state it changes.
3. Oracle handles GM reality changes and calls owners directly.
4. Domain owners mutate only their canonical domain state.
5. CE receives an explicit fresh snapshot and performs no I/O.
6. Tobik/the authoritative Roll Engine resolves requested dice and never applies HP/scene legality.
7. Larisa world/time state has no automatic character mechanics consequences by default.
8. Chasovoy owns reusable definitions, not concrete usages.
9. EngineEventBus and CharacterResolutionBus are ephemeral signals, never storage.
10. Supabase Realtime is refresh transport, never canonical engine communication.
11. Sheet, Chat and Revolver consume one shared resolved character runtime.

## Integration closure

The earlier runtime migration seam is closed for the current engine foundation: shared character snapshot assembly is behind the Character Runtime Resolver, GM canonical writes have Oracle owner paths, normal gameplay GENA paths use authoritative server boundaries, and mechanical owner mutations are covered by invalidation regression tests.

Future product work may add new owner commands/projections, but it must extend this graph rather than create a second runtime or another canonical path.
