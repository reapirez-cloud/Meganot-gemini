import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { classReference } from "../src/data/classReference.ts"

const historicalClassSql = fs.readFileSync(
  "supabase/migrations/20260827180000_official_class_catalog.sql",
  "utf8",
)
const historicalSubclassSql = fs.readFileSync(
  "supabase/migrations/20260827180100_official_subclass_catalog.sql",
  "utf8",
)
const resetSql = fs.readFileSync(
  "supabase/migrations/20260829235500_remove_legacy_builtin_classes.sql",
  "utf8",
)
const bootstrapGuardSql = fs.readFileSync(
  "supabase/migrations/20260830000500_retire_legacy_class_bootstrap_triggers.sql",
  "utf8",
)
const wizardBootstrapSql = fs.readFileSync(
  "supabase/migrations/20260831100100_wizard_catalog_bootstrap.sql",
  "utf8",
)

function embeddedCatalog(sql: string) {
  const match = sql.match(/v_catalog jsonb := \$catalog\$(.*?)\$catalog\$::jsonb/s)
  assert.ok(match?.[1], "embedded historical catalog is missing")
  return JSON.parse(match[1]) as Array<Record<string, any>>
}

test("historical full-catalog migrations stay immutable migration history", () => {
  const historicalClasses = embeddedCatalog(historicalClassSql)
  const historicalSubclasses = embeddedCatalog(historicalSubclassSql)

  const keys = new Set(historicalClasses.map((entry) => entry.key))
  keys.add("druid")
  assert.equal(keys.size, 13)
  assert.equal(historicalSubclasses.length, 125)
  assert.match(historicalClassSql, /private\.install_official_class_catalog/)
  assert.match(historicalSubclassSql, /private\.official_subclass_spell_mechanic/)
})

test("player-facing active reference contains only rebuilt class families", () => {
  assert.deepEqual(
    classReference.map((entry) => entry.id).sort(),
    ["cleric", "druid", "fighter", "wizard"],
  )
  assert.equal(classReference.reduce((sum, entry) => sum + entry.subclasses.length, 0), 32)
  assert.equal(classReference.find((entry) => entry.id === "wizard")?.subclasses.length, 0)
})

test("legacy reset remains immutable history and does not touch custom easter-egg classes", () => {
  assert.match(resetSql, /is_builtin IS TRUE/)
  assert.match(resetSql, /'class:fighter', 'class:druid', 'class:cleric'/)
  assert.doesNotMatch(resetSql, /'class:fighter', 'class:druid', 'class:cleric', 'class:wizard'/)
  assert.match(resetSql, /custom\/non-builtin templates are intentionally outside this cleanup/i)
  assert.match(resetSql, /Жопка/)
})

test("new campaigns preserve rebuilt Wizard without resurrecting other removed classes or rejected Voss layers", () => {
  assert.match(bootstrapGuardSql, /drop trigger if exists campaigns_install_official_class_catalog/)
  assert.match(bootstrapGuardSql, /drop trigger if exists campaigns_install_official_subclass_catalog/)
  assert.match(bootstrapGuardSql, /drop trigger if exists zzzzzzzzzzzzz_campaigns_voss_subclass_nuances/)
  assert.match(bootstrapGuardSql, /drop trigger if exists zzzzzzzzzzzzzz_campaigns_voss_spell_style_ability_explanations/)
  assert.match(bootstrapGuardSql, /create trigger zzzzzzzzzzzzzzzzzzzz_campaigns_prune_removed_builtin_classes/)
  assert.match(bootstrapGuardSql, /Жопка/)

  assert.match(wizardBootstrapSql, /private\.install_wizard_2024_text_pack\(new\.id\)/)
  assert.match(wizardBootstrapSql, /'class:fighter', 'class:druid', 'class:cleric', 'class:wizard'/)
  assert.match(wizardBootstrapSql, /create trigger zzzz_campaigns_install_wizard_2024_text_pack/)
  assert.match(wizardBootstrapSql, /private\.prune_removed_builtin_class_catalog\(v_campaign\.id\)/)
})
