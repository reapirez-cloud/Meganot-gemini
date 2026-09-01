import assert from "node:assert/strict"
import test from "node:test"

import {
  FormulaConflictError,
  evaluateFormula,
  resolveCharacter,
  type BaseCharacter,
  type CharacterContribution,
  type CharacterState,
  type FormulaExpression,
} from "../src/character-engine/index.ts"

const base: BaseCharacter = {
  id: "formula-test",
  name: "Formula Test",
  level: 4,
  abilities: {
    strength: 8,
    dexterity: 8,
    constitution: 10,
    intelligence: 10,
    wisdom: 18,
    charisma: 19,
  },
  baseMaxHp: 20,
  baseSpeed: 30,
}

const state: CharacterState = { currentHp: 20, tempHp: 0 }
const source = (id: string, name: string) => ({ id, name })
const ref = (key: string): FormulaExpression => ({ kind: "reference", key })
const literal = (value: number): FormulaExpression => ({ kind: "literal", value })

test("default AC is a formula, not stored truth", () => {
  const resolved = resolveCharacter(base, state)
  assert.equal(resolved.combat.ac.value, 9)
  assert.equal(resolved.combat.ac.formulaSources.length, 0)
})

test("unarmored defense can replace the AC formula and numeric bonuses apply afterwards", () => {
  const contributions: CharacterContribution[] = [
    {
      id: "unarmored-defense",
      kind: "formula",
      target: "combat.ac",
      operation: "SET_FORMULA",
      formula: {
        kind: "add",
        terms: [literal(10), ref("abilities.dexterity.modifier"), ref("abilities.wisdom.modifier")],
      },
      source: source("unarmored", "Без доспеха"),
    },
    {
      id: "ring-ac",
      kind: "numeric",
      target: "combat.ac",
      operation: "ADD",
      value: 1,
      source: source("ring", "Кольцо защиты"),
    },
  ]

  const resolved = resolveCharacter(base, state, contributions)
  assert.equal(resolved.combat.ac.baseValue, 13)
  assert.equal(resolved.combat.ac.value, 14)
  assert.equal(resolved.combat.ac.formulaSources[0]?.source.name, "Без доспеха")
  assert.equal(resolved.combat.ac.sources[0]?.source.name, "Кольцо защиты")
})

test("formula clamp expresses armor ability caps without armor-specific engine code", () => {
  const formula: FormulaExpression = {
    kind: "add",
    terms: [
      literal(14),
      {
        kind: "clamp",
        value: ref("abilities.dexterity.modifier"),
        max: 2,
      },
    ],
  }

  assert.equal(evaluateFormula(formula, { "abilities.dexterity.modifier": 4 }), 16)
  assert.equal(evaluateFormula(formula, { "abilities.dexterity.modifier": -1 }), 13)
})

test("using another ability is just another formula reference", () => {
  const strengthAttack = ref("abilities.strength.modifier")
  const charismaAttack = ref("abilities.charisma.modifier")
  const context = {
    "abilities.strength.modifier": -1,
    "abilities.charisma.modifier": 4,
  }

  assert.equal(evaluateFormula(strengthAttack, context), -1)
  assert.equal(evaluateFormula(charismaAttack, context), 4)
})

test("conditional formula only participates while its condition is active", () => {
  const armorFormula: CharacterContribution = {
    id: "armor-formula",
    kind: "formula",
    target: "combat.ac",
    operation: "SET_FORMULA",
    formula: { kind: "add", terms: [literal(14), ref("abilities.dexterity.modifier")] },
    condition: { kind: "state", key: "equipment.armor.equipped", operator: "EQUALS", value: true },
    source: source("armor", "Броня"),
  }

  assert.equal(resolveCharacter(base, state, [armorFormula]).combat.ac.value, 9)
  assert.equal(
    resolveCharacter(base, { ...state, facts: { "equipment.armor.equipped": true } }, [armorFormula]).combat.ac.value,
    13,
  )
})

test("higher-priority formula replaces lower-priority formula deterministically", () => {
  const contributions: CharacterContribution[] = [
    {
      id: "low",
      kind: "formula",
      target: "combat.ac",
      operation: "SET_FORMULA",
      formula: literal(12),
      priority: 10,
      source: source("low", "Низкий приоритет"),
    },
    {
      id: "high",
      kind: "formula",
      target: "combat.ac",
      operation: "SET_FORMULA",
      formula: literal(17),
      priority: 20,
      source: source("high", "Высокий приоритет"),
    },
  ]

  assert.equal(resolveCharacter(base, state, contributions).combat.ac.value, 17)
  assert.equal(resolveCharacter(base, state, [...contributions].reverse()).combat.ac.value, 17)
})

test("different equal-priority formulas are an explicit conflict", () => {
  const contributions: CharacterContribution[] = [
    {
      id: "a",
      kind: "formula",
      target: "combat.ac",
      operation: "SET_FORMULA",
      formula: literal(15),
      priority: 10,
      source: source("a", "Формула A"),
    },
    {
      id: "b",
      kind: "formula",
      target: "combat.ac",
      operation: "SET_FORMULA",
      formula: literal(16),
      priority: 10,
      source: source("b", "Формула B"),
    },
  ]

  assert.throws(() => resolveCharacter(base, state, contributions), FormulaConflictError)
})

test("identical equal-priority formulas merge provenance", () => {
  const formula = literal(15)
  const contributions: CharacterContribution[] = [
    {
      id: "a",
      kind: "formula",
      target: "combat.ac",
      operation: "SET_FORMULA",
      formula,
      source: source("a", "A"),
    },
    {
      id: "b",
      kind: "formula",
      target: "combat.ac",
      operation: "SET_FORMULA",
      formula,
      source: source("b", "B"),
    },
  ]

  const ac = resolveCharacter(base, state, contributions).combat.ac
  assert.equal(ac.value, 15)
  assert.equal(ac.formulaSources.length, 2)
})
