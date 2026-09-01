import { defaultDiceRoller, evaluateRollValue, rollDice, validateDice } from "./dice.ts"
import { applyScalingRules, validateScalingRule } from "./scaling.ts"
import type {
  DiceRoller,
  RollContext,
  RollEffectDefinition,
  RollEffectPlan,
  RollEffectResult,
  RollExecutionPlan,
  RollExecutionResult,
  RollInstancePlan,
  RollInstanceResult,
  RollRecipe,
  RollResolutionDefinition,
  RollResolutionPlan,
  RollResolutionResult,
  RollSequenceDefinition,
  RollSequencePlan,
} from "./types.ts"

export class RollEngineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RollEngineError"
  }
}

function nonEmpty(value: string, label: string): void {
  if (!value.trim()) throw new RollEngineError(`${label} must not be empty`)
}

function positiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) throw new RollEngineError(`${label} must be an integer >= 1`)
}

function validateResolution(resolution: RollResolutionDefinition): void {
  if (resolution.kind === "save" && !resolution.ability) {
    throw new RollEngineError("save ability must be defined")
  }
}

function validateEffect(effect: RollEffectDefinition): void {
  nonEmpty(effect.key, "effect key")
  validateDice(effect.dice)
  for (const rule of effect.scaling ?? []) validateScalingRule(rule)
}

function validateSequence(sequence: RollSequenceDefinition): void {
  nonEmpty(sequence.key, "sequence key")
  if (sequence.instances !== undefined) positiveInteger(sequence.instances, "sequence instances")
  validateResolution(sequence.resolution)
  if (sequence.effects.length === 0 && sequence.resolution.kind === "none") {
    throw new RollEngineError(
      `sequence ${sequence.key} must define a resolution and/or at least one rolled effect`,
    )
  }
  const effectKeys = new Set<string>()
  for (const effect of sequence.effects) {
    validateEffect(effect)
    if (effectKeys.has(effect.key)) throw new RollEngineError(`duplicate effect key: ${effect.key}`)
    effectKeys.add(effect.key)
  }
  for (const rule of sequence.instanceScaling ?? []) validateScalingRule(rule)
}

export function validateRollRecipe(recipe: RollRecipe): void {
  nonEmpty(recipe.key, "recipe key")
  nonEmpty(recipe.name, "recipe name")
  if (recipe.spellLevel !== undefined && (!Number.isInteger(recipe.spellLevel) || recipe.spellLevel < 0)) {
    throw new RollEngineError("spellLevel must be an integer >= 0")
  }

  if (recipe.interaction === "link") {
    if (recipe.sequences && recipe.sequences.length > 0) {
      throw new RollEngineError("link-only recipe must not define roll sequences")
    }
    return
  }

  if (!recipe.sequences || recipe.sequences.length === 0) {
    throw new RollEngineError("roll recipe must define at least one sequence")
  }
  const sequenceKeys = new Set<string>()
  for (const sequence of recipe.sequences) {
    validateSequence(sequence)
    if (sequenceKeys.has(sequence.key)) throw new RollEngineError(`duplicate sequence key: ${sequence.key}`)
    sequenceKeys.add(sequence.key)
  }
}

function validateContext(recipe: RollRecipe, context: RollContext): void {
  if (!Number.isInteger(context.characterLevel) || context.characterLevel < 1) {
    throw new RollEngineError("context.characterLevel must be an integer >= 1")
  }
  if (recipe.spellLevel !== undefined && context.spellLevel !== undefined && recipe.spellLevel !== context.spellLevel) {
    throw new RollEngineError(
      `recipe spell level ${recipe.spellLevel} does not match context spell level ${context.spellLevel}`,
    )
  }
  if (
    recipe.spellLevel !== undefined &&
    recipe.spellLevel > 0 &&
    context.castLevel !== undefined &&
    context.castLevel < recipe.spellLevel
  ) {
    throw new RollEngineError("castLevel cannot be below the spell base level")
  }
}

function planResolution(resolution: RollResolutionDefinition, context: RollContext): RollResolutionPlan {
  if (resolution.kind === "automatic" || resolution.kind === "none") return { kind: resolution.kind }
  if (resolution.kind === "save") {
    return {
      kind: "save",
      ability: resolution.ability,
      dc: evaluateRollValue(resolution.dc, context),
      onSuccess: resolution.onSuccess,
    }
  }
  return {
    kind: "attack",
    bonus: evaluateRollValue(resolution.bonus, context),
    ...(resolution.target ? { target: resolution.target } : {}),
  }
}

