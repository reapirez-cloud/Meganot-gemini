import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  defaultSheetModulePresentation,
  readSheetModulePresentation,
} from "../src/components/characters/sheetModulePresentation.ts"

const app = fs.readFileSync("src/App.tsx", "utf8")
const css = fs.readFileSync("src/character-sheet-modules.css", "utf8")

test("character sheet uses compact non-scrolling core modules", () => {
  assert.match(app, /character-sheet-modules\.css/)
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/)
  assert.match(css, /\.sheet-v3__combat > :nth-child\(4\) \{ order: 3; \}/)
  assert.match(css, /\.sheet-v3__ability-tabs,[\s\S]*\.sheet-v3__swipe-hint[\s\S]*display: none/)
  assert.match(css, /\.sheet-v3__ability-rail[\s\S]*display: grid/)
  assert.match(css, /\.sheet-v3__resource-list[\s\S]*grid-template-columns: repeat\(2/)
  assert.match(css, /\.sheet-v3__action-list[\s\S]*grid-template-columns: repeat\(2/)
})

test("future CE sources can describe resource presentation without changing mechanics", () => {
  assert.deepEqual(defaultSheetModulePresentation(), { tone: "neutral", display: "counter" })
  assert.deepEqual(
    readSheetModulePresentation({
      max: 4,
      presentation: { tone: "red", icon: "🔥", display: "pips", priority: 20 },
    }),
    { tone: "red", icon: "🔥", display: "pips", priority: 20 },
  )
  assert.deepEqual(
    readSheetModulePresentation({ presentation: { tone: "unknown", display: "unknown" } }),
    { tone: "neutral", display: "counter" },
  )
})
