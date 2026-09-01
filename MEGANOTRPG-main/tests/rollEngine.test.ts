import assert from "node:assert/strict"
import test from "node:test"

import {
  resolveCharacterContract,
  type CharacterContribution,
  type CharacterEngineInput,
} from "../src/character-engine/index.ts"
import {
  RollContextError,
  RollEngineError,
  RollScalingError,
  createSpellRollContext,
  executeRollRecipe,
  type DiceRoller,
  type RollRecipe,
  type RollValueExpression,
  type RollValueReference,
} from "../src/roll-engine/index.ts"

const ref = (key: RollValueReference): RollValueExpression => ({ kind: "reference", key })
const lit = (value: number): RollValueExpression => ({ kind: "literal", value })
const constantRoller = (value: number): DiceRoller => () => value

function sequenceRoller(values: number[]): DiceRoller {
  let index = 0
  return (sides) => {
    const value = values[index++]
    if (value === undefined) throw new Error(`test roller exhausted before d${sides}`)
    return value
  }
}

const detectMagic: RollRecipe = {
  key: "detect-magic",
  name: "Detect Magic",
  sourceKind: "spell",
  interaction: "link",
  spellLevel: 1,
}

const fireBolt: RollRecipe = {
  key: "fire-bolt",
  name: "Fire Bolt",
  sourceKind: "spell",
  interaction: "roll",
  spellLevel: 0,
  sequences: [{
    key: "bolt",
    resolution: { kind: "attack", bonus: ref("attack_bonus"), target: "armor_class" },
    effects: [{
      key: "fire",
      kind: "damage",
      damageType: "fire",
      dice: { count: 1, sides: 10 },
      scaling: [{
        kind: "steps",
        reference: { source: "character_level" },
        steps: [
          { atLeast: 1, adjustment: { diceCount: 1 } },
          { atLeast: 5, adjustment: { diceCount: 2 } },
          { atLeast: 11, adjustment: { diceCount: 3 } },
          { atLeast: 17, adjustment: { diceCount: 4 } },
        ],
      }],
    }],
  }],
}

const fireball: RollRecipe = {
  key: "fireball",
  name: "Fireball",
  sourceKind: "spell",
  interaction: "roll",
  spellLevel: 3,
  sequences: [{
    key: "blast",
    resolution: { kind: "save", ability: "dexterity", dc: ref("save_dc"), onSuccess: "half" },
    effects: [{
      key: "fire",
      kind: "damage",
      damageType: "fire",
      dice: { count: 8, sides: 6 },
      scaling: [{
        kind: "per_level",
        reference: { source: "cast_level" },
        above: 3,
        diceCountPerLevel: 1,
      }],
    }],
  }],
}

const cureWounds: RollRecipe = {
  key: "cure-wounds",
  name: "Cure Wounds",
  sourceKind: "spell",
  interaction: "roll",
  spellLevel: 1,
  sequences: [{
    key: "healing",
    resolution: { kind: "none" },
    effects: [{
      key: "healing",
      kind: "healing",
      dice: { count: 2, sides: 8 },
      modifier: ref("casting_ability_modifier"),
      scaling: [{
        kind: "per_level",
        reference: { source: "cast_level" },
        above: 1,
        diceCountPerLevel: 2,
      }],
    }],
  }],
}

const magicMissile: RollRecipe = {
  key: "magic-missile",
  name: "Magic Missile",
  sourceKind: "spell",
  interaction: "roll",
  spellLevel: 1,
  sequences: [{
    key: "dart",
    instances: 3,
    instanceScaling: [{
      kind: "per_level",
      reference: { source: "cast_level" },
      above: 1,
      instancesPerLevel: 1,
    }],
    resolution: { kind: "automatic" },
    effects: [{ key: "force", kind: "damage", damageType: "force", dice: { count: 1, sides: 4 }, modifier: lit(1) }],
  }],
}

