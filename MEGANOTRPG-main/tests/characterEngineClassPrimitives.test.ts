import assert from "node:assert/strict"
import test from "node:test"

import {
  executeAction,
  resolveCharacterContract,
  type CharacterContribution,
  type CharacterEngineInput,
  type CharacterSource,
  type CharacterState,
} from "../src/character-engine/index.ts"

const source: CharacterSource = {
  id: "test:source",
  name: "Generic mechanics source",
  sourceType: "test",
}

function input(
  contributions: CharacterContribution[],
  state: CharacterState = { currentHp: 20, tempHp: 0, resources: {}, facts: {} },
): CharacterEngineInput {
  return {
    base: {
      id: "generic-character",
      name: "Generic Character",
      level: 8,
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
    },
    state,
    contributions,
  }
}

test("generic scalar values drive dynamic action dice without becoming resources", () => {
  const contributions: CharacterContribution[] = [
    {
      id: "die-size",
      kind: "grant",
      operation: "REPLACE",
      target: "value",
      key: "superiority_die",
      payload: { value: 10, label: "Superiority Die" },
      source,
    },
    {
      id: "maneuver",
      kind: "grant",
      operation: "GRANT",
      target: "action",
      key: "trip_attack",
      payload: {
        economy: "on_hit",
        damage: [
          {
            key: "superiority",
            type: "bonus",
            dice: {
              count: 1,
              sides: { kind: "reference", key: "values.superiority_die" },
            },
          },
        ],
      },
      source,
    },
  ]

  const contract = resolveCharacterContract(input(contributions))
  assert.equal(contract.resources.length, 0)
  assert.equal(contract.values.length, 1)
  assert.equal(contract.values[0]?.value.value, 10)
  assert.deepEqual(contract.actions[0]?.damage[0]?.dice, { count: 1, sides: 10 })
})

test("permission grants can hard-gate actions without CE knowing why the permission exists", () => {
  const gatedAction: CharacterContribution = {
    id: "prepare-action",
    kind: "grant",
    operation: "GRANT",
    target: "action",
    key: "prepare_spells",
    payload: {
      economy: "downtime",
      requirements: [
        {
          kind: "grant",
          target: "permission",
          key: "spell_preparation",
          label: "Preparation permission",
        },
      ],
    },
    source,
  }

  const withoutPermission = resolveCharacterContract(input([gatedAction]))
  assert.equal(withoutPermission.actions[0]?.available, false)
  assert.equal(withoutPermission.actions[0]?.requirements[0]?.satisfied, false)

  const withPermission = resolveCharacterContract(
    input([
      gatedAction,
      {
        id: "book-permission",
        kind: "grant",
        operation: "GRANT",
        target: "permission",
        key: "spell_preparation",
        payload: { scope: "arcane_book" },
        source: { ...source, id: "item:book", sourceType: "item" },
      },
    ]),
  )
  assert.equal(withPermission.actions[0]?.available, true)
})

test("GM-enforced requirements warn without disabling the action", () => {
  const contract = resolveCharacterContract(
    input([
      {
        id: "gm-rule-action",
        kind: "grant",
        operation: "GRANT",
        target: "action",
        key: "situational_action",
        payload: {
          economy: "action",
          requirements: [
            {
              kind: "condition",
              condition: { kind: "state", key: "scene.allowed", operator: "EQUALS", value: true },
              enforcement: "gm",
              label: "GM decides whether the scene allows it",
            },
          ],
        },
        source,
      },
    ]),
  )

  assert.equal(contract.actions[0]?.requirements[0]?.satisfied, false)
  assert.equal(contract.actions[0]?.requirements[0]?.enforcement, "gm")
  assert.equal(contract.actions[0]?.available, true)
})

test("alternative costs plus resource effects express generic resource conversion", () => {
  const contributions: CharacterContribution[] = [
    {
      id: "resource-a",
      kind: "grant",
      operation: "GRANT",
      target: "resource",
      key: "shape_charge",
      payload: { max: 2, recharge: { triggers: ["short_rest"], restore: "full" } },
      source,
    },
    {
      id: "resource-b",
      kind: "grant",
      operation: "GRANT",
      target: "resource",
      key: "energy_slot",
      payload: { max: 4, recharge: { triggers: ["long_rest"], restore: "full" } },
      source,
    },
    {
      id: "conversion",
      kind: "grant",
      operation: "GRANT",
      target: "action",
      key: "recover_shape_charge",
      payload: {
        economy: "bonus_action",
        costOptions: [
          { key: "shape", costs: [{ key: "shape_charge", amount: 1 }] },
          { key: "slot", costs: [{ key: "energy_slot", amount: 1 }] },
        ],
        effects: [
          { kind: "resource", key: "shape_charge", operation: "RESTORE", amount: 1 },
        ],
      },
      source,
    },
  ]
  const state: CharacterState = {
    currentHp: 20,
    tempHp: 0,
    resources: {
      shape_charge: { current: 0 },
      energy_slot: { current: 3 },
    },
    facts: {},
  }

  const contract = resolveCharacterContract(input(contributions, state))
  const action = contract.actions[0]!
  assert.equal(action.available, true)
  assert.equal(action.costOptions.find((option) => option.key === "shape")?.available, false)
  assert.equal(action.costOptions.find((option) => option.key === "slot")?.available, true)

  const next = executeAction(state, action, "slot")
  assert.equal(next.resources?.energy_slot?.current, 2)
  assert.equal(next.resources?.shape_charge?.current, 1)
})

test("state effects provide a generic mode lifecycle for conditional mechanics", () => {
  const contributions: CharacterContribution[] = [
    {
      id: "activate-mode",
      kind: "grant",
      operation: "GRANT",
      target: "action",
      key: "activate_mode",
      payload: {
        economy: "bonus_action",
        effects: [{ kind: "state", key: "mode.active", operation: "SET", value: true }],
      },
      source,
    },
    {
      id: "mode-speed",
      kind: "numeric",
      target: "combat.speed",
      operation: "ADD",
      value: 10,
      condition: { kind: "state", key: "mode.active", operator: "EQUALS", value: true },
      source,
    },
  ]
  const initialState: CharacterState = { currentHp: 20, tempHp: 0, resources: {}, facts: {} }
  const before = resolveCharacterContract(input(contributions, initialState))
  assert.equal(before.combat.speed.value, 30)

  const nextState = executeAction(initialState, before.actions[0]!)
  assert.equal(nextState.facts?.["mode.active"], true)

  const after = resolveCharacterContract(input(contributions, nextState))
  assert.equal(after.combat.speed.value, 40)
})
