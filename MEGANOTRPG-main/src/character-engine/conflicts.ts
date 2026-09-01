import { applyNumericOperation } from "./numeric.ts"
import type { NumericContribution, NumericOperation } from "./types.ts"

export class CharacterConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CharacterConflictError"
  }
}

const OPERATION_ORDER: Record<NumericOperation, number> = {
  SET: 0,
  MULTIPLY: 1,
  ADD: 2,
  SUBTRACT: 2,
  MIN: 3,
  MAX: 4,
}

function canonicalContributionOrder(left: NumericContribution, right: NumericContribution) {
  const priorityDifference = (left.priority ?? 0) - (right.priority ?? 0)
  if (priorityDifference) return priorityDifference

  const operationDifference = OPERATION_ORDER[left.operation] - OPERATION_ORDER[right.operation]
  if (operationDifference) return operationDifference

  return left.id.localeCompare(right.id)
}

function uniqueValues(contributions: NumericContribution[]) {
  return [...new Set(contributions.map((contribution) => contribution.value))]
}

function resolvePriorityTier(
  current: number,
  priority: number,
  contributions: NumericContribution[],
) {
  const sets = contributions.filter((contribution) => contribution.operation === "SET")
  const setValues = uniqueValues(sets)
  if (setValues.length > 1) {
    throw new CharacterConflictError(
      `conflicting SET operations at priority ${priority}: ${setValues.join(", ")}`,
    )
  }

  const floors = contributions.filter((contribution) => contribution.operation === "MIN")
  const ceilings = contributions.filter((contribution) => contribution.operation === "MAX")
  const floor = floors.length ? Math.max(...floors.map((contribution) => contribution.value)) : undefined
  const ceiling = ceilings.length
    ? Math.min(...ceilings.map((contribution) => contribution.value))
    : undefined

  if (floor !== undefined && ceiling !== undefined && floor > ceiling) {
    throw new CharacterConflictError(
      `incompatible MIN/MAX constraints at priority ${priority}: minimum ${floor} exceeds maximum ${ceiling}`,
    )
  }

  let value = setValues.length === 1 ? setValues[0] : current

  const multiplier = contributions
    .filter((contribution) => contribution.operation === "MULTIPLY")
    .reduce((product, contribution) => product * contribution.value, 1)
  if (multiplier !== 1) {
    value = applyNumericOperation(value, "MULTIPLY", multiplier)
  }

  const delta = contributions.reduce((sum, contribution) => {
    if (contribution.operation === "ADD") return sum + contribution.value
    if (contribution.operation === "SUBTRACT") return sum - contribution.value
    return sum
  }, 0)
  if (delta !== 0) {
    value = applyNumericOperation(value, "ADD", delta)
  }

  if (floor !== undefined) {
    value = applyNumericOperation(value, "MIN", floor)
  }
  if (ceiling !== undefined) {
    value = applyNumericOperation(value, "MAX", ceiling)
  }

  return value
}

export interface NumericConflictResolution {
  value: number
  contributions: NumericContribution[]
}

/**
 * Resolves active numeric contributions without depending on array order or IDs.
 *
 * Priorities are processed from lower to higher. Inside one priority tier:
 * SET -> MULTIPLY -> net ADD/SUBTRACT -> strongest MIN -> strongest MAX.
 * Equal-priority contradictory SET or MIN/MAX rules are rejected explicitly.
 */
export function resolveNumericConflicts(
  baseValue: number,
  contributions: NumericContribution[],
): NumericConflictResolution {
  const byPriority = new Map<number, NumericContribution[]>()

  for (const contribution of contributions) {
    const priority = contribution.priority ?? 0
    const tier = byPriority.get(priority) ?? []
    tier.push(contribution)
    byPriority.set(priority, tier)
  }

  let value = baseValue
  const priorities = [...byPriority.keys()].sort((left, right) => left - right)
  for (const priority of priorities) {
    value = resolvePriorityTier(value, priority, byPriority.get(priority) ?? [])
  }

  return {
    value,
    contributions: [...contributions].sort(canonicalContributionOrder),
  }
}