const scorchingRay: RollRecipe = {
  key: "scorching-ray",
  name: "Scorching Ray",
  sourceKind: "spell",
  interaction: "roll",
  spellLevel: 2,
  sequences: [{
    key: "ray",
    instances: 3,
    instanceScaling: [{
      kind: "per_level",
      reference: { source: "cast_level" },
      above: 2,
      instancesPerLevel: 1,
    }],
    resolution: { kind: "attack", bonus: ref("attack_bonus"), target: "armor_class" },
    effects: [{ key: "fire", kind: "damage", damageType: "fire", dice: { count: 2, sides: 6 } }],
  }],
}

test("peaceful spell is link-only and never invents a meaningless roll", () => {
  assert.deepEqual(
    executeRollRecipe(detectMagic, { characterLevel: 4, spellLevel: 1, castLevel: 1 }, constantRoller(1)),
    { kind: "link", recipeKey: "detect-magic", name: "Detect Magic" },
  )
})

test("spell attack rolls attack and potential damage immediately with character-level scaling", () => {
  const result = executeRollRecipe(
    fireBolt,
    { characterLevel: 11, spellLevel: 0, castLevel: 0, attackBonus: 6 },
    sequenceRoller([12, 4, 5, 6]),
  )
  assert.equal(result.kind, "roll")
  if (result.kind !== "roll") return
  const instance = result.sequences[0]!.instances[0]!
  assert.deepEqual(instance.resolution, { kind: "attack", d20: 12, bonus: 6, total: 18, target: "armor_class" })
  assert.deepEqual(instance.effects[0]!.roll, {
    dice: { count: 3, sides: 10 }, rolls: [4, 5, 6], diceTotal: 15, modifier: 0, total: 15,
  })
})

test("save spell rolls damage now and upcasts from selected cast level", () => {
  const result = executeRollRecipe(
    fireball,
    { characterLevel: 9, spellLevel: 3, castLevel: 5, saveDc: 16 },
    constantRoller(3),
  )
  assert.equal(result.kind, "roll")
  if (result.kind !== "roll") return
  const instance = result.sequences[0]!.instances[0]!
  assert.deepEqual(instance.resolution, { kind: "save", ability: "dexterity", dc: 16, onSuccess: "half" })
  assert.equal(instance.effects[0]!.roll.dice.count, 10)
  assert.equal(instance.effects[0]!.roll.total, 30)
})

test("healing scales from cast level and adds casting ability without player input", () => {
  const result = executeRollRecipe(
    cureWounds,
    { characterLevel: 7, spellLevel: 1, castLevel: 3, castingAbilityModifier: 4 },
    constantRoller(2),
  )
  assert.equal(result.kind, "roll")
  if (result.kind !== "roll") return
  const healing = result.sequences[0]!.instances[0]!.effects[0]!.roll
  assert.deepEqual(healing.dice, { count: 6, sides: 8 })
  assert.equal(healing.total, 16)
})

test("automatic and multi-attack spells scale independent instance counts", () => {
  const missiles = executeRollRecipe(
    magicMissile,
    { characterLevel: 5, spellLevel: 1, castLevel: 3 },
    constantRoller(2),
  )
  assert.equal(missiles.kind, "roll")
  if (missiles.kind !== "roll") return
  assert.equal(missiles.sequences[0]!.instances.length, 5)
  assert.deepEqual(missiles.sequences[0]!.instances.map((dart) => dart.effects[0]!.roll.total), [3, 3, 3, 3, 3])

  const rays = executeRollRecipe(
    scorchingRay,
    { characterLevel: 7, spellLevel: 2, castLevel: 4, attackBonus: 7 },
    constantRoller(4),
  )
  assert.equal(rays.kind, "roll")
  if (rays.kind !== "roll") return
  assert.equal(rays.sequences[0]!.instances.length, 5)
  assert.equal(rays.sequences[0]!.instances.every((ray) => ray.resolution.kind === "attack" && ray.effects[0]!.roll.total === 8), true)
})

