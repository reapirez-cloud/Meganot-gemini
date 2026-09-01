import {
  choiceCountAtLevel,
  choiceDefinitionAvailable,
  choiceOptionAvailableAtLevel,
} from "./resolver.ts"
import type {
  CharacterTemplateBundle,
  RuleChoiceDefinition,
  RuleChoiceSelectionMode,
  RuleChoiceTarget,
  RuleTemplateKind,
} from "./types.ts"

export type TemplateChoiceStatus = "hidden" | "pending" | "locked"

export type TemplateChoiceOptionState = {
  key: string
  label: string
  available: boolean
  selected: boolean
}

export type TemplateChoiceState = {
  id: string
  assignmentId: string
  templateId: string
  templateKind: RuleTemplateKind
  sourceName: string
  sourceLevel: number
  unlockLevel: number
  key: string
  label: string
  target: RuleChoiceTarget
  selectionMode: RuleChoiceSelectionMode
  required: number
  selected: string[]
  remaining: number
  status: TemplateChoiceStatus
  options: TemplateChoiceOptionState[]
}

function normalizedSelected(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value : value ? [value] : []
  return [...new Set(raw.map((item) => item.trim()).filter(Boolean))]
}

function sourceLevelForChoice(
  bundle: CharacterTemplateBundle,
  characterLevel: number,
  classLevels: ReadonlyMap<string, number>,
): number {
  if (bundle.template.kind === "subclass" && bundle.template.parent_template_id) {
    const parentLevel = classLevels.get(bundle.template.parent_template_id)
    if (parentLevel !== undefined) return Math.max(1, parentLevel)
  }
  return Math.max(1, bundle.assignment.template_level || characterLevel)
}

function unlockedDefinitions(bundle: CharacterTemplateBundle, sourceLevel: number) {
  const definitions = new Map<string, { definition: RuleChoiceDefinition; unlockLevel: number }>()

  for (const definition of bundle.template.choices || []) {
    definitions.set(definition.key, { definition, unlockLevel: 1 })
  }

  for (const level of bundle.levels
    .filter((entry) => entry.level <= sourceLevel)
    .sort((left, right) => left.level - right.level)) {
    for (const definition of level.choices || []) {
      const previous = definitions.get(definition.key)
      definitions.set(definition.key, {
        definition,
        unlockLevel: Math.min(previous?.unlockLevel || level.level, level.level),
      })
    }
  }

  return [...definitions.values()]
}

export function resolveTemplateChoiceStates(
  bundles: CharacterTemplateBundle[],
  characterLevel: number,
): TemplateChoiceState[] {
  const classLevels = new Map(
    bundles
      .filter((bundle) => bundle.template.kind === "class")
      .map((bundle) => [bundle.template.id, Math.max(1, bundle.assignment.template_level || characterLevel)] as const),
  )
  const result: TemplateChoiceState[] = []

  for (const bundle of bundles) {
    const sourceLevel = sourceLevelForChoice(bundle, characterLevel, classLevels)
    const rootUnlockLevel = bundle.template.kind === "subclass" ? Math.max(1, bundle.template.unlock_level || 1) : 1
    if (bundle.template.kind === "subclass" && sourceLevel < rootUnlockLevel) continue

    for (const { definition, unlockLevel } of unlockedDefinitions(bundle, sourceLevel)) {
      const selectionMode = definition.selection_mode || "manager"
      if (selectionMode !== "player_once") continue

      const required = choiceCountAtLevel(definition, sourceLevel)
      const selected = normalizedSelected(bundle.assignment.selected_choices?.[definition.key])
      const dependencyAvailable = choiceDefinitionAvailable(definition, bundle.assignment.selected_choices)
      const status: TemplateChoiceStatus = !dependencyAvailable
        ? "hidden"
        : selected.length >= required
          ? "locked"
          : "pending"

      const known = new Set(definition.options)
      const options: TemplateChoiceOptionState[] = definition.options.map((key) => ({
        key,
        label: definition.option_labels?.[key] || key,
        available: choiceOptionAvailableAtLevel(definition, key, sourceLevel),
        selected: selected.includes(key),
      }))
      for (const key of selected.filter((key) => !known.has(key))) {
        options.push({ key, label: key, available: false, selected: true })
      }

      result.push({
        id: `${bundle.assignment.id}:${definition.key}`,
        assignmentId: bundle.assignment.id,
        templateId: bundle.template.id,
        templateKind: bundle.template.kind,
        sourceName: bundle.template.name,
        sourceLevel,
        unlockLevel: Math.max(rootUnlockLevel, unlockLevel),
        key: definition.key,
        label: definition.label,
        target: definition.target,
        selectionMode,
        required,
        selected,
        remaining: Math.max(0, required - selected.length),
        status,
        options,
      })
    }
  }

  const statusOrder: Record<TemplateChoiceStatus, number> = { pending: 0, locked: 1, hidden: 2 }
  return result.sort((left, right) =>
    statusOrder[left.status] - statusOrder[right.status]
    || left.templateKind.localeCompare(right.templateKind)
    || left.unlockLevel - right.unlockLevel
    || left.label.localeCompare(right.label, "ru"),
  )
}
