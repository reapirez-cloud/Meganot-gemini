import type {
  AbilityKey,
  ActionCostOption,
  ActionEffectDefinition,
  ActionRange,
  ActionRequirementDefinition,
  ActionResourceCost,
  CharacterCondition,
  FormulaExpression,
  GrantPayload,
  GrantTarget,
  NumericOperation,
  NumericTarget,
  SpellGrantPayload,
} from "../character-engine/index.ts"
import type { PersistentResourceRecoveryTrigger, ResourceRecoveryStep } from "./characterResources.ts"

export type MechanicActivation = "carried" | "equipped"
export type MechanicModuleTone = "neutral" | "violet" | "blue" | "cyan" | "green" | "amber" | "red"
export type MechanicModuleDisplay = "counter" | "pips" | "bar"
export type StoredGrantOperation = "GRANT" | "REPLACE"

/** Presentation metadata is renderer-only. Character Engine never branches on it. */
export type StoredMechanicPresentation = {
  tone?: MechanicModuleTone
  icon?: string
  display?: MechanicModuleDisplay
  priority?: number
  /** Plain-language Voss explanation shown BEFORE the authoritative rule. */
  authorExplanation?: string
  /** Common subclass misreadings shown AFTER the exact rule; never executable mechanics. */
  authorNuances?: string[]
  /** Personal Voss field remark shown AFTER the authoritative rule and nuances. */
  authorComment?: string
}

type StoredMechanicMeta = {
  activation?: MechanicActivation
  condition?: CharacterCondition
  /** Stable parser-side source group. Mechanics sharing a sourceKey are one switchable feature. */
  sourceKey?: string
  variantKey?: string
  priority?: number
  grantOperation?: StoredGrantOperation
  curseEffect?: boolean
  /** Renderer-only metadata shared by every mechanic kind. */
  presentation?: StoredMechanicPresentation
}

export type StoredNumericMechanic = StoredMechanicMeta & {
  id: string
  type: "numeric"
  label?: string
  target: NumericTarget
  operation: NumericOperation
  value: number
}

export type StoredGrantMechanic = StoredMechanicMeta & {
  id: string
  type: "grant"
  label?: string
  target: Exclude<GrantTarget, "resource" | "action" | "spell">
  key: string
  payload?: GrantPayload
}

export type StoredResourceMechanic = StoredMechanicMeta & {
  id: string
  type: "resource"
  key: string
  label: string
  max: number | FormulaExpression
  /** Persistent CE counters recover only on rest or dawn. */
  recharge: PersistentResourceRecoveryTrigger | PersistentResourceRecoveryTrigger[]
  /** Optional mixed schedule, e.g. +1 on short rest and full on long rest. */
  recoveryRules?: ResourceRecoveryStep[]
  restore?: "full" | "amount"
  restoreAmount?: number
  initial?: "full" | "empty" | number
}

export type StoredActionDamage = {
  key: string
  label?: string
  damageType: string
  count: number | FormulaExpression
  sides: number | FormulaExpression
  ability?: AbilityKey
  flat?: number
}

export type StoredActionMechanic = StoredMechanicMeta & {
  id: string
  type: "action"
  key: string
  label: string
  economy: string
  range?: ActionRange
  attackAbility?: AbilityKey
  proficient?: boolean
  attackFlat?: number
  damage?: StoredActionDamage[]
  /** Legacy single-cost fields kept for existing rows. */
  resourceKey?: string
  resourceCost?: number
  /** Canonical CE-native mechanics for new class/item definitions. */
  resourceCosts?: ActionResourceCost[]
  costOptions?: ActionCostOption[]
  requirements?: ActionRequirementDefinition[]
  effects?: ActionEffectDefinition[]
  tags?: string[]
}

export type StoredSpellMechanic = StoredMechanicMeta & {
  id: string
  type: "spell"
  /** Canonical key is spell:<spell_catalog.slug>. */
  key: string
  /** Stable relational identity used to link this access back to spell_catalog. */
  catalogSlug?: string
  payload: SpellGrantPayload
}

export type StoredMechanic =
  | StoredNumericMechanic
  | StoredGrantMechanic
  | StoredResourceMechanic
  | StoredActionMechanic
  | StoredSpellMechanic

export type StoredMechanics = StoredMechanic[]
