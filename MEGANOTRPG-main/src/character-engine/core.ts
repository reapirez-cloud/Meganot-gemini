import { parseActionGrantPayload, ActionEngineError } from "./actions.ts"
import { validateFormula } from "./formulas.ts"
import { parseResourceGrantPayload, ResourceEngineError } from "./resources.ts"
import { parseSpellGrantPayload, SpellEngineError } from "./spells.ts"
import { parseValueGrantPayload, ValueEngineError } from "./values.ts"
import {
  ABILITY_KEYS,
  type CharacterCondition,
  type CharacterEngineInput,
  type GrantPayload,
  type StateFactValue,
  type SuppressionCondition,
} from "./types.ts"

export class CharacterEngineInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CharacterEngineInputError"
  }
}

function requireNonEmpty(value: string, field: string) {
  if (!value.trim()) throw new CharacterEngineInputError(`${field} must not be empty`)
}

function requireFinite(value: number, field: string) {
  if (!Number.isFinite(value)) throw new CharacterEngineInputError(`${field} must be a finite number`)
}

function validateFactValue(value: StateFactValue, field: string) {
  if (typeof value === "number") requireFinite(value, field)
}

function validateGrantPayload(value: GrantPayload, field: string): void {
  if (typeof value === "number") {
    requireFinite(value, field)
    return
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") return
  if (Array.isArray(value)) {
    value.forEach((child, index) => validateGrantPayload(child, `${field}[${index}]`))
    return
  }
  for (const [key, child] of Object.entries(value)) {
    requireNonEmpty(key, `${field} key`)
    validateGrantPayload(child as GrantPayload, `${field}.${key}`)
  }
}

function validateStateConditionFields(
  condition: Extract<CharacterCondition, { kind: "state" }>,
  field: string,
) {
  requireNonEmpty(condition.key, `${field}.key`)
  if ("value" in condition) validateFactValue(condition.value, `${field}.value`)
}

function validateCondition(condition: CharacterCondition, field: string): void {
  switch (condition.kind) {
    case "always":
      return
    case "hp_below_percent":
      requireFinite(condition.percent, `${field}.percent`)
      if (condition.percent < 0 || condition.percent > 100) {
        throw new CharacterEngineInputError(`${field}.percent must be between 0 and 100`)
      }
      return
    case "state":
      validateStateConditionFields(condition, field)
      return
    case "all":
    case "any":
      if (condition.conditions.length === 0) {
        throw new CharacterEngineInputError(`${field}.conditions must not be empty`)
      }
      condition.conditions.forEach((child, index) =>
        validateCondition(child, `${field}.conditions[${index}]`),
      )
      return
    case "not":
      validateCondition(condition.condition, `${field}.condition`)
  }
}

function validateSuppressionCondition(condition: SuppressionCondition, field: string): void {
  switch (condition.kind) {
    case "always":
      return
    case "state":
      validateStateConditionFields(condition, field)
      return
    case "all":
    case "any":
      if (condition.conditions.length === 0) {
        throw new CharacterEngineInputError(`${field}.conditions must not be empty`)
      }
      condition.conditions.forEach((child, index) =>
        validateSuppressionCondition(child, `${field}.conditions[${index}]`),
      )
      return
    case "not":
      validateSuppressionCondition(condition.condition, `${field}.condition`)
  }
}

export function validateCharacterEngineInput(input: CharacterEngineInput) {
  const { base, state, contributions } = input
  requireNonEmpty(base.id, "base.id")
  requireNonEmpty(base.name, "base.name")
  if (!Number.isInteger(base.level) || base.level < 1) {
    throw new CharacterEngineInputError("base.level must be an integer >= 1")
  }
  for (const ability of ABILITY_KEYS) {
    requireFinite(base.abilities[ability], `base.abilities.${ability}`)
  }
  requireFinite(base.baseMaxHp, "base.baseMaxHp")
  requireFinite(base.baseSpeed, "base.baseSpeed")
  requireFinite(state.currentHp, "state.currentHp")
  requireFinite(state.tempHp, "state.tempHp")
  if (base.baseMaxHp < 0) throw new CharacterEngineInputError("base.baseMaxHp must be >= 0")
  if (base.baseSpeed < 0) throw new CharacterEngineInputError("base.baseSpeed must be >= 0")
  if (state.tempHp < 0) throw new CharacterEngineInputError("state.tempHp must be >= 0")

  for (const [resourceKey, resource] of Object.entries(state.resources ?? {})) {
    requireNonEmpty(resourceKey, "state.resources key")
    requireFinite(resource.current, `state.resources.${resourceKey}.current`)
    if (resource.current < 0) {
      throw new CharacterEngineInputError(`state.resources.${resourceKey}.current must be >= 0`)
    }
    if (resource.max !== undefined) {
      requireFinite(resource.max, `state.resources.${resourceKey}.max`)
    }
  }
  for (const [factKey, factValue] of Object.entries(state.facts ?? {})) {
    requireNonEmpty(factKey, "state.facts key")
    validateFactValue(factValue, `state.facts.${factKey}`)
  }

  const contributionIds = new Set<string>()
  for (const contribution of contributions) {
    requireNonEmpty(contribution.id, "contribution.id")
    if (contributionIds.has(contribution.id)) {
      throw new CharacterEngineInputError(`duplicate contribution id: ${contribution.id}`)
    }
    contributionIds.add(contribution.id)
    requireNonEmpty(contribution.source.id, `contribution.${contribution.id}.source.id`)
    requireNonEmpty(contribution.source.name, `contribution.${contribution.id}.source.name`)
    if (contribution.priority !== undefined) {
      requireFinite(contribution.priority, `contribution.${contribution.id}.priority`)
    }

    if (contribution.kind === "suppression") {
      if (contribution.condition) {
        validateSuppressionCondition(
          contribution.condition,
          `contribution.${contribution.id}.condition`,
        )
      }
      if (contribution.selector.kind === "source") {
        requireNonEmpty(
          contribution.selector.sourceId,
          `contribution.${contribution.id}.selector.sourceId`,
        )
      } else {
        requireNonEmpty(
          contribution.selector.contributionId,
          `contribution.${contribution.id}.selector.contributionId`,
        )
      }
      continue
    }

    if (contribution.condition) {
      validateCondition(contribution.condition, `contribution.${contribution.id}.condition`)
    }

    if (contribution.kind === "numeric") {
      requireFinite(contribution.value, `contribution.${contribution.id}.value`)
    } else if (contribution.kind === "formula") {
      validateFormula(contribution.formula)
    } else {
      requireNonEmpty(contribution.key, `contribution.${contribution.id}.key`)
      if (contribution.variantKey !== undefined) {
        requireNonEmpty(contribution.variantKey, `contribution.${contribution.id}.variantKey`)
      }
      if (contribution.operation === "SUPPRESS" && contribution.payload !== undefined) {
        throw new CharacterEngineInputError(
          `contribution.${contribution.id}.payload is not allowed for SUPPRESS`,
        )
      }
      if (contribution.payload !== undefined) {
        validateGrantPayload(contribution.payload, `contribution.${contribution.id}.payload`)
      }
      if (
        contribution.target === "proficiency" &&
        contribution.payload !== undefined &&
        contribution.operation !== "SUPPRESS"
      ) {
        const payload = contribution.payload
        if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
          throw new CharacterEngineInputError(
            `contribution.${contribution.id}.payload must be { rank: 1 | 2 } for proficiency`,
          )
        }
        const rank = (payload as unknown as Record<string, GrantPayload>).rank
        if (rank !== 1 && rank !== 2) {
          throw new CharacterEngineInputError(
            `contribution.${contribution.id}.payload must be { rank: 1 | 2 } for proficiency`,
          )
        }
      }
      if (contribution.target === "resource" && contribution.operation !== "SUPPRESS") {
        try {
          parseResourceGrantPayload(contribution.payload)
        } catch (error) {
          if (error instanceof ResourceEngineError) {
            throw new CharacterEngineInputError(
              `contribution.${contribution.id}.payload: ${error.message}`,
            )
          }
          throw error
        }
      }
      if (contribution.target === "value" && contribution.operation !== "SUPPRESS") {
        try {
          parseValueGrantPayload(contribution.payload)
        } catch (error) {
          if (error instanceof ValueEngineError) {
            throw new CharacterEngineInputError(
              `contribution.${contribution.id}.payload: ${error.message}`,
            )
          }
          throw error
        }
      }
      if (contribution.target === "action" && contribution.operation !== "SUPPRESS") {
        try {
          parseActionGrantPayload(contribution.payload)
        } catch (error) {
          if (error instanceof ActionEngineError) {
            throw new CharacterEngineInputError(
              `contribution.${contribution.id}.payload: ${error.message}`,
            )
          }
          throw error
        }
      }
      if (contribution.target === "spell" && contribution.operation !== "SUPPRESS") {
        try {
          parseSpellGrantPayload(contribution.payload)
        } catch (error) {
          if (error instanceof SpellEngineError) {
            throw new CharacterEngineInputError(
              `contribution.${contribution.id}.payload: ${error.message}`,
            )
          }
          throw error
        }
      }
    }
  }
}

export function createCharacterEngineInput(input: CharacterEngineInput): CharacterEngineInput {
  validateCharacterEngineInput(input)
  return input
}
