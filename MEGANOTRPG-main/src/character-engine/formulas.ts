import type {
  FormulaContribution,
  FormulaExpression,
  FormulaTarget,
  ResolvedSourceRef,
} from "./types.ts"

export type FormulaContext = Record<string, number>

export class FormulaEngineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "FormulaEngineError"
  }
}

export class FormulaConflictError extends FormulaEngineError {
  constructor(message: string) {
    super(message)
    this.name = "FormulaConflictError"
  }
}

function requireNonEmpty(values: FormulaExpression[], kind: string) {
  if (values.length === 0) {
    throw new FormulaEngineError(`${kind} formula must contain at least one value`)
  }
}

export function validateFormula(expression: FormulaExpression): void {
  switch (expression.kind) {
    case "literal":
      if (!Number.isFinite(expression.value)) {
        throw new FormulaEngineError("formula literal must be finite")
      }
      return
    case "reference":
      if (!expression.key.trim()) {
        throw new FormulaEngineError("formula reference key must not be empty")
      }
      return
    case "add":
      requireNonEmpty(expression.terms, "add")
      expression.terms.forEach(validateFormula)
      return
    case "subtract":
      validateFormula(expression.left)
      validateFormula(expression.right)
      return
    case "multiply":
      requireNonEmpty(expression.factors, "multiply")
      expression.factors.forEach(validateFormula)
      return
    case "min":
    case "max":
      requireNonEmpty(expression.values, expression.kind)
      expression.values.forEach(validateFormula)
      return
    case "clamp":
      validateFormula(expression.value)
      if (expression.min !== undefined && !Number.isFinite(expression.min)) {
        throw new FormulaEngineError("formula clamp min must be finite")
      }
      if (expression.max !== undefined && !Number.isFinite(expression.max)) {
        throw new FormulaEngineError("formula clamp max must be finite")
      }
      if (
        expression.min !== undefined &&
        expression.max !== undefined &&
        expression.min > expression.max
      ) {
        throw new FormulaEngineError("formula clamp min must not exceed max")
      }
      return
  }
}

export function evaluateFormula(expression: FormulaExpression, context: FormulaContext): number {
  validateFormula(expression)

  let result: number
  switch (expression.kind) {
    case "literal":
      result = expression.value
      break
    case "reference": {
      const value = context[expression.key]
      if (!Number.isFinite(value)) {
        throw new FormulaEngineError(`missing or non-finite formula reference: ${expression.key}`)
      }
      result = value
      break
    }
    case "add":
      result = expression.terms.reduce((sum, term) => sum + evaluateFormula(term, context), 0)
      break
    case "subtract":
      result = evaluateFormula(expression.left, context) - evaluateFormula(expression.right, context)
      break
    case "multiply":
      result = expression.factors.reduce(
        (product, factor) => product * evaluateFormula(factor, context),
        1,
      )
      break
    case "min":
      result = Math.min(...expression.values.map((value) => evaluateFormula(value, context)))
      break
    case "max":
      result = Math.max(...expression.values.map((value) => evaluateFormula(value, context)))
      break
    case "clamp": {
      result = evaluateFormula(expression.value, context)
      if (expression.min !== undefined) result = Math.max(result, expression.min)
      if (expression.max !== undefined) result = Math.min(result, expression.max)
      break
    }
  }

  if (!Number.isFinite(result)) {
    throw new FormulaEngineError("formula produced a non-finite result")
  }
  return result
}

function canonicalFormula(expression: FormulaExpression): string {
  return JSON.stringify(expression)
}

export interface FormulaSelection {
  formula: FormulaExpression
  sources: ResolvedSourceRef[]
}

/**
 * Higher priority replaces lower priority. Equal-priority identical formulas
 * merge provenance; equal-priority different formulas are an explicit conflict.
 */
export function selectFormula(
  target: FormulaTarget,
  defaultFormula: FormulaExpression,
  contributions: FormulaContribution[],
): FormulaSelection {
  if (contributions.length === 0) return { formula: defaultFormula, sources: [] }

  const highestPriority = Math.max(...contributions.map((item) => item.priority ?? 0))
  const finalists = contributions.filter((item) => (item.priority ?? 0) === highestPriority)
  const canonical = new Set(finalists.map((item) => canonicalFormula(item.formula)))

  if (canonical.size > 1) {
    throw new FormulaConflictError(
      `conflicting formulas for ${target} at priority ${highestPriority}`,
    )
  }

  const formula = finalists[0]!.formula
  validateFormula(formula)
  return {
    formula,
    sources: finalists
      .slice()
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((item) => ({ contributionId: item.id, source: item.source })),
  }
}
