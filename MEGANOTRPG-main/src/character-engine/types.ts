export const ABILITY_KEYS = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
] as const

export type AbilityKey = (typeof ABILITY_KEYS)[number]

export const SKILL_KEYS = [
  "acrobatics",
  "animal_handling",
  "arcana",
  "athletics",
  "deception",
  "history",
  "insight",
  "intimidation",
  "investigation",
  "medicine",
  "nature",
  "perception",
  "performance",
  "persuasion",
  "religion",
  "sleight_of_hand",
  "stealth",
  "survival",
] as const

export type SkillKey = (typeof SKILL_KEYS)[number]
export type ProficiencyRank = 0 | 1 | 2

export const PASSIVE_KEYS = ["perception", "investigation", "insight"] as const
export type PassiveKey = (typeof PASSIVE_KEYS)[number]

export interface BaseCharacter {
  id: string
  name: string
  level: number
  abilities: Record<AbilityKey, number>
  baseMaxHp: number
  baseSpeed: number
  skillProficiencies?: Partial<Record<SkillKey, ProficiencyRank>>
  savingThrowProficiencies?: Partial<Record<AbilityKey, ProficiencyRank>>
}

export type StateFactValue = string | number | boolean | null

export interface CharacterState {
  currentHp: number
  tempHp: number
  resources?: Record<string, ResourceState>
  facts?: Record<string, StateFactValue>
}

/** Runtime truth for a consumable resource. */
export interface ResourceState {
  current: number
  /**
   * @deprecated Maximum is resolved from the resource definition/contributions.
   * Kept temporarily for adapter compatibility and intentionally ignored by Resource Engine.
   */
  max?: number
}

export type SourceVisibility = "campaign" | "private"

/** Provenance only. Engine mechanics must not branch on sourceType. */
export interface CharacterSource {
  id: string
  name: string
  sourceType?: string
  parentSourceId?: string
  visibility?: SourceVisibility
}

export type StateCondition =
  | { kind: "state"; key: string; operator: "EXISTS" | "NOT_EXISTS" }
  | {
      kind: "state"
      key: string
      operator: "EQUALS" | "NOT_EQUALS"
      value: StateFactValue
    }
  | {
      kind: "state"
      key: string
      operator: "GT" | "GTE" | "LT" | "LTE"
      value: number
    }

export type CharacterCondition =
  | { kind: "always" }
  | { kind: "hp_below_percent"; percent: number }
  | StateCondition
  | { kind: "all"; conditions: CharacterCondition[] }
  | { kind: "any"; conditions: CharacterCondition[] }
  | { kind: "not"; condition: CharacterCondition }

/**
 * Pre-resolution suppression cannot depend on derived values, otherwise it can
 * create cycles (for example by suppressing the source that changes Max HP).
 */
export type SuppressionCondition =
  | { kind: "always" }
  | StateCondition
  | { kind: "all"; conditions: SuppressionCondition[] }
  | { kind: "any"; conditions: SuppressionCondition[] }
  | { kind: "not"; condition: SuppressionCondition }

export type NumericTarget =
  | `abilities.${AbilityKey}`
  | "core.proficiencyBonus"
  | `skills.${SkillKey}.bonus`
  | `savingThrows.${AbilityKey}.bonus`
  | `passives.${PassiveKey}`
  | "combat.ac"
  | "combat.initiative"
  | "combat.maxHp"
  | "combat.speed"
  | `resources.${string}.max`
  | `values.${string}`
  | `actions.${string}.attackBonus`
  | `actions.${string}.damage.${string}.modifier`
  | `spells.${string}.access.${string}.method.${string}.attackBonus`
  | `spells.${string}.access.${string}.method.${string}.saveDc`

export type NumericOperation = "ADD" | "SUBTRACT" | "SET" | "MIN" | "MAX" | "MULTIPLY"

export interface NumericContribution {
  id: string
  kind: "numeric"
  target: NumericTarget
  operation: NumericOperation
  value: number
  source: CharacterSource
  condition?: CharacterCondition
  priority?: number
}

export type FormulaExpression =
  | { kind: "literal"; value: number }
  | { kind: "reference"; key: string }
  | { kind: "add"; terms: FormulaExpression[] }
  | { kind: "subtract"; left: FormulaExpression; right: FormulaExpression }
  | { kind: "multiply"; factors: FormulaExpression[] }
  | { kind: "min"; values: FormulaExpression[] }
  | { kind: "max"; values: FormulaExpression[] }
  | { kind: "clamp"; value: FormulaExpression; min?: number; max?: number }

export type FormulaTarget = "combat.ac"

export interface FormulaContribution {
  id: string
  kind: "formula"
  target: FormulaTarget
  operation: "SET_FORMULA"
  formula: FormulaExpression
  source: CharacterSource
  condition?: CharacterCondition
  priority?: number
}

