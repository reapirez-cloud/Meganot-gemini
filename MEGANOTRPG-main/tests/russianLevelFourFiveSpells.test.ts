import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const files4 = ["20260825164747_ru_level4_voss_part_1.sql", "20260825164900_ru_level4_voss_part_2.sql"]
const files5 = ["20260825170014_ru_level5_voss_part_1.sql", "20260825170145_ru_level5_voss_part_2.sql"]

async function readBatch(files: string[]) {
  const parts = await Promise.all(files.map((name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8")))
  return parts.join("\n")
}

function checkBatch(sql: string, count: number) {
  assert.equal((sql.match(/where slug='/g) || []).length, count)
  assert.equal((sql.match(/name_ru=/g) || []).length, count)
  assert.equal((sql.match(/author_description=/g) || []).length, count)
  assert.equal((sql.match(/author_comment=/g) || []).length, count)
  assert.ok(!sql.includes("array['V'"))
}

test("level 4 and 5 batches are complete", async () => {
  checkBatch(await readBatch(files4), 34)
  checkBatch(await readBatch(files5), 38)
})

test("level 5 keeps verified casting times", async () => {
  const sql = await readBatch(files5)
  assert.match(sql, /Пробуждение', casting_time='8 часов'/)
  assert.match(sql, /Освящение', casting_time='24 часа'/)
  assert.match(sql, /Планарное связывание', casting_time='1 час'/)
  assert.match(sql, /Воскрешение мёртвого', casting_time='1 час'/)
  assert.match(sql, /Реинкарнация', casting_time='1 час'/)
  assert.match(sql, /Наблюдение', casting_time='10 минут'/)
  assert.match(sql, /Круг телепортации', casting_time='1 минута'/)
})
