import type { CharacterContribution, CharacterSource, FormulaExpression } from "../character-engine/index.ts"
import { contributionForStoredMechanic } from "../lib/characterMechanics.ts"
import type { StoredMechanic, StoredMechanics } from "../types/characterMechanics.ts"
import type { CharacterTemplateBundle, RuleChoiceDefinition, RuleTemplateKind } from "./types.ts"

// INTERNAL: before adding or changing class/subclass mechanics, read ./CLASS_INTEGRATION_NOTES.md.
// It defines CE-vs-GM condition enforcement, dependency rules, sourceKey policy, and the class definition-of-done.

export type TemplateSourceNodeKind = "template" | "mechanic" | "choice"

/** Read-model for GM/source UI. CE never branches on these labels. */
export type TemplateSourceNode = {
  id: string
  parentSourceId?: string
  name: string
  sourceType: string
  nodeKind: TemplateSourceNodeKind
  templateId: string
  templateKind: RuleTemplateKind
  unlockLevel: number
  mechanicIds: string[]
  choiceKey?: string
  optionKey?: string
}

export type TemplateSourceResolution = {
  contributions: CharacterContribution[]
  sources: TemplateSourceNode[]
}

function templateRootId(bundle: CharacterTemplateBundle): string {
  return `template:${bundle.template.kind}:${bundle.template.id}:v${bundle.template.version}`
}

function templateRootSource(bundle: CharacterTemplateBundle): CharacterSource {
  return { id: templateRootId(bundle), name: bundle.template.name, sourceType: `${bundle.template.kind}_template`, visibility: "campaign" }
}

function normalizeSelected(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.map((item) => item.trim()).filter(Boolean)
  return typeof value === "string" && value.trim() ? [value.trim()] : []
}

export function choiceDefinitionAvailable(
  definition: RuleChoiceDefinition,
  selectedChoices: Record<string, string | string[]> | null | undefined,
): boolean {
  const requirement = definition.requires_choice
  if (!requirement) return true
  return normalizeSelected(selectedChoices?.[requirement.key]).includes(requirement.option)
}

export function choiceCountAtLevel(definition: RuleChoiceDefinition, sourceLevel: number): number {
  const base = Math.max(1, definition.count || 1)
  return Object.entries(definition.count_by_level || {})
    .filter(([level]) => Number(level) <= sourceLevel)
    .sort(([left], [right]) => Number(left) - Number(right))
    .reduce((count, [, next]) => Math.max(1, Number(next) || count), base)
}

export function choiceOptionAvailableAtLevel(definition: RuleChoiceDefinition, option: string, sourceLevel: number): boolean {
  return sourceLevel >= Math.max(1, Number(definition.option_unlock_level?.[option] || 1))
}

function substituteFormula(expression: FormulaExpression, sourceLevel: number): FormulaExpression {
  switch (expression.kind) {
    case "reference": return expression.key === "source.level" ? { kind: "literal", value: sourceLevel } : expression
    case "add": return { ...expression, terms: expression.terms.map((term) => substituteFormula(term, sourceLevel)) }
    case "subtract": return { ...expression, left: substituteFormula(expression.left, sourceLevel), right: substituteFormula(expression.right, sourceLevel) }
    case "multiply": return { ...expression, factors: expression.factors.map((factor) => substituteFormula(factor, sourceLevel)) }
    case "min": return { ...expression, values: expression.values.map((value) => substituteFormula(value, sourceLevel)) }
    case "max": return { ...expression, values: expression.values.map((value) => substituteFormula(value, sourceLevel)) }
    case "clamp": return { ...expression, value: substituteFormula(expression.value, sourceLevel) }
    default: return expression
  }
}

function mechanicAtSourceLevel(mechanic: StoredMechanic, sourceLevel: number): StoredMechanic {
  if (mechanic.type !== "resource" || typeof mechanic.max === "number") return mechanic
  return { ...mechanic, max: substituteFormula(mechanic.max, sourceLevel) }
}

function mechanicsAtSourceLevel(mechanics: StoredMechanics, sourceLevel: number): StoredMechanics {
  return (mechanics || []).map((mechanic) => mechanicAtSourceLevel(mechanic, sourceLevel))
}

