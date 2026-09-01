# MEGANOTRPG engine closure gate

> Status: **CLOSED — STABLE BOUNDARY ON `dev`**

## State

**CLOSED — STABLE BOUNDARY ON `dev`.**

The named-engine foundation has passed its closure gate. Product work may continue on classes, maps, sheets, feats, content and UX without treating the engine architecture as an unfinished migration seam.

`CLOSED` does not mean “the application is finished”. It means the canonical ownership and command boundaries below are now the accepted foundation and must be extended rather than bypassed.

## Required command paths

Normal gameplay:

```text
Player / gameplay UI
  -> GENA or an explicitly permitted player-owner command
  -> explicit owning engine
  -> canonical persisted state
  -> character/world invalidation
  -> runtime resolver/projections
  -> CE where character mechanics are affected
  -> Sheet / Chat / Revolver presentation
```

GM authority:

```text
GM Cabinet
  -> Oracle
  -> explicit owning engine
  -> canonical persisted state
  -> invalidation
  -> fresh read model / CE resolution
  -> presentation
```

Oracle must never depend on GENA. UI must not be canonical inter-engine transport.

## Required ownership

- CE: deterministic character calculation only; no persistence or I/O.
- GENA: normal gameplay/session orchestration, authoritative execution routing and gameplay command correlation/receipts; no domain ownership and no GM control plane.
- Oracle: imperative GM entry point; no state, no gameplay-legality checks, no GENA dependency.
- Tobik: authoritative random dice resolution facade; no HP or scene adjudication.
- Shapoklyak: PC/NPC identity and canonical character assignment/lifecycle/mechanics/runtime state, including persistent character resources.
- Cheburashka: inventory instances, equipment, charges, quantities and transfers.
- Larisa: runtime world state, discovery, positions, scenes, location/map topology and NPC habitats.
- Chasovoy: reusable authored definitions/reference content and revisions.

## Closure criteria — accepted

The following gates define the closed foundation and are regression requirements from this point forward:

1. `dev` passes Build, Lint and Tests on its exact HEAD before a closure/release claim.
2. The live Supabase schema contains every required owner/RPC boundary used by the current runtime, with legacy bypass helpers sealed from authenticated clients where appropriate.
3. Character template assignment/removal is an owner operation in Shapoklyak and is reachable through Oracle for GM authority.
4. Class assignment plus class sheet-profile synchronization is atomic on the server.
5. Character-affecting owner mutations request a fresh character resolution; definition revisions can invalidate the campaign.
6. Chat, Sheet and Revolver consume the shared Character Runtime Resolver/read model rather than constructing incompatible CE snapshots independently.
7. Normal player rests/recovery use GENA; GM-forced recovery uses Oracle -> Shapoklyak. Both finish with fresh character invalidation.
8. GM lifecycle/HP/assignment/inventory/world/topology edits use Oracle -> owner paths where an owner contract exists.
9. Player direct-owner commands are limited to explicitly permitted ownership actions and are revalidated server-side.
10. Canonical random rolls use Tobik/the authoritative Roll Engine boundary; source UI does not invent parallel randomness.
11. Failure of a character read/resolve reaches a finite error or stale state; indefinite loading is not a valid steady state.
12. Integration tests cover at least: item use, GM HP/lifecycle, rest/recovery, template assignment, suppression, owner invalidation, shared resolved runtime, receipt idempotency and Oracle/GENA separation.
13. A reload after successful mutation reconstructs the same canonical result from persistence.
14. Documentation and repository instructions describe the same ownership graph as production code.

## Accepted runtime invariants

- Oracle and GENA are parallel entry points. Oracle must never depend on GENA.
- Owners persist canonical facts and request invalidation after character-affecting commits.
- CE is pure and has no outbound command/storage path.
- The application has one Character Runtime Resolver for character mechanics.
- Sheet, Chat and Revolver consume one resolved character representation.
- Supabase Realtime is refresh transport, not canonical engine communication.
- Receipt-aware GENA template RPCs own retry-safe class action/roll/spell execution; old template-v1/internal spend helpers are not authenticated client APIs.
- Shapoklyak owner RPCs own template assignment/removal; legacy assignment helpers are not authenticated client APIs.

## Not required to keep the foundation closed

- every class/subclass/race/feat being authored;
- final visual redesign of every screen;
- tactical scene simulation, automatic HP damage application or action-economy policing;
- every future world/map editing feature;
- removal of every historical migration file;
- eliminating unrelated application-level advisory/performance debt before building new product features.

Those are product/content capabilities built on top of the closed engine foundation. A future feature reopens this gate only if it violates an ownership/command/runtime invariant above.
