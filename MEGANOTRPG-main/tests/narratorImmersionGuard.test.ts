import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const reference = readFileSync(new URL("../src/data/classes/druidReference.ts", import.meta.url), "utf8")
const migration = readFileSync(new URL("../supabase/migrations/20260828015500_narrator_immersion_guard.sql", import.meta.url), "utf8")

const forbidden = /(character engine|редакци|совместимост|compatib|мы использу|player.?s handbook|\bSRD\b|\bD&D\b|\b2014\b|\b2024\b)/i

test("Voss copy in the static Druid reference stays in-world", () => {
  const narratorLines = reference
    .split("\n")
    .filter((line) => /\b(?:voss|authorComment|authorDescription)\s*:/.test(line))

  assert.ok(narratorLines.length > 0)
  for (const line of narratorLines) assert.doesNotMatch(line, forbidden)
})

test("Moon narrator normalization removes implementation meta and installs a guard", () => {
  assert.match(migration, /normalize_builtin_narrator_copy/)
  assert.match(migration, /assert_builtin_narrator_immersion/)
  assert.match(migration, /Лунного друида легко узнать в бою/)
  assert.doesNotMatch(
    migration.match(/author_comment = '([^']|'')*'/)?.[0] || "",
    forbidden,
  )
})
