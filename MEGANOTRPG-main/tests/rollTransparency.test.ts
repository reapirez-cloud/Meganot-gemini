import assert from "node:assert/strict"
import test from "node:test"

import {
  executeRollRecipe,
  type DiceRoller,
  type RollRecipe,
} from "../src/roll-engine/index.ts"

function sequenceRoller(values: number[]): DiceRoller {
  let index = 0
  return (sides) => {
    const value = values[index++]
    if (value === undefined) throw new Error(`test roller exhausted before d${sides}`)
    return value
  }
}

const attackSpell: RollRecipe = {
  key: "transparent-bolt",
  name: "Transparent Bolt",
  interaction: "roll",
  spellLevel: 0,
  sequences: [{
    key: "bolt",
    resolution: {
      kind: "attack",
      bonus: { kind: "reference", key: "attack_bonus" },
      target: "armor_class",
    },
    effects: [{
      key: "fire",
      kind: "damage",
      damageType: "fire",
      dice: { count: 3, sides: 10 },
      modifier: { kind: "literal", value: 2 },
    }],
  }],
}

const saveSpell: RollRecipe = {
  key: "transparent-blast",
  name: "Transparent Blast",
  interaction: "roll",
  spellLevel: 3,
  sequences: [{
    key: "blast",
    resolution: {
      kind: "save",
      ability: "dexterity",
      dc: { kind: "reference", key: "save_dc" },
      onSuccess: "half",
    },
    effects: [{
      key: "fire",
      kind: "damage",
      damageType: "fire",
      dice: { count: 4, sides: 6 },
    }],
  }],
}

test("attack resolution exposes raw d20, modifier and final total", () => {
  const result = executeRollRecipe(
    attackSpell,
    { characterLevel: 11, spellLevel: 0, castLevel: 0, attackBonus: 6 },
    sequenceRoller([13, 4, 7, 9]),
  )

  assert.equal(result.kind, "roll")
  if (result.kind !== "roll") return

  const instance = result.sequences[0]!.instances[0]!
  assert.deepEqual(instance.resolutionRoll, {
    dice: { count: 1, sides: 20 },
    rolls: [13],
    diceTotal: 13,
    modifier: 6,
    total: 19,
  })
  assert.deepEqual(instance.resolution, {
    kind: "attack",
    d20: 13,
    bonus: 6,
    total: 19,
    target: "armor_class",
  })

  assert.deepEqual(instance.effects[0]!.roll, {
    dice: { count: 3, sides: 10 },
    rolls: [4, 7, 9],
    diceTotal: 20,
    modifier: 2,
    total: 22,
  })
})

test("save resolution never invents target d20 but preserves every potential damage die", () => {
  const result = executeRollRecipe(
    saveSpell,
    { characterLevel: 9, spellLevel: 3, castLevel: 3, saveDc: 16 },
    sequenceRoller([1, 3, 5, 6]),
  )

  assert.equal(result.kind, "roll")
  if (result.kind !== "roll") return

  const instance = result.sequences[0]!.instances[0]!
  assert.equal(instance.resolutionRoll, undefined)
  assert.deepEqual(instance.resolution, {
    kind: "save",
    ability: "dexterity",
    dc: 16,
    onSuccess: "half",
  })
  assert.deepEqual(instance.effects[0]!.roll, {
    dice: { count: 4, sides: 6 },
    rolls: [1, 3, 5, 6],
    diceTotal: 15,
    modifier: 0,
    total: 15,
  })
})

test("multiple attacks keep each d20 and each damage roll independent", () => {
  const recipe: RollRecipe = {
    key: "two-rays",
    name: "Two Rays",
    interaction: "roll",
    sequences: [{
      key: "ray",
      instances: 2,
      resolution: {
        kind: "attack",
        bonus: { kind: "reference", key: "attack_bonus" },
      },
      effects: [{
        key: "fire",
        kind: "damage",
        dice: { count: 2, sides: 6 },
      }],
    }],
  }

  const result = executeRollRecipe(
    recipe,
    { characterLevel: 5, attackBonus: 5 },
    sequenceRoller([10, 2, 6, 18, 1, 4]),
  )

  assert.equal(result.kind, "roll")
  if (result.kind !== "roll") return

  const [first, second] = result.sequences[0]!.instances
  assert.deepEqual(first!.resolutionRoll?.rolls, [10])
  assert.deepEqual(first!.effects[0]!.roll.rolls, [2, 6])
  assert.equal(first!.effects[0]!.roll.total, 8)

  assert.deepEqual(second!.resolutionRoll?.rolls, [18])
  assert.deepEqual(second!.effects[0]!.roll.rolls, [1, 4])
  assert.equal(second!.effects[0]!.roll.total, 5)
})
