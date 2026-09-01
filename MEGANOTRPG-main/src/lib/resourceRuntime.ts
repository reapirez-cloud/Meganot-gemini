import type { GrantPayload, ResolvedCharacterContract, ResolvedResource, ResourceState } from "../character-engine/index.ts"
import type { PersistedResourceRecharge, ResourceCostInput, ResourceRecoveryStep, ResourceSyncInput } from "../types/characterResources.ts"
import { assertPersistentResourceRecharge, isPersistentResourceRecoveryTrigger } from "./persistentResourcePolicy.ts"

const runtimeRegistry = new Map<string, Record<string, ResourceState>>()

export function registerCharacterResourceState(characterId: string, state: Record<string, ResourceState>) {
  runtimeRegistry.set(characterId, state)
}

export function clearCharacterResourceState(characterId: string) {
  runtimeRegistry.delete(characterId)
}

export function registeredCharacterResourceState(characterId: string): Record<string, ResourceState> {
  return runtimeRegistry.get(characterId) || {}
}

function grantPayload(contract: ResolvedCharacterContract, resource: ResolvedResource): Record<string, unknown> | null {
  const grant = contract.grants.find((entry) => entry.target === "resource" && entry.key === resource.key && entry.variantKey === resource.variantKey)
  const payload: GrantPayload | undefined = grant?.payload
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : null
}

function grantLabel(contract: ResolvedCharacterContract, resource: ResolvedResource): string {
  const payload = grantPayload(contract, resource)
  const label = payload?.label
  if (typeof label === "string" && label.trim()) return label.trim()
  return resource.key.split(/[_-]+/g).map((part) => part ? `${part[0]!.toLocaleUpperCase("ru-RU")}${part.slice(1)}` : part).join(" ")
}

function recoveryStep(value: unknown, stateKey: string): ResourceRecoveryStep {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${stateKey}: recovery rule must be an object`)
  }
  const record = value as Record<string, unknown>
  const trigger = String(record.trigger || "")
  if (!isPersistentResourceRecoveryTrigger(trigger)) {
    throw new Error(`${stateKey}: CE does not persist manual/turn/state-based counters`)
  }
  if (record.restore === "full") return { trigger, restore: "full" }
  if (record.restore === "amount" && typeof record.amount === "number" && Number.isFinite(record.amount) && record.amount > 0) {
    return { trigger, restore: "amount", amount: record.amount }
  }
  throw new Error(`${stateKey}: invalid recovery rule`)
}

export function persistedResourceRecharge(
  contract: ResolvedCharacterContract,
  resource: ResolvedResource,
): PersistedResourceRecharge {
  const raw = grantPayload(contract, resource)?.recoveryRules
  const recharge: PersistedResourceRecharge = Array.isArray(raw)
    ? { rules: raw.map((entry) => recoveryStep(entry, resource.stateKey)) }
    : resource.recharge
  assertPersistentResourceRecharge(recharge, resource.stateKey)
  return recharge
}

/**
 * Persistent runtime state is shared by every finite CE ledger, including spell slots.
 * Only short-rest, long-rest, and dawn recovery are legal persistent triggers.
 * Turn/round/state/scene limits remain rules for the GM layer and never become counters.
 */
export function resourceSyncInputs(contract: ResolvedCharacterContract): ResourceSyncInput[] {
  return contract.resources.map((resource) => ({
    stateKey: resource.stateKey,
    current: resource.current,
    max: resource.max.value,
    label: grantLabel(contract, resource),
    recharge: persistedResourceRecharge(contract, resource),
  }))
}

export function resourceCostInputs(contract: ResolvedCharacterContract, costs: Array<{ stateKey: string; amount: number; current: number; max: number }>): ResourceCostInput[] {
  const byStateKey = new Map(contract.resources.map((resource) => [resource.stateKey, resource]))
  return costs.map((cost) => {
    const resource = byStateKey.get(cost.stateKey)
    if (!resource) throw new Error(`Resource cost references unresolved CE ledger: ${cost.stateKey}`)
    return {
      stateKey: cost.stateKey,
      amount: cost.amount,
      current: cost.current,
      max: cost.max,
      label: grantLabel(contract, resource),
      recharge: persistedResourceRecharge(contract, resource),
    }
  })
}
