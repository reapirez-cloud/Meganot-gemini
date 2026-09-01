import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const dataUrl = new URL("../supabase/data/official_supplement_spells.json", import.meta.url)
const generatorUrl = new URL("../scripts/generateOfficialSupplementSpellsJson.mjs", import.meta.url)

type SpellRow = {
  slug: string
  name_en: string
  name_ru: string | null
  spell_level: number
  source: string
  source_kind: string
  rules_text: string | null
  classes: string[]
}

type Package = {
  count: number
  spells: SpellRow[]
}

async function loadPackage() {
  return JSON.parse(await readFile(dataUrl, "utf8")) as Package
}

test("official supplement package is complete and slug-unique", async () => {
  const data = await loadPackage()
  assert.equal(data.count, 183)
  assert.equal(data.spells.length, 183)
  assert.equal(new Set(data.spells.map((spell) => spell.slug)).size, 183)

  for (const spell of data.spells) {
    assert.equal(spell.source_kind, "official")
    assert.equal(spell.rules_text, null)
  }
})

test("Primal Savagery is a druid cantrip from Xanathar", async () => {
  const data = await loadPackage()
  const spell = data.spells.find((item) => item.slug === "primal-savagery")

  assert.ok(spell)
  assert.equal(spell.name_en, "Primal Savagery")
  assert.equal(spell.name_ru, "Первобытная ярость")
  assert.equal(spell.spell_level, 0)
  assert.equal(spell.source, "Xanathar's Guide to Everything")
  assert.ok(spell.classes.includes("druid"))
})

test("supplement package contains sentinel spells from multiple official books", async () => {
  const data = await loadPackage()
  const slugs = new Set(data.spells.map((spell) => spell.slug))

  for (const slug of [
    "silvery-barbs",
    "gift-of-alacrity",
    "sapping-sting",
    "rime-s-binding-ice",
    "frost-fingers",
    "jim-s-magic-missile",
  ]) {
    assert.ok(slugs.has(slug), `Missing supplement spell ${slug}`)
  }
})

test("supplement generator never imports proprietary spell rules prose", async () => {
  const source = await readFile(generatorUrl, "utf8")
  assert.doesNotMatch(source, /spell\.entries\b/)
  assert.match(source, /rules_text:\s*null/)
})
