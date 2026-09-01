import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const sql = fs.readFileSync("supabase/migrations/20260830015000_player_template_choice_runtime.sql", "utf8")
const ui = fs.readFileSync("src/components/characters/CharacterTemplateChoices.tsx", "utf8")
const wrapper = fs.readFileSync("src/components/characters/CharacterClassPanel.tsx", "utf8")
const types = fs.readFileSync("src/rule-templates/types.ts", "utf8")

test("player choice runtime is opt-in, server validated and append-only", () => {
  assert.match(sql, /commit_character_template_choice_v1/)
  assert.match(sql, /selection_mode','manager'\)<>'player_once'/)
  assert.match(sql, /assigned_user_id/)
  assert.match(sql, /private\.can_manage_character/)
  assert.match(sql, /Already confirmed options cannot be removed or replaced/)
  assert.match(sql, /Choice is already locked/)
  assert.match(sql, /count_by_level/)
  assert.match(sql, /option_unlock_level/)
  assert.match(sql, /requires_choice/)
})

test("choice authoring contract exposes explicit player_once mode", () => {
  assert.match(types, /RuleChoiceSelectionMode = "manager" \| "player_once"/)
  assert.match(types, /selection_mode\?: RuleChoiceSelectionMode/)
})

test("Class tab renders CE decisions with explicit confirmation and lock state", () => {
  assert.match(wrapper, /CharacterTemplateChoices/)
  assert.match(ui, /Нужен выбор/)
  assert.match(ui, /Зафиксировать выбор/)
  assert.match(ui, /Зафиксировано/)
  assert.match(ui, /Выкл/)
  assert.match(ui, /попросит только добавить новый/)
})
