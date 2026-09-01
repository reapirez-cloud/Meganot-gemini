import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const migrations = [
  "20260825160456_ru_level1_voss_part_1.sql",
  "20260825160625_ru_level1_voss_part_2.sql",
  "20260825160729_ru_level1_voss_part_3.sql",
]

async function batchSql() {
  const parts = await Promise.all(
    migrations.map((name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8")),
  )
  return parts.join("\n")
}

test("all SRD level 1 spells have a Russian Voss card", async () => {
  const sql = await batchSql()
  assert.equal((sql.match(/where slug='/g) || []).length, 57)
  assert.equal((sql.match(/author_description=/g) || []).length, 57)
  assert.equal((sql.match(/author_comment=/g) || []).length, 57)
  assert.equal((sql.match(/name_ru=/g) || []).length, 57)
  assert.ok(!sql.includes("array['V'"), "Russian batch must not keep English V/S/M components")
})

test("level 1 cards preserve important casting triggers", async () => {
  const sql = await batchSql()
  assert.match(sql, /Бонусное действие сразу после попадания оружием ближнего боя или безоружным ударом/)
  assert.match(sql, /Реакция, когда по тебе попали атакой или тебя выбрала целью Волшебная стрела/)
  assert.match(sql, /Реакция после получения урона от видимого существа в пределах 60 футов/)
  assert.match(sql, /Взрыв происходит и при промахе/)
  assert.match(sql, /Щит полностью защищает от Волшебной стрелы/)
})
