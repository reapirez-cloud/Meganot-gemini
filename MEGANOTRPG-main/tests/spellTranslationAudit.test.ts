import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const auditMigrations = [
  "20260826043236_audit_ru_spell_cards_levels_0_4.sql",
  "20260826043335_normalize_ru_spell_card_style_levels_0_4.sql",
  "20260826043402_finish_ru_cantrip_style_normalization.sql",
]

async function auditSql() {
  const chunks = await Promise.all(
    auditMigrations.map((name) =>
      readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8"),
    ),
  )
  return chunks.join("\n")
}

test("spell audit fixes parser-derived casting times and concentration", async () => {
  const sql = await auditSql()

  for (const slug of [
    "mending",
    "find-familiar",
    "animate-dead",
    "magic-mouth",
    "prayer-of-healing",
    "clairvoyance",
    "magic-circle",
    "glyph-of-warding",
  ]) {
    assert.ok(sql.includes(`'${slug}'`), `audit must cover ${slug}`)
  }

  assert.match(sql, /casting_time = '1 час', concentration = false where slug = 'glyph-of-warding'/)
  assert.match(sql, /Действие \(Зарастание\) или 8 часов \(Обогащение\)/)
})

test("spell audit preserves operational details needed at the table", async () => {
  const sql = await auditSql()

  assert.match(sql, /Спрятаться или Использование/)
  assert.match(sql, /1к4 \(1 — север, 2 — восток, 3 — юг, 4 — запад\)/)
  assert.match(sql, /пароль: если произнести его в пределах 5 футов/)
  assert.match(sql, /яркий свет в радиусе 20 футов и тусклый ещё на 20 футов/)
  assert.match(sql, /видеть его вблизи — в пределах 30 футов/)
  assert.match(sql, /в области иллюзии или в пределах 5 футов от неё/)
  assert.match(sql, /портал 3 × 5 футов/)
  assert.match(sql, /Водоворот требует воду минимум 50 × 50 футов и 25 футов глубиной/)
  assert.match(sql, /модификатор характеристики заклинаний вместо Силы/)
  assert.match(sql, /оставаться в пределах 30 футов в течение всех 10 минут сотворения/)
})

test("early Russian cards use the same direct second-person voice", async () => {
  const sql = await auditSql()

  assert.match(sql, /Касаешься добровольного существа/)
  assert.match(sql, /Чинишь один разрыв или поломку/)
  assert.match(sql, /который слышишь только ты/)
  assert.match(sql, /Метаешь чародейскую энергию/)
  assert.match(sql, /Как часть заклинания совершаешь одну атаку оружием/)
})
