import assert from "node:assert/strict"
import test from "node:test"

import {
  CharacterEngineInputError,
  createCharacterEngineInput,
  resolveCharacterInput,
  type CharacterEngineInput,
} from "../src/character-engine/index.ts"

const coreInput = (): CharacterEngineInput => ({
  base: {
    id: "core-test-character",
    name: "Core Test",
    level: 1,
    abilities: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
    },
    baseMaxHp: 10,
    baseSpeed: 30,
  },
  state: {
    currentHp: 7,
    tempHp: 2,
    resources: {
      test_resource: { current: 1, max: 3 },
    },
  },
  contributions: [],
})

test("Character Core accepts Base + State + Contributions through one canonical input", () => {
  const input = createCharacterEngineInput(coreInput())
  const resolved = resolveCharacterInput(input)

  assert.equal(resolved.id, "core-test-character")
  assert.equal(resolved.name, "Core Test")
  assert.equal(resolved.level, 1)
  assert.equal(resolved.combat.currentHp, 7)
  assert.equal(resolved.combat.tempHp, 2)
})

test("resolver does not mutate Character Core input", () => {
  const input = coreInput()
  const snapshot = structuredClone(input)

  resolveCharacterInput(input)

  assert.deepEqual(input, snapshot)
})

test("source type is provenance metadata and is not interpreted by Character Core", () => {
  const first = coreInput()
  first.contributions.push({
    id: "source-a-bonus",
    kind: "numeric",
    target: "abilities.strength",
    operation: "ADD",
    value: 2,
    source: {
      id: "source-a",
      name: "Первый источник",
      sourceType: "class",
    },
  })

  const second = structuredClone(first)
  second.contributions[0]!.source.sourceType = "totally_unknown_future_source"

  assert.equal(resolveCharacterInput(first).abilities.strength.value, 12)
  assert.equal(resolveCharacterInput(second).abilities.strength.value, 12)
})

test("Character Core rejects duplicate contribution ids", () => {
  const input = coreInput()
  input.contributions = [
    {
      id: "duplicate",
      kind: "numeric",
      target: "abilities.strength",
      operation: "ADD",
      value: 1,
      source: { id: "a", name: "A" },
    },
    {
      id: "duplicate",
      kind: "numeric",
      target: "abilities.dexterity",
      operation: "ADD",
      value: 1,
      source: { id: "b", name: "B" },
    },
  ]

  assert.throws(() => resolveCharacterInput(input), CharacterEngineInputError)
})

test("Character Core rejects non-finite raw values before resolution", () => {
  const input = coreInput()
  input.base.abilities.wisdom = Number.NaN

  assert.throws(() => resolveCharacterInput(input), CharacterEngineInputError)
})
