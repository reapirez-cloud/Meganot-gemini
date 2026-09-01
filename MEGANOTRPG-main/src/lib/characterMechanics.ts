import type {
  AbilityKey,
  ActionResourceCost,
  CharacterCondition,
  CharacterContribution,
  CharacterSource,
  FormulaExpression,
  GrantPayload,
  ResourceRechargeTrigger,
} from "../character-engine/index.ts"
import type { CharacterFeature, InventoryItem } from "../types/characterSheet.ts"
import type { StoredActionDamage, StoredMechanic, StoredMechanics, StoredMechanicPresentation } from "../types/characterMechanics.ts"
import { isPersistentResourceRecoveryTrigger } from "./persistentResourcePolicy.ts"

function literal(value: number): FormulaExpression { return { kind: "literal", value } }
function reference(key: string): FormulaExpression { return { kind: "reference", key } }
function sumFormula(parts: FormulaExpression[]): FormulaExpression { if (!parts.length) return literal(0); if (parts.length === 1) return parts[0]!; return { kind: "add", terms: parts } }
function abilityModifierFormula(ability?: AbilityKey): FormulaExpression[] { return ability ? [reference(`abilities.${ability}.modifier`)] : [] }
function actionDamageFormula(damage: StoredActionDamage): FormulaExpression | undefined { const parts = abilityModifierFormula(damage.ability); if (damage.flat) parts.push(literal(damage.flat)); return parts.length ? sumFormula(parts) : undefined }
function withCondition<T extends CharacterContribution>(contribution: T, condition?: CharacterCondition): T { return condition ? { ...contribution, condition } : contribution }
function withPriority<T extends CharacterContribution>(contribution: T, priority?: number): T { return priority === undefined ? contribution : { ...contribution, priority } }
function sourceFor(id: string, name: string, sourceType: string, visibility: CharacterSource["visibility"] = "campaign", parentSourceId?: string): CharacterSource { return { id, name, sourceType, visibility, ...(parentSourceId ? { parentSourceId } : {}) } }
function rechargeTriggers(value: ResourceRechargeTrigger | ResourceRechargeTrigger[]): ResourceRechargeTrigger[] {
  const triggers = [...new Set(Array.isArray(value) ? value : [value])]
  if (!triggers.length || triggers.some((trigger) => !isPersistentResourceRecoveryTrigger(trigger))) {
    throw new Error("Persistent CE resources may recover only on short_rest, long_rest, or dawn")
  }
  return triggers
}
function presentationPayload(value?: StoredMechanicPresentation): GrantPayload | undefined {
  if (!value) return undefined
  return {
    ...(value.tone ? { tone: value.tone } : {}),
    ...(value.icon ? { icon: value.icon } : {}),
    ...(value.display ? { display: value.display } : {}),
    ...(value.priority !== undefined ? { priority: value.priority } : {}),
  }
}

function actionCosts(mechanic: Extract<StoredMechanic, { type: "action" }>): ActionResourceCost[] | undefined {
  if (mechanic.resourceCosts?.length) return mechanic.resourceCosts
  if (mechanic.resourceKey && mechanic.resourceCost) return [{ key: mechanic.resourceKey, amount: mechanic.resourceCost }]
  return undefined
}

