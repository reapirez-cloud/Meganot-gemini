import assert from "node:assert/strict"
import test from "node:test"

import {
  compileRollRecipe,
  executeRollRecipe,
  type RollContext,
  type RollRecipe,
} from "../src/roll-engine/index.ts"

const context: RollContext = {
  characterLevel: 5,
  spellLevel: 2,
  castLevel: 3,
  attackBonus: 7,
  saveDc: 15,
  castingAbilityModifier: 4,
}

const recipe: RollRecipe = {
  key: "test-rays",
  name: "Тестовые лучи",
  interaction: "roll",
  spellLevel: 2,
  sequences: [{
    key: "ray",
    instances: 2,
    instanceScaling: [{
      kind: "per_level",
      reference: { source: "cast_level" },
      above: 2,
      instancesPerLevel: 1,
    }],
    resolution: {
      kind: "attack",
      bonus: { kind: "reference", key: "attack_bonus" },
      target: "armor_class",
    },
    effects: [{
      key: "fire",
      kind: "damage",
      damageType: "fire",
      dice: { count: 2, sides: 6 },
      modifier: { kind: "reference", key: "casting_ability_modifier" },
    }],
  }],
}

test("compileRollRecipe resolves scaling and formulas without rolling dice", () => {
  const plan = compileRollRecipe(recipe, context)
  assert.equal(plan.kind, "roll")
  if (plan.kind !== "roll") return
  assert.equal(plan.castLevel, 3)
  assert.equal(plan.sequences[0]?.instances.length, 3)
  assert.deepEqual(plan.sequences[0]?.instances[0]?.resolution, {
    kind: "attack",
    bonus: 7,
    target: "armor_class",
  })
  assert.deepEqual(plan.sequences[0]?.instances[0]?.effects[0], {
    key: "fire",
    kind: "damage",
    damageType: "fire",
    dice: { count: 2, sides: 6 },
    modifier: 4,
  })
})

test("executeRollRecipe consumes the same compiled plan with injected randomness", () => {
  const faces = [11, 2, 3, 12, 4, 5, 13, 6, 1]
  let cursor = 0
  const result = executeRollRecipe(recipe, context, () => faces[cursor++]!)
  assert.equal(result.kind, "roll")
  if (result.kind !== "roll") return
  assert.equal(result.sequences[0]?.instances.length, 3)
  assert.deepEqual(result.sequences[0]?.instances.map((instance) => instance.resolution), [
    { kind: "attack", d20: 11, bonus: 7, total: 18, target: "armor_class" },
    { kind: "attack", d20: 12, bonus: 7, total: 19, target: "armor_class" },
    { kind: "attack", d20: 13, bonus: 7, total: 20, target: "armor_class" },
  ])
  assert.deepEqual(result.sequences[0]?.instances.map((instance) => instance.effects[0]?.roll.total), [9, 13, 11])
})
