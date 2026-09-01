import type { StoredMechanic, StoredMechanics } from "../types/characterMechanics.ts"
import type { CharacterTemplateBundle, RuleChoiceDefinition } from "./types.ts"

/**
 * INTERNAL DEVELOPER CONTRACT.
 *
 * This module is intentionally not imported by player-facing application code.
 * It exists for class/subclass implementation audits and CI tests only.
 * Never render these requirements, issue messages, or implementation language in the UI.
 */
export const CLASS_INTEGRATION_CONTRACT_VERSION = "2026-08-29-strict-v1" as const

export const INTERNAL_CLASS_DEFINITION_OF_DONE = [
  "Every player-facing feature is an exact rule, not a summary: trigger/condition, activation, cost, target, exact effect, numbers or dice, duration, and limit/recharge are stated whenever they apply.",
  "No vague or placeholder wording remains: a player must never receive a card equivalent to 'you have something and can do something with it'.",
  "Base-class progression and every included subclass are audited across their full supported level range before the package is called finished.",
  "Finite uses are represented by real CE resources when CE owns the count; recharge is explicit and uses the correct trigger.",
  "Deliberate resource-mutating abilities have usable server-authoritative actions; client preview logic is not persistence.",
  "Granted spells are CE spell accesses with the correct source level and real casting resource, not prose-only promises.",
  "Passive numeric/grant/value mechanics are native whenever the engine can truthfully represent them.",
  "Dependencies, replacements, upgrades, and resource conversions are structured; CE priority is mechanical precedence, never catalog versioning.",
  "Scene or fiction requirements stay precise in rules prose and are never faked as *_confirmed, *_available, or GM-enforced parser state.",
  "Persistent choices survive level changes; count growth, option unlocks, and later option mechanics use the original choice unless the rules explicitly grant a new choice.",
  "Subclass mechanics always use the parent class level and never total character level or an independent subclass level.",
  "Every independently suppressible mechanical package has a stable sourceKey shared by its related feature/action/resource/spell pieces.",
  "Representative low, mid, and high level parser -> ResolvedCharacterContract tests exist for the class package.",
  "Resource state persists through the shared server runtime and remains consistent between character sheet and chat.",
  "Player-facing descriptions and narrator text contain no Character Engine, parser, migration, compatibility, revision, or implementation meta.",
  "Russian terminology, action economy, costs, ranges, DCs, dice, durations, recharge, and edge restrictions are audited against the chosen project rules source.",
  "Any ambiguity discovered during implementation is resolved before completion; uncertainty is not hidden behind generic wording.",
  "Build, lint, and the complete test suite are green before integration.",
] as const

export type ClassQualityIssueCode =
  | "missing_description"
  | "short_description"
  | "vague_description"
  | "placeholder_description"
  | "implementation_meta"
  | "unclear_summary"
  | "missing_source_key"
  | "action_without_explanation"
  | "finite_use_without_resource"
  | "finite_action_without_action"
  | "invalid_choice"
  | "invalid_choice_progression"
  | "invalid_subclass_parent"

export type ClassQualityIssue = {
  code: ClassQualityIssueCode
  path: string
  message: string
}

type MechanicEntry = {
  mechanic: StoredMechanic
  level: number
  path: string
}

const VAGUE_RULE_PATTERNS = [
  /что[- ]?то/iu,
  /что[- ]?нибудь/iu,
  /какие[- ]?то\s+(?:возможност|эффект|бонус|способност)/iu,
  /некоторые\s+(?:возможност|эффект|бонус|способност)/iu,
  /особым образом/iu,
  /по ситуации/iu,
  /при необходимости/iu,
  /в некоторых случаях/iu,
  /расширяет возможности/iu,
  /усиливает возможности/iu,
  /становится эффективнее/iu,
  /получает новые возможности/iu,
  /может применять (?:это|способность|эффект)(?![а-яё])(?![^.]{0,80}(?:действи|реакц|раз|фут|к\d|d\d|урон|леч|Сл|DC))/iu,
]

const PLACEHOLDER_PATTERNS = [
  /\bTODO\b/i,
  /\bTBD\b/i,
  /\bFIXME\b/i,
  /placeholder/i,
  /описание (?:позже|способности)/iu,
  /заглушк/iu,
]

const IMPLEMENTATION_META_PATTERNS = [
  /Character Engine/i,
  /\bCE\b/,
  /runtime/i,
  /парсер/iu,
  /миграци/iu,
  /реализаци/iu,
  /совместимост/iu,
  /catalog[_ -]?revision/i,
  /sourceKey/i,
]

function sourceKeyOf(mechanic: StoredMechanic): string {
  return "sourceKey" in mechanic && typeof mechanic.sourceKey === "string" ? mechanic.sourceKey.trim() : ""
}

function featureDescription(mechanic: StoredMechanic): string | undefined {
  if (mechanic.type !== "grant" || mechanic.target !== "feature") return undefined
  const payload = mechanic.payload
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return ""
  const description = (payload as Record<string, unknown>).description
  return typeof description === "string" ? description.trim() : ""
}

