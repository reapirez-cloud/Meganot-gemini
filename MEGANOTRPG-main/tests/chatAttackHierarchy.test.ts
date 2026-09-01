import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const sheet = readFileSync("src/components/chat/ChatActionSheet.tsx", "utf8")
const resolver = readFileSync("src/engine-runtime/characterRuntimeResolver.ts", "utf8")

test("Attack is a quiet three-step directory instead of a mixed roll bucket", () => {
  assert.match(sheet, /type AttackChannel = "weapon" \| "spell" \| "special" \| null/)
  assert.match(sheet, />Оружие</)
  assert.match(sheet, />Заклинание</)
  assert.match(sheet, />Особое</)
  assert.match(sheet, /setAttackChannel\("weapon"\)/)
  assert.match(sheet, /setAttackChannel\("spell"\)/)
  assert.match(sheet, /setAttackChannel\("special"\)/)
  assert.match(sheet, /SpellSlotFlow spells=\{model\.attackSpells\}/)
})

test("special attacks are limited to inventory sources and meaningful attack mechanics", () => {
  assert.match(sheet, /group\.sourceType === "inventory_item" \|\| group\.id\.startsWith\("item:"\)/)
  assert.match(sheet, /actions: group\.actions\.filter\(actionIsAttack\)/)
  assert.match(sheet, /spells: group\.spells\.filter\(\(spell\) => attackSpellKeys\.has\(spell\.key\)\)/)
})

test("only Roll Engine damage effects route a spell into Attack", () => {
  assert.match(resolver, /if \(record\.kind === "damage"\) return true/)
  assert.match(resolver, /function catalogDealsDamage\(row: Pick<SpellCatalogRoutingRow, "roll_recipe"> \| undefined\)/)
  assert.doesNotMatch(resolver, /row\.damage\.trim\(\)/)
})
