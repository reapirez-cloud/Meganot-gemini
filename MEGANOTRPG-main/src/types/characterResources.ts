import type { ResourceRechargeRule, ResourceRechargeTrigger } from "../character-engine/index.ts"

export type PersistentResourceRecoveryTrigger = Extract<ResourceRechargeTrigger, "short_rest" | "long_rest" | "dawn">

export type ResourceRecoveryStep =
  | { trigger: PersistentResourceRecoveryTrigger; restore: "full" }
  | { trigger: PersistentResourceRecoveryTrigger; restore: "amount"; amount: number }

/**
 * Persistent CE state exists only for finite ledgers recovered by short rest,
 * long rest, or dawn. Per-turn/per-round/state/scene restrictions belong to the
 * rules/GM layer and must never be represented here as mutable counters.
 *
 * ResourceRechargeRule remains in the union because the low-level CE contract is
 * shared with legacy/internal callers; persistentResourcePolicy validates it
 * before any value reaches the database.
 */
export type PersistedResourceRecharge =
  | ResourceRechargeRule
  | { rules: ResourceRecoveryStep[] }

export type CharacterResourceStateRow = {
  character_id: string
  state_key: string
  current: number
  max_snapshot: number
  label: string
  recharge: PersistedResourceRecharge
  updated_by: string | null
  created_at: string
  updated_at: string
}

export type ResourceSyncInput = {
  stateKey: string
  current: number
  max: number
  label: string
  recharge: PersistedResourceRecharge
}

export type ResourceCostInput = ResourceSyncInput & { amount: number }
