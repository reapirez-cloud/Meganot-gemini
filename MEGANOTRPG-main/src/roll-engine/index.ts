export {
  RollContextError,
  createSpellRollContext,
  type PreparedSpellRollContext,
  type SpellRollContextSelection,
} from "./character-context.ts"
export {
  RollDiceError,
  defaultDiceRoller,
  evaluateRollValue,
  rollDice,
  validateDice,
} from "./dice.ts"
export {
  RollEngineError,
  compileRollRecipe,
  executeRollRecipe,
  validateRollRecipe,
} from "./engine.ts"
export {
  RollScalingError,
  applyScalingRules,
  scalingReferenceValue,
  validateScalingRule,
  type AppliedScaling,
} from "./scaling.ts"
export {
  type DiceDefinition,
  type DiceRoller,
  type DiceRollResult,
  type RollContext,
  type RollEffectDefinition,
  type RollEffectPlan,
  type RollEffectResult,
  type RollExecutionPlan,
  type RollExecutionResult,
  type RollInstancePlan,
  type RollInstanceResult,
  type RollRecipe,
  type RollResolutionDefinition,
  type RollResolutionPlan,
  type RollResolutionResult,
  type RollScalingAdjustment,
  type RollScalingReference,
  type RollScalingRule,
  type RollScalingSource,
  type RollSequenceDefinition,
  type RollSequencePlan,
  type RollSequenceResult,
  type RollValueExpression,
  type RollValueReference,
  type SaveAbility,
} from "./types.ts"
export {
  ROLL_ENGINE_STATUS,
  ROLL_ENGINE_VERSION,
  ROLL_ENGINE_VERSION_INFO,
} from "./version.ts"
export {
  TobikEngine,
  tobik,
  type TobikPort,
  type TobikRollRequest,
} from "./tobik.ts"
