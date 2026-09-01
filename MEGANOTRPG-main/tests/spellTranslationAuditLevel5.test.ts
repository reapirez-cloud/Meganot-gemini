import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const files = [
  "20260826044103_audit_ru_spell_cards_level_5.sql",
  "20260826044147_finish_ru_spell_audit_level_5.sql",
]

async function auditSql() {
  const parts = await Promise.all(
    files.map((name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8")),
  )
  return parts.join("\n")
}

test("level 5 audit fixes reincarnate and detailed operational rules", async () => {
  const sql = await auditSql()
  assert.match(sql, /1 — Аасимар; 2 — Драконорождённый/)
  assert.match(sql, /5 футов \+ 5 × модификатор/)
  assert.match(sql, /Полуукрытие от атак и эффектов/)
  assert.match(sql, /существо полностью выполнило приказ/)
  assert.match(sql, /светящийся шар размером примерно с кулак/)
  assert.match(sql, /магическим светом заклинаний ниже 5 уровня/)
  assert.match(sql, /При снижении панели до 0 HP она разрушается/)
  assert.match(sql, /пролёт длиной больше 20 футов/)
})

test("level 5 audit keeps direct Russian address", async () => {
  const sql = await auditSql()
  assert.match(sql, /Пробуждённая цель Очарована тобой 30 дней/)
  assert.match(sql, /Пока ты и цель находитесь на одном плане/)
  assert.match(sql, /если ты сражаешься с целью/)
  assert.match(sql, /ты находишься с ним на одном плане/)
})
