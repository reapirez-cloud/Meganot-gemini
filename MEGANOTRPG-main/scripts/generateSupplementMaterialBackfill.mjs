import { readFile, writeFile } from "node:fs/promises"

// Generates the durable DB backfill from the canonical supplement metadata package.
const INPUT = "supabase/data/official_supplement_spells.json"
const OUTPUT = "supabase/migrations/20260826124000_backfill_supplement_spell_materials.sql"

function sql(value) {
  if (value == null) return "null"
  return `'${String(value).replaceAll("'", "''")}'`
}

const payload = JSON.parse(await readFile(INPUT, "utf8"))
const rows = (payload.spells || []).filter((spell) => spell.material)

if (!rows.length) throw new Error("No supplement material metadata found")
if (rows.some((spell) => spell.components?.includes("M") && !spell.material)) {
  throw new Error("A material component was lost during generation")
}

const statements = rows.map((spell) => {
  const cost = spell.material_cost_gp == null ? "null" : Number(spell.material_cost_gp)
  const consumed = spell.material_consumed ? "true" : "false"
  return `update public.spell_catalog\nset material = ${sql(spell.material)},\n    material_cost_gp = ${cost},\n    material_consumed = ${consumed}\nwhere slug = ${sql(spell.slug)} and source_kind = 'official';`
})

const output = `begin;\n\n-- Generated from structured material-component metadata.\n-- Full copyrighted spell rules prose is not stored here.\n\n${statements.join("\n\n")}\n\ncommit;\n`
await writeFile(OUTPUT, output, "utf8")
console.log(`Generated material backfill for ${rows.length} supplement spells.`)