function mechanicsFromChoice(choice: RuleChoiceDefinition, path: string, level: number): MechanicEntry[] {
  const entries: MechanicEntry[] = []
  for (const [option, mechanics] of Object.entries(choice.option_mechanics || {})) {
    for (const mechanic of mechanics || []) entries.push({ mechanic, level, path: `${path}.option:${option}` })
  }
  for (const [option, byLevel] of Object.entries(choice.option_mechanics_by_level || {})) {
    for (const [unlockLevel, mechanics] of Object.entries(byLevel || {})) {
      for (const mechanic of mechanics || []) entries.push({ mechanic, level: Number(unlockLevel) || level, path: `${path}.option:${option}.level:${unlockLevel}` })
    }
  }
  return entries
}

function collectMechanics(bundle: CharacterTemplateBundle): MechanicEntry[] {
  const entries: MechanicEntry[] = []
  const add = (mechanics: StoredMechanics, level: number, path: string) => {
    for (const mechanic of mechanics || []) entries.push({ mechanic, level, path })
  }

  add(bundle.template.mechanics || [], 1, "template")
  for (const choice of bundle.template.choices || []) entries.push(...mechanicsFromChoice(choice, `template.choice:${choice.key}`, 1))
  for (const row of bundle.levels || []) {
    add(row.mechanics || [], row.level, `level:${row.level}`)
    for (const choice of row.choices || []) entries.push(...mechanicsFromChoice(choice, `level:${row.level}.choice:${choice.key}`, row.level))
  }
  return entries
}

function allChoices(bundle: CharacterTemplateBundle): Array<{ choice: RuleChoiceDefinition; path: string }> {
  return [
    ...(bundle.template.choices || []).map((choice) => ({ choice, path: `template.choice:${choice.key}` })),
    ...(bundle.levels || []).flatMap((row) => (row.choices || []).map((choice) => ({ choice, path: `level:${row.level}.choice:${choice.key}` }))),
  ]
}

/** Do not use JS \b/\w here: their word semantics are ASCII-biased and miss Cyrillic rules text. */
function hasFiniteRestLimit(description: string): boolean {
  const lower = description.toLocaleLowerCase("ru")
  const mentionsRest = /(?:коротк|долг)[а-яё-]*\s+отдых/iu.test(lower)
  const mentionsFiniteUse = /использован[а-яё-]*|запас[а-яё-]*|заряд[а-яё-]*|восстанавл[а-яё-]*|(?:^|[\s,.;:])раз(?:а)?(?=$|[\s,.;:])/iu.test(lower)
  return mentionsRest && mentionsFiniteUse
}

/** Same Cyrillic rule: explicit separators are safer than ASCII-style word boundaries. */
function hasActionEconomy(description: string): boolean {
  return /(?:^|[\s,.;:])(?:бонусным действием|магическим действием|действием|реакцией)(?=$|[\s,.;:])/iu.test(description)
}

function auditChoice(choice: RuleChoiceDefinition, path: string): ClassQualityIssue[] {
  const issues: ClassQualityIssue[] = []
  const options = choice.options.map((option) => option.trim()).filter(Boolean)
  if (!choice.key.trim() || !choice.label.trim() || options.length === 0 || new Set(options).size !== options.length) {
    issues.push({ code: "invalid_choice", path, message: "Choice needs a stable key, label, and unique non-empty options." })
  }

  const allowed = new Set(options)
  for (const option of Object.keys(choice.option_unlock_level || {})) {
    if (!allowed.has(option)) issues.push({ code: "invalid_choice", path, message: `Unlock level references unknown option '${option}'.` })
  }
  for (const option of Object.keys(choice.option_mechanics || {})) {
    if (!allowed.has(option)) issues.push({ code: "invalid_choice", path, message: `Mechanics reference unknown option '${option}'.` })
  }
  for (const option of Object.keys(choice.option_mechanics_by_level || {})) {
    if (!allowed.has(option)) issues.push({ code: "invalid_choice", path, message: `Level mechanics reference unknown option '${option}'.` })
  }

  const progression = Object.entries(choice.count_by_level || {})
    .map(([level, count]) => [Number(level), Number(count)] as const)
    .sort(([a], [b]) => a - b)
  let previous = Math.max(1, Number(choice.count || 1))
  for (const [level, count] of progression) {
    if (!Number.isInteger(level) || level < 1 || !Number.isInteger(count) || count < previous) {
      issues.push({ code: "invalid_choice_progression", path, message: "count_by_level must use positive integer levels and must never shrink a persistent choice." })
      break
    }
    previous = count
  }

  for (const [option, byLevel] of Object.entries(choice.option_mechanics_by_level || {})) {
    for (const level of Object.keys(byLevel || {})) {
      if (!Number.isInteger(Number(level)) || Number(level) < 1) {
        issues.push({ code: "invalid_choice_progression", path, message: `Option '${option}' has an invalid mechanic unlock level '${level}'.` })
      }
    }
  }

  return issues
}