function planEffect(effect: RollEffectDefinition, context: RollContext): RollEffectPlan {
  const baseModifier = effect.modifier ? evaluateRollValue(effect.modifier, context) : 0
  const scaled = applyScalingRules(
    { diceCount: effect.dice.count, instances: 1, modifier: baseModifier },
    effect.scaling,
    context,
  )
  return {
    key: effect.key,
    kind: effect.kind,
    dice: { count: scaled.diceCount, sides: effect.dice.sides },
    modifier: scaled.modifier,
    ...(effect.damageType ? { damageType: effect.damageType } : {}),
    ...(effect.label ? { label: effect.label } : {}),
  }
}

function planSequence(sequence: RollSequenceDefinition, context: RollContext): RollSequencePlan {
  const scaled = applyScalingRules(
    { diceCount: 0, instances: sequence.instances ?? 1, modifier: 0 },
    sequence.instanceScaling,
    context,
  )
  const resolution = planResolution(sequence.resolution, context)
  const effects = sequence.effects.map((effect) => planEffect(effect, context))
  const instances: RollInstancePlan[] = Array.from({ length: scaled.instances }, (_, index) => ({
    index,
    resolution,
    effects,
  }))
  return { key: sequence.key, instances }
}

/**
 * Resolves formulas, scaling and instance counts without rolling random dice.
 * The result is transport-safe and can be executed by the chat server so the
 * browser never owns randomness.
 */
export function compileRollRecipe(recipe: RollRecipe, context: RollContext): RollExecutionPlan {
  validateRollRecipe(recipe)
  validateContext(recipe, context)
  if (recipe.interaction === "link") return { kind: "link", recipeKey: recipe.key, name: recipe.name }
  return {
    kind: "roll",
    recipeKey: recipe.key,
    name: recipe.name,
    ...(recipe.spellLevel !== undefined ? { spellLevel: recipe.spellLevel } : {}),
    ...(context.castLevel !== undefined ? { castLevel: context.castLevel } : {}),
    sequences: recipe.sequences!.map((sequence) => planSequence(sequence, context)),
  }
}

function executeResolutionPlan(
  plan: RollResolutionPlan,
  roller: DiceRoller,
): { resolution: RollResolutionResult; resolutionRoll?: ReturnType<typeof rollDice> } {
  if (plan.kind === "automatic" || plan.kind === "none") return { resolution: { kind: plan.kind } }
  if (plan.kind === "save") return { resolution: { ...plan } }
  const roll = rollDice({ count: 1, sides: 20 }, plan.bonus, roller)
  return {
    resolution: {
      kind: "attack",
      d20: roll.rolls[0]!,
      bonus: plan.bonus,
      total: roll.total,
      ...(plan.target ? { target: plan.target } : {}),
    },
    resolutionRoll: roll,
  }
}

function executeEffectPlan(effect: RollEffectPlan, roller: DiceRoller): RollEffectResult {
  const roll = rollDice(effect.dice, effect.modifier, roller)
  return {
    key: effect.key,
    kind: effect.kind,
    ...(effect.damageType ? { damageType: effect.damageType } : {}),
    ...(effect.label ? { label: effect.label } : {}),
    roll,
  }
}

function executeInstancePlan(instance: RollInstancePlan, roller: DiceRoller): RollInstanceResult {
  const resolved = executeResolutionPlan(instance.resolution, roller)
  return {
    index: instance.index,
    resolution: resolved.resolution,
    ...(resolved.resolutionRoll ? { resolutionRoll: resolved.resolutionRoll } : {}),
    effects: instance.effects.map((effect) => executeEffectPlan(effect, roller)),
  }
}

export function executeRollRecipe(
  recipe: RollRecipe,
  context: RollContext,
  roller: DiceRoller = defaultDiceRoller,
): RollExecutionResult {
  const plan = compileRollRecipe(recipe, context)
  if (plan.kind === "link") return plan
  return {
    kind: "roll",
    recipeKey: plan.recipeKey,
    name: plan.name,
    ...(plan.spellLevel !== undefined ? { spellLevel: plan.spellLevel } : {}),
    ...(plan.castLevel !== undefined ? { castLevel: plan.castLevel } : {}),
    sequences: plan.sequences.map((sequence) => ({
      key: sequence.key,
      instances: sequence.instances.map((instance) => executeInstancePlan(instance, roller)),
    })),
  }
}