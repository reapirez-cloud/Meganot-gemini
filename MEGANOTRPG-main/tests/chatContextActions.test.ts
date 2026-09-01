import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const chatRoom = fs.readFileSync("src/pages/ChatRoom.tsx", "utf8")
const contextSheet = fs.readFileSync("src/components/chat/ChatContextSheet.tsx", "utf8")
const positionSheet = fs.readFileSync("src/components/world/WorldPositionSheet.tsx", "utf8")
const spellDetail = fs.readFileSync("src/components/chat/ChatSpellDetailSheet.tsx", "utf8")
const contextCss = fs.readFileSync("src/components/chat/ChatContextSheet.css", "utf8")

test("spell events open a full in-chat catalog sheet", () => {
  assert.match(chatRoom, /ChatSpellDetailSheet/)
  assert.match(chatRoom, /onOpenSpell=\{setSelectedSpellEvent\}/)
  assert.match(chatRoom, /spellKey=\{selectedSpellEvent\.spellKey\}/)
  assert.match(spellDetail, /from\("spell_catalog"\)/)
  assert.match(spellDetail, /eq\("slug", rawKey\)/)
  assert.match(spellDetail, /eq\("name_ru", label\.trim\(\)\)/)
  assert.match(spellDetail, /Полное правило/)
  assert.doesNotMatch(spellDetail, /window\.location|location\.hash/)
})

test("GM context keeps location time and recovery as separate actions", () => {
  assert.match(contextSheet, /setEditingPosition\("location"\)/)
  assert.match(contextSheet, /setEditingPosition\("time"\)/)
  assert.match(contextSheet, /recover\("short_rest"\)/)
  assert.match(contextSheet, /recover\("long_rest"\)/)
  assert.match(contextSheet, /recover\("dawn"\)/)
  assert.match(contextSheet, /oracle\.characters\.recover/)
  assert.match(contextSheet, /intent=\{editingPosition === "time" \? "edit-time"/)
  assert.match(positionSheet, /"edit-location" \| "edit-time"/)
  assert.match(positionSheet, /const showLocation = !editingTimeOnly/)
  assert.match(positionSheet, /const showTime = !movingCharacter && !editingLocationOnly/)
})

test("legacy character-sheet recovery UI is not shown alongside chat controls", () => {
  assert.match(contextCss, /character-admin-section:has\(\.resource-recovery-grid\)\{display:none\}/)
})
