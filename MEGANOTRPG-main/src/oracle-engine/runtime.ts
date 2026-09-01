import { shapoklyak } from "../entity-engine/runtime.ts"
import { cheburashka } from "../inventory-engine/runtime.ts"
import { larisa } from "../location-engine/runtime.ts"
import { chasovoy } from "../reference-engine/runtime.ts"
import { OracleEngine } from "./engine.ts"

export const oracle = new OracleEngine({
  shapoklyak,
  cheburashka,
  larisa,
  chasovoy,
})
