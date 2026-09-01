import assert from "node:assert/strict"
import test from "node:test"

import {
  CharacterConflictError,
  resolveCharacter,
  resolveNumericConflicts,
  type BaseCharacter,
  type NumericContribution,
} from "../src/character-engine/index.ts"

const source = { id: "conflict-test", name: "Conflict test" }

function contribution(
  id: string,
  operation: NumericContribution["operation"],
  value: number,
  priority = 0,
): NumericContribution {
  return {
    id,
    kind: "numeric",
    target: "abilities.strength",
    operation,
    value,
    priority,
    source,
  }
}

test("equal-priority numeric conflicts are independent of array order and contribution IDs", () => {
  const first = [
    contribution("z-set", "SET", 10),
    contribution("a-multiply", "MULTIPLY", 2),
    contribution("q-add", "ADD", 5),
    contribution("b-subtract", "SUBTRACT", 1),
    contribution("m-min", "MIN", 18),
    contribution("c-max", "MAX", 25),
  ]

  const second = [
    contribution("01-max", "MAX", 25),
    contribution("99-subtract", "SUBTRACT", 1),
    contribution("50-min", "MIN", 18),
    contribution("02-add", "ADD", 5),
    contribution("77-set", "SET", 10),
    contribution("03-multiply", "MULTIPLY", 2),
  ].reverse()

  assert.equal(resolveNumericConflicts(7, first).value, 24)
  assert.equal(resolveNumericConflicts(7, second).value, 24)
})

test("same-priority operations use canonical semantic phases", () => {
  const contributions = [
    contribution("set", "SET", 10),
    contribution("multiply-a", "MULTIPLY", 2),
    contribution("multiply-b", "MULTIPLY", 0.5),
    contribution("add-a", "ADD", 7),
    contribution("add-b", "ADD", 3),
    contribution("subtract", "SUBTRACT", 4),
    contribution("floor-a", "MIN", 12),
    contribution("floor-b", "MIN", 15),
    contribution("ceiling-a", "MAX", 40),
    contribution("ceiling-b", "MAX", 18),
  ]

  // SET 10 -> multipliers net x1 -> delta +6 -> 16 -> floor 15 -> ceiling 18.
  assert.equal(resolveNumericConflicts(100, contributions).value, 16)
})

test("higher priority tiers are applied later and can override lower tiers", () => {
  const contributions = [
    contribution("feat", "ADD", 2, 10),
    contribution("belt", "MIN", 19, 20),
    contribution("curse", "SUBTRACT", 4, 30),
  ]

  assert.equal(resolveNumericConflicts(8, contributions).value, 15)

  const override = [
    contribution("low-floor", "MIN", 20, 10),
    contribution("high-ceiling", "MAX", 10, 20),
  ]
  assert.equal(resolveNumericConflicts(8, override).value, 10)
})

test("equal-priority SET operations may agree but may not disagree", () => {
  assert.equal(
    resolveNumericConflicts(8, [
      contribution("set-a", "SET", 18),
      contribution("set-b", "SET", 18),
      contribution("bonus", "ADD", 2),
    ]).value,
    20,
  )

  assert.throws(
    () =>
      resolveNumericConflicts(8, [
        contribution("set-a", "SET", 18),
        contribution("set-b", "SET", 20),
      ]),
    CharacterConflictError,
  )
})

test("incompatible equal-priority MIN and MAX constraints fail explicitly", () => {
  assert.throws(
    () =>
      resolveNumericConflicts(12, [
        contribution("floor", "MIN", 20),
        contribution("ceiling", "MAX", 15),
      ]),
    /minimum 20 exceeds maximum 15/,
  )
})

test("character resolver uses conflict policy rather than input row order", () => {
  const base: BaseCharacter = {
    id: "conflict-character",
    name: "Conflict Character",
    level: 4,
    abilities: {
      strength: 8,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
    },
    baseMaxHp: 10,
    baseSpeed: 30,
  }

  const contributions = [
    contribution("curse", "SUBTRACT", 4, 30),
    contribution("feat", "ADD", 2, 10),
    contribution("belt", "MIN", 19, 20),
  ]

  const forward = resolveCharacter(base, { currentHp: 10, tempHp: 0 }, contributions)
  const reverse = resolveCharacter(base, { currentHp: 10, tempHp: 0 }, [...contributions].reverse())

  assert.equal(forward.abilities.strength.value, 15)
  assert.equal(reverse.abilities.strength.value, 15)
})
