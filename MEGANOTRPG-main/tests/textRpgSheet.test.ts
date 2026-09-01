import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const sheetEditorPath = new URL(
  "../src/components/characters/CharacterSheetEditor.tsx",
  import.meta.url,
)
const inventoryEditorPath = new URL(
  "../src/components/characters/InventoryItemEditor.tsx",
  import.meta.url,
)
const inventoryViewPath = new URL(
  "../src/components/characters/CharacterInventory.tsx",
  import.meta.url,
)
const textSheetStylesPath = new URL(
  "../src/styles/textRpgSheet.css",
  import.meta.url,
)

test("text sheet editor omits tabletop-only character fields", async () => {
  const source = await readFile(sheetEditorPath, "utf8")

  assert.doesNotMatch(source, /draft\.background/)
  assert.doesNotMatch(source, /draft\.alignment/)
  assert.doesNotMatch(source, /draft\.experience/)
  assert.doesNotMatch(source, /draft\.speed/)
  assert.doesNotMatch(source, /draft\.hit_dice/)
  assert.doesNotMatch(source, /draft\.death_save_successes/)
  assert.doesNotMatch(source, /draft\.death_save_failures/)
  assert.match(source, /История персонажа/)
})

test("inventory uses currency summary and drill-down folders", async () => {
  const editor = await readFile(inventoryEditorPath, "utf8")
  const view = await readFile(inventoryViewPath, "utf8")

  assert.match(view, /Золото/)
  assert.match(view, /Серебро/)
  assert.match(view, /Медь/)
  assert.match(view, /inventory-rpg__folder/)
  assert.match(view, /equipmentSlots\.map/)
  assert.match(view, /openSlot/)
  assert.match(view, /openCategory/)
  assert.doesNotMatch(view, /<small>Позиций<\/small>/)
  assert.doesNotMatch(view, /counts\.units/)
  assert.doesNotMatch(view, /counts\.equipped/)
  assert.match(editor, /weight: item\?\.weight \?\? null/)
})

test("legacy tabletop values are hidden from the read-only sheet", async () => {
  const styles = await readFile(textSheetStylesPath, "utf8")

  assert.match(styles, /sheet-identity > div:nth-child\(n \+ 2\)/)
  assert.match(styles, /combat-stat-grid > \.combat-stat:nth-child\(3\)/)
  assert.match(styles, /sheet-line:nth-of-type\(3\)/)
  assert.match(styles, /sheet-line:nth-of-type\(4\)/)
  assert.match(styles, /История персонажа/)
})
