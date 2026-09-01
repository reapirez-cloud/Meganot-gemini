import { evaluateCondition } from "./conditions.ts"
import { resolveNumericConflicts } from "./conflicts.ts"
import { evaluateFormula, validateFormula, type FormulaContext } from "./formulas.ts"
import type {
  CharacterContribution,
  CharacterState,
  FormulaExpression,
  GrantPayload,
  NumericContribution,
  NumericTarget,
  ResolvedGrant,
  ResolvedResource,
  ResourceGrantPayload,
  ResourceRechargeRule,
  ResourceRechargeTrigger,
} from "./types.ts"

export class ResourceEngineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ResourceEngineError"
  }
}

const NEVER_RECHARGE: ResourceRechargeRule = {
  triggers: ["never"],
  restore: "full",
}

function asObject(value: GrantPayload | undefined): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ResourceEngineError("resource grant payload must be an object")
  }
  return value as Record<string, unknown>
}

function isFormulaExpression(value: unknown): value is FormulaExpression {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { kind?: unknown }).kind === "string"
  )
}

function parseRecharge(value: unknown): ResourceRechargeRule {
  if (value === undefined) return NEVER_RECHARGE
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ResourceEngineError("resource recharge must be an object")
  }

  const candidate = value as Record<string, unknown>
  if (!Array.isArray(candidate.triggers) || candidate.triggers.length === 0) {
    throw new ResourceEngineError("resource recharge.triggers must not be empty")
  }

  const allowed = new Set<ResourceRechargeTrigger>([
    "short_rest",
    "long_rest",
    "dawn",
    "manual",
    "never",
  ])
  const triggers = candidate.triggers.map((trigger) => {
    if (typeof trigger !== "string" || !allowed.has(trigger as ResourceRechargeTrigger)) {
      throw new ResourceEngineError(`unsupported resource recharge trigger: ${String(trigger)}`)
    }
    return trigger as ResourceRechargeTrigger
  })

  if (new Set(triggers).size !== triggers.length) {
    throw new ResourceEngineError("resource recharge triggers must be unique")
  }
  if (triggers.includes("never") && triggers.length > 1) {
    throw new ResourceEngineError("resource recharge 'never' cannot be combined with other triggers")
  }

  if (candidate.restore === "full") {
    return { triggers, restore: "full" }
  }
  if (candidate.restore === "amount") {
    if (
      typeof candidate.amount !== "number" ||
      !Number.isFinite(candidate.amount) ||
      candidate.amount <= 0
    ) {
      throw new ResourceEngineError("resource recharge amount must be a finite number > 0")
    }
    return { triggers, restore: "amount", amount: candidate.amount }
  }

  throw new ResourceEngineError("resource recharge.restore must be 'full' or 'amount'")
}

/** Runtime validation + normalization for a resource GRANT payload. */
export function parseResourceGrantPayload(payload: GrantPayload | undefined): ResourceGrantPayload {
  const object = asObject(payload)
  const maximum = object.max

  if (typeof maximum === "number") {
    if (!Number.isFinite(maximum) || maximum < 0) {
      throw new ResourceEngineError("resource max must be a finite number >= 0")
    }
  } else if (isFormulaExpression(maximum)) {
    validateFormula(maximum)
  } else {
    throw new ResourceEngineError("resource max must be a number or formula")
  }

  const initial = object.initial
  if (
    initial !== undefined &&
    initial !== "full" &&
    initial !== "empty" &&
    (typeof initial !== "number" || !Number.isFinite(initial) || initial < 0)
  ) {
    throw new ResourceEngineError("resource initial must be 'full', 'empty', or a finite number >= 0")
  }

  const label = object.label
  if (label !== undefined && (typeof label !== "string" || !label.trim())) {
    throw new ResourceEngineError("resource label must be a non-empty string")
  }

  return {
    max: maximum,
    recharge: parseRecharge(object.recharge),
    ...(initial === undefined ? {} : { initial: initial as number | "full" | "empty" }),
    ...(label === undefined ? {} : { label: label as string }),
  }
}

export function resourceStateKey(key: string, variantKey = "default"): string {
  return variantKey === "default" ? key : `${key}::${variantKey}`
}