export function contributionForStoredMechanic(mechanic: StoredMechanic, source: CharacterSource): CharacterContribution {
  const id = `${source.id}:mechanic:${mechanic.id}`
  const operation = mechanic.grantOperation || "GRANT"
  const variant = mechanic.variantKey ? { variantKey: mechanic.variantKey } : {}
  if (mechanic.type === "numeric") return withPriority(withCondition({ id, kind: "numeric", target: mechanic.target, operation: mechanic.operation, value: mechanic.value, source }, mechanic.condition), mechanic.priority)
  if (mechanic.type === "grant") return withPriority(withCondition({ id, kind: "grant", operation, target: mechanic.target, key: mechanic.key, ...variant, ...(mechanic.payload === undefined ? {} : { payload: mechanic.payload }), source }, mechanic.condition), mechanic.priority)
  if (mechanic.type === "resource") {
    const triggers = rechargeTriggers(mechanic.recharge)
    const recharge = mechanic.restore === "amount"
      ? { triggers, restore: "amount" as const, amount: Math.max(1, mechanic.restoreAmount || 1) }
      : { triggers, restore: "full" as const }
    const presentation = presentationPayload(mechanic.presentation)
    return withPriority(withCondition({
      id,
      kind: "grant",
      operation,
      target: "resource",
      key: mechanic.key,
      ...variant,
      payload: {
        max: mechanic.max,
        label: mechanic.label,
        initial: mechanic.initial ?? "full",
        recharge,
        ...(mechanic.recoveryRules?.length ? { recoveryRules: mechanic.recoveryRules } : {}),
        ...(presentation ? { presentation } : {}),
      },
      source,
    }, mechanic.condition), mechanic.priority)
  }
  if (mechanic.type === "action") {
    const attackParts = abilityModifierFormula(mechanic.attackAbility)
    if (mechanic.proficient) attackParts.push(reference("core.proficiencyBonus"))
    if (mechanic.attackFlat) attackParts.push(literal(mechanic.attackFlat))
    const damage = (mechanic.damage || []).map((entry) => {
      const modifier = actionDamageFormula(entry)
      return { key: entry.key, type: entry.damageType, dice: { count: entry.count, sides: entry.sides }, ...(modifier ? { modifier } : {}) }
    })
    const resourceCosts = actionCosts(mechanic)
    const presentation = presentationPayload(mechanic.presentation)
    return withPriority(withCondition({
      id,
      kind: "grant",
      operation,
      target: "action",
      key: mechanic.key,
      ...variant,
      payload: {
        label: mechanic.label,
        economy: mechanic.economy,
        ...(mechanic.range ? { range: mechanic.range } : {}),
        ...(attackParts.length ? { attack: { bonus: sumFormula(attackParts), target: "armor_class" } } : {}),
        ...(damage.length ? { damage } : {}),
        ...(resourceCosts?.length ? { resourceCosts } : {}),
        ...(mechanic.costOptions?.length ? { costOptions: mechanic.costOptions } : {}),
        ...(mechanic.requirements?.length ? { requirements: mechanic.requirements } : {}),
        ...(mechanic.effects?.length ? { effects: mechanic.effects } : {}),
        tags: mechanic.tags || [],
        ...(presentation ? { presentation } : {}),
      },
      source,
    }, mechanic.condition), mechanic.priority)
  }
  return withPriority(withCondition({ id, kind: "grant", operation, target: "spell", key: mechanic.key, variantKey: mechanic.variantKey || `mechanic-${mechanic.id}`, payload: mechanic.payload, source }, mechanic.condition), mechanic.priority)
}

function mechanicsArray(value: unknown): StoredMechanics { return Array.isArray(value) ? value as StoredMechanics : [] }
export function storedMechanicContributions(mechanics: StoredMechanics, source: CharacterSource): CharacterContribution[] { return mechanicsArray(mechanics).map((mechanic) => contributionForStoredMechanic(mechanic, source)) }

export function inventoryMechanicContributions(items: InventoryItem[]): CharacterContribution[] {
  const contributions: CharacterContribution[] = []
  for (const item of items) {
    const source = sourceFor(`item:${item.id}`, item.name, "inventory_item")
    const privateCurseSource = sourceFor(`item:${item.id}:curse`, item.name, "inventory_item", "private", source.id)
    for (const mechanic of mechanicsArray(item.mechanics)) {
      const requiresEquipped = mechanic.activation === "equipped" && item.category === "equipment"
      if (requiresEquipped && !item.equipped) continue
      contributions.push(contributionForStoredMechanic(mechanic, mechanic.curseEffect ? privateCurseSource : source))
    }
  }
  return contributions
}
export function featureMechanicContributions(features: CharacterFeature[]): CharacterContribution[] {
  const contributions: CharacterContribution[] = []
  for (const feature of features) { const source = sourceFor(`feature:${feature.id}`, feature.name, "character_feature"); for (const mechanic of mechanicsArray(feature.mechanics)) contributions.push(contributionForStoredMechanic(mechanic, source)) }
  return contributions
}

export type ItemCurseInfo = { cursed: boolean; description: string; showCurseToPlayer: boolean; showCurseEffectToPlayer: boolean }