export type MechanicalData =
  | string
  | number
  | boolean
  | null
  | MechanicalData[]
  | { [key: string]: MechanicalData }

export type ResourceRechargeTrigger =
  | "short_rest"
  | "long_rest"
  | "dawn"
  | "manual"
  | "never"

export type ResourceRechargeRule =
  | {
      triggers: ResourceRechargeTrigger[]
      restore: "full"
    }
  | {
      triggers: ResourceRechargeTrigger[]
      restore: "amount"
      amount: number
    }

/**
 * Mechanical definition of a granted resource. `current` never belongs here.
 * A missing initial policy defaults to `full` when no runtime state exists yet.
 */
export interface ResourceGrantPayload {
  max: number | FormulaExpression
  recharge?: ResourceRechargeRule
  initial?: "full" | "empty" | number
  label?: string
}

/** Generic non-consumable scalar such as die size, reach tier or system-specific rating. */
export interface ValueGrantPayload {
  value: number | FormulaExpression
  label?: string
}

export type ActionRange =
  | { kind: "self" }
  | { kind: "touch" }
  | { kind: "melee"; reach: number; unit: string }
  | { kind: "ranged"; normal: number; long?: number; unit: string }
  | { kind: "area"; shape: string; size: number; unit: string }
  | { kind: "custom"; label: string }

export interface ActionAttackDefinition {
  /** Resolves the modifier added to the attack roll. */
  bonus: FormulaExpression
  /** Free semantic target such as armor_class; engine does not branch on it. */
  target?: string
  /** Optional d20 critical threshold; defaults are renderer/ruleset concerns. */
  criticalThreshold?: number
}

/** Fully resolved dice exposed to renderers/executors. */
export interface ActionDice {
  count: number
  sides: number
}

/** Dice definition may reference any scalar present in FormulaContext. */
export interface ActionDiceDefinition {
  count: number | FormulaExpression
  sides: number | FormulaExpression
}

export interface ActionDamageDefinition {
  /** Stable identity so external modifiers can target one damage component. */
  key: string
  type: string
  dice?: ActionDiceDefinition
  /** Optional deterministic modifier added to the dice result. */
  modifier?: FormulaExpression
}

export interface ActionResourceCost {
  key: string
  variantKey?: string
  amount: number
}

/** One alternative payment path. Mandatory resourceCosts, when present, apply in addition. */
export interface ActionCostOption {
  key: string
  costs: ActionResourceCost[]
  label?: string
}

export type ActionRequirementEnforcement = "engine" | "gm"

/** Generic action prerequisite; no class/ruleset names are interpreted by CE. */
export type ActionRequirementDefinition =
  | {
      kind: "condition"
      condition: CharacterCondition
      enforcement?: ActionRequirementEnforcement
      label?: string
    }
  | {
      kind: "resource"
      key: string
      variantKey?: string
      minimum: number
      enforcement?: ActionRequirementEnforcement
      label?: string
    }
  | {
      kind: "grant"
      target: GrantTarget
      key: string
      variantKey?: string
      enforcement?: ActionRequirementEnforcement
      label?: string
    }

/** State mutations provide a generic mode lifecycle: actions can activate/end any named state. */
export type ActionStateEffectDefinition =
  | { kind: "state"; key: string; operation: "SET"; value: StateFactValue }
  | { kind: "state"; key: string; operation: "UNSET" }
  | { kind: "state"; key: string; operation: "ADD" | "SUBTRACT"; value: number }

/** Resource effects plus action costs are enough to express generic resource conversion. */
export interface ActionResourceEffectDefinition {
  kind: "resource"
  key: string
  variantKey?: string
  operation: "RESTORE" | "SPEND" | "SET"
  amount: number | FormulaExpression
}

/**
 * Semantic effects are intentionally opaque to the CE kernel. A ruleset/chat executor
 * may interpret keys such as save, healing, movement or status without class hardcoding.
 */
export interface ActionSemanticEffectDefinition {
  kind: "semantic"
  key: string
  payload?: MechanicalData
}

export type ActionEffectDefinition =
  | ActionStateEffectDefinition
  | ActionResourceEffectDefinition
  | ActionSemanticEffectDefinition

/**
 * Generic action definition. Weapons, class abilities and custom attacks all use
 * this same structure; sourceType never selects behavior.
 */
export interface ActionGrantPayload {
  label?: string
  /** Semantic action economy value, e.g. action, bonus_action, reaction, custom. */
  economy: string
  range?: ActionRange
  attack?: ActionAttackDefinition
  damage?: ActionDamageDefinition[]
  /** Mandatory costs. */
  resourceCosts?: ActionResourceCost[]
  /** Alternative payment paths; at least one must be affordable when present. */
  costOptions?: ActionCostOption[]
  requirements?: ActionRequirementDefinition[]
  effects?: ActionEffectDefinition[]
  tags?: string[]
}