export function resourceMaxTarget(stateKey: string): NumericTarget {
  return `resources.${stateKey}.max`
}

function resolveResourceMaximum(
  stateKey: string,
  definition: ResourceGrantPayload,
  contributions: CharacterContribution[],
  state: CharacterState,
  maxHp: number,
  formulaContext: FormulaContext,
) {
  const baseValue =
    typeof definition.max === "number"
      ? definition.max
      : evaluateFormula(definition.max, formulaContext)

  const target = resourceMaxTarget(stateKey)
  const relevant = contributions.filter(
    (contribution): contribution is NumericContribution =>
      contribution.kind === "numeric" &&
      contribution.target === target &&
      evaluateCondition(contribution.condition, { state, maxHp }),
  )
  const resolution = resolveNumericConflicts(baseValue, relevant)

  if (resolution.value < 0) {
    throw new ResourceEngineError(`resolved resource maximum must be >= 0: ${stateKey}`)
  }

  return {
    value: resolution.value,
    baseValue,
    sources: resolution.contributions.map((contribution) => ({
      contributionId: contribution.id,
      source: contribution.source,
    })),
  }
}

function initialCurrent(definition: ResourceGrantPayload, max: number): number {
  if (definition.initial === "empty") return 0
  if (typeof definition.initial === "number") return definition.initial
  return max
}

/**
 * Resolves only resources that currently exist as active resource grants.
 * Orphaned CharacterState.resources entries are intentionally ignored.
 */
export function resolveResources(
  grants: ResolvedGrant[],
  contributions: CharacterContribution[],
  state: CharacterState,
  maxHp: number,
  formulaContext: FormulaContext,
): ResolvedResource[] {
  return grants
    .filter((grant) => grant.target === "resource")
    .map((grant) => {
      const definition = parseResourceGrantPayload(grant.payload)
      const stateKey = resourceStateKey(grant.key, grant.variantKey)
      const max = resolveResourceMaximum(
        stateKey,
        definition,
        contributions,
        state,
        maxHp,
        formulaContext,
      )
      const rawCurrent = state.resources?.[stateKey]?.current ?? initialCurrent(definition, max.value)
      if (!Number.isFinite(rawCurrent) || rawCurrent < 0) {
        throw new ResourceEngineError(`resource current must be a finite number >= 0: ${stateKey}`)
      }

      return {
        key: grant.key,
        variantKey: grant.variantKey,
        stateKey,
        current: Math.min(rawCurrent, max.value),
        rawCurrent,
        max,
        recharge: definition.recharge ?? NEVER_RECHARGE,
        sources: grant.sources,
      }
    })
    .sort((left, right) => left.stateKey.localeCompare(right.stateKey))
}

function cloneStateWithResources(state: CharacterState) {
  return {
    ...state,
    resources: Object.fromEntries(
      Object.entries(state.resources ?? {}).map(([key, value]) => [key, { current: value.current }]),
    ),
  }
}

/** Immutable transition helper. Throws instead of allowing accidental overspend. */
export function spendResource(
  state: CharacterState,
  resource: ResolvedResource,
  amount = 1,
): CharacterState {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ResourceEngineError("resource spend amount must be a finite number > 0")
  }
  if (amount > resource.current) {
    throw new ResourceEngineError(`insufficient resource: ${resource.stateKey}`)
  }

  const next = cloneStateWithResources(state)
  next.resources[resource.stateKey] = { current: resource.current - amount }
  return next
}

/**
 * Applies one explicit recovery event to all matching resources.
 * Long rest does not implicitly mean short rest: resources that support both
 * must list both triggers in their definition.
 */
export function applyResourceRecovery(
  state: CharacterState,
  resources: ResolvedResource[],
  trigger: ResourceRechargeTrigger,
): CharacterState {
  const next = cloneStateWithResources(state)
  if (trigger === "never") return next

  for (const resource of resources) {
    if (!resource.recharge.triggers.includes(trigger)) continue

    const current = resource.current
    const restored =
      resource.recharge.restore === "full"
        ? resource.max.value
        : Math.min(resource.max.value, current + resource.recharge.amount)
    next.resources[resource.stateKey] = { current: restored }
  }

  return next
}
