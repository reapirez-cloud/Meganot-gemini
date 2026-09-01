import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const migration = fs.readFileSync("supabase/migrations/20260828014500_subclass_reference_quality.sql", "utf8")

test("subclass reference quality guard covers the whole active subclass catalog", () => {
  assert.match(migration, /t\.kind='subclass'/)
  assert.match(migration, /length\(trim\(coalesce\(f\.description,''\)\)\) < 45/)
  assert.match(migration, /расширяет возможности/)
  assert.match(migration, /усиливает возможности/)
  assert.match(migration, /% может %/)
  assert.match(migration, /% могут %/)
  assert.match(migration, /% иногда %/)
  assert.match(migration, /% обычно %/)
  assert.match(migration, /% примерно %/)
})

test("new campaigns run subclass explanation validation after catalog installers", () => {
  assert.match(migration, /zz_campaigns_enforce_subclass_reference_quality/)
  assert.match(migration, /after insert on public\.campaigns/)
  assert.match(migration, /private\.apply_subclass_reference_quality\(new\.id\)/)
})

test("Moon explanations use deterministic cost and effect wording", () => {
  assert.match(migration, /При попадании атакой звериной формы выбирается тип урона/)
  assert.match(migration, /Чтобы вернуть 1 использование раньше, потрать 1 ячейку заклинаний 2 уровня или выше/)
  assert.match(migration, /союзник появляется в пределах 10 футов от точки назначения/)
  assert.doesNotMatch(migration, /Атаки звериной формы могут наносить/)
  assert.doesNotMatch(migration, /Ячейка 2\+ уровня может вернуть/)
  assert.doesNotMatch(migration, /Лунный шаг может забрать/)
})
