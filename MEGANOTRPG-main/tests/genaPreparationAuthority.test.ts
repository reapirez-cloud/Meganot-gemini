import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"
import { buildCharacterPreparationModel, choiceRequiredCount } from "../src/lib/characterPreparation.ts"
import type { CharacterTemplateBundle, RuleChoiceDefinition } from "../src/rule-templates/types.ts"

const migration = fs.readFileSync("supabase/migrations/20260831090000_gena_preparation_authority_and_locking.sql", "utf8")
const card = fs.readFileSync("src/components/chat/ChatPreparationCard.tsx", "utf8")

function druidLevelFourBundle(): CharacterTemplateBundle {
  return {
    assignment: {
      id: "assignment-druid-4",
      character_id: "character-vita",
      template_id: "template-druid",
      template_level: 4,
      selected_choices: {},
      assigned_at: "2026-08-31T00:00:00Z",
      updated_at: "2026-08-31T00:00:00Z",
    },
    template: {
      id: "template-druid",
      campaign_id: "campaign-1",
      kind: "class",
      slug: "druid",
      name: "Друид",
      description: "",
      version: 1,
      mechanics: [],
      choices: [],
      catalog_key: "class:druid",
      catalog_revision: "2024",
      rules_meta: {
        spell_preparation_refresh: "long_rest",
        sheet_profile: {
          prepared_spells_by_level: { "1": 4, "2": 5, "3": 6, "4": 7, "5": 9 },
        },
      },
      is_active: true,
      created_by: null,
      created_at: "2026-08-31T00:00:00Z",
      updated_at: "2026-08-31T00:00:00Z",
    },
    levels: [],
  }
}

test("Druid 4 GENA preparation uses the authored 2024 quota of seven", () => {
  const model = buildCharacterPreparationModel(
    [druidLevelFourBundle()],
    4,
    {
      character_id: "character-vita",
      generation: 1,
      is_open: true,
      opened_at: "2026-08-31T00:00:00Z",
      opened_by: "gm",
      closed_at: null,
      closed_by_message_id: null,
    },
    [],
  )
  const task = model.tasks.find((entry) => entry.kind === "spells")
  assert.ok(task && task.kind === "spells")
  assert.equal(task.required, 7)
})

test("choiceRequiredCount respects count_by_level", () => {
  const definition: RuleChoiceDefinition = {
    key: "scaled-choice",
    label: "Scaled choice",
    target: "trait",
    options: ["a", "b", "c"],
    count: 1,
    count_by_level: { "5": 2, "9": 3 },
  }
  assert.equal(choiceRequiredCount(definition, 4), 1)
  assert.equal(choiceRequiredCount(definition, 5), 2)
  assert.equal(choiceRequiredCount(definition, 8), 2)
  assert.equal(choiceRequiredCount(definition, 9), 3)
})

test("GENA preparation RPCs are assigned-player only and one-shot", () => {
  assert.match(migration, /create or replace function private\.gena_assert_assigned_player/)
  assert.match(migration, /c\.assigned_user_id=auth\.uid\(\)/)
  assert.doesNotMatch(migration, /can_manage_character/)
  assert.match(migration, /gena_commit_character_spell_preparation_v1/)
  assert.match(migration, /cardinality\(v_ids\)<>v_required/)
  assert.match(migration, /Spell preparation is already fixed for this long rest/)
  assert.match(migration, /gena_commit_character_template_choice_v1/)
  assert.match(migration, /'choice:' \|\| btrim\(p_choice_key\)/)
  assert.match(migration, /This choice is already fixed for this long rest/)
  assert.match(migration, /gena_send_chat_preparation_roll_v1/)
})

test("forgotten random preparation gets a server default before chat closes", () => {
  assert.match(migration, /gena_resolve_missing_random_preparations/)
  assert.match(migration, /floor\(random\(\)\*v_sides\)/)
  assert.match(migration, /perform private\.gena_resolve_missing_random_preparations\(new\.character_id,new\.user_id\)/)
})

test("chat preparation locks confirmed tasks and enforces exact quotas", () => {
  assert.match(card, /assigned_user_id === user\.id/)
  assert.match(card, /gena_commit_character_spell_preparation_v1/)
  assert.match(card, /gena_send_chat_preparation_roll_v1/)
  assert.match(card, /draft\.length === required/)
  assert.match(card, /busy \|\| locked/)
  assert.match(card, /После «Готово» этот выбор нельзя менять до следующего долгого отдыха/)
})
