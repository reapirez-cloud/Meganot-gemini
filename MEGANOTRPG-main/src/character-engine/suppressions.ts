import type {
  CharacterContribution,
  CharacterSource,
  CharacterState,
  SuppressionCondition,
  SuppressionContribution,
} from "./types.ts"

export class SuppressionEngineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SuppressionEngineError"
  }
}

function hasFact(state: CharacterState, key: string) {
  return Object.prototype.hasOwnProperty.call(state.facts ?? {}, key)
}

function evaluateSuppressionCondition(
  condition: SuppressionCondition | undefined,
  state: CharacterState,
): boolean {
  if (!condition || condition.kind === "always") return true

  if (condition.kind === "all") {
    return condition.conditions.every((child) => evaluateSuppressionCondition(child, state))
  }
  if (condition.kind === "any") {
    return condition.conditions.some((child) => evaluateSuppressionCondition(child, state))
  }
  if (condition.kind === "not") {
    return !evaluateSuppressionCondition(condition.condition, state)
  }

  const exists = hasFact(state, condition.key)
  if (condition.operator === "EXISTS") return exists
  if (condition.operator === "NOT_EXISTS") return !exists
  if (!exists) return false

  const actual = state.facts?.[condition.key]
  if (condition.operator === "EQUALS") return Object.is(actual, condition.value)
  if (condition.operator === "NOT_EQUALS") return !Object.is(actual, condition.value)

  if (typeof actual !== "number" || !Number.isFinite(actual)) {
    throw new SuppressionEngineError(
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

function buildParentMap(contributions: CharacterContribution[]): Map<string, string | undefined> {
  const parents = new Map<string, string | undefined>()

  for (const contribution of contributions) {
    const source = contribution.source
    const known = parents.get(source.id)
    if (parents.has(source.id) && known !== source.parentSourceId) {
      throw new SuppressionEngineError(
        `source ${source.id} has conflicting parentSourceId metadata`,
      )
    }
    parents.set(source.id, source.parentSourceId)
  }

  return parents
}

function sourceMatches(
  source: CharacterSource,
  targetSourceId: string,
  includeDescendants: boolean,
  parents: Map<string, string | undefined>,
): boolean {
  if (source.id === targetSourceId) return true
  if (!includeDescendants) return false

  let current = source.parentSourceId
  const visited = new Set<string>()
  while (current) {
    if (current === targetSourceId) return true
    if (visited.has(current)) {
      throw new SuppressionEngineError(`source parent cycle detected at ${current}`)
    }
    visited.add(current)
    current = parents.get(current)
  }

  return false
}

export interface SuppressionResolution {
  /** Active non-control contributions after universal suppression is applied. */
  contributions: CharacterContribution[]
  /** Concrete contribution ids removed from this resolution pass. */
  suppressedContributionIds: string[]
  /** Concrete source ids whose contributions were removed. */
  suppressedSourceIds: string[]
  /** Active suppression controls, retained for later provenance/explain work. */
  controls: SuppressionContribution[]
}

/**
 * Applies universal suppression before numeric/formula/grant resolution.
 *
 * Suppression controls are authoritative and are not themselves suppressible.
 * This avoids recursive control loops. They may depend only on raw State facts,
 * never on derived character values.
 */
export function applySuppressions(
  contributions: CharacterContribution[],
  state: CharacterState,
): SuppressionResolution {
  const controls = contributions.filter(
    (contribution): contribution is SuppressionContribution =>
      contribution.kind === "suppression" &&
      evaluateSuppressionCondition(contribution.condition, state),
  )
  const parents = buildParentMap(contributions)

  const suppressedContributionIds = new Set<string>()
  const suppressedSourceIds = new Set<string>()

  const active = contributions.filter((contribution) => {
    if (contribution.kind === "suppression") return false

    for (const control of controls) {
      if (control.selector.kind === "contribution") {
        if (control.selector.contributionId === contribution.id) {
          suppressedContributionIds.add(contribution.id)
          return false
        }
        continue
      }

      if (
        sourceMatches(
          contribution.source,
          control.selector.sourceId,
          control.selector.includeDescendants ?? true,
          parents,
        )
      ) {
        suppressedContributionIds.add(contribution.id)
        suppressedSourceIds.add(contribution.source.id)
        return false
      }
    }

    return true
  })

  return {
    contributions: active,
    suppressedContributionIds: [...suppressedContributionIds].sort(),
    suppressedSourceIds: [...suppressedSourceIds].sort(),
    controls: controls.slice().sort((left, right) => left.id.localeCompare(right.id)),
  }
}
