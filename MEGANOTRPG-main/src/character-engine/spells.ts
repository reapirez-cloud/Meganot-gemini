import { evaluateCondition } from "./conditions.ts"
import { resolveNumericConflicts } from "./conflicts.ts"
import { evaluateFormula, validateFormula, type FormulaContext } from "./formulas.ts"
import { resourceStateKey } from "./resources.ts"
import {
  ABILITY_KEYS,
  type AbilityKey,
  type CharacterContribution,
  type CharacterState,
  type FormulaExpression,
  type GrantPayload,
  type NumericContribution,
  type NumericTarget,
  type ResolvedGrant,
  type ResolvedNumber,
  type ResolvedResource,
  type ResolvedSpell,
  type ResolvedSpellResourceOption,
  type SpellCastingMethodDefinition,
  type SpellGrantPayload,
  type SpellIdentityDefinition,
  type SpellPreparationRule,
  type SpellResourceOption,
} from "./types.ts"

export class SpellEngineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SpellEngineError"
  }
}

export class SpellConflictError extends SpellEngineError {
  constructor(message: string) {
    super(message)
    this.name = "SpellConflictError"
  }
}

function asObject(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SpellEngineError(message)
  }
  return value as Record<string, unknown>
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new SpellEngineError(`${field} must be a non-empty string`)
  }
  return value
}

function positiveNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new SpellEngineError(`${field} must be a finite number > 0`)
  }
  return value
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new SpellEngineError(`${field} must be an integer >= 0`)
  }
  return value as number
}

function parseFormula(value: unknown, field: string): FormulaExpression {
  const formula = value as FormulaExpression
  try {
    validateFormula(formula)
  } catch (error) {
    throw new SpellEngineError(`${field}: ${error instanceof Error ? error.message : String(error)}`)
  }
  return formula
}

function parseIdentity(value: unknown): SpellIdentityDefinition {
  const object = asObject(value, "spell identity must be an object")
  const level = nonNegativeInteger(object.level, "spell.level")
  if (object.ritual !== undefined && typeof object.ritual !== "boolean") {
    throw new SpellEngineError("spell.ritual must be boolean")
  }

  return {
    name: nonEmptyString(object.name, "spell.name"),
    level,
    ...(object.school === undefined ? {} : { school: nonEmptyString(object.school, "spell.school") }),
    ...(object.ritual === undefined ? {} : { ritual: object.ritual as boolean }),
  }
}

function parsePreparation(value: unknown): SpellPreparationRule {
  const object = asObject(value, "spell preparation must be an object")
  const mode = nonEmptyString(object.mode, "spell preparation.mode")

  if (mode === "prepared") {
    if (object.defaultPrepared !== undefined && typeof object.defaultPrepared !== "boolean") {
      throw new SpellEngineError("spell preparation.defaultPrepared must be boolean")
    }
    return {
      mode,
      ...(object.defaultPrepared === undefined ? {} : { defaultPrepared: object.defaultPrepared as boolean }),
    }
  }
  if (mode === "always_prepared" || mode === "not_required") return { mode }

  throw new SpellEngineError(`unsupported spell preparation mode: ${mode}`)
}

function parseResourceOption(value: unknown, index: number, spellLevel: number): SpellResourceOption {
  const object = asObject(value, `spell resourceOptions[${index}] must be an object`)
  if (!Array.isArray(object.costs) || object.costs.length === 0) {
    throw new SpellEngineError(`spell resourceOptions[${index}].costs must be a non-empty array`)
  }

  const costs = object.costs.map((rawCost, costIndex) => {
    const cost = asObject(
      rawCost,
      `spell resourceOptions[${index}].costs[${costIndex}] must be an object`,
    )
    const variantKey =
      cost.variantKey === undefined
        ? undefined
        : nonEmptyString(
            cost.variantKey,
            `spell resourceOptions[${index}].costs[${costIndex}].variantKey`,
          )
    return {
      key: nonEmptyString(cost.key, `spell resourceOptions[${index}].costs[${costIndex}].key`),
      ...(variantKey ? { variantKey } : {}),
      amount: positiveNumber(
        cost.amount,
        `spell resourceOptions[${index}].costs[${costIndex}].amount`,
      ),
    }
  })

  const costStateKeys = costs.map((cost) => resourceStateKey(cost.key, cost.variantKey ?? "default"))
  if (new Set(costStateKeys).size !== costStateKeys.length) {
    throw new SpellEngineError(`spell resourceOptions[${index}] contains duplicate resource costs`)
  }

  let castLevel: number | undefined
  if (object.castLevel !== undefined) {
    castLevel = nonNegativeInteger(object.castLevel, `spell resourceOptions[${index}].castLevel`)
    if (castLevel < spellLevel) {
      throw new SpellEngineError(
        `spell resourceOptions[${index}].castLevel must be >= spell level ${spellLevel}`,
      )
    }
  }

  return {
    key: nonEmptyString(object.key, `spell resourceOptions[${index}].key`),
    ...(castLevel === undefined ? {} : { castLevel }),
    costs,
  }
}

