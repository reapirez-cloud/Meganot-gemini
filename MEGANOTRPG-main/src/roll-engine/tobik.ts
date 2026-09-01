import { compileRollRecipe, executeRollRecipe } from "./engine.ts"
import type {
  DiceRoller,
  RollContext,
  RollExecutionPlan,
  RollExecutionResult,
  RollRecipe,
} from "./types.ts"

export type TobikRollRequest = {
  recipe: RollRecipe
  context: RollContext
}

export interface TobikPort {
  compile(request: TobikRollRequest): RollExecutionPlan
  execute(request: TobikRollRequest, roller?: DiceRoller): RollExecutionResult
}

/**
 * Named Roll Engine facade. Browser gameplay should normally send compile()
 * output to the server-owned Tobik RPC so randomness and the durable chat event
 * happen together. execute() is for trusted/local runtimes and deterministic
 * tests with an injected roller.
 */
export class TobikEngine implements TobikPort {
  compile(request: TobikRollRequest): RollExecutionPlan {
    return compileRollRecipe(request.recipe, request.context)
  }

  execute(request: TobikRollRequest, roller?: DiceRoller): RollExecutionResult {
    return executeRollRecipe(request.recipe, request.context, roller)
  }
}

export const tobik = new TobikEngine()

