import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const presets = fs.readFileSync("src/components/characters/ItemMechanicPresets.tsx", "utf8")
const editor = fs.readFileSync("src/components/characters/InventoryItemEditor.tsx", "utf8")
const inventory = fs.readFileSync("src/components/characters/CharacterInventory.tsx", "utf8")
const mechanics = fs.readFileSync("src/lib/characterMechanics.ts", "utf8")

test("non-equippable items cannot keep dead equipped-only effects", () => {
  assert.match(presets, /equippable\?: boolean/)
  assert.match(presets, /!equippable && mechanic\.activation === "equipped"/)
  assert.match(editor, /category !== "equipment" && mechanic\.activation === "equipped"/)
  assert.match(editor, /activation: "carried" as const/)
})

test("legacy non-equipment effects recover while equipment still requires equip", () => {
  assert.match(mechanics, /mechanic\.activation === "equipped" && item\.category === "equipment"/)
  assert.match(mechanics, /if \(requiresEquipped && !item\.equipped\) continue/)
  assert.match(editor, /эффектов пока не активны/)
  assert.match(inventory, /Неактивно: предмет нужно надеть/)
})

test("cursed items use an engine-native trait marker and visible inventory status", () => {
  assert.match(editor, /target: "trait"/)
  assert.match(editor, /key: "curse:item"/)
  assert.match(editor, /Что делает проклятие/)
  assert.match(mechanics, /itemCurseInfo/)
  assert.match(inventory, /☠ Проклято/)
  assert.match(inventory, /Проклятие/)
})

test("quick mechanics include both protective and curse-friendly AC presets", () => {
  assert.match(presets, /title: "\+1 к КД"/)
  assert.match(presets, /title: "−1 к КД"/)
  assert.match(presets, /target: "combat\.ac"/)
})
