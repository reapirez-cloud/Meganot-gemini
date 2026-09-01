import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const guide = fs.readFileSync("src/components/reference/ReferenceGuide.tsx", "utf8")
const voice = fs.readFileSync("src/data/vossVoice.ts", "utf8")
const cleanup = fs.readFileSync("supabase/migrations/20260829204500_remove_class_reference_nuances.sql", "utf8")

test("class and subclass reference no longer render or collect Voss nuances", () => {
  for (const forbidden of [
    /Нюансы Восса/,
    /reference-voss-nuances/,
    /featureNuances/,
    /payloadStringList/,
    /getDruidBaseFeatureNuances/,
    /getDruidSubclassFeatureNuances/,
    /authorNuances/,
  ]) assert.doesNotMatch(guide, forbidden)

  assert.match(guide, /Объяснение → правило → комментарий/)
  assert.equal(fs.existsSync("src/data/classes/druidNuances.ts"), false)
})

test("Voss author contract keeps only explanation rule and comment layers", () => {
  assert.doesNotMatch(voice, /Нюансы Восса|authorNuances/)
  assert.match(voice, /THREE separate layers/)
  assert.match(voice, /authorExplanation/)
  assert.match(voice, /exact rules\/mechanics text/)
  assert.match(voice, /authorComment/)
  assert.match(voice, /«Восс объясняет».+точное правило.+«Комментарий Восса»/)
})

test("database cleanup is restricted to class and subclass templates", () => {
  assert.match(cleanup, /where kind in \('class', 'subclass'\)/)
  assert.match(cleanup, /t\.kind in \('class', 'subclass'\)/)
  assert.doesNotMatch(cleanup, /spell_catalog|spell_reference|catalog_spells|spell_catalog_entries/i)
})
