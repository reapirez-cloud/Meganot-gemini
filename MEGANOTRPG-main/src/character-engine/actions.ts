import { evaluateCondition } from "./conditions.ts"
import { resolveNumericConflicts } from "./conflicts.ts"
import { evaluateFormula, validateFormula, type FormulaContext } from "./formulas.ts"
import { resourceStateKey } from "./resources.ts"
import type {
  ActionCostOption,
  ActionDamageDefinition,
  ActionDice,
  ActionDiceDefinition,
  ActionEffectDefinition,
  ActionGrantPayload,
  ActionRange,
  ActionRequirementDefinition,
  ActionRequirementEnforcement,
  ActionResourceCost,
  CharacterCondition,
  CharacterContribution,
  CharacterState,
  FormulaExpression,
  GrantPayload,
  GrantTarget,
  MechanicalData,
  NumericContribution,
  NumericTarget,
  ResolvedAction,
  ResolvedActionCostOption,
  ResolvedActionEffect,
  ResolvedActionRequirement,
  ResolvedActionResourceCost,
  ResolvedGrant,
  ResolvedNumber,
  ResolvedResource,
  StateFactValue,
} from "./types.ts"

export class ActionEngineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ActionEngineError"
  }
}

const GRANT_TARGETS = new Set<GrantTarget>([
  "resistance",
  "immunity",
  "language",
  "proficiency",
  "sense",
  "feature",
  "trait",
  "resource",
  "value",
  "permission",
  "action",
  "spell",
])

function asObject(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ActionEngineError(message)
  }
  return value as Record<string, unknown>
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ActionEngineError(`${field} must be a non-empty string`)
  }
  return value
}

function finiteNonNegative(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new ActionEngineError(`${field} must be a finite number >= 0`)
  }
  return value
}

function positiveInteger(value: unknown, field: string, minimum = 1): number {
  if (!Number.isInteger(value) || (value as number) < minimum) {
    throw new ActionEngineError(`${field} must be an integer >= ${minimum}`)
  }
  return value as number
}

function parseRange(value: unknown): ActionRange {
  const object = asObject(value, "action range must be an object")
  const kind = nonEmptyString(object.kind, "action range.kind")

  if (kind === "self" || kind === "touch") return { kind }
  if (kind === "melee") {
    return {
      kind,
      reach: finiteNonNegative(object.reach, "action range.reach"),
      unit: nonEmptyString(object.unit, "action range.unit"),
    }
  }
  if (kind === "ranged") {
    const normal = finiteNonNegative(object.normal, "action range.normal")
    const unit = nonEmptyString(object.unit, "action range.unit")
    if (object.long === undefined) return { kind, normal, unit }
    const long = finiteNonNegative(object.long, "action range.long")
    if (long < normal) {
      throw new ActionEngineError("action range.long must be >= range.normal")
    }
    return { kind, normal, long, unit }
  }
  if (kind === "area") {
    return {
      kind,
      shape: nonEmptyString(object.shape, "action range.shape"),
      size: finiteNonNegative(object.size, "action range.size"),
      unit: nonEmptyString(object.unit, "action range.unit"),
    }
  }
  if (kind === "custom") {
    return { kind, label: nonEmptyString(object.label, "action range.label") }
  }

  throw new ActionEngineError(`unsupported action range kind: ${kind}`)
}

function parseFormula(value: unknown, field: string): FormulaExpression {
  const formula = value as FormulaExpression
  try {
    validateFormula(formula)
  } catch (error) {
    throw new ActionEngineError(`${field}: ${error instanceof Error ? error.message : String(error)}`)
  }
  return formula
}

function parseDicePart(value: unknown, field: string, minimum: number): number | FormulaExpression {
  if (typeof value === "number") return positiveInteger(value, field, minimum)
  return parseFormula(value, field)
}