/** Canonical spell identity shared by every access to one spell key. */
export interface SpellIdentityDefinition {
  name: string
  level: number
  school?: string
  ritual?: boolean
}

/** Preparation is an access concern, never a casting-method or source label. */
export type SpellPreparationRule =
  | { mode: "prepared"; defaultPrepared?: boolean }
  | { mode: "always_prepared" }
  | { mode: "not_required" }

export interface SpellResourceCost {
  key: string
  variantKey?: string
  amount: number
}

/** One alternative way to pay for a cast, e.g. a 1st-level slot or one item charge. */
export interface SpellResourceOption {
  key: string
  castLevel?: number
  costs: SpellResourceCost[]
}

/**
 * How one access can cast the spell. `kind` is semantic mechanical data only;
 * UI shorthand such as [И]/[Ф]/[Б] must never be stored here.
 */
export interface SpellCastingMethodDefinition {
  key: string
  kind: string
  ability?: AbilityKey
  attackBonus?: FormulaExpression
  saveDc?: FormulaExpression
  /** Defaults to true. Ritual-like methods may opt out independently. */
  requiresPrepared?: boolean
  /** Missing resourceOptions means this method has no resource cost. */
  resourceOptions?: SpellResourceOption[]
}

/**
 * One GRANT target=spell represents one access. Grant key is spell identity;
 * variantKey is the access identity (class, domain, item access, feat access, etc.).
 */
export interface SpellGrantPayload {
  spell: SpellIdentityDefinition
  preparation: SpellPreparationRule
  methods: SpellCastingMethodDefinition[]
}

/** JSON-compatible mechanical data attached to a grant. */
export type GrantPayload =
  | MechanicalData
  | FormulaExpression
  | ResourceGrantPayload
  | ValueGrantPayload
  | ActionGrantPayload
  | SpellGrantPayload
  | GrantPayload[]
  | { [key: string]: GrantPayload }

export type ProficiencyGrantPayload = { rank: 1 | 2 }
export type SenseGrantPayload = { range?: number; unit?: string }

export type GrantTarget =
  | "resistance"
  | "immunity"
  | "language"
  | "proficiency"
  | "sense"
  | "feature"
  | "trait"
  | "resource"
  | "value"
  | "permission"
  | "action"
  | "spell"

export interface GrantContribution<TPayload extends GrantPayload = GrantPayload> {
  id: string
  kind: "grant"
  operation: "GRANT" | "SUPPRESS" | "REPLACE"
  target: GrantTarget
  /** Stable identity inside a target, e.g. fire, common, skill:medicine. */
  key: string
  /** Mechanically distinct variants must use distinct keys here. */
  variantKey?: string
  payload?: TPayload
  source: CharacterSource
  condition?: CharacterCondition
  priority?: number
}

export type SuppressionSelector =
  | {
      kind: "source"
      sourceId: string
      /** Defaults to true so suppressing an item also suppresses child feature sources. */
      includeDescendants?: boolean
    }
  | {
      kind: "contribution"
      contributionId: string
    }

/**
 * Universal pre-resolution suppression. These controls are authoritative input
 * filters and are not themselves suppressible, avoiding recursive control loops.
 */
export interface SuppressionContribution {
  id: string
  kind: "suppression"
  operation: "SUPPRESS"
  selector: SuppressionSelector
  source: CharacterSource
  condition?: SuppressionCondition
  priority?: number
}

export type CharacterContribution =
  | NumericContribution
  | FormulaContribution
  | GrantContribution
  | SuppressionContribution

export interface CharacterEngineInput {
  base: BaseCharacter
  state: CharacterState
  contributions: CharacterContribution[]
}

export interface ResolvedSourceRef {
  contributionId: string
  source: CharacterSource
}

export interface ResolvedNumber {
  value: number
  baseValue: number
  sources: ResolvedSourceRef[]
}

export interface ResolvedFormulaNumber extends ResolvedNumber {
  formula: FormulaExpression
  formulaSources: ResolvedSourceRef[]
}

export interface ResolvedAbility extends ResolvedNumber {
  modifier: number
}

export interface ResolvedSkill {
  key: SkillKey
  ability: AbilityKey
  proficiencyRank: ProficiencyRank
  proficiencySources: ResolvedSourceRef[]
  bonus: ResolvedNumber
}

export interface ResolvedSavingThrow {
  ability: AbilityKey
  proficiencyRank: ProficiencyRank
  proficiencySources: ResolvedSourceRef[]
  bonus: ResolvedNumber
}

