import type { StoredMechanic, StoredMechanics } from "../types/characterMechanics.ts"
import type { CharacterTemplateBundle, RuleChoiceDefinition } from "./types.ts"

/**
 * INTERNAL DEVELOPER POLICY — NEVER IMPORT INTO PLAYER UI.
 *
 * Official class/subclass packages may persist only explicit finite pools whose
 * rules restore them on a short rest, long rest, and/or dawn. Manual/never and
 * turn/round/combat/state cadence are not persistent Character Engine ledgers.
 *
 * Action economy and encounter cadence are not resources. A reaction, once per
 * turn/round/combat, initiative/start-of-combat trigger, etc. stays unlimited
 * from CE's resource perspective unless the same rule separately defines a
 * finite rest/dawn-recovering pool. The GM tracks that cadence.
 *
 * The legacy policy version/header name is retained for migration compatibility;
 * its authoritative semantics include dawn from this revision onward.
 */
export const CLASS_RESOURCE_POLICY_VERSION = "2026-08-29-short-long-rest-v1" as const

export type ClassResourcePolicyIssueCode =
  | "class_resource_without_rest_recovery"
  | "class_resource_has_forbidden_recovery"
  | "gm_cadence_counter_forbidden"

export type ClassResourcePolicyIssue = {
  code: ClassResourcePolicyIssueCode
  path: string
  message: string
}

type MechanicEntry = { mechanic: StoredMechanic; path: string }

const ALLOWED_CLASS_RECOVERY = new Set(["short_rest", "long_rest", "dawn"])

function mechanicsFromChoice(choice: RuleChoiceDefinition, path: string): MechanicEntry[] {
  const entries: MechanicEntry[] = []
  for (const [option, mechanics] of Object.entries(choice.option_mechanics || {})) {
    for (const mechanic of mechanics || []) entries.push({ mechanic, path: `${path}.option:${option}` })
  }
  for (const [option, byLevel] of Object.entries(choice.option_mechanics_by_level || {})) {
    for (const [level, mechanics] of Object.entries(byLevel || {})) {
      for (const mechanic of mechanics || []) entries.push({ mechanic, path: `${path}.option:${option}.level:${level}` })
    }
  }
  return entries
}

function collectMechanics(bundle: CharacterTemplateBundle): MechanicEntry[] {
  const entries: MechanicEntry[] = []
  const add = (mechanics: StoredMechanics, path: string) => {
    for (const mechanic of mechanics || []) entries.push({ mechanic, path })
  }
  add(bundle.template.mechanics || [], "template")
  for (const choice of bundle.template.choices || []) entries.push(...mechanicsFromChoice(choice, `template.choice:${choice.key}`))
  for (const row of bundle.levels || []) {
    add(row.mechanics || [], `level:${row.level}`)
    for (const choice of row.choices || []) entries.push(...mechanicsFromChoice(choice, `level:${row.level}.choice:${choice.key}`))
  }
  return entries
}

function sourceKeyOf(mechanic: StoredMechanic): string {
  return "sourceKey" in mechanic && typeof mechanic.sourceKey === "string" ? mechanic.sourceKey.trim() : ""
}

function featureDescription(mechanic: StoredMechanic): string {
  if (mechanic.type !== "grant" || mechanic.target !== "feature") return ""
  if (!mechanic.payload || typeof mechanic.payload !== "object" || Array.isArray(mechanic.payload)) return ""
  const value = (mechanic.payload as Record<string, unknown>).description
  return typeof value === "string" ? value : ""
}

function resourceRecoveryTriggers(mechanic: StoredMechanic): string[] {
  if (mechanic.type !== "resource") return []
  const recharge = Array.isArray(mechanic.recharge) ? mechanic.recharge : [mechanic.recharge]
  const rules = (mechanic.recoveryRules || []).map((rule) => rule.trigger)
  return [...new Set([...recharge, ...rules].filter(Boolean))]
}

function mentionsPersistentRecoveryPool(text: string): boolean {
  const lower = text.toLocaleLowerCase("ru")
  const recovery = /(?:коротк|долг)[а-яё-]*\s+отдых|рассвет/iu.test(lower)
  const pool = /использован|запас|заряд|восстанавл|восстанов|количеств[а-яё-]*\s+использован/iu.test(lower)
  return recovery && pool
}

function mentionsGmCadence(text: string): boolean {
  return /(?:один\s+)?раз\s+(?:за|на)\s+(?:свой\s+)?(?:ход|раунд|бой)|в\s+начале\s+(?:боя|сражения)|при\s+(?:броске\s+)?инициатив|кажд(?:ый|ом)\s+(?:свой\s+)?ход/iu.test(text)
}

export function auditClassResourcePolicy(bundle: CharacterTemplateBundle): ClassResourcePolicyIssue[] {
  if (bundle.template.kind !== "class" && bundle.template.kind !== "subclass") return []
  const entries = collectMechanics(bundle)
  const descriptionsBySource = new Map<string, string[]>()
  for (const { mechanic } of entries) {
    const sourceKey = sourceKeyOf(mechanic)
    const description = featureDescription(mechanic).trim()
    if (!sourceKey || !description) continue
    descriptionsBySource.set(sourceKey, [...(descriptionsBySource.get(sourceKey) || []), description])
  }

  const issues: ClassResourcePolicyIssue[] = []
  for (const { mechanic, path } of entries) {
    if (mechanic.type !== "resource") continue
    const triggers = resourceRecoveryTriggers(mechanic)
    const issuePath = `${path}.${mechanic.id}`
    const forbidden = triggers.filter((trigger) => !ALLOWED_CLASS_RECOVERY.has(trigger))
    if (!triggers.some((trigger) => ALLOWED_CLASS_RECOVERY.has(trigger))) {
      issues.push({
        code: "class_resource_without_rest_recovery",
        path: issuePath,
        message: "Class/subclass resources must restore on short rest, long rest, and/or dawn.",
      })
    }
    if (forbidden.length > 0) {
      issues.push({
        code: "class_resource_has_forbidden_recovery",
        path: issuePath,
        message: `Class/subclass resources may not use non-persistent recovery triggers: ${forbidden.join(", ")}.`,
      })
    }

    const sourceKey = sourceKeyOf(mechanic)
    const descriptions = sourceKey ? descriptionsBySource.get(sourceKey) || [] : []
    if (descriptions.some(mentionsGmCadence) && !descriptions.some(mentionsPersistentRecoveryPool)) {
      issues.push({
        code: "gm_cadence_counter_forbidden",
        path: issuePath,
        message: "Reaction/turn/round/combat cadence is GM-tracked and may not be represented as a persistent CE counter without a separate rest/dawn-recovering pool.",
      })
    }
  }
  return issues
}

export function auditClassPackageResourcePolicy(bundles: CharacterTemplateBundle[]): ClassResourcePolicyIssue[] {
  return bundles.flatMap(auditClassResourcePolicy)
}

export function assertClassResourcePolicy(bundles: CharacterTemplateBundle[]): void {
  const issues = auditClassPackageResourcePolicy(bundles)
  if (issues.length === 0) return
  throw new Error(`Class resource policy failed:\n${issues.map((issue) => `- [${issue.code}] ${issue.path}: ${issue.message}`).join("\n")}`)
}
