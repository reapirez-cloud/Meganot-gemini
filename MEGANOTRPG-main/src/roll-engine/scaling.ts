import type {
  RollContext,
  RollScalingAdjustment,
  RollScalingReference,
  RollScalingRule,
} from "./types.ts"

export class RollScalingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RollScalingError"
  }
}

function finiteNonNegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new RollScalingError(`${label} must be an integer >= 0`)
  }
  return value
}

export function scalingReferenceValue(
  reference: RollScalingReference,
  context: RollContext,
): number {
  if (reference.source === "character_level") {
    return finiteNonNegativeInteger(context.characterLevel, "characterLevel")
  }

  if (reference.source === "cast_level") {
    if (context.castLevel === undefined) {
      throw new RollScalingError("cast_level scaling requires context.castLevel")
    }
    return finiteNonNegativeInteger(context.castLevel, "castLevel")
  }

  if (!reference.classKey?.trim()) {
    throw new RollScalingError("class_level scaling requires a non-empty classKey")
  }
  const level = context.classLevels?.[reference.classKey]
  if (level === undefined) {
    throw new RollScalingError(`missing class level in context: ${reference.classKey}`)
  }
  return finiteNonNegativeInteger(level, `classLevels.${reference.classKey}`)
}

export function validateScalingRule(rule: RollScalingRule): void {
  if (rule.reference.source === "class_level" && !rule.reference.classKey?.trim()) {
    throw new RollScalingError("class_level scaling requires a non-empty classKey")
  }

  if (rule.kind === "steps") {
    if (rule.steps.length === 0) throw new RollScalingError("step scaling must not be empty")
    let previous = -1
    for (const [index, step] of rule.steps.entries()) {
      finiteNonNegativeInteger(step.atLeast, `steps[${index}].atLeast`)
      if (step.atLeast <= previous) {
        throw new RollScalingError("step scaling thresholds must be strictly increasing")
      }
      previous = step.atLeast
      validateAdjustment(step.adjustment, `steps[${index}].adjustment`)
    }
    return
  }

  finiteNonNegativeInteger(rule.above, "per_level.above")
  const fields = [rule.diceCountPerLevel, rule.instancesPerLevel, rule.modifierPerLevel]
  if (fields.every((field) => field === undefined)) {
    throw new RollScalingError("per_level scaling must change at least one value")
  }
  if (rule.diceCountPerLevel !== undefined) {
    finiteNonNegativeInteger(rule.diceCountPerLevel, "diceCountPerLevel")
  }
  if (rule.instancesPerLevel !== undefined) {
    finiteNonNegativeInteger(rule.instancesPerLevel, "instancesPerLevel")
  }
  if (rule.modifierPerLevel !== undefined && !Number.isFinite(rule.modifierPerLevel)) {
    throw new RollScalingError("modifierPerLevel must be finite")
  }
}

function validateAdjustment(adjustment: RollScalingAdjustment, label: string): void {
  if (
    adjustment.diceCount === undefined &&
    adjustment.instances === undefined &&
    adjustment.modifier === undefined
  ) {
    throw new RollScalingError(`${label} must change at least one value`)
  }
  if (adjustment.diceCount !== undefined) {
    finiteNonNegativeInteger(adjustment.diceCount, `${label}.diceCount`)
  }
  if (adjustment.instances !== undefined) {
    finiteNonNegativeInteger(adjustment.instances, `${label}.instances`)
  }
  if (adjustment.modifier !== undefined && !Number.isFinite(adjustment.modifier)) {
    throw new RollScalingError(`${label}.modifier must be finite`)
  }
}

export interface AppliedScaling {
  diceCount: number
  instances: number
  modifier: number
}

export function applyScalingRules(
  base: AppliedScaling,
  rules: RollScalingRule[] | undefined,
  context: RollContext,
): AppliedScaling {
  let current = { ...base }

  for (const rule of rules ?? []) {
    validateScalingRule(rule)
    const level = scalingReferenceValue(rule.reference, context)

    if (rule.kind === "steps") {
      let selected: RollScalingAdjustment | undefined
      for (const step of rule.steps) {
        if (level >= step.atLeast) selected = step.adjustment
        else break
      }
      if (!selected) continue
      current = {
        diceCount: selected.diceCount ?? current.diceCount,
        instances: selected.instances ?? current.instances,
        modifier: current.modifier + (selected.modifier ?? 0),
      }
      continue
    }

    const extraLevels = Math.max(0, level - rule.above)
    current = {
      diceCount: current.diceCount + extraLevels * (rule.diceCountPerLevel ?? 0),
      instances: current.instances + extraLevels * (rule.instancesPerLevel ?? 0),
      modifier: current.modifier + extraLevels * (rule.modifierPerLevel ?? 0),
    }
  }

  finiteNonNegativeInteger(current.diceCount, "resolved diceCount")
  finiteNonNegativeInteger(current.instances, "resolved instances")
  if (!Number.isFinite(current.modifier)) {
    throw new RollScalingError("resolved modifier must be finite")
  }
  return current
}