function parseDamage(value: unknown, index: number): ActionDamageDefinition {
  const object = asObject(value, `action damage[${index}] must be an object`)
  const key = nonEmptyString(object.key, `action damage[${index}].key`)
  const type = nonEmptyString(object.type, `action damage[${index}].type`)

  let dice: ActionDiceDefinition | undefined
  if (object.dice !== undefined) {
    const diceObject = asObject(object.dice, `action damage[${index}].dice must be an object`)
    dice = {
      count: parseDicePart(diceObject.count, `action damage[${index}].dice.count`, 1),
      sides: parseDicePart(diceObject.sides, `action damage[${index}].dice.sides`, 2),
    }
  }

  const modifier =
    object.modifier === undefined
      ? undefined
      : parseFormula(object.modifier, `action damage[${index}].modifier`)

  if (!dice && !modifier) {
    throw new ActionEngineError(`action damage[${index}] must define dice and/or modifier`)
  }

  return {
    key,
    type,
    ...(dice ? { dice } : {}),
    ...(modifier ? { modifier } : {}),
  }
}

function parseResourceCost(value: unknown, field: string): ActionResourceCost {
  const cost = asObject(value, `${field} must be an object`)
  const key = nonEmptyString(cost.key, `${field}.key`)
  const variantKey =
    cost.variantKey === undefined ? undefined : nonEmptyString(cost.variantKey, `${field}.variantKey`)
  const amount = finiteNonNegative(cost.amount, `${field}.amount`)
  if (amount === 0) throw new ActionEngineError(`${field}.amount must be > 0`)
  return { key, ...(variantKey ? { variantKey } : {}), amount }
}

function assertUniqueResourceCosts(costs: ActionResourceCost[], field: string): void {
  const stateKeys = new Set<string>()
  for (const cost of costs) {
    const stateKey = resourceStateKey(cost.key, cost.variantKey ?? "default")
    if (stateKeys.has(stateKey)) throw new ActionEngineError(`duplicate ${field}: ${stateKey}`)
    stateKeys.add(stateKey)
  }
}

function parseCostOptions(value: unknown): ActionCostOption[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ActionEngineError("action costOptions must be a non-empty array")
  }
  const options = value.map((rawOption, index) => {
    const option = asObject(rawOption, `action costOptions[${index}] must be an object`)
    const key = nonEmptyString(option.key, `action costOptions[${index}].key`)
    if (!Array.isArray(option.costs) || option.costs.length === 0) {
      throw new ActionEngineError(`action costOptions[${index}].costs must be a non-empty array`)
    }
    const costs = option.costs.map((cost, costIndex) =>
      parseResourceCost(cost, `action costOptions[${index}].costs[${costIndex}]`),
    )
    assertUniqueResourceCosts(costs, `action costOptions[${index}] resource cost`)
    const label = option.label === undefined ? undefined : nonEmptyString(option.label, `action costOptions[${index}].label`)
    return { key, costs, ...(label ? { label } : {}) }
  })
  const keys = options.map((option) => option.key)
  if (new Set(keys).size !== keys.length) throw new ActionEngineError("action costOptions keys must be unique")
  return options
}

function parseFactValue(value: unknown, field: string): StateFactValue {
  if (value === null) return null
  if (typeof value === "string") return value
  if (typeof value === "boolean") return value
  if (typeof value === "number" && Number.isFinite(value)) return value
  throw new ActionEngineError(`${field} must be a finite number, string, boolean or null`)
}

