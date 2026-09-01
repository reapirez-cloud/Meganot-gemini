import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const migrations = [
  "20260825163418_ru_level3_voss_part_1.sql",
  "20260825163524_ru_level3_voss_part_2.sql",
  "20260825163624_ru_level3_voss_part_3.sql",
]

async function batchSql() {
  const parts = await Promise.all(
    migrations.map((name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8")),
  )
  return parts.join("\n")
}

test("all SRD level 3 spells have a Russian Voss card", async () => {
  const sql = await batchSql()
  assert.equal((sql.match(/where slug='/g) || []).length, 42)
  assert.equal((sql.match(/author_description=/g) || []).length, 42)
  assert.equal((sql.match(/author_comment=/g) || []).length, 42)
  assert.equal((sql.match(/name_ru=/g) || []).length, 42)
  assert.ok(!sql.includes("array['V'"), "Russian batch must not keep English V/S/M components")
})

test("level 3 cards preserve important 2024 restrictions and triggers", async () => {
  const sql = (await batchSql()).toLowerCase()
  assert.match(sql, /контрзаклинание/)
  assert.match(sql, /цель делает спасбросок телосложения/)
  assert.match(sql, /сама ячейка не расходуется/)
  assert.match(sql, /если поверхность или объект переместить более чем на 10 футов/)
  assert.match(sql, /сохранённое заклинание с концентрацией действует полную длительность без необходимости поддерживать концентрацию/)
  assert.match(sql, /цель до конца своего следующего хода недееспособна и имеет скорость 0/)
  assert.match(sql, /заклинание с соматическим компонентом имеет 25% шанс провалиться/)
  assert.match(sql, /умершее не более 1 минуты назад/)
  assert.match(sql, /алмазы стоимостью 300\+ зм, расходуются/)
  assert.match(sql, /заклинания 3 уровня и ниже нельзя проводить сквозь границу/)
})
