import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const migration = fs.readFileSync("supabase/migrations/20260828015000_subclass_action_explanations.sql", "utf8")

test("every subclass action group must have a rules explanation", () => {
  assert.match(migration, /bool_or\(item->>'type'='action'\) has_action/)
  assert.match(migration, /where has_action and not has_explanation/)
  assert.match(migration, /Subclass catalog has % action groups without rules explanations/)
})

test("Moon passenger upgrade is explained with exact distances and unchanged cost", () => {
  assert.match(migration, /одного согласного союзника/)
  assert.match(migration, /в пределах 10 футов от точки отправления/)
  assert.match(migration, /в пределах 10 футов от точки назначения/)
  assert.match(migration, /бонусное действие, 1 использование, телепорт друида на 30 футов/)
})

test("Stars level 10 explains each constellation upgrade", () => {
  assert.match(migration, /Лучник наносит 2к8 \+ модификатор Мудрости/)
  assert.match(migration, /Чаша лечит на 2к8 \+ Мудрость/)
  assert.match(migration, /Дракон получает скорость полёта 20 футов и зависание/)
  assert.match(migration, /без нового расхода Дикой формы/)
})
