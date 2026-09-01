import assert from "node:assert/strict"
import test from "node:test"

import { resolveTemplateChoiceStates } from "../src/rule-templates/choiceState.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"

function bundle(level: number, selected_choices: Record<string, string | string[]> = {}): CharacterTemplateBundle {
  return {
    template: {
      id: "class-template",
      campaign_id: "campaign",
      kind: "class",
      slug: "choice-test",
      name: "Тестовый класс",
      description: "Тестирует постоянные выборы.",
      version: 1,
      mechanics: [],
      choices: [
        {
          key: "path",
          label: "Путь",
          target: "trait",
          selection_mode: "player_once",
          options: ["warden", "mage"],
          option_labels: { warden: "Страж", mage: "Маг" },
        },
        {
          key: "spells",
          label: "Заклинания",
          target: "trait",
          selection_mode: "player_once",
          count: 1,
          count_by_level: { "5": 2 },
          options: ["spell:a", "spell:b", "spell:c"],
        },
        {
          key: "child",
          label: "Зависимый выбор",
          target: "trait",
          selection_mode: "player_once",
          requires_choice: { key: "path", option: "mage" },
          options: ["spell:a"],
        },
        {
          key: "gm-only",
          label: "Выбор ГМа",
          target: "trait",
          options: ["x", "y"],
        },
      ],
      parent_template_id: null,
      unlock_level: null,
      catalog_key: "class:choice-test",
      catalog_revision: "test",
      source_kind: "official",
      source_label: "Test",
      is_builtin: true,
      mechanical_summary: "Даёт взаимоисключающий путь и постоянные уровневые выборы.",
      author_description: "",
      author_comment: "",
      rules_meta: {},
      is_active: true,
      created_by: null,
      created_at: "2026-08-30T00:00:00Z",
      updated_at: "2026-08-30T00:00:00Z",
    },
    assignment: {
      id: "assignment",
      character_id: "hero",
      template_id: "class-template",
      template_level: level,
      selected_choices,
      assigned_at: "2026-08-30T00:00:00Z",
      updated_at: "2026-08-30T00:00:00Z",
    },
    levels: [],
  }
}

test("player_once choice is pending before confirmation and locked afterwards", () => {
  const pending = resolveTemplateChoiceStates([bundle(1)], 1).find((choice) => choice.key === "path")
  assert.ok(pending)
  assert.equal(pending.status, "pending")
  assert.equal(pending.required, 1)
  assert.equal(pending.remaining, 1)

  const locked = resolveTemplateChoiceStates([bundle(1, { path: "warden" })], 1).find((choice) => choice.key === "path")
  assert.ok(locked)
  assert.equal(locked.status, "locked")
  assert.deepEqual(locked.selected, ["warden"])
  assert.equal(locked.options.find((option) => option.key === "warden")?.selected, true)
  assert.equal(locked.options.find((option) => option.key === "mage")?.selected, false)
})

test("count growth reopens only the missing slots without forgetting confirmed selections", () => {
  const state = resolveTemplateChoiceStates([bundle(5, { spells: "spell:a" })], 5).find((choice) => choice.key === "spells")
  assert.ok(state)
  assert.equal(state.status, "pending")
  assert.equal(state.required, 2)
  assert.equal(state.remaining, 1)
  assert.deepEqual(state.selected, ["spell:a"])
})

test("dependent player choice stays hidden until its parent option is active", () => {
  const hidden = resolveTemplateChoiceStates([bundle(1, { path: "warden" })], 1).find((choice) => choice.key === "child")
  assert.ok(hidden)
  assert.equal(hidden.status, "hidden")

  const visible = resolveTemplateChoiceStates([bundle(1, { path: "mage" })], 1).find((choice) => choice.key === "child")
  assert.ok(visible)
  assert.equal(visible.status, "pending")
})

test("manager choices do not leak into the player decision queue", () => {
  assert.equal(resolveTemplateChoiceStates([bundle(1)], 1).some((choice) => choice.key === "gm-only"), false)
})
