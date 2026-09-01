import { evaluateCondition } from "./conditions.ts"
import { resolveNumericConflicts } from "./conflicts.ts"
import { evaluateFormula, FormulaEngineError, validateFormula, type FormulaContext } from "./formulas.ts"
import type {
  CharacterContribution,
  CharacterState,
  FormulaExpression,
  GrantPayload,
  NumericContribution,
  NumericTarget,
  ResolvedGrant,
  ResolvedNumber,
  ResolvedValue,
  ValueGrantPayload,
} from "./types.ts"

export class ValueEngineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ValueEngineError"
  }
}

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ValueEngineError("value grant payload must be an object")
  }
  return value as Record<string, unknown>
}

function parseValueExpression(value: unknown): number | FormulaExpression {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new ValueEngineError("value must be finite")
    return value
  }
  const formula = value as FormulaExpression
  try {
    validateFormula(formula)
  } catch (error) {
    throw new ValueEngineError(
      `value formula: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  return formula
}

export function parseValueGrantPayload(payload: GrantPayload | undefined): ValueGrantPayload {
  const object = asObject(payload)
  if (object.value === undefined) throw new ValueEngineError("value grant payload.value is required")
  const value = parseValueExpression(object.value)
  const label = object.label
  if (label !== undefined && (typeof label !== "string" || !label.trim())) {
    throw new ValueEngineError("value grant payload.label must be a non-empty string")
  }
  return {
    value,
    ...(typeof label === "string" ? { label } : {}),
  }
}

export function valueStateKey(key: string, variantKey = "default"): string {
  return variantKey === "default" ? key : `${key}::${variantKey}`
}

export function valueNumericTarget(stateKey: string): NumericTarget {
  return `values.${stateKey}`
}

function resolveValueNumber(
  target: NumericTarget,
  baseValue: number,
  contributions: CharacterContribution[],
  state: CharacterState,
  maxHp: number,
): ResolvedNumber {
  const relevant = contributions.filter(
    (contribution): contribution is NumericContribution =>
      contribution.kind === "numeric" &&
      contribution.target === target &&
      evaluateCondition(contribution.condition, { state, maxHp }),
  )
  const resolution = resolveNumericConflicts(baseValue, relevant)
  return {
    value: resolution.value,
    baseValue,
    sources: resolution.contributions.map((contribution) => ({
      contributionId: contribution.id,
      source: contribution.source,
    })),
  }
}

function evaluateValue(
  definition: ValueGrantPayload,
  context: FormulaContext,
): number {
  if (typeof definition.value === "number") return definition.value
  return evaluateFormula(definition.value, context)
}

function isMissingReference(error: unknown): boolean {
  return error instanceof FormulaEngineError && error.message.startsWith("missing or non-finite formula reference:")
}

/**
 * Resolves arbitrary named scalar values. Formulas may depend on previously resolvable
 * values through `values.<stateKey>`; dependency order is discovered without class logic.
 */
export function resolveValues(
  grants: ResolvedGrant[],
  contributions: CharacterContribution[],
  state: CharacterState,
  maxHp: number,
  formulaContext: FormulaContext,
): ResolvedValue[] {
  const pending = grants
    .filter((grant) => grant.target === "value")
    .map((grant) => ({ grant, definition: parseValueGrantPayload(grant.payload) }))
    .sort((left, right) =>
      valueStateKey(left.grant.key, left.grant.variantKey).localeCompare(
        valueStateKey(right.grant.key, right.grant.variantKey),
      ),
    )

  const context = { ...formulaContext }
  const resolved: ResolvedValue[] = []

  while (pending.length > 0) {
    let progressed = false

    for (let index = 0; index < pending.length; ) {
      const entry = pending[index]!
      const stateKey = valueStateKey(entry.grant.key, entry.grant.variantKey)
      let baseValue: number
      try {
        baseValue = evaluateValue(entry.definition, context)
      } catch (error) {
        if (isMissingReference(error)) {
          index += 1
          continue
        }
        throw error
      }

      const value = resolveValueNumber(
        valueNumericTarget(stateKey),
        baseValue,
        contributions,
        state,
        maxHp,
      )
      const item: ResolvedValue = {
        key: entry.grant.key,
        variantKey: entry.grant.variantKey,
        stateKey,
        ...(entry.definition.label === undefined ? {} : { label: entry.definition.label }),
        value,
        sources: entry.grant.sources,
      }
      resolved.push(item)
      context[`values.${stateKey}`] = value.value
      pending.splice(index, 1)
      progressed = true
    }

    if (!progressed) {
      throw new ValueEngineError(
        `unresolved or cyclic value dependencies: ${pending
          .map((entry) => valueStateKey(entry.grant.key, entry.grant.variantKey))
          .join(", ")}`,
      )
    }
  }

  return resolved.sort((left, right) => left.stateKey.localeCompare(right.stateKey))
}