function parseCondition(value: unknown, field: string): CharacterCondition {
  const object = asObject(value, `${field} must be an object`)
  const kind = nonEmptyString(object.kind, `${field}.kind`)
  if (kind === "always") return { kind }
  if (kind === "hp_below_percent") {
    const percent = finiteNonNegative(object.percent, `${field}.percent`)
    if (percent > 100) throw new ActionEngineError(`${field}.percent must be <= 100`)
    return { kind, percent }
  }
  if (kind === "state") {
    const key = nonEmptyString(object.key, `${field}.key`)
    const operator = nonEmptyString(object.operator, `${field}.operator`)
    if (operator === "EXISTS" || operator === "NOT_EXISTS") return { kind, key, operator }
    if (operator === "EQUALS" || operator === "NOT_EQUALS") {
      return { kind, key, operator, value: parseFactValue(object.value, `${field}.value`) }
    }
    if (operator === "GT" || operator === "GTE" || operator === "LT" || operator === "LTE") {
      if (typeof object.value !== "number" || !Number.isFinite(object.value)) {
        throw new ActionEngineError(`${field}.value must be finite for ${operator}`)
      }
      return { kind, key, operator, value: object.value }
    }
    throw new ActionEngineError(`unsupported ${field}.operator: ${operator}`)
  }
  if (kind === "all" || kind === "any") {
    if (!Array.isArray(object.conditions) || object.conditions.length === 0) {
      throw new ActionEngineError(`${field}.conditions must be a non-empty array`)
    }
    const conditions = object.conditions.map((condition, index) =>
      parseCondition(condition, `${field}.conditions[${index}]`),
    )
    return { kind, conditions }
  }
  if (kind === "not") return { kind, condition: parseCondition(object.condition, `${field}.condition`) }
  throw new ActionEngineError(`unsupported ${field}.kind: ${kind}`)
}

function parseEnforcement(value: unknown, field: string): ActionRequirementEnforcement {
  if (value === undefined || value === "engine") return "engine"
  if (value === "gm") return "gm"
  throw new ActionEngineError(`${field} must be engine or gm`)
}

function parseRequirements(value: unknown): ActionRequirementDefinition[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ActionEngineError("action requirements must be a non-empty array")
  }
  return value.map((rawRequirement, index) => {
    const field = `action requirements[${index}]`
    const requirement = asObject(rawRequirement, `${field} must be an object`)
    const kind = nonEmptyString(requirement.kind, `${field}.kind`)
    const enforcement = parseEnforcement(requirement.enforcement, `${field}.enforcement`)
    const label = requirement.label === undefined ? undefined : nonEmptyString(requirement.label, `${field}.label`)
    if (kind === "condition") {
      return {
        kind,
        condition: parseCondition(requirement.condition, `${field}.condition`),
        enforcement,
        ...(label ? { label } : {}),
      }
    }
    if (kind === "resource") {
      const minimum = finiteNonNegative(requirement.minimum, `${field}.minimum`)
      return {
        kind,
        key: nonEmptyString(requirement.key, `${field}.key`),
        ...(requirement.variantKey === undefined
          ? {}
          : { variantKey: nonEmptyString(requirement.variantKey, `${field}.variantKey`) }),
        minimum,
        enforcement,
        ...(label ? { label } : {}),
      }
    }
    if (kind === "grant") {
      const target = nonEmptyString(requirement.target, `${field}.target`) as GrantTarget
      if (!GRANT_TARGETS.has(target)) throw new ActionEngineError(`unsupported ${field}.target: ${target}`)
      return {
        kind,
        target,
        key: nonEmptyString(requirement.key, `${field}.key`),
        ...(requirement.variantKey === undefined
          ? {}
          : { variantKey: nonEmptyString(requirement.variantKey, `${field}.variantKey`) }),
        enforcement,
        ...(label ? { label } : {}),
      }
    }
    throw new ActionEngineError(`unsupported ${field}.kind: ${kind}`)
  })
}

