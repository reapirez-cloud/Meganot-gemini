import { resolveCharacterContract } from "../character-engine/index.ts"
import { shapoklyak } from "../entity-engine/runtime.ts"
import { gena, genaSession } from "../game-engine/runtime.ts"
import { cheburashka } from "../inventory-engine/runtime.ts"
import { larisa } from "../location-engine/runtime.ts"
import { oracle } from "../oracle-engine/runtime.ts"
import { chasovoy } from "../reference-engine/runtime.ts"
import { tobik } from "../roll-engine/index.ts"
import { characterRuntimeResolver } from "./characterRuntime.ts"
import { characterResolutionBus, engineEventBus } from "./runtimeSignals.ts"

/**
 * Composition root for the named MEGANOTRPG engines.
 *
 * This object owns no game state and performs no routing. It merely exposes the
 * already-composed runtime instances in one place so application adapters can
 * depend on the engine graph instead of rebuilding it inside React components.
 */
export const engineRuntime = Object.freeze({
  ce: Object.freeze({ resolve: resolveCharacterContract }),
  characterRuntime: characterRuntimeResolver,
  gena,
  genaSession,
  tobik,
  cheburashka,
  shapoklyak,
  larisa,
  chasovoy,
  oracle,
  signals: Object.freeze({
    events: engineEventBus,
    resolution: characterResolutionBus,
  }),
})