export interface ResolvedGrant<TPayload extends GrantPayload = GrantPayload> {
  target: GrantTarget
  key: string
  variantKey: string
  payload?: TPayload
  sources: ResolvedSourceRef[]
}

export interface ResolvedResource {
  key: string
  variantKey: string
  /** Key used inside CharacterState.resources. */
  stateKey: string
  current: number
  /** Unclamped runtime value retained for later explain/debug tooling. */
  rawCurrent: number
  max: ResolvedNumber
  recharge: ResourceRechargeRule
  sources: ResolvedSourceRef[]
}

export interface ResolvedValue {
  key: string
  variantKey: string
  stateKey: string
  label?: string
  value: ResolvedNumber
  sources: ResolvedSourceRef[]
}

export interface ResolvedActionAttack {
  formula: FormulaExpression
  bonus: ResolvedNumber
  target?: string
  criticalThreshold?: number
}

export interface ResolvedActionDamage {
  key: string
  type: string
  dice?: ActionDice
  modifier: ResolvedNumber
  modifierFormula?: FormulaExpression
}

export interface ResolvedActionResourceCost {
  key: string
  variantKey: string
  stateKey: string
  amount: number
  current: number
  max: number
  available: boolean
}

export interface ResolvedActionCostOption {
  key: string
  label?: string
  costs: ResolvedActionResourceCost[]
  available: boolean
}

export interface ResolvedActionRequirement {
  kind: ActionRequirementDefinition["kind"]
  enforcement: ActionRequirementEnforcement
  label?: string
  satisfied: boolean
}

export type ResolvedActionEffect =
  | ActionStateEffectDefinition
  | {
      kind: "resource"
      key: string
      variantKey: string
      stateKey: string
      operation: ActionResourceEffectDefinition["operation"]
      amount: number
      current: number
      max: number
    }
  | ActionSemanticEffectDefinition

export interface ResolvedAction {
  key: string
  variantKey: string
  stateKey: string
  label?: string
  economy: string
  range?: ActionRange
  attack?: ResolvedActionAttack
  damage: ResolvedActionDamage[]
  resourceCosts: ResolvedActionResourceCost[]
  costOptions: ResolvedActionCostOption[]
  requirements: ResolvedActionRequirement[]
  effects: ResolvedActionEffect[]
  tags: string[]
  /** False when an engine-enforced requirement/cost cannot currently be satisfied. */
  available: boolean
  sources: ResolvedSourceRef[]
}

export interface ResolvedSpellResourceCost {
  key: string
  variantKey: string
  stateKey: string
  amount: number
  current: number
  max: number
  available: boolean
}

export interface ResolvedSpellResourceOption {
  key: string
  castLevel: number
  costs: ResolvedSpellResourceCost[]
  available: boolean
}

export interface ResolvedSpellCastingMethod {
  key: string
  kind: string
  ability?: AbilityKey
  requiresPrepared: boolean
  attackBonus?: ResolvedNumber
  saveDc?: ResolvedNumber
  resourceOptions: ResolvedSpellResourceOption[]
  available: boolean
}

export interface ResolvedSpellAccess {
  /** Grant variantKey; stable identity of why/how this character has the spell. */
  key: string
  preparationMode: SpellPreparationRule["mode"]
  prepared: boolean
  preparedFactKey?: string
  methods: ResolvedSpellCastingMethod[]
  available: boolean
  /** Concrete source names/types are renderer-facing provenance badges. */
  sources: ResolvedSourceRef[]
}

export interface ResolvedSpell {
  key: string
  identity: SpellIdentityDefinition
  accesses: ResolvedSpellAccess[]
  available: boolean
}

export interface ResolvedCharacter {
  id: string
  name: string
  level: number
  proficiencyBonus: ResolvedNumber
  abilities: Record<AbilityKey, ResolvedAbility>
  skills: Record<SkillKey, ResolvedSkill>
  savingThrows: Record<AbilityKey, ResolvedSavingThrow>
  combat: {
    ac: ResolvedFormulaNumber
    maxHp: ResolvedNumber
    currentHp: number
    tempHp: number
    speed: ResolvedNumber
    initiative: ResolvedNumber
  }
  passives: Record<PassiveKey, ResolvedNumber>
  spellcasting: {
    byAbility: Record<AbilityKey, { saveDc: number; attackBonus: number }>
  }
  /** Generic non-consumable named scalar values used by formulas/actions. */
  values: ResolvedValue[]
  /** Dynamic section: empty array means UI should render no resource block. */
  resources: ResolvedResource[]
  /** Dynamic section: empty array means UI should render no actions/attacks block. */
  actions: ResolvedAction[]
  /** One card per spell identity; each card contains one or more access paths. */
  spells: ResolvedSpell[]
  grants: ResolvedGrant[]
}