export function itemCurseInfo(item: Pick<InventoryItem, "mechanics">): ItemCurseInfo {
  const marker = mechanicsArray(item.mechanics).find((mechanic) => mechanic.type === "grant" && mechanic.target === "trait" && mechanic.key === "curse:item")
  if (!marker || marker.type !== "grant") return { cursed: false, description: "", showCurseToPlayer: false, showCurseEffectToPlayer: false }
  const payload = marker.payload
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { cursed: true, description: "", showCurseToPlayer: true, showCurseEffectToPlayer: true }
  const record = payload as Record<string, unknown>
  const description = record.description
  return {
    cursed: true,
    description: typeof description === "string" ? description : "",
    showCurseToPlayer: typeof record.showCurseToPlayer === "boolean" ? record.showCurseToPlayer : true,
    showCurseEffectToPlayer: typeof record.showCurseEffectToPlayer === "boolean" ? record.showCurseEffectToPlayer : true,
  }
}

export function playerVisibleItemMechanics(item: Pick<InventoryItem, "mechanics">, canManage: boolean): StoredMechanics {
  const curse = itemCurseInfo(item)
  return mechanicsArray(item.mechanics).filter((mechanic) => {
    if (mechanic.type === "grant" && mechanic.target === "trait" && mechanic.key === "curse:item") return false
    if (!mechanic.curseEffect) return true
    return canManage || (curse.showCurseToPlayer && curse.showCurseEffectToPlayer)
  })
}

const targetNames: Record<string, string> = { "combat.ac": "КД", "combat.initiative": "инициатива", "combat.maxHp": "макс. HP", "combat.speed": "скорость", "core.proficiencyBonus": "мастерство", "abilities.strength": "Сила", "abilities.dexterity": "Ловкость", "abilities.constitution": "Телосложение", "abilities.intelligence": "Интеллект", "abilities.wisdom": "Мудрость", "abilities.charisma": "Харизма" }
function conditionLabel(condition?: CharacterCondition): string { if (!condition || condition.kind === "always") return ""; if (condition.kind === "hp_below_percent") return `при HP < ${condition.percent}%`; return "при условии" }
function formulaLabel(value: number | FormulaExpression): string {
  if (typeof value === "number") return String(value)
  if (value.kind === "reference") {
    if (value.key === "source.level") return "уровень класса"
    if (value.key === "core.level") return "уровень персонажа"
    if (value.key === "core.proficiencyBonus") return "бонус мастерства"
    const ability = value.key.match(/^abilities\.([a-z]+)\.modifier$/)?.[1]
    if (ability) return `мод. ${targetNames[`abilities.${ability}`] || ability}`
  }
  return "формула"
}
export function mechanicSummary(mechanic: StoredMechanic): string {
  let result = "Эффект"
  if (mechanic.type === "numeric") { const sign = mechanic.operation === "ADD" && mechanic.value >= 0 ? "+" : ""; result = `${targetNames[mechanic.target] || mechanic.target} ${sign}${mechanic.value}` }
  else if (mechanic.type === "grant") {
    if (mechanic.target === "trait" && mechanic.key === "curse:item") {
      const payload = mechanic.payload
      const description = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>).description : ""
      result = typeof description === "string" && description.trim() ? `Проклятие: ${description.trim()}` : "Проклято"
    } else {
      const nouns: Record<string, string> = { resistance: "Сопротивление", immunity: "Иммунитет", language: "Язык", proficiency: "Владение", sense: "Чувство", feature: "Особенность", trait: "Черта", value: "Значение", permission: "Разрешение" }
      result = `${nouns[mechanic.target] || mechanic.target}: ${mechanic.key}`
    }
  }
  else if (mechanic.type === "resource") result = `${mechanic.label}: ${formulaLabel(mechanic.max)}`
  else if (mechanic.type === "action") {
    const cost = mechanic.resourceCosts?.[0] || (mechanic.resourceKey && mechanic.resourceCost ? { key: mechanic.resourceKey, amount: mechanic.resourceCost } : null)
    result = `Действие: ${mechanic.label}${cost ? ` · −${cost.amount} ${cost.key}` : ""}`
  }
  else result = `Заклинание: ${mechanic.payload.spell.name}`
  return [result, mechanic.activation === "equipped" ? "надето" : "", conditionLabel(mechanic.condition)].filter(Boolean).join(" · ")
}

export function mechanicPayloadLabel(payload?: GrantPayload): string { if (typeof payload === "string") return payload; if (payload && typeof payload === "object" && !Array.isArray(payload)) { const label = (payload as Record<string, unknown>).label; return typeof label === "string" ? label : "" } return "" }
