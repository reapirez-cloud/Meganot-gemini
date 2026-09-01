import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const migrations = [
  "20260826050237_ru_level6_voss_part_1.sql",
  "20260826050329_ru_level6_voss_part_2.sql",
  "20260826050413_ru_level6_voss_part_3.sql",
]

async function batchSql() {
  const parts = await Promise.all(
    migrations.map((name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8")),
  )
  return parts.join("\n")
}

test("all SRD level 6 spells have a Russian Voss card", async () => {
  const sql = await batchSql()
  assert.equal((sql.match(/where slug='/g) || []).length, 31)
  assert.equal((sql.match(/author_description=/g) || []).length, 31)
  assert.equal((sql.match(/author_comment=/g) || []).length, 31)
  assert.equal((sql.match(/name_ru=/g) || []).length, 31)
  assert.ok(!sql.includes("array['V'"), "Russian batch must not keep English V/S/M components")
})

test("level 6 cards fix parser-derived casting times and ritual flags", async () => {
  const sql = await batchSql()
  assert.match(sql, /name_ru='Предосторожность', casting_time='10 минут'/)
  assert.match(sql, /name_ru='Создание нежити', casting_time='1 минута'/)
  assert.match(sql, /name_ru='Поиск пути', casting_time='1 минута'/)
  assert.match(sql, /name_ru='Запрет', casting_time='10 минут или ритуал'.*ritual=true/)
  assert.match(sql, /name_ru='Стражи и защиты', casting_time='1 час'/)
  assert.match(sql, /name_ru='Пир героев', casting_time='10 минут'/)
  assert.match(sql, /name_ru='Мгновенный призыв', casting_time='Действие'.*ritual=false/)
  assert.match(sql, /name_ru='Волшебный сосуд', casting_time='1 минута'/)
  assert.match(sql, /name_ru='Планарный союзник', casting_time='10 минут'/)
  assert.match(sql, /name_ru='Хождение по ветру', casting_time='1 минута'/)
})

test("level 6 cards preserve critical operational rules", async () => {
  const sql = await batchSql()
  assert.match(sql, /9 уровень: до 6 гулей, 3 гастов\/умертвий или 2 мумий/)
  assert.match(sql, /цель до конца своего следующего хода танцует на месте/)
  assert.match(sql, /Каждая 10-футовая секция: КД 12, 30 HP/)
  assert.match(sql, /каждый 1 фут движения стоит 4 фута/)
  assert.match(sql, /Обратное превращение занимает 1 минуту, во время которой цель Оглушена/)
})
