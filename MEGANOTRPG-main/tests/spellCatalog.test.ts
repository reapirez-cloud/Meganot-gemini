import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  isSpellAvailableToCharacter,
  maxAvailableSpellLevel,
  normalizeSpellClass,
} from "../src/lib/spellCatalog.ts"

describe("spell catalog class normalization", () => {
  it("recognizes Russian and English base classes", () => {
    assert.equal(normalizeSpellClass("Жрец"), "cleric")
    assert.equal(normalizeSpellClass(" cleric "), "cleric")
    assert.equal(normalizeSpellClass("Варлок"), "warlock")
    assert.equal(normalizeSpellClass("Волшебник"), "wizard")
  })

  it("does not guess unknown or custom classes", () => {
    assert.equal(normalizeSpellClass("Мрут"), null)
    assert.equal(normalizeSpellClass("Персонаж"), null)
  })
})

describe("spell catalog availability", () => {
  it("uses the highest slot level with a positive maximum", () => {
    assert.equal(maxAvailableSpellLevel({
      "1": { max: 4, used: 2 },
      "2": { max: 3, used: 3 },
      "3": { max: 2, used: 2 },
      "4": { max: 0, used: 0 },
    }), 3)
  })

  it("shows cantrips plus spells up to the character slot ceiling", () => {
    const clericCantrip = { spell_level: 0, classes: ["cleric" as const] }
    const clericThird = { spell_level: 3, classes: ["cleric" as const] }
    const clericFourth = { spell_level: 4, classes: ["cleric" as const] }
    const wizardThird = { spell_level: 3, classes: ["wizard" as const] }

    assert.equal(isSpellAvailableToCharacter(clericCantrip, "cleric", 3, true), true)
    assert.equal(isSpellAvailableToCharacter(clericThird, "cleric", 3, true), true)
    assert.equal(isSpellAvailableToCharacter(clericFourth, "cleric", 3, true), false)
    assert.equal(isSpellAvailableToCharacter(wizardThird, "cleric", 3, true), false)
  })

  it("requires spellcasting to be enabled for the smart available filter", () => {
    const spell = { spell_level: 1, classes: ["cleric" as const] }
    assert.equal(isSpellAvailableToCharacter(spell, "cleric", 3, false), false)
  })
})
