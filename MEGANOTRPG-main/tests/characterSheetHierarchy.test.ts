import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const sheetBase = fs.readFileSync("src/components/characters/ResolvedCharacterSheetBase.tsx", "utf8")
const sheetBridge = fs.readFileSync("src/components/characters/ResolvedCharacterSheet.tsx", "utf8")
const classPanel = fs.readFileSync("src/components/characters/CharacterClassPanel.tsx", "utf8")
const profile = fs.readFileSync("src/pages/CharacterProfileV2.tsx", "utf8")
const styles = fs.readFileSync("src/character-profile-v4.css", "utf8")
const suppressions = fs.readFileSync("src/hooks/useCharacterSourceSuppressions.ts", "utf8")
const templateRegistry = fs.readFileSync("src/hooks/useCharacterTemplateRegistry.ts", "utf8")

test("character sheet opens with essentials then abilities then a section directory", () => {
  const combat = sheetBase.indexOf('className="sheet-v3__combat sheet-v4__combat"')
  const abilities = sheetBase.indexOf('className="sheet-v3__section sheet-v3__abilities sheet-v4__abilities"')
  const directory = sheetBase.indexOf('className="sheet-v4__directory"')
  assert.ok(combat >= 0)
  assert.ok(abilities > combat)
  assert.ok(directory > abilities)
  assert.match(sheetBase, /Разделы листа/)
  assert.match(sheetBase, /Способности класса/)
  assert.match(sheetBase, /Способности подкласса/)
  assert.match(sheetBase, /Фиты и особенности/)
  assert.match(sheetBase, /Защиты и владения/)
})

test("secondary sheet content is focused instead of one permanent stack", () => {
  assert.match(sheetBase, /type SheetSection = "overview" \| "resources" \| "actions" \| "features" \| "defenses" \| "identity" \| "story"/)
  assert.match(sheetBase, /section === "resources"/)
  assert.match(sheetBase, /section === "actions"/)
  assert.match(sheetBase, /section === "features"/)
  assert.match(sheetBase, /section === "defenses"/)
  assert.match(sheetBase, /section === "story"/)
  assert.match(sheetBase, /FocusHeader/)
})

test("class and subclass directory entries open runtime mechanics instead of the reference database", () => {
  assert.match(sheetBridge, /Способности подкласса/)
  assert.match(sheetBridge, /meganotrpg\.character-class-focus/)
  assert.match(sheetBridge, /\.profile-v3__class/)
  assert.match(classPanel, /Все/)
  assert.match(classPanel, /Подкласс/)
  assert.match(profile, /<CharacterClassPanel/)
})

test("class tab subscribers cannot collide with the character runtime suppression owner", () => {
  assert.match(suppressions, /character-suppressions-\$\{characterId\}-\$\{subscriberIdRef\.current\}/)
  assert.doesNotMatch(suppressions, /clearCharacterSourceSuppressions/)
  assert.match(templateRegistry, /clearCharacterSourceSuppressions\(characterId\)/)
})

test("profile hero no longer visually duplicates the class beside the portrait", () => {
  assert.match(profile, /profile-v3__class/)
  assert.match(styles, /\.character-profile-v2 \.profile-v3__class \{\s*display: none;/)
  assert.match(styles, /\.profile-v3__hero/)
})

test("mobile ability panels stay adaptive instead of depending on one magic pixel height", () => {
  assert.match(styles, /\.sheet-v4__abilities \.sheet-v3__ability-score/)
  assert.match(styles, /\.sheet-v4__abilities \.sheet-v3__skill-column/)
  assert.match(styles, /min-height:\s*0/)
  assert.match(styles, /height:\s*auto/)
  assert.match(styles, /align-items:\s*start/)
  assert.doesNotMatch(styles, /min-height:\s*144px/)
})
