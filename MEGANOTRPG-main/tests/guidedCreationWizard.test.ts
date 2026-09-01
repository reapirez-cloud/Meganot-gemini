import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const inventory = fs.readFileSync("src/components/characters/InventoryItemEditor.tsx", "utf8")
const feature = fs.readFileSync("src/components/characters/FeatureEditor.tsx", "utf8")
const styles = fs.readFileSync("src/creation-wizard.css", "utf8")
const app = fs.readFileSync("src/App.tsx", "utf8")

test("inventory creation is a four-step guided wizard", () => {
  assert.match(inventory, /шаг \{step\} из 4/)
  assert.match(inventory, /Что создаём\?/)
  assert.match(inventory, /База предмета/)
  assert.match(inventory, /Что предмет делает\?/)
  assert.match(inventory, /Проверка/)
})

test("inventory presets keep optional mechanics explicit", () => {
  assert.match(inventory, /Обычная вещь/)
  assert.match(inventory, /Оружие/)
  assert.match(inventory, /Артефакт/)
  assert.match(inventory, /Обычных эффектов нет/)
  assert.match(inventory, /Атака оружием/)
  assert.match(inventory, /sides: 8/)
})

test("features use the same progressive creation language", () => {
  assert.match(feature, /шаг \{step\} из 3/)
  assert.match(feature, /Тип нужен только для понятной группировки/)
  assert.match(feature, /Оставь пустым — и особенность будет только описанием/)
  assert.match(feature, /Никаких скрытых эффектов/)
})

test("character defaults are explained in the existing character wizard", () => {
  assert.match(styles, /все 6 характеристик = 10/)
  assert.match(styles, /спасброски и навыки без владения/)
})

test("wizard stylesheet is loaded", () => {
  assert.match(app, /creation-wizard\.css/)
})
