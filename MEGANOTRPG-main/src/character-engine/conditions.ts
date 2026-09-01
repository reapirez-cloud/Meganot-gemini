import type {
  CharacterCondition,
  CharacterState,
  StateCondition,
  StateFactValue,
} from "./types.ts"

export interface ConditionContext {
  state: CharacterState
  /** Resolved maximum HP used by HP-relative conditions. */
  maxHp: number
}

export class ConditionEngineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ConditionEngineError"
  }
}

function hasFact(state: CharacterState, key: string) {
  return Object.prototype.hasOwnProperty.call(state.facts ?? {}, key)
}

function getFact(state: CharacterState, key: string): StateFactValue | undefined {
  return state.facts?.[key]
}

function evaluateStateCondition(condition: StateCondition, state: CharacterState): boolean {
  const exists = hasFact(state, condition.key)

  if (condition.operator === "EXISTS") return exists
  if (condition.operator === "NOT_EXISTS") return !exists
  if (!exists) return false

  const actual = getFact(state, condition.key)

  if (condition.operator === "EQUALS") {
    return Object.is(actual, condition.value)
  }
  if (condition.operator === "NOT_EQUALS") {
    return !Object.is(actual, condition.value)
  }

  if (typeof actual !== "number" || !Number.isFinite(actual)) {
    throw new ConditionEngineError(
      `state fact ${condition.key} must be a finite number for ${condition.operator}`,
    )
  }

  switch (condition.operator) {
    case "GT":
      return actual > condition.value
    case "GTE":
      return actual >= condition.value
    case "LT":
      return actual < condition.value
    case "LTE":
      return actual <= condition.value
  }
}

/**
 * Evaluates the universal condition language against current runtime state.
 *
 * The evaluator knows nothing about items, classes, feats, forms or rests.
 * Those concepts are represented by fact keys supplied by adapters/data.
 */
export function evaluateCondition(
  condition: CharacterCondition | undefined,
  context: ConditionContext,
): boolean {
  if (!condition || condition.kind === "always") return true

  switch (condition.kind) {
    case "hp_below_percent":
      if (context.maxHp <= 0) return false
      return context.state.currentHp / context.maxHp < condition.percent / 100

    case "state":
      return evaluateStateCondition(condition, context.state)

    case "all":
      return condition.conditions.every((child) => evaluateCondition(child, context))

    case "any":
      return condition.conditions.some((child) => evaluateCondition(child, context))

    case "not":
      return !evaluateCondition(condition.condition, context)
  }
}
