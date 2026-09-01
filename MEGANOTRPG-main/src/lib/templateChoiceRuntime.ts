import { supabase } from "./supabase.ts"
import {
  registerCharacterTemplateBundles,
  registeredCharacterTemplateBundles,
} from "../rule-templates/registry.ts"

type ChoiceCommitResult = {
  assignment_id: string
  selected_choices: Record<string, string | string[]>
  updated_at?: string
}

type ChoiceRpcName = "commit_character_template_choice_v1" | "gena_commit_character_template_choice_v1"

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function parseResult(value: unknown): ChoiceCommitResult | null {
  if (!isRecord(value) || typeof value.assignment_id !== "string" || !isRecord(value.selected_choices)) return null
  return {
    assignment_id: value.assignment_id,
    selected_choices: value.selected_choices as Record<string, string | string[]>,
    ...(typeof value.updated_at === "string" ? { updated_at: value.updated_at } : {}),
  }
}

async function commitChoice(
  rpc: ChoiceRpcName,
  characterId: string,
  assignmentId: string,
  choiceKey: string,
  selectedOptions: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalized = [...new Set(selectedOptions.map((item) => item.trim()).filter(Boolean))]
  const args = rpc === "gena_commit_character_template_choice_v1"
    ? {
        p_character_id: characterId,
        p_assignment_id: assignmentId,
        p_choice_key: choiceKey,
        p_selected_options: normalized,
      }
    : {
        p_assignment_id: assignmentId,
        p_choice_key: choiceKey,
        p_selected_options: normalized,
      }
  const { data, error } = await supabase.rpc(rpc, args)
  if (error) return { ok: false, error: error.message }

  const result = parseResult(data)
  if (!result) return { ok: false, error: "Сервер сохранил выбор, но не вернул обновлённое состояние." }

  const current = registeredCharacterTemplateBundles(characterId)
  const next = current.map((bundle) => bundle.assignment.id === result.assignment_id
    ? {
        ...bundle,
        assignment: {
          ...bundle.assignment,
          selected_choices: result.selected_choices,
          updated_at: result.updated_at || bundle.assignment.updated_at,
        },
      }
    : bundle,
  )
  registerCharacterTemplateBundles(characterId, next)
  return { ok: true }
}

export async function commitCharacterTemplateChoice(
  characterId: string,
  assignmentId: string,
  choiceKey: string,
  selectedOptions: string[],
) {
  return commitChoice("commit_character_template_choice_v1", characterId, assignmentId, choiceKey, selectedOptions)
}

export async function commitGenaCharacterTemplateChoice(
  characterId: string,
  assignmentId: string,
  choiceKey: string,
  selectedOptions: string[],
) {
  return commitChoice("gena_commit_character_template_choice_v1", characterId, assignmentId, choiceKey, selectedOptions)
}