function parseMethod(value: unknown, index: number, spellLevel: number): SpellCastingMethodDefinition {
  const object = asObject(value, `spell methods[${index}] must be an object`)
  const ability = object.ability
  if (ability !== undefined && !ABILITY_KEYS.includes(ability as AbilityKey)) {
    throw new SpellEngineError(`spell methods[${index}].ability is unsupported: ${String(ability)}`)
  }
  if (object.requiresPrepared !== undefined && typeof object.requiresPrepared !== "boolean") {
    throw new SpellEngineError(`spell methods[${index}].requiresPrepared must be boolean`)
  }

  let resourceOptions: SpellResourceOption[] | undefined
  if (object.resourceOptions !== undefined) {
    if (!Array.isArray(object.resourceOptions) || object.resourceOptions.length === 0) {
      throw new SpellEngineError(`spell methods[${index}].resourceOptions must be a non-empty array`)
    }
    resourceOptions = object.resourceOptions.map((option, optionIndex) =>
      parseResourceOption(option, optionIndex, spellLevel),
    )
    const optionKeys = resourceOptions.map((option) => option.key)
    if (new Set(optionKeys).size !== optionKeys.length) {
      throw new SpellEngineError(`spell methods[${index}] contains duplicate resource option keys`)
    }
  }

  return {
    key: nonEmptyString(object.key, `spell methods[${index}].key`),
    kind: nonEmptyString(object.kind, `spell methods[${index}].kind`),
    ...(ability === undefined ? {} : { ability: ability as AbilityKey }),
    ...(object.attackBonus === undefined
      ? {}
      : { attackBonus: parseFormula(object.attackBonus, `spell methods[${index}].attackBonus`) }),
    ...(object.saveDc === undefined
      ? {}
      : { saveDc: parseFormula(object.saveDc, `spell methods[${index}].saveDc`) }),
    ...(object.requiresPrepared === undefined
      ? {}
      : { requiresPrepared: object.requiresPrepared as boolean }),
    ...(resourceOptions ? { resourceOptions } : {}),
  }
}

/** Runtime validation + normalization for one spell access GRANT payload. */
export function parseSpellGrantPayload(payload: GrantPayload | undefined): SpellGrantPayload {
  const object = asObject(payload, "spell grant payload must be an object")
  const spell = parseIdentity(object.spell)
  const preparation = parsePreparation(object.preparation)

  if (!Array.isArray(object.methods) || object.methods.length === 0) {
    throw new SpellEngineError("spell methods must be a non-empty array")
  }
  const methods = object.methods.map((method, index) => parseMethod(method, index, spell.level))
  const methodKeys = methods.map((method) => method.key)
  if (new Set(methodKeys).size !== methodKeys.length) {
    throw new SpellEngineError("spell methods must have unique keys")
  }

  return { spell, preparation, methods }
}

export function spellAccessStateKey(spellKey: string, accessKey: string): string {
  return `${spellKey}::${accessKey}`
}

export function spellPreparedFactKey(spellKey: string, accessKey: string): string {
  return `spells.${spellAccessStateKey(spellKey, accessKey)}.prepared`
}

export function spellMethodAttackBonusTarget(
  spellKey: string,
  accessKey: string,
  methodKey: string,
): NumericTarget {
  return `spells.${spellKey}.access.${accessKey}.method.${methodKey}.attackBonus`
}

export function spellMethodSaveDcTarget(
  spellKey: string,
  accessKey: string,
  methodKey: string,
): NumericTarget {
  return `spells.${spellKey}.access.${accessKey}.method.${methodKey}.saveDc`
}

function canonicalIdentity(identity: SpellIdentityDefinition): string {
  return JSON.stringify({
    name: identity.name,
    level: identity.level,
    school: identity.school ?? null,
    ritual: identity.ritual ?? false,
  })
}

function resolveSpellNumber(
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

function preparedState(
  preparation: SpellPreparationRule,
  spellKey: string,
  accessKey: string,
  state: CharacterState,
): { prepared: boolean; factKey?: string } {
  if (preparation.mode === "always_prepared" || preparation.mode === "not_required") {
    return { prepared: true }
  }

  const factKey = spellPreparedFactKey(spellKey, accessKey)
  const fact = state.facts?.[factKey]
  if (fact !== undefined && typeof fact !== "boolean") {
    throw new SpellEngineError(`spell prepared fact must be boolean: ${factKey}`)
  }
  return {
    prepared: typeof fact === "boolean" ? fact : (preparation.defaultPrepared ?? false),
    factKey,
  }
}

function formulaContextValue(context: FormulaContext, key: string): number {
  const value = context[key]
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SpellEngineError(`missing finite formula context value: ${key}`)
  }
  return value
}

function resolveResourceOption(
  option: SpellResourceOption,
  spellLevel: number,
  resources: ResolvedResource[],
): ResolvedSpellResourceOption {
  const costs = option.costs.map((cost) => {
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
  })

  return {
    key: option.key,
    castLevel: option.castLevel ?? spellLevel,
    costs,
    available: costs.every((cost) => cost.available),
  }
}

/**
 * Resolves one card per spell identity. Every grant variant becomes one access;
 * source provenance stays on that access so the renderer can show concrete badges.
 */