function payloadLabel(mechanic: StoredMechanic): string | undefined {
  if (mechanic.type === "resource" || mechanic.type === "action") return mechanic.label
  if (mechanic.type === "spell") return mechanic.payload.spell.name
  if (mechanic.label?.trim()) return mechanic.label.trim()
  if (mechanic.type === "grant" && mechanic.payload && typeof mechanic.payload === "object" && !Array.isArray(mechanic.payload)) {
    const label = (mechanic.payload as Record<string, unknown>).label
    if (typeof label === "string" && label.trim()) return label.trim()
  }
  return undefined
}

function mechanicFallbackName(mechanic: StoredMechanic): string {
  if (mechanic.type === "numeric") return mechanic.target
  return mechanic.key
}

function sourceKeyForMechanic(mechanic: StoredMechanic): string {
  const sourceKey = "sourceKey" in mechanic && typeof mechanic.sourceKey === "string" ? mechanic.sourceKey.trim() : ""
  return sourceKey || `mechanic:${mechanic.id}`
}

function sourceForMechanic(bundle: CharacterTemplateBundle, mechanic: StoredMechanic): CharacterSource {
  const root = templateRootSource(bundle)
  const key = sourceKeyForMechanic(mechanic)
  return {
    id: `${root.id}:source:${key}`,
    name: payloadLabel(mechanic) || mechanicFallbackName(mechanic),
    sourceType: root.sourceType,
    parentSourceId: root.id,
    visibility: root.visibility,
  }
}

function upsertNode(nodes: Map<string, TemplateSourceNode>, node: TemplateSourceNode, mechanicId?: string) {
  const current = nodes.get(node.id)
  if (!current) {
    nodes.set(node.id, { ...node, mechanicIds: mechanicId ? [mechanicId] : [...node.mechanicIds] })
    return
  }
  if (mechanicId && !current.mechanicIds.includes(mechanicId)) current.mechanicIds.push(mechanicId)
  current.unlockLevel = Math.min(current.unlockLevel, node.unlockLevel)
}

function mechanicContributions(
  bundle: CharacterTemplateBundle,
  mechanics: StoredMechanics,
  sourceLevel: number,
  unlockLevel: number,
  nodes: Map<string, TemplateSourceNode>,
): CharacterContribution[] {
  return mechanicsAtSourceLevel(mechanics, sourceLevel).map((mechanic) => {
    const source = sourceForMechanic(bundle, mechanic)
    upsertNode(nodes, {
      id: source.id,
      parentSourceId: source.parentSourceId,
      name: source.name,
      sourceType: source.sourceType || `${bundle.template.kind}_template`,
      nodeKind: "mechanic",
      templateId: bundle.template.id,
      templateKind: bundle.template.kind,
      unlockLevel,
      mechanicIds: [],
    }, mechanic.id)
    return contributionForStoredMechanic(mechanic, source)
  })
}

function choiceContributions(
  bundle: CharacterTemplateBundle,
  definition: RuleChoiceDefinition,
  sourceLevel: number,
  unlockLevel: number,
  nodes: Map<string, TemplateSourceNode>,
): CharacterContribution[] {
  if (!choiceDefinitionAvailable(definition, bundle.assignment.selected_choices)) return []

  const selected = normalizeSelected(bundle.assignment.selected_choices?.[definition.key])
    .filter((key) => definition.options.includes(key) && choiceOptionAvailableAtLevel(definition, key, sourceLevel))
    .slice(0, choiceCountAtLevel(definition, sourceLevel))
  const root = templateRootSource(bundle)

  return selected.flatMap((key, index) => {
    const optionName = definition.option_labels?.[key] || key
    const source: CharacterSource = {
      id: `${root.id}:choice:${definition.key}:${key}`,
      name: `${definition.label}: ${optionName}`,
      sourceType: root.sourceType,
      parentSourceId: root.id,
      visibility: root.visibility,
    }
    upsertNode(nodes, {
      id: source.id,
      parentSourceId: source.parentSourceId,
      name: source.name,
      sourceType: source.sourceType || `${bundle.template.kind}_template`,
      nodeKind: "choice",
      templateId: bundle.template.id,
      templateKind: bundle.template.kind,
      unlockLevel: Math.max(unlockLevel, Number(definition.option_unlock_level?.[key] || unlockLevel)),
      mechanicIds: [],
      choiceKey: definition.key,
      optionKey: key,
    })

    const base: CharacterContribution = {
      id: `${source.id}:grant:${index}`,
      kind: "grant",
      operation: "GRANT",
      target: definition.target,
      key,
      ...(definition.target === "proficiency" ? { payload: { rank: 1 } } : {}),
      source,
    }

    const unlockedMechanics: StoredMechanics = [
      ...(definition.option_mechanics?.[key] || []),
      ...Object.entries(definition.option_mechanics_by_level?.[key] || {})
        .filter(([level]) => Number(level) <= sourceLevel)
        .sort(([a], [b]) => Number(a) - Number(b))
        .flatMap(([, mechanics]) => mechanics || []),
    ]

    const optionMechanics = mechanicsAtSourceLevel(unlockedMechanics, sourceLevel).map((mechanic) => contributionForStoredMechanic(mechanic, source))
    return [base, ...optionMechanics]
  })
}

