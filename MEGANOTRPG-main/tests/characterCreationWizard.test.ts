import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  characterWizardPatch,
  defaultCharacterWizardSheet,
  sheetValueMatchesAuto,
  wizardInitiative,
  wizardPassivePerception,
  wizardProficiency,
} from "../src/lib/characterWizard.ts"

const wizard = fs.readFileSync("src/components/characters/CharacterCreationWizard.tsx", "utf8")
const workspace = fs.readFileSync("src/pages/GmWorkspace.tsx", "utf8")

test("PC and NPC editor is a seven-step progressive wizard", () => {
  assert.match(wizard, /шаг \{step\} из 7/)
  assert.match(wizard, /Кто это\?/)
  assert.match(wizard, /Характеристики/)
  assert.match(wizard, /Боевая база/)
  assert.match(wizard, /Владения/)
  assert.match(wizard, /Магия/)
  assert.match(wizard, /Доступ/)
  assert.match(wizard, /Проверка/)
  assert.match(workspace, /CharacterCreationWizard/)
})

test("new character defaults stay explicit and minimal", () => {
  const sheet = defaultCharacterWizardSheet(1)
  assert.deepEqual(
    [sheet.strength, sheet.dexterity, sheet.constitution, sheet.intelligence, sheet.wisdom, sheet.charisma],
    [10, 10, 10, 10, 10, 10],
  )
  assert.equal(sheet.max_hp, 1)
  assert.equal(sheet.current_hp, 1)
  assert.equal(sheet.armor_class, 10)
  assert.equal(sheet.speed, 30)
  assert.deepEqual(sheet.saving_throw_proficiencies, [])
  assert.deepEqual(sheet.skill_proficiencies, {})
  assert.equal(sheet.spellcasting_enabled, false)
})

test("derived wizard values agree with Character Engine conventions", () => {
  const sheet = defaultCharacterWizardSheet(5)
  sheet.dexterity = 16
  sheet.wisdom = 14
  sheet.skill_proficiencies = { perception: 1 }
  sheet.proficiency_bonus = wizardProficiency(5)

  assert.equal(wizardInitiative(sheet), 3)
  assert.equal(sheet.proficiency_bonus, 3)
  assert.equal(wizardPassivePerception(sheet), 15)

  sheet.initiative_bonus = 3
  sheet.passive_perception = 15
  assert.deepEqual(sheetValueMatchesAuto(sheet, 5), { initiative: true, proficiency: true, passivePerception: true })
})

test("wizard only persists sheet fields the GM actually changed", () => {
  const sheet = defaultCharacterWizardSheet(1)
  sheet.strength = 16
  sheet.languages = "Общий"
  const patch = characterWizardPatch(sheet, new Set(["strength", "languages"]))
  assert.deepEqual(patch, { strength: 16, languages: "Общий" })
  assert.equal("dexterity" in patch, false)
  assert.equal("spellcasting_enabled" in patch, false)
})

test("magic setup keeps derived spell math automatic without exposing engine internals", () => {
  assert.match(wizard, /СЛ и бонус атаки не вводятся вручную/)
  assert.match(wizard, /вычисляются из характеристики и бонуса мастерства/)
  assert.doesNotMatch(wizard, /Character Engine вычислит их/)
  assert.match(wizard, /Сами заклинания добавляются из каталога/)
})