export function resolveSpells(
  grants: ResolvedGrant[],
  contributions: CharacterContribution[],
  resources: ResolvedResource[],
  state: CharacterState,
  maxHp: number,
  formulaContext: FormulaContext,
): ResolvedSpell[] {
  const spellGrants = grants.filter((grant) => grant.target === "spell")
  const bySpell = new Map<string, ResolvedGrant[]>()
  for (const grant of spellGrants) {
    const list = bySpell.get(grant.key) ?? []
    list.push(grant)
    bySpell.set(grant.key, list)
  }

  const resolved: ResolvedSpell[] = []
  for (const [spellKey, accessGrants] of bySpell) {
    let identity: SpellIdentityDefinition | undefined
    let identitySignature: string | undefined

    const accesses = accessGrants
      .slice()
      .sort((left, right) => left.variantKey.localeCompare(right.variantKey))
      .map((grant) => {
        const definition = parseSpellGrantPayload(grant.payload)
        const signature = canonicalIdentity(definition.spell)
        if (identitySignature !== undefined && signature !== identitySignature) {
          throw new SpellConflictError(`conflicting spell identity definitions for ${spellKey}`)
        }
        identity = definition.spell
        identitySignature = signature

        const preparation = preparedState(
          definition.preparation,
          spellKey,
          grant.variantKey,
          state,
        )

        const methods = definition.methods.map((method) => {
          const requiresPrepared = method.requiresPrepared ?? true
          const preparationAvailable = !requiresPrepared || preparation.prepared
          const resourceOptions = (method.resourceOptions ?? []).map((option) =>
            resolveResourceOption(option, definition.spell.level, resources),
          )
          const resourceAvailable =
            resourceOptions.length === 0 || resourceOptions.some((option) => option.available)

          let attackBonus: ResolvedNumber | undefined
          let saveDc: ResolvedNumber | undefined
          const abilityModifier =
            method.ability === undefined
              ? undefined
              : formulaContextValue(formulaContext, `abilities.${method.ability}.modifier`)
          const proficiencyBonus = formulaContextValue(formulaContext, "core.proficiencyBonus")

          if (method.attackBonus !== undefined || abilityModifier !== undefined) {
            const baseAttack =
              method.attackBonus !== undefined
                ? evaluateFormula(method.attackBonus, formulaContext)
                : abilityModifier! + proficiencyBonus
            attackBonus = resolveSpellNumber(
              spellMethodAttackBonusTarget(spellKey, grant.variantKey, method.key),
              baseAttack,
              contributions,
              state,
              maxHp,
            )
          }

          if (method.saveDc !== undefined || abilityModifier !== undefined) {
            const baseSaveDc =
              method.saveDc !== undefined
                ? evaluateFormula(method.saveDc, formulaContext)
                : 8 + abilityModifier! + proficiencyBonus
            saveDc = resolveSpellNumber(
              spellMethodSaveDcTarget(spellKey, grant.variantKey, method.key),
              baseSaveDc,
              contributions,
              state,
              maxHp,
            )
          }

          return {
            key: method.key,
            kind: method.kind,
            ...(method.ability === undefined ? {} : { ability: method.ability }),
            requiresPrepared,
            ...(attackBonus ? { attackBonus } : {}),
            ...(saveDc ? { saveDc } : {}),
            resourceOptions,
            available: preparationAvailable && resourceAvailable,
          }
        })

        return {
          key: grant.variantKey,
          preparationMode: definition.preparation.mode,
          prepared: preparation.prepared,
          ...(preparation.factKey ? { preparedFactKey: preparation.factKey } : {}),
          methods,
          available: methods.some((method) => method.available),
          sources: grant.sources,
        }
      })

    if (!identity) continue
    resolved.push({
      key: spellKey,
      identity,
      accesses,
      available: accesses.some((access) => access.available),
    })
  }

  return resolved.sort((left, right) =>
    left.identity.level - right.identity.level || left.identity.name.localeCompare(right.identity.name),
  )
}

/** Immutable preparation-state transition for a mutable prepared access. */
export function setSpellAccessPrepared(
  state: CharacterState,
  spellKey: string,
  accessKey: string,
  prepared: boolean,
): CharacterState {
  return {
    ...state,
    facts: {
      ...(state.facts ?? {}),
      [spellPreparedFactKey(spellKey, accessKey)]: prepared,
    },
  }
}

/** Atomically spends one selected resolved casting option. */
export function applySpellResourceOption(
  state: CharacterState,
  option: ResolvedSpellResourceOption,
): CharacterState {
  if (!option.available) {
    throw new SpellEngineError(`spell resource option is unavailable: ${option.key}`)
  }

  const resources = Object.fromEntries(
    Object.entries(state.resources ?? {}).map(([key, value]) => [key, { ...value }]),
  )

  for (const cost of option.costs) {
    if (!cost.available || cost.current < cost.amount) {
      throw new SpellEngineError(`insufficient spell resource: ${cost.stateKey}`)
    }
    resources[cost.stateKey] = { current: cost.current - cost.amount }
  }

  return { ...state, resources }
}
