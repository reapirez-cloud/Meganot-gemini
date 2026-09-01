import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const sheet = readFileSync("src/components/chat/ChatActionSheet.tsx", "utf8")

test("spell casting keeps the exact access, method and resource option chosen by the player", () => {
  assert.match(sheet, /type SpellChannel = "cantrips" \| string \| null/)
  assert.match(sheet, /type SpellCastSelection = \{[\s\S]*accessKey: string[\s\S]*methodKey: string[\s\S]*optionKey\?: string/)
  assert.match(sheet, /spellCastForSlot\(spell, slot\.level, slot\.resource\.stateKey\)/)
  assert.match(sheet, /item\.costs\.some\(\(cost\) => cost\.stateKey === stateKey && cost\.available\)/)
  assert.match(sheet, /function exactSpellCast\(selection: SpellCastSelection\)/)
  assert.match(sheet, /resourceOptions: option \? \[\{ \.\.\.option, available: true \}\] : \[\]/)
  assert.match(sheet, /accesses: \[selectedAccess\]/)
  assert.doesNotMatch(sheet, /preferSpellCast/)
})

test("spell UI remains slot-first instead of presenting one mixed spell wall", () => {
  assert.match(sheet, /Шаг 1/)
  assert.match(sheet, /Выбери ячейку/)
  assert.match(sheet, /Шаг 2/)
  assert.match(sheet, /setChannel\(resource\.stateKey\)/)
})
