export type RollScalingSource = "character_level" | "cast_level" | "class_level"

export interface RollScalingReference {
  source: RollScalingSource
  /** Required only for class_level scaling. */
  classKey?: string
}

export interface RollScalingAdjustment {
  /** Replaces the base dice count when a step is selected. */
  diceCount?: number
  /** Replaces the base sequence instance count when a step is selected. */
  instances?: number
  /** Adds a flat amount to the effect modifier. */
  modifier?: number
}

export type RollScalingRule =
  | {
      kind: "steps"
      reference: RollScalingReference
      steps: Array<{
        atLeast: number
        adjustment: RollScalingAdjustment
      }>
    }
  | {
      kind: "per_level"
      reference: RollScalingReference
      /** No scaling is applied at or below this level. */
      above: number
      diceCountPerLevel?: number
      instancesPerLevel?: number
      modifierPerLevel?: number
    }

export interface DiceDefinition {
  count: number
  sides: number
}

export type RollValueReference =
  | "casting_ability_modifier"
  | "attack_bonus"
  | "save_dc"
  | "character_level"
  | "cast_level"
  | "spell_level"
  | `class_level.${string}`
  | `value.${string}`

export type RollValueExpression =
  | { kind: "literal"; value: number }
  | { kind: "reference"; key: RollValueReference }
  | { kind: "add"; terms: RollValueExpression[] }
  | { kind: "subtract"; left: RollValueExpression; right: RollValueExpression }
  | { kind: "multiply"; factors: RollValueExpression[] }

export type SaveAbility =
  | "strength"
  | "dexterity"
  | "constitution"
  | "intelligence"
  | "wisdom"
  | "charisma"

export type RollResolutionDefinition =
  | {
      kind: "attack"
      /** Usually resolves from attack_bonus in RollContext. */
      bonus: RollValueExpression
      target?: string
    }
  | {
      kind: "save"
      ability: SaveAbility
      /** Usually resolves from save_dc in RollContext. */
      dc: RollValueExpression
      /** What the GM should do with rolled effects when the save succeeds. */
      onSuccess: "none" | "half" | "full" | "custom"
    }
  | { kind: "automatic" }
  | { kind: "none" }

export interface RollEffectDefinition {
  key: string
  kind: "damage" | "healing" | "roll"
  dice: DiceDefinition
  /** Flat modifier after dice, e.g. casting ability modifier or +1. */
  modifier?: RollValueExpression
  damageType?: string
  label?: string
  /** Scaling that changes this effect only. */
  scaling?: RollScalingRule[]
}

export interface RollSequenceDefinition {
  key: string
  /** Base number of independent rays/darts/attacks. Defaults to 1. */
  instances?: number
  /** Scaling that changes the number of independent instances. */
  instanceScaling?: RollScalingRule[]
  resolution: RollResolutionDefinition
  /** Effects are rolled immediately for every instance, even before GM confirms hit/save. */
  effects: RollEffectDefinition[]
}

export interface RollRecipe {
  key: string
  name: string
  /** Semantic grouping only; Roll Engine behavior never branches on sourceKind. */
  sourceKind?: string
  /** Link-only recipes carry no dice and are sent to chat as references/cards. */
  interaction: "link" | "roll"
  spellLevel?: number
  sequences?: RollSequenceDefinition[]
}

export interface RollContext {
  characterLevel: number
  spellLevel?: number
  castLevel?: number
  classLevels?: Record<string, number>
  castingAbilityModifier?: number
  attackBonus?: number
  saveDc?: number
  /** Escape hatch for future generic values without adding engine branches. */
  values?: Record<string, number>
}

/**
 * Deterministic, fully resolved roll instructions. All formulas/scaling are
 * already evaluated, but no random die has been rolled yet. The chat server can
 * safely own randomness while the Roll Engine remains the only rules compiler.
 */
export type RollResolutionPlan =
  | { kind: "attack"; bonus: number; target?: string }
  | {
      kind: "save"
      ability: SaveAbility
      dc: number
      onSuccess: "none" | "half" | "full" | "custom"
    }
  | { kind: "automatic" }
  | { kind: "none" }

export interface RollEffectPlan {
  key: string
  kind: RollEffectDefinition["kind"]
  dice: DiceDefinition
  modifier: number
  damageType?: string
  label?: string
}

export interface RollInstancePlan {
  index: number
  resolution: RollResolutionPlan
  effects: RollEffectPlan[]
}

export interface RollSequencePlan {
  key: string
  instances: RollInstancePlan[]
}

export type RollExecutionPlan =
  | {
      kind: "link"
      recipeKey: string
      name: string
    }
  | {
      kind: "roll"
      recipeKey: string
      name: string
      spellLevel?: number
      castLevel?: number
      sequences: RollSequencePlan[]
    }

/**
 * Canonical transparent dice result. `rolls` contains every raw die face in
 * order; consumers never need to reconstruct hidden dice from `total`.
 */
export interface DiceRollResult {
  dice: DiceDefinition
  rolls: number[]
  diceTotal: number
  modifier: number
  total: number
}

export type RollResolutionResult =
  | {
      kind: "attack"
      d20: number
      bonus: number
      total: number
      target?: string
    }
  | {
      kind: "save"
      ability: SaveAbility
      dc: number
      onSuccess: "none" | "half" | "full" | "custom"
    }
  | { kind: "automatic" }
  | { kind: "none" }

export interface RollEffectResult {
  key: string
  kind: RollEffectDefinition["kind"]
  damageType?: string
  label?: string
  /** Full raw dice breakdown for this damage/healing/custom effect. */
  roll: DiceRollResult
}

export interface RollInstanceResult {
  index: number
  resolution: RollResolutionResult
  /**
   * Raw dice for resolving the instance itself, currently the attack d20.
   * Save resolutions intentionally omit this because the GM/target rolls them.
   */
  resolutionRoll?: DiceRollResult
  effects: RollEffectResult[]
}

export interface RollSequenceResult {
  key: string
  instances: RollInstanceResult[]
}

export type RollExecutionResult =
  | {
      kind: "link"
      recipeKey: string
      name: string
    }
  | {
      kind: "roll"
      recipeKey: string
      name: string
      spellLevel?: number
      castLevel?: number
      sequences: RollSequenceResult[]
    }

export type DiceRoller = (sides: number) => number