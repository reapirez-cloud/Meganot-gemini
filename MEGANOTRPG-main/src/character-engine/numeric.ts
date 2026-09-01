import type { NumericOperation } from "./types.ts"

export class NumericEngineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "NumericEngineError"
  }
}

/**
 * Applies one universal numeric operation.
 *
 * MIN means "the result cannot be lower than operand" (a floor).
 * MAX means "the result cannot be higher than operand" (a ceiling).
 */
export function applyNumericOperation(
  current: number,
  operation: NumericOperation,
  operand: number,
): number {
  let result: number

  switch (operation) {
    case "ADD":
      result = current + operand
      break
    case "SUBTRACT":
      result = current - operand
      break
    case "SET":
      result = operand
      break
    case "MIN":
      result = Math.max(current, operand)
      break
    case "MAX":
      result = Math.min(current, operand)
      break
    case "MULTIPLY":
      result = current * operand
      break
  }

  if (!Number.isFinite(result)) {
    throw new NumericEngineError(
      `numeric operation ${operation} produced a non-finite result from ${current} and ${operand}`,
    )
  }

  return result
}

/** Standard ability modifier derived from an ability score. */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

/** Default 5e proficiency progression for levels 1-20. */
export function proficiencyBonusForLevel(level: number): number {
  const normalizedLevel = Math.max(1, Math.min(20, Math.trunc(level)))
  return 2 + Math.floor((normalizedLevel - 1) / 4)
}
