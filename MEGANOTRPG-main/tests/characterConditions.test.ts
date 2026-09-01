import assert from "node:assert/strict"
import test from "node:test"

import {
  CharacterEngineInputError,
  ConditionEngineError,
  evaluateCondition,
  resolveCharacter,
  type BaseCharacter,
  type CharacterContribution,
  type CharacterState,
} from "../src/character-engine/index.ts"

const base: BaseCharacter = {
  id: "conditions-test",
  name: "Conditions Test",
  level: 4,
  abilities: {
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
  },
  baseMaxHp: 20,
  baseSpeed: 30,
}

const source = { id: "source", name: "Источник" }

function state(facts: CharacterState["facts"] = {}, currentHp = 20): CharacterState {
  return { currentHp, tempHp: 0, facts }
}

test("state facts express equipped, attuned and other domain concepts without hard-coded condition kinds", () => {
  const contribution: CharacterContribution = {
    id: "ring-speed",
    kind: "numeric",
    target: "combat.speed",
    operation: "ADD",
    value: 10,
    source,
    condition: {
      kind: "all",
      conditions: [
        {
          kind: "state",
          key: "equipment.ring-1.equipped",
          operator: "EQUALS",
          value: true,
        },
        {
          kind: "state",
          key: "equipment.ring-1.attuned",
          operator: "EQUALS",
          value: true,
        },
      ],
    },
  }

  const active = resolveCharacter(
    base,
    state({
      "equipment.ring-1.equipped": true,
      "equipment.ring-1.attuned": true,
    }),
    [contribution],
  )
  assert.equal(active.combat.speed.value, 40)

  const notAttuned = resolveCharacter(
    base,
    state({
      "equipment.ring-1.equipped": true,
      "equipment.ring-1.attuned": false,
    }),
    [contribution],
  )
  assert.equal(notAttuned.combat.speed.value, 30)
})

test("ALL, ANY and NOT compose conditions predictably", () => {
  const condition = {
    kind: "all" as const,
    conditions: [
      {
        kind: "any" as const,
        conditions: [
          {
            kind: "state" as const,
            key: "combat.concentration",
            operator: "EQUALS" as const,
            value: "bless",
          },
          {
            kind: "state" as const,
            key: "combat.form",
            operator: "EQUALS" as const,
            value: "brown-bear",
          },
        ],
      },
      {
        kind: "not" as const,
        condition: {
          kind: "state" as const,
          key: "status.poisoned",
          operator: "EQUALS" as const,
          value: true,
        },
      },
    ],
  }

  assert.equal(
    evaluateCondition(condition, {
      maxHp: 20,
      state: state({ "combat.form": "brown-bear", "status.poisoned": false }),
    }),
    true,
  )
  assert.equal(
    evaluateCondition(condition, {
      maxHp: 20,
      state: state({ "combat.form": "brown-bear", "status.poisoned": true }),
    }),
    false,
  )
  assert.equal(
    evaluateCondition(condition, {
      maxHp: 20,
      state: state({ "combat.form": "human", "status.poisoned": false }),
    }),
    false,
  )
})

test("state conditions support existence, equality and numeric comparisons", () => {
  const runtime = state({
    "status.marked": null,
    "scene.round": 4,
    "combat.form": "human",
  })

  assert.equal(
    evaluateCondition(
      { kind: "state", key: "status.marked", operator: "EXISTS" },
      { state: runtime, maxHp: 20 },
    ),
    true,
  )
  assert.equal(
    evaluateCondition(
      { kind: "state", key: "missing", operator: "NOT_EXISTS" },
      { state: runtime, maxHp: 20 },
    ),
    true,
  )
  assert.equal(
    evaluateCondition(
      { kind: "state", key: "scene.round", operator: "GTE", value: 4 },
      { state: runtime, maxHp: 20 },
    ),
    true,
  )
  assert.equal(
    evaluateCondition(
      { kind: "state", key: "combat.form", operator: "NOT_EQUALS", value: "wolf" },
      { state: runtime, maxHp: 20 },
    ),
    true,
  )
})

test("until-rest style effects are represented by ordinary state facts", () => {
  const contribution: CharacterContribution = {
    id: "until-long-rest",
    kind: "numeric",
    target: "abilities.wisdom",
    operation: "ADD",
    value: 2,
    source,
    condition: {
      kind: "state",
      key: "rest.long.sequence",
      operator: "EQUALS",
      value: 7,
    },
  }

  const beforeRest = resolveCharacter(base, state({ "rest.long.sequence": 7 }), [contribution])
  assert.equal(beforeRest.abilities.wisdom.value, 12)

  const afterRest = resolveCharacter(base, state({ "rest.long.sequence": 8 }), [contribution])
  assert.equal(afterRest.abilities.wisdom.value, 10)
})

test("HP-relative conditions use resolved maximum HP for downstream targets", () => {
  const contributions: CharacterContribution[] = [
    {
      id: "max-hp",
      kind: "numeric",
      target: "combat.maxHp",
      operation: "ADD",
      value: 20,
      source: { id: "hp-source", name: "Запас здоровья" },
    },
    {
      id: "bloodied-speed",
      kind: "numeric",
      target: "combat.speed",
      operation: "ADD",
      value: 10,
      source: { id: "bloodied", name: "На грани" },
      condition: { kind: "hp_below_percent", percent: 50 },
    },
    {
      id: "bloodied-resistance",
      kind: "grant",
      operation: "GRANT",
      target: "resistance",
      key: "fire",
      source: { id: "bloodied-resistance-source", name: "Горячая кровь" },
      condition: { kind: "hp_below_percent", percent: 50 },
    },
  ]

  // 15/40 is below 50%, while 15/20 would not be.
  const resolved = resolveCharacter(base, state({}, 15), contributions)
  assert.equal(resolved.combat.maxHp.value, 40)
  assert.equal(resolved.combat.speed.value, 40)
  assert.equal(
    resolved.grants.some((grant) => grant.target === "resistance" && grant.key === "fire"),
    true,
  )
})

test("invalid empty composite conditions are rejected at the engine boundary", () => {
  const contribution: CharacterContribution = {
    id: "empty-any",
    kind: "numeric",
    target: "combat.speed",
    operation: "ADD",
    value: 10,
    source,
    condition: { kind: "any", conditions: [] },
  }

  assert.throws(
    () => resolveCharacter(base, state(), [contribution]),
    (error: unknown) =>
      error instanceof CharacterEngineInputError && /conditions must not be empty/.test(error.message),
  )
})

test("numeric comparisons reject a non-numeric runtime fact instead of silently guessing", () => {
  assert.throws(
    () =>
      evaluateCondition(
        { kind: "state", key: "scene.round", operator: "GT", value: 2 },
        { state: state({ "scene.round": "third" }), maxHp: 20 },
      ),
    (error: unknown) =>
      error instanceof ConditionEngineError && /must be a finite number/.test(error.message),
  )
})