function parseEffects(value: unknown): ActionEffectDefinition[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ActionEngineError("action effects must be a non-empty array")
  }
  return value.map((rawEffect, index) => {
    const field = `action effects[${index}]`
    const effect = asObject(rawEffect, `${field} must be an object`)
    const kind = nonEmptyString(effect.kind, `${field}.kind`)
    if (kind === "state") {
      const key = nonEmptyString(effect.key, `${field}.key`)
      const operation = nonEmptyString(effect.operation, `${field}.operation`)
      if (operation === "UNSET") return { kind, key, operation }
      if (operation === "SET") {
        return { kind, key, operation, value: parseFactValue(effect.value, `${field}.value`) }
      }
      if (operation === "ADD" || operation === "SUBTRACT") {
        if (typeof effect.value !== "number" || !Number.isFinite(effect.value)) {
          throw new ActionEngineError(`${field}.value must be finite for ${operation}`)
        }
        return { kind, key, operation, value: effect.value }
      }
      throw new ActionEngineError(`unsupported ${field}.operation: ${operation}`)
    }
    if (kind === "resource") {
      const operation = nonEmptyString(effect.operation, `${field}.operation`)
      if (operation !== "RESTORE" && operation !== "SPEND" && operation !== "SET") {
        throw new ActionEngineError(`unsupported ${field}.operation: ${operation}`)
      }
      const amount =
        typeof effect.amount === "number"
          ? finiteNonNegative(effect.amount, `${field}.amount`)
          : parseFormula(effect.amount, `${field}.amount`)
      return {
        kind,
        key: nonEmptyString(effect.key, `${field}.key`),
        ...(effect.variantKey === undefined
          ? {}
          : { variantKey: nonEmptyString(effect.variantKey, `${field}.variantKey`) }),
        operation,
        amount,
      }
    }
    if (kind === "semantic") {
      return {
        kind,
        key: nonEmptyString(effect.key, `${field}.key`),
        ...(effect.payload === undefined ? {} : { payload: effect.payload as MechanicalData }),
      }
    }
    throw new ActionEngineError(`unsupported ${field}.kind: ${kind}`)
  })
}

/** Runtime validation + normalization for an action GRANT payload. */
export function parseActionGrantPayload(payload: GrantPayload | undefined): ActionGrantPayload {
  const object = asObject(payload, "action grant payload must be an object")
  const economy = nonEmptyString(object.economy, "action economy")

  let attack: ActionGrantPayload["attack"]
  if (object.attack !== undefined) {
    const attackObject = asObject(object.attack, "action attack must be an object")
    attack = {
      bonus: parseFormula(attackObject.bonus, "action attack.bonus"),
      ...(attackObject.target === undefined
        ? {}
        : { target: nonEmptyString(attackObject.target, "action attack.target") }),
      ...(attackObject.criticalThreshold === undefined
        ? {}
        : {
            criticalThreshold: positiveInteger(
              attackObject.criticalThreshold,
              "action attack.criticalThreshold",
            ),
          }),
    }
    if (attack.criticalThreshold !== undefined && attack.criticalThreshold > 20) {
      throw new ActionEngineError("action attack.criticalThreshold must be <= 20")
    }
  }

  let damage: ActionDamageDefinition[] | undefined
  if (object.damage !== undefined) {
    if (!Array.isArray(object.damage) || object.damage.length === 0) {
      throw new ActionEngineError("action damage must be a non-empty array")
    }
    damage = object.damage.map(parseDamage)
    const damageKeys = new Set<string>()
    for (const component of damage) {
      if (damageKeys.has(component.key)) {
        throw new ActionEngineError(`duplicate action damage key: ${component.key}`)
      }
      damageKeys.add(component.key)
    }
  }

  let resourceCosts: ActionGrantPayload["resourceCosts"]
  if (object.resourceCosts !== undefined) {
    if (!Array.isArray(object.resourceCosts) || object.resourceCosts.length === 0) {
      throw new ActionEngineError("action resourceCosts must be a non-empty array")
    }
    resourceCosts = object.resourceCosts.map((cost, index) =>
      parseResourceCost(cost, `action resourceCosts[${index}]`),
    )
    assertUniqueResourceCosts(resourceCosts, "action resource cost")
  }

  const costOptions = object.costOptions === undefined ? undefined : parseCostOptions(object.costOptions)
  const requirements = object.requirements === undefined ? undefined : parseRequirements(object.requirements)
  const effects = object.effects === undefined ? undefined : parseEffects(object.effects)

  let tags: string[] | undefined
  if (object.tags !== undefined) {
    if (!Array.isArray(object.tags)) throw new ActionEngineError("action tags must be an array")
    tags = object.tags.map((tag, index) => nonEmptyString(tag, `action tags[${index}]`))
    if (new Set(tags).size !== tags.length) {
      throw new ActionEngineError("action tags must be unique")
    }
  }

  return {
    economy,
    ...(object.label === undefined ? {} : { label: nonEmptyString(object.label, "action label") }),
    ...(object.range === undefined ? {} : { range: parseRange(object.range) }),
    ...(attack ? { attack } : {}),
    ...(damage ? { damage } : {}),
    ...(resourceCosts ? { resourceCosts } : {}),
    ...(costOptions ? { costOptions } : {}),
    ...(requirements ? { requirements } : {}),
    ...(effects ? { effects } : {}),
    ...(tags ? { tags } : {}),
  }
}