export function auditClassBundleQuality(bundle: CharacterTemplateBundle): ClassQualityIssue[] {
  if (bundle.template.kind !== "class" && bundle.template.kind !== "subclass") return []

  const issues: ClassQualityIssue[] = []
  const summary = bundle.template.mechanical_summary?.trim() || ""
  if (summary.length < 45 || VAGUE_RULE_PATTERNS.some((pattern) => pattern.test(summary)) || PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(summary))) {
    issues.push({
      code: "unclear_summary",
      path: `template:${bundle.template.catalog_key || bundle.template.id}.mechanical_summary`,
      message: "Class/subclass mechanical_summary must state a concrete play identity and may not be vague or placeholder text.",
    })
  }

  const entries = collectMechanics(bundle)
  const bySource = new Map<string, StoredMechanic[]>()
  for (const { mechanic } of entries) {
    const sourceKey = sourceKeyOf(mechanic)
    if (!sourceKey) continue
    const current = bySource.get(sourceKey) || []
    current.push(mechanic)
    bySource.set(sourceKey, current)
  }

  for (const [sourceKey, sourceMechanics] of bySource) {
    if (!sourceMechanics.some((item) => item.type === "action")) continue
    const descriptions = sourceMechanics.map(featureDescription).filter((value): value is string => value !== undefined)
    if (!descriptions.some((description) => description.length >= 45)) {
      issues.push({
        code: "action_without_explanation",
        path: `source:${sourceKey}`,
        message: "Every class/subclass action needs a precise player-facing feature explanation under the same sourceKey.",
      })
    }
  }

  for (const entry of entries) {
    const { mechanic, path } = entry
    const sourceKey = sourceKeyOf(mechanic)
    if (!sourceKey) {
      issues.push({ code: "missing_source_key", path: `${path}.${mechanic.id}`, message: "Class mechanics require a stable sourceKey so GM suppression removes the complete package." })
    }

    const description = featureDescription(mechanic)
    if (description === undefined) continue
    const issuePath = `${path}.${mechanic.id}`
    if (!description) {
      issues.push({ code: "missing_description", path: issuePath, message: "Player-facing feature has no rules explanation." })
      continue
    }
    if (description.length < 45) {
      issues.push({ code: "short_description", path: issuePath, message: "Feature explanation is too short to establish a complete rule; spell out the exact mechanic." })
    }
    if (VAGUE_RULE_PATTERNS.some((pattern) => pattern.test(description))) {
      issues.push({ code: "vague_description", path: issuePath, message: "Feature uses vague wording instead of a deterministic rule." })
    }
    if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(description))) {
      issues.push({ code: "placeholder_description", path: issuePath, message: "Feature still contains placeholder/TODO wording." })
    }
    if (IMPLEMENTATION_META_PATTERNS.some((pattern) => pattern.test(description))) {
      issues.push({ code: "implementation_meta", path: issuePath, message: "Player-facing rules must not expose implementation or Character Engine metadata." })
    }

    if (sourceKey && hasFiniteRestLimit(description)) {
      const sourceMechanics = bySource.get(sourceKey) || []
      if (!sourceMechanics.some((item) => item.type === "resource")) {
        issues.push({ code: "finite_use_without_resource", path: issuePath, message: "A rest-recharging finite ability must have a real CE resource under the same sourceKey." })
      }
      if (hasActionEconomy(description) && !sourceMechanics.some((item) => item.type === "action")) {
        issues.push({ code: "finite_action_without_action", path: issuePath, message: "A deliberate finite action/reaction needs an actionable mechanic under the same sourceKey." })
      }
    }
  }

  for (const { choice, path } of allChoices(bundle)) issues.push(...auditChoice(choice, path))
  return issues
}

export function auditClassPackageQuality(bundles: CharacterTemplateBundle[]): ClassQualityIssue[] {
  const issues = bundles.flatMap(auditClassBundleQuality)
  const classes = bundles.filter((bundle) => bundle.template.kind === "class")
  const classIds = new Set(classes.map((bundle) => bundle.template.id))

  for (const bundle of bundles.filter((item) => item.template.kind === "subclass")) {
    if (!bundle.template.parent_template_id || !classIds.has(bundle.template.parent_template_id)) {
      issues.push({
        code: "invalid_subclass_parent",
        path: `template:${bundle.template.catalog_key || bundle.template.id}`,
        message: "A completed class package must audit each subclass together with its parent class so subclass level provenance is explicit.",
      })
    }
  }
  return issues
}

export function assertClassPackageQuality(bundles: CharacterTemplateBundle[]): void {
  const issues = auditClassPackageQuality(bundles)
  if (issues.length === 0) return
  const details = issues.map((issue) => `- [${issue.code}] ${issue.path}: ${issue.message}`).join("\n")
  throw new Error(`Class integration quality gate failed (${CLASS_INTEGRATION_CONTRACT_VERSION}):\n${details}`)
}
