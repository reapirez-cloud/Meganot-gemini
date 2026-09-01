import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const migrations = [
  "20260825164747_ru_level4_voss_part_1.sql",
  "20260825164900_ru_level4_voss_part_2.sql",
]

async function batchSql() {
  const parts = await Promise.all(
    migrations.map((name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8")),
  )
  return parts.join("\n")
}

test("all SRD level 4 spells have a Russian Voss card", async () => {
  const sql = await batchSql()
  assert.equal((sql.match(/where slug='/g) || []).length, 34)
  assert.equal((sql.match(/author_description=/g) || []).length, 34)
  assert.equal((sql.match(/author_comment=/g) || []).length, 34)
  assert.equal((sql.match(/name_ru=/g) || []).length, 34)
  assert.ok(!sql.includes("array['V'"), "Russian batch must not keep English V/S/M components")
})

test("level 4 cards preserve 2024 rules and errata", async () => {
  const sql = await batchSql()
  assert.match(sql, /Призыв малых элементалей[\s\S]*\+1к8 дополнительного урона за каждый уровень ячейки выше 4/)
  assert.match(sql, /Призыв лесных существ[\s\S]*\+1к8 урона за каждый уровень ячейки выше 4/)
  assert.match(sql, /10к4 кислотой сразу \+ 5к4 в конце следующего хода/)
  assert.match(sql, /Если цель — Аберрация, Небожитель, Элементаль, Фея или Исчадие[\s\S]*полную минуту/)
  assert.match(sql, /В отличие от обычной Невидимости, эффект не заканчивается из-за атаки, урона или сотворения заклинания/)
  assert.match(sql, /Заклинание заканчивается, когда временные HP формы заканчиваются/)
  assert.match(sql, /Выбираешь одну горячую сторону/)
})