export function actionStateKey(key: string, variantKey = "default"): string {
  return variantKey === "default" ? key : `${key}::${variantKey}`
}

export function actionAttackBonusTarget(stateKey: string): NumericTarget {
  return `actions.${stateKey}.attackBonus`
}

export function actionDamageModifierTarget(stateKey: string, damageKey: string): NumericTarget {
  return `actions.${stateKey}.damage.${damageKey}.modifier`
}

function resolveActionNumber(
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

function resolveDicePart(
  value: number | FormulaExpression,
  formulaContext: FormulaContext,
  field: string,
  minimum: number,
): number {
  const resolved = typeof value === "number" ? value : evaluateFormula(value, formulaContext)
  if (!Number.isInteger(resolved) || resolved < minimum) {
    throw new ActionEngineError(`${field} resolved to ${resolved}; expected integer >= ${minimum}`)
  }
  return resolved
}

function resolveDice(
  definition: ActionDiceDefinition,
  formulaContext: FormulaContext,
  field: string,
): ActionDice {
  return {
    count: resolveDicePart(definition.count, formulaContext, `${field}.count`, 1),
    sides: resolveDicePart(definition.sides, formulaContext, `${field}.sides`, 2),
  }
}

function resolveResourceCost(cost: ActionResourceCost, resources: ResolvedResource[]): ResolvedActionResourceCost {
  const variantKey = cost.variantKey ?? "default"
  const stateKey = resourceStateKey(cost.key, variantKey)
  const resource = resources.find((candidate) => candidate.stateKey === stateKey)
  const current = resource?.current ?? 0
  return {
    key: cost.key,
    variantKey,
    stateKey,
    amount: cost.amount,
    current,
    max: resource?.max.value ?? 0,
    available: resource !== undefined && current >= cost.amount,
  }
}

function resolveCostOption(option: ActionCostOption, resources: ResolvedResource[]): ResolvedActionCostOption {
  const costs = option.costs.map((cost) => resolveResourceCost(cost, resources))
  return {
    key: option.key,
    ...(option.label === undefined ? {} : { label: option.label }),
    costs,
    available: costs.every((cost) => cost.available),
  }
}

function resolveRequirement(
  definition: ActionRequirementDefinition,
  grants: ResolvedGrant[],
  resources: ResolvedResource[],
  state: CharacterState,
  maxHp: number,
): ResolvedActionRequirement {
  let satisfied = false
  if (definition.kind === "condition") {
    satisfied = evaluateCondition(definition.condition, { state, maxHp })
  } else if (definition.kind === "resource") {
    const stateKey = resourceStateKey(definition.key, definition.variantKey ?? "default")
    const resource = resources.find((candidate) => candidate.stateKey === stateKey)
    satisfied = resource !== undefined && resource.current >= definition.minimum
  } else {
    const variantKey = definition.variantKey ?? "default"
    satisfied = grants.some(
      (grant) =>
        grant.target === definition.target &&
        grant.key === definition.key &&
        grant.variantKey === variantKey,
    )
  }
  return {
    kind: definition.kind,
    enforcement: definition.enforcement ?? "engine",
    ...(definition.label === undefined ? {} : { label: definition.label }),
    satisfied,
  }
}

function resolveEffect(
  definition: ActionEffectDefinition,
  resources: ResolvedResource[],
  formulaContext: FormulaContext,
): ResolvedActionEffect {
  if (definition.kind === "state" || definition.kind === "semantic") return definition
  const variantKey = definition.variantKey ?? "default"
  const stateKey = resourceStateKey(definition.key, variantKey)
  const resource = resources.find((candidate) => candidate.stateKey === stateKey)
  const amount =
    typeof definition.amount === "number"
      ? definition.amount
      : evaluateFormula(definition.amount, formulaContext)
  if (!Number.isFinite(amount) || amount < 0) {
    throw new ActionEngineError(`action resource effect ${stateKey} resolved invalid amount: ${amount}`)
  }
  return {
    kind: "resource",
    key: definition.key,
    variantKey,
    stateKey,
    operation: definition.operation,
    amount,
    current: resource?.current ?? 0,
    max: resource?.max.value ?? 0,
  }
}

/** Resolves active action grants into ready-to-render/use mechanical actions. */
export function resolveActions(
  grants: ResolvedGrant[],
  contributions: CharacterContribution[],
  resources: ResolvedResource[],
  state: CharacterState,
  maxHp: number,
  formulaContext: FormulaContext,
): ResolvedAction[] {
  return grants
    .filter((grant) => grant.target === "action")
    .map((grant) => {
      const definition = parseActionGrantPayload(grant.payload)
      const stateKey = actionStateKey(grant.key, grant.variantKey)

      const attack = definition.attack
        ? {
            formula: definition.attack.bonus,
            bonus: resolveActionNumber(
              actionAttackBonusTarget(stateKey),
              evaluateFormula(definition.attack.bonus, formulaContext),
              contributions,
              state,
              maxHp,
            ),
            ...(definition.attack.target === undefined ? {} : { target: definition.attack.target }),
            ...(definition.attack.criticalThreshold === undefined
              ? {}
              : { criticalThreshold: definition.attack.criticalThreshold }),
          }
        : undefined

      const damage = (definition.damage ?? []).map((component) => {
        const baseModifier = component.modifier
          ? evaluateFormula(component.modifier, formulaContext)
          : 0
        return {
          key: component.key,
          type: component.type,
          ...(component.dice
            ? { dice: resolveDice(component.dice, formulaContext, `action ${stateKey} damage ${component.key}`) }
            : {}),
          modifier: resolveActionNumber(
            actionDamageModifierTarget(stateKey, component.key),
            baseModifier,
            contributions,
            state,
            maxHp,
          ),
          ...(component.modifier ? { modifierFormula: component.modifier } : {}),
        }
      })

      const resourceCosts = (definition.resourceCosts ?? []).map((cost) =>
        resolveResourceCost(cost, resources),
      )
      const costOptions = (definition.costOptions ?? []).map((option) =>
        resolveCostOption(option, resources),
      )
      const requirements = (definition.requirements ?? []).map((requirement) =>
        resolveRequirement(requirement, grants, resources, state, maxHp),
      )
      const effects = (definition.effects ?? []).map((effect) =>
        resolveEffect(effect, resources, formulaContext),
      )

      const engineRequirementsSatisfied = requirements
        .filter((requirement) => requirement.enforcement === "engine")
        .every((requirement) => requirement.satisfied)
      const alternativeCostsSatisfied =
        costOptions.length === 0 || costOptions.some((option) => option.available)

      return {
        key: grant.key,
        variantKey: grant.variantKey,
        stateKey,
        ...(definition.label === undefined ? {} : { label: definition.label }),
        economy: definition.economy,
        ...(definition.range === undefined ? {} : { range: definition.range }),
        ...(attack ? { attack } : {}),
        damage,
        resourceCosts,
        costOptions,
        requirements,
        effects,
        tags: definition.tags ?? [],
        available:
          resourceCosts.every((cost) => cost.available) &&
          alternativeCostsSatisfied &&
          engineRequirementsSatisfied,
        sources: grant.sources,
      }
    })
    .sort((left, right) => left.stateKey.localeCompare(right.stateKey))
}

function selectCostOption(action: ResolvedAction, optionKey?: string): ResolvedActionCostOption | undefined {
  if (action.costOptions.length === 0) return undefined
  if (optionKey !== undefined) {
    const selected = action.costOptions.find((option) => option.key === optionKey)
    if (!selected) throw new ActionEngineError(`unknown action cost option: ${optionKey}`)
    if (!selected.available) throw new ActionEngineError(`action cost option is unavailable: ${optionKey}`)
    return selected
  }
  const available = action.costOptions.filter((option) => option.available)
  if (available.length === 1) return available[0]
  if (available.length === 0) throw new ActionEngineError(`no action cost option is available: ${action.stateKey}`)
  throw new ActionEngineError(`action cost option must be selected: ${action.stateKey}`)
}

/** Atomically spends mandatory costs plus one selected alternative cost option. */
export function applyActionResourceCosts(
  state: CharacterState,
  action: ResolvedAction,
  optionKey?: string,
): CharacterState {
  if (!action.available) {
    throw new ActionEngineError(`action is unavailable: ${action.stateKey}`)
  }

  const resources = Object.fromEntries(
    Object.entries(state.resources ?? {}).map(([key, value]) => [key, { ...value }]),
  )
  const selectedOption = selectCostOption(action, optionKey)
  const costs = [...action.resourceCosts, ...(selectedOption?.costs ?? [])]

  for (const cost of costs) {
    const current = resources[cost.stateKey]?.current ?? cost.current
    if (current < cost.amount) {
      throw new ActionEngineError(`insufficient resource for action: ${cost.stateKey}`)
    }
    resources[cost.stateKey] = { current: current - cost.amount }
  }

  return { ...state, resources }
}

/** Applies self/runtime effects. Semantic effects are preserved for external ruleset/chat executors. */
export function applyActionEffects(state: CharacterState, action: ResolvedAction): CharacterState {
  const facts = { ...(state.facts ?? {}) }
  const resources = Object.fromEntries(
    Object.entries(state.resources ?? {}).map(([key, value]) => [key, { ...value }]),
  )

  for (const effect of action.effects) {
    if (effect.kind === "semantic") continue
    if (effect.kind === "state") {
      if (effect.operation === "UNSET") {
        delete facts[effect.key]
      } else if (effect.operation === "SET") {
        facts[effect.key] = effect.value
      } else {
        const current = facts[effect.key]
        if (current !== undefined && typeof current !== "number") {
          throw new ActionEngineError(`state fact is not numeric: ${effect.key}`)
        }
        const base = typeof current === "number" ? current : 0
        facts[effect.key] = effect.operation === "ADD" ? base + effect.value : base - effect.value
      }
      continue
    }

    const runtime = resources[effect.stateKey]
    if (!runtime) throw new ActionEngineError(`resource effect target is unavailable: ${effect.stateKey}`)
    const current = runtime.current
    let next: number
    if (effect.operation === "RESTORE") next = Math.min(effect.max, current + effect.amount)
    else if (effect.operation === "SET") next = Math.min(effect.max, effect.amount)
    else {
      if (current < effect.amount) {
        throw new ActionEngineError(`insufficient resource for effect: ${effect.stateKey}`)
      }
      next = current - effect.amount
    }
    resources[effect.stateKey] = { current: Math.max(0, next) }
  }

  return { ...state, facts, resources }
}

/** Executes one resolved action against its actor state without knowing its class/ruleset. */
export function executeAction(
  state: CharacterState,
  action: ResolvedAction,
  optionKey?: string,
): CharacterState {
  return applyActionEffects(applyActionResourceCosts(state, action, optionKey), action)
}