function sourceLevelForBundle(
  bundle: CharacterTemplateBundle,
  characterLevel: number,
  classLevels: ReadonlyMap<string, number>,
): number {
  if (bundle.template.kind === "subclass" && bundle.template.parent_template_id) {
    const parentClassLevel = classLevels.get(bundle.template.parent_template_id)
    if (parentClassLevel !== undefined) return Math.max(1, parentClassLevel)
  }
  return Math.max(1, bundle.assignment.template_level || characterLevel)
}

/**
 * Pure parser between rule-template data and Character Engine input.
 * It knows class/subclass levels and persistent choices, but never resolves HP,
 * slots, actions or other final character values itself.
 */
export function resolveTemplateBundles(bundles: CharacterTemplateBundle[], characterLevel: number): TemplateSourceResolution {
  const contributions: CharacterContribution[] = []
  const nodes = new Map<string, TemplateSourceNode>()
  const classLevels = new Map(
    bundles
      .filter((bundle) => bundle.template.kind === "class")
      .map((bundle) => [bundle.template.id, Math.max(1, bundle.assignment.template_level || characterLevel)] as const),
  )

  for (const bundle of bundles) {
    const effectiveLevel = sourceLevelForBundle(bundle, characterLevel, classLevels)
    const rootUnlockLevel = bundle.template.kind === "subclass" ? Math.max(1, bundle.template.unlock_level || 1) : 1
    const root = templateRootSource(bundle)
    upsertNode(nodes, {
      id: root.id,
      name: root.name,
      sourceType: root.sourceType || `${bundle.template.kind}_template`,
      nodeKind: "template",
      templateId: bundle.template.id,
      templateKind: bundle.template.kind,
      unlockLevel: rootUnlockLevel,
      mechanicIds: [],
    })

    // A subclass is a child of the class assignment. Keeping the assignment is
    // useful when a GM temporarily lowers the class level, but CE must emit none
    // of its mechanics until the parent class reaches the subclass unlock level.
    if (bundle.template.kind === "subclass" && effectiveLevel < rootUnlockLevel) continue

    contributions.push(...mechanicContributions(bundle, bundle.template.mechanics || [], effectiveLevel, 1, nodes))
    for (const definition of bundle.template.choices || []) contributions.push(...choiceContributions(bundle, definition, effectiveLevel, 1, nodes))

    for (const level of bundle.levels.filter((entry) => entry.level <= effectiveLevel).sort((a, b) => a.level - b.level)) {
      contributions.push(...mechanicContributions(bundle, level.mechanics || [], effectiveLevel, level.level, nodes))
      for (const definition of level.choices || []) contributions.push(...choiceContributions(bundle, definition, effectiveLevel, level.level, nodes))
    }
  }

  return {
    contributions,
    sources: [...nodes.values()].sort((left, right) =>
      left.templateKind.localeCompare(right.templateKind) || left.unlockLevel - right.unlockLevel || left.name.localeCompare(right.name, "ru"),
    ),
  }
}