test("class-level scaling remains distinct from total character level", () => {
  const recipe: RollRecipe = {
    key: "class-scaling-test",
    name: "Class Scaling Test",
    interaction: "roll",
    sequences: [{
      key: "effect",
      resolution: { kind: "none" },
      effects: [{
        key: "damage",
        kind: "damage",
        dice: { count: 1, sides: 6 },
        scaling: [{
          kind: "steps",
          reference: { source: "class_level", classKey: "wizard" },
          steps: [
            { atLeast: 1, adjustment: { diceCount: 1 } },
            { atLeast: 5, adjustment: { diceCount: 2 } },
          ],
        }],
      }],
    }],
  }
  const result = executeRollRecipe(recipe, { characterLevel: 10, classLevels: { wizard: 4, cleric: 6 } }, constantRoller(3))
  assert.equal(result.kind, "roll")
  if (result.kind !== "roll") return
  assert.equal(result.sequences[0]!.instances[0]!.effects[0]!.roll.dice.count, 1)
  assert.throws(() => executeRollRecipe(recipe, { characterLevel: 10 }, constantRoller(1)), RollScalingError)
})

function spellCharacterInput(slot5Current = 1): CharacterEngineInput {
  const source = { id: "wizard", name: "Wizard" }
  const contributions: CharacterContribution[] = [
    { id: "slot-3", kind: "grant", operation: "GRANT", target: "resource", key: "spell-slot-3", payload: { max: 3 }, source },
    { id: "slot-5", kind: "grant", operation: "GRANT", target: "resource", key: "spell-slot-5", payload: { max: 1 }, source },
    {
      id: "fireball-access",
      kind: "grant",
      operation: "GRANT",
      target: "spell",
      key: "fireball",
      variantKey: "wizard",
      payload: {
        spell: { name: "Fireball", level: 3 },
        preparation: { mode: "always_prepared" },
        methods: [{
          key: "slots",
          kind: "spell_slots",
          ability: "intelligence",
          resourceOptions: [
            { key: "slot-3", castLevel: 3, costs: [{ key: "spell-slot-3", amount: 1 }] },
            { key: "slot-5", castLevel: 5, costs: [{ key: "spell-slot-5", amount: 1 }] },
          ],
        }],
      },
      source,
    },
  ]
  return {
    base: {
      id: "roll-character", name: "Roll Character", level: 9,
      abilities: { strength: 8, dexterity: 14, constitution: 14, intelligence: 18, wisdom: 10, charisma: 10 },
      baseMaxHp: 50, baseSpeed: 30,
    },
    state: {
      currentHp: 50, tempHp: 0,
      resources: { "spell-slot-3": { current: 3 }, "spell-slot-5": { current: slot5Current } },
    },
    contributions,
  }
}

test("selected resolved slot becomes castLevel, so 5th-level cast cannot accidentally use base damage", () => {
  const character = resolveCharacterContract(spellCharacterInput())
  const prepared = createSpellRollContext(character, {
    spellKey: "fireball", accessKey: "wizard", methodKey: "slots", resourceOptionKey: "slot-5",
  })
  assert.equal(prepared.context.castLevel, 5)
  assert.equal(prepared.context.spellLevel, 3)
  assert.equal(prepared.context.castingAbilityModifier, 4)
  assert.equal(prepared.context.attackBonus, 8)
  assert.equal(prepared.context.saveDc, 16)

  const result = executeRollRecipe(fireball, prepared.context, constantRoller(2))
  assert.equal(result.kind, "roll")
  if (result.kind !== "roll") return
  assert.equal(result.sequences[0]!.instances[0]!.effects[0]!.roll.dice.count, 10)
})

test("exhausted slot is rejected before rolling and casts below base level are invalid", () => {
  const character = resolveCharacterContract(spellCharacterInput(0))
  assert.throws(
    () => createSpellRollContext(character, {
      spellKey: "fireball", accessKey: "wizard", methodKey: "slots", resourceOptionKey: "slot-5",
    }),
    RollContextError,
  )
  assert.throws(
    () => executeRollRecipe(fireball, { characterLevel: 9, spellLevel: 3, castLevel: 2, saveDc: 16 }, constantRoller(1)),
    RollEngineError,
  )
})
