import type { PersistedResourceRecharge } from "../types/characterResources.ts"

export const PERSISTENT_RESOURCE_RECOVERY_TRIGGERS = ["short_rest", "long_rest", "dawn"] as const
export type PersistentResourceRecoveryTrigger = typeof PERSISTENT_RESOURCE_RECOVERY_TRIGGERS[number]

const allowed = new Set<string>(PERSISTENT_RESOURCE_RECOVERY_TRIGGERS)

function assertRestoreRule(value: unknown, context: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${context}: recovery rule must be an object`)
  }
  const rule = value as Record<string, unknown>
  if (typeof rule.trigger !== "string" || !allowed.has(rule.trigger)) {
    throw new Error(`${context}: persistent CE resources may recover only on short_rest, long_rest, or dawn`)
  }
  if (rule.restore === "full") return
  if (rule.restore === "amount" && typeof rule.amount === "number" && Number.isFinite(rule.amount) && rule.amount > 0) return
  throw new Error(`${context}: recovery rule must restore full or a positive amount`)
}

/**
 * Persistent CE resources are ledgers, not turn trackers.
 *
 * Only finite pools that recover on short rest, long rest, or dawn belong here.
 * "Once per turn/round", "while in a form/state", target marks, scene conditions,
 * manual resets and never-recharging flags are rules for the GM/rules layer and
 * must not become mutable Character Engine counters.
 */
export function assertPersistentResourceRecharge(
  recharge: PersistedResourceRecharge,
  context = "resource",
): void {
  const value = recharge as unknown
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${context}: recharge must be an object`)
  }
  const record = value as Record<string, unknown>

  if (Array.isArray(record.rules)) {
    if (record.rules.length === 0) throw new Error(`${context}: recovery rules must not be empty`)
    for (const rule of record.rules) assertRestoreRule(rule, context)
    return
  }

  if (!Array.isArray(record.triggers) || record.triggers.length === 0) {
    throw new Error(`${context}: persistent CE resource requires a recovery trigger`)
  }
  for (const trigger of record.triggers) {
    if (typeof trigger !== "string" || !allowed.has(trigger)) {
      throw new Error(`${context}: persistent CE resources may recover only on short_rest, long_rest, or dawn`)
    }
  }
  if (record.restore === "full") return
  if (record.restore === "amount" && typeof record.amount === "number" && Number.isFinite(record.amount) && record.amount > 0) return
  throw new Error(`${context}: recharge must restore full or a positive amount`)
}

export function isPersistentResourceRecoveryTrigger(value: string): value is PersistentResourceRecoveryTrigger {
  return allowed.has(value)
}