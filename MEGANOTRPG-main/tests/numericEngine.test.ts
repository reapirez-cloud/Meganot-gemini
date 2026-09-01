import assert from "node:assert/strict"
import test from "node:test"

import {
  NumericEngineError,
  abilityModifier,
  applyNumericOperation,
  proficiencyBonusForLevel,
  resolveCharacter,
  type BaseCharacter,
  type CharacterContribution,
  type NumericOperation,
} from "../src/character-engine/index.ts"

const source = { id: "numeric-test", name: "Numeric Engine test" }

const base: BaseCharacter = {
  id: "numeric-character",
  name: "Numeric Test",
  level: 4,
  abilities: {
    strength: 8,
    dexterity: 8,
    constitution: 7,
    intelligence: 10,
    wisdom: 18,
    charisma: 19,
  },
  baseMaxHp: 19,
  baseSpeed: 30,
  skillProficiencies: {
    deception: 2,
  },
  savingThrowProficiencies: {
    wisdom: 1,
  },
}

test("ability modifiers and default proficiency progression are derived, not stored", () => {
  assert.equal(abilityModifier(8), -1)
  assert.equal(abilityModifier(9), -1)
  assert.equal(abilityModifier(10), 0)
  assert.equal(abilityModifier(18), 4)
  assert.equal(abilityModifier(19), 4)
  assert.equal(abilityModifier(20), 5)

  assert.equal(proficiencyBonusForLevel(1), 2)
  assert.equal(proficiencyBonusForLevel(4), 2)
  assert.equal(proficiencyBonusForLevel(5), 3)
  assert.equal(proficiencyBonusForLevel(9), 4)
  assert.equal(proficiencyBonusForLevel(13), 5)
  assert.equal(proficiencyBonusForLevel(17), 6)
  assert.equal(proficiencyBonusForLevel(20), 6)
})

test("every Numeric Engine operation has explicit semantics", () => {
  const cases: Array<[NumericOperation, number, number]> = [
    ["ADD", 2, 12],
    ["SUBTRACT", 2, 8],
    ["SET", 15, 15],
    ["MIN", 15, 15],
    ["MAX", 8, 8],
    ["MULTIPLY", 2, 20],
  ]

  for (const [operation, operand, expected] of cases) {
    assert.equal(applyNumericOperation(10, operation, operand), expected, operation)
  }
})

test("Numeric Engine rejects arithmetic that produces a non-finite result", () => {
  assert.throws(
    () => applyNumericOperation(Number.MAX_VALUE, "MULTIPLY", 2),
    NumericEngineError,
  )
})

test("numeric contributions propagate through dependent character values", () => {
  const contributions: CharacterContribution[] = [
    {
      id: "charisma-plus-two",
      kind: "numeric",
      target: "abilities.charisma",
      operation: "ADD",
      value: 2,
      source,
    },
    {
      id: "proficiency-plus-one",
      kind: "numeric",
      target: "core.proficiencyBonus",
      operation: "ADD",
      value: 1,
      source,
    },
    {
      id: "deception-plus-one",
      kind: "numeric",
      target: "skills.deception.bonus",
      operation: "ADD",
      value: 1,
      source,
    },
    {
      id: "wisdom-save-plus-two",
      kind: "numeric",
      target: "savingThrows.wisdom.bonus",
      operation: "ADD",
      value: 2,
      source,
    },
    {
      id: "perception-plus-two",
      kind: "numeric",
      target: "skills.perception.bonus",
      operation: "ADD",
      value: 2,
      source,
    },
    {
      id: "passive-perception-plus-five",
      kind: "numeric",
      target: "passives.perception",
      operation: "ADD",
      value: 5,
      source,
    },
    {
      id: "initiative-plus-five",
      kind: "numeric",
      target: "combat.initiative",
      operation: "ADD",
      value: 5,
      source,
    },
    {
      id: "speed-plus-ten",
      kind: "numeric",
      target: "combat.speed",
      operation: "ADD",
      value: 10,
      source,
    },
    {
      id: "max-hp-plus-five",
      kind: "numeric",
      target: "combat.maxHp",
      operation: "ADD",
      value: 5,
      source,
    },
  ]

  const resolved = resolveCharacter(base, { currentHp: 19, tempHp: 0 }, contributions)

  assert.equal(resolved.proficiencyBonus.value, 3)
  assert.equal(resolved.abilities.charisma.value, 21)
  assert.equal(resolved.abilities.charisma.modifier, 5)

  // CHA +5 and expertise with proficiency +3 => 11, then direct +1 => 12.
  assert.equal(resolved.skills.deception.bonus.baseValue, 11)
  assert.equal(resolved.skills.deception.bonus.value, 12)
  assert.equal(resolved.skills.deception.bonus.sources.length, 1)

  // WIS +4 and save proficiency +3 => 7, then direct +2 => 9.
  assert.equal(resolved.savingThrows.wisdom.bonus.baseValue, 7)
  assert.equal(resolved.savingThrows.wisdom.bonus.value, 9)

  // Perception +4 becomes +6; passive derives from the resolved skill (16), then gets +5.
  assert.equal(resolved.skills.perception.bonus.value, 6)
  assert.equal(resolved.passives.perception.baseValue, 16)
  assert.equal(resolved.passives.perception.value, 21)

  assert.equal(resolved.combat.initiative.baseValue, -1)
  assert.equal(resolved.combat.initiative.value, 4)
  assert.equal(resolved.combat.speed.value, 40)
  assert.equal(resolved.combat.maxHp.value, 24)

  // Generic spell math still reacts to the resolved ability and proficiency values.
  assert.equal(resolved.spellcasting.byAbility.wisdom.attackBonus, 7)
  assert.equal(resolved.spellcasting.byAbility.wisdom.saveDc, 15)
})

test("removing one numeric source recomputes downstream values instead of reversing mutations", () => {
  const charismaBoost: CharacterContribution = {
    id: "charisma-boost",
    kind: "numeric",
    target: "abilities.charisma",
    operation: "ADD",
    value: 2,
    source,
  }

  const withBoost = resolveCharacter(base, { currentHp: 19, tempHp: 0 }, [charismaBoost])
  const withoutBoost = resolveCharacter(base, { currentHp: 19, tempHp: 0 }, [])

  assert.equal(withBoost.skills.deception.bonus.value, 9)
  assert.equal(withoutBoost.skills.deception.bonus.value, 8)
  assert.equal(base.abilities.charisma, 19)
})
