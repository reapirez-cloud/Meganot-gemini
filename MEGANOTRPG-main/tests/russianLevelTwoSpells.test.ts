import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const migrations = [
  "20260825161748_ru_level2_voss_part_1.sql",
  "20260825161907_ru_level2_voss_part_2.sql",
  "20260825162014_ru_level2_voss_part_3.sql",
]

async function batchSql() {
  const parts = await Promise.all(
    migrations.map((name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8")),
  )
  return parts.join("\n")
}

test("all SRD level 2 spells have a Russian Voss card", async () => {
  const sql = await batchSql()
  assert.equal((sql.match(/where slug='/g) || []).length, 57)
  assert.equal((sql.match(/author_description=/g) || []).length, 57)
  assert.equal((sql.match(/author_comment=/g) || []).length, 57)
  assert.equal((sql.match(/name_ru=/g) || []).length, 57)
  assert.ok(!sql.includes("array['V'"), "Russian batch must not keep English V/S/M components")
})

test("level 2 cards preserve important restrictions and triggers", async () => {
  const sql = await batchSql()
  assert.match(sql, /Работает только на гуманоидов/)
  assert.match(sql, /Заклинания с вербальным компонентом внутри области сотворить нельзя/)
  assert.match(sql, /золотая пыль стоимостью 25\+ зм, расходуется/)
  assert.match(sql, /Цель знает об эффекте и может молчать, уклоняться от ответа/)
  assert.match(sql, /каждые 5 футов движения внутри наносят 2к4 колющего урона/i)
  assert.match(sql, /каждый раз, когда она получает урон, ты получаешь столько же/i)
})
