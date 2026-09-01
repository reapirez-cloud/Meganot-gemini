import type { ResolvedCharacterContract } from "../character-engine/index.ts"
import { syncResolvedCharacterResources } from "./classResourceRuntime.ts"
import { supabase } from "./supabase.ts"

export type WizardArcaneRecoveryResult = { ok: true } | { ok: false; error: string }

export type SpellSlotRecoverySelection = Record<number, number>

export async function runWizardArcaneRecovery(
  characterId: string,
  assignmentId: string,
  contract: ResolvedCharacterContract,
  selection: SpellSlotRecoverySelection,
): Promise<WizardArcaneRecoveryResult> {
  const synced = await syncResolvedCharacterResources(characterId, contract)
  if (!synced.ok) return synced

  const recovery = Object.fromEntries(
    Object.entries(selection)
      .map(([level, amount]) => [level, Math.max(0, Math.trunc(Number(amount) || 0))])
      .filter(([, amount]) => Number(amount) > 0),
  )
  if (!Object.keys(recovery).length) return { ok: false, error: "Выбери хотя бы одну потраченную ячейку." }

  const { error } = await supabase.rpc("use_wizard_arcane_recovery_v1", {
    p_character_id: characterId,
    p_assignment_id: assignmentId,
    p_recovery: recovery,
  })
  return error ? { ok: false, error: error.message } : { ok: true }
}
