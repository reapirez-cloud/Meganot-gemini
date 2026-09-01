import type {
  ResolvedAction,
  ResolvedCharacterContract,
  ResolvedSpellResourceOption,
} from "../character-engine/index.ts"
import { resourceCostInputs, resourceSyncInputs } from "./resourceRuntime.ts"
import { supabase } from "./supabase.ts"

export type ClassRuntimeResult = { ok: true } | { ok: false; error: string }

export function resolvedActionMechanicId(action: ResolvedAction): string {
  const marker = ":mechanic:"
  for (const source of action.sources) {
    const index = source.contributionId.lastIndexOf(marker)
    if (index >= 0) return source.contributionId.slice(index + marker.length)
  }
  return ""
}

/**
 * Synchronize CE's resolved resource definitions/current snapshot into the one
 * persistent resource ledger before a narrow server-authoritative class action.
 * Reusable class runtimes may call this; they must never invent a second ledger.
 */
export async function syncResolvedCharacterResources(
  characterId: string,
  contract: ResolvedCharacterContract,
): Promise<ClassRuntimeResult> {
  const resources = resourceSyncInputs(contract)
  if (!resources.length) return { ok: true }
  const { error } = await supabase.rpc("sync_character_resource_states", {
    p_character_id: characterId,
    p_resources: resources,
  })
  return error ? { ok: false, error: error.message } : { ok: true }
}

/**
 * Executes only the persistent resource side of a resolved class/subclass action.
 * The server re-reads the assigned template mechanic, so a client cannot submit
 * arbitrary restore effects. Scene/fiction consequences remain player/GM rules.
 */
export async function runResolvedTemplateResourceAction(
  characterId: string,
  contract: ResolvedCharacterContract,
  action: ResolvedAction,
  optionKey?: string,
): Promise<ClassRuntimeResult> {
  const mechanicId = resolvedActionMechanicId(action)
  if (!mechanicId) return { ok: false, error: "Не удалось определить механику классового действия." }
  const synced = await syncResolvedCharacterResources(characterId, contract)
  if (!synced.ok) return synced
  const { error } = await supabase.rpc("use_character_template_resource_action", {
    p_character_id: characterId,
    p_mechanic_id: mechanicId,
    p_option_key: optionKey || null,
  })
  return error ? { ok: false, error: error.message } : { ok: true }
}

/** Spend the real CE resources for an automatically granted class spell. */
export async function spendResolvedClassSpellOption(
  characterId: string,
  contract: ResolvedCharacterContract,
  option: ResolvedSpellResourceOption,
): Promise<ClassRuntimeResult> {
  const synced = await syncResolvedCharacterResources(characterId, contract)
  if (!synced.ok) return synced
  const costs = resourceCostInputs(contract, option.costs)
  const { error } = await supabase.rpc("spend_character_resources", {
    p_character_id: characterId,
    p_costs: costs,
  })
  return error ? { ok: false, error: error.message } : { ok: true }
}
