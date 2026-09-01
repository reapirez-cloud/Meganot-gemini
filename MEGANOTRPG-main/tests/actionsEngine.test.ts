import assert from "node:assert/strict"
import test from "node:test"

import {
  ActionEngineError,
  CharacterEngineInputError,
  actionAttackBonusTarget,
  actionDamageModifierTarget,
  applyActionResourceCosts,
  resolveCharacter,
  type BaseCharacter,
  type CharacterContribution,
  type CharacterState,
  type FormulaExpression,
} from "../src/character-engine/index.ts"

const base: BaseCharacter = {
  id: "actions-test",
  name: "Actions Test",
  level: 5,
  abilities: {
    strength: 8,
    dexterity: 14,
    constitution: 12,
    intelligence: 10,
    wisdom: 16,
    charisma: 18,
  },
  baseMaxHp: 30,
  baseSpeed: 30,
}

const source = (id: string, name: string, parentSourceId?: string) => ({
  id,
  name,
  ...(parentSourceId ? { parentSourceId } : {}),
})

const ref = (key: string): FormulaExpression => ({ kind: "reference", key })
const add = (...terms: FormulaExpression[]): FormulaExpression => ({ kind: "add", terms })

const daggerAction: CharacterContribution = {
  id: "dagger-action",
  kind: "grant",
  operation: "GRANT",
  target: "action",
  key: "dagger",
  payload: {
    label: "Кинжал",
    economy: "action",
    range: { kind: "melee", reach: 5, unit: "ft" },
    attack: {
      bonus: add(ref("abilities.dexterity.modifier"), ref("core.proficiencyBonus")),
      target: "armor_class",
      criticalThreshold: 20,
    },
    damage: [
      {
        key: "piercing",
        type: "piercing",
        dice: { count: 1, sides: 4 },
        modifier: ref("abilities.dexterity.modifier"),
      },
    ],
    tags: ["weapon", "finesse"],
  },
  source: source("dagger-item", "Кинжал"),
}

test("no active action grants means no resolved action section", () => {
  const resolved = resolveCharacter(base, { currentHp: 30, tempHp: 0 }, [])
  assert.deepEqual(resolved.actions, [])
})

test("generic weapon-like action resolves attack, range and damage formulas", () => {
  const resolved = resolveCharacter(base, { currentHp: 30, tempHp: 0 }, [daggerAction])
  assert.equal(resolved.actions.length, 1)

  const dagger = resolved.actions[0]!
  assert.equal(dagger.stateKey, "dagger")
  assert.equal(dagger.economy, "action")
  assert.deepEqual(dagger.range, { kind: "melee", reach: 5, unit: "ft" })
  assert.equal(dagger.attack?.bonus.value, 5)
  assert.equal(dagger.attack?.target, "armor_class")
  assert.equal(dagger.damage[0]?.dice?.sides, 4)
  assert.equal(dagger.damage[0]?.modifier.value, 2)
  assert.equal(dagger.damage[0]?.type, "piercing")
  assert.equal(dagger.available, true)
})

test("external numeric contributions can modify attack and one damage component independently", () => {
  const contributions: CharacterContribution[] = [
    daggerAction,
    {
      id: "enchanted-attack",
      kind: "numeric",
      target: actionAttackBonusTarget("dagger"),
      operation: "ADD",
      value: 1,
      source: source("weapon-enchantment", "+1 enchantment"),
    },
    {
      id: "poisoned-damage",
      kind: "numeric",
      target: actionDamageModifierTarget("dagger", "piercing"),
      operation: "ADD",
      value: 2,
      source: source("damage-bonus", "Боевой бонус"),
    },
  ]

  const dagger = resolveCharacter(base, { currentHp: 30, tempHp: 0 }, contributions).actions[0]!
  assert.equal(dagger.attack?.bonus.value, 6)
  assert.equal(dagger.attack?.bonus.sources.length, 1)
  assert.equal(dagger.damage[0]?.modifier.value, 4)
  assert.equal(dagger.damage[0]?.modifier.sources.length, 1)
})

test("weird custom action can have no attack roll and multiple arbitrary damage components", () => {
  const frogBlast: CharacterContribution = {
    id: "frog-blast",
    kind: "grant",
    operation: "GRANT",
    target: "action",
    key: "frog-blast",
    payload: {
      label: "Жабий хлопок",
      economy: "custom:half-action",
      range: { kind: "custom", label: "Все жабы в пределах слышимости" },
      damage: [
        {
          key: "psychic",
          type: "psychic",
          dice: { count: 2, sides: 6 },
          modifier: ref("abilities.wisdom.modifier"),
        },
        {
          key: "mud",
          type: "mud",
          modifier: { kind: "literal", value: 3 },
        },
      ],
      tags: ["frog", "custom"],
    },
    source: source("frog-school", "Жабья школа"),
  }

  const action = resolveCharacter(base, { currentHp: 30, tempHp: 0 }, [frogBlast]).actions[0]!
  assert.equal(action.attack, undefined)
  assert.equal(action.damage.length, 2)
  assert.equal(action.damage[0]?.modifier.value, 3)
  assert.equal(action.damage[1]?.modifier.value, 3)
  assert.equal(action.economy, "custom:half-action")
})

test("resource costs control availability and can be spent atomically", () => {
  const maneuverResource: CharacterContribution = {
    id: "superiority-resource",
    kind: "grant",
    operation: "GRANT",
    target: "resource",
    key: "superiority-die",
    payload: {
      max: 2,
      recharge: { triggers: ["short_rest", "long_rest"], restore: "full" },
    },
    source: source("maneuver-source", "Манёвры"),
  }
  const maneuverAction: CharacterContribution = {
    id: "trip-attack",
    kind: "grant",
    operation: "GRANT",
    target: "action",
    key: "trip-attack",
    payload: {
      label: "Сбивающая атака",
      economy: "on_hit",
      resourceCosts: [{ key: "superiority-die", amount: 1 }],
      damage: [{ key: "extra", type: "weapon", dice: { count: 1, sides: 8 } }],
    },
    source: source("maneuver-source", "Манёвры"),
  }
  const state: CharacterState = {
    currentHp: 30,
    tempHp: 0,
    resources: { "superiority-die": { current: 1 } },
  }

  const resolved = resolveCharacter(base, state, [maneuverResource, maneuverAction])
  const action = resolved.actions[0]!
  assert.equal(action.available, true)
  assert.equal(action.resourceCosts[0]?.current, 1)

  const spent = applyActionResourceCosts(state, action)
  assert.equal(spent.resources?.["superiority-die"]?.current, 0)
  assert.equal(state.resources?.["superiority-die"]?.current, 1)

  const afterSpend = resolveCharacter(base, spent, [maneuverResource, maneuverAction]).actions[0]!
  assert.equal(afterSpend.available, false)
  assert.throws(() => applyActionResourceCosts(spent, afterSpend), ActionEngineError)
})

test("missing resource makes the action unavailable instead of inventing a resource", () => {
  const actionOnly: CharacterContribution = {
    id: "charge-action",
    kind: "grant",
    operation: "GRANT",
    target: "action",
    key: "charge-action",
    payload: {
      economy: "action",
      resourceCosts: [{ key: "missing-charge", amount: 1 }],
    },
    source: source("charged-item", "Зарядный предмет"),
  }

  const action = resolveCharacter(base, { currentHp: 30, tempHp: 0 }, [actionOnly]).actions[0]!
  assert.equal(action.available, false)
  assert.equal(action.resourceCosts[0]?.current, 0)
  assert.equal(action.resourceCosts[0]?.max, 0)
})

test("action conditions control existence, not empty placeholder cards", () => {
  const equippedAction: CharacterContribution = {
    ...daggerAction,
    id: "equipped-dagger-action",
    condition: { kind: "state", key: "equipment.dagger.equipped", operator: "EQUALS", value: true },
  }

  const unequipped = resolveCharacter(
    base,
    { currentHp: 30, tempHp: 0, facts: { "equipment.dagger.equipped": false } },
    [equippedAction],
  )
  assert.deepEqual(unequipped.actions, [])

  const equipped = resolveCharacter(
    base,
    { currentHp: 30, tempHp: 0, facts: { "equipment.dagger.equipped": true } },
    [equippedAction],
  )
  assert.equal(equipped.actions.length, 1)
})

test("source suppression removes an action and REPLACE can install a new mechanic", () => {
  const suppression: CharacterContribution = {
    id: "disable-dagger",
    kind: "suppression",
    operation: "SUPPRESS",
    selector: { kind: "source", sourceId: "dagger-item" },
    source: source("gm-effect", "Предмет отключён"),
  }
  assert.deepEqual(
    resolveCharacter(base, { currentHp: 30, tempHp: 0 }, [daggerAction, suppression]).actions,
    [],
  )

  const replacement: CharacterContribution = {
    id: "cursed-dagger-replacement",
    kind: "grant",
    operation: "REPLACE",
    target: "action",
    key: "dagger",
    priority: 10,
    payload: {
      label: "Проклятый кинжал",
      economy: "bonus_action",
      range: { kind: "melee", reach: 10, unit: "ft" },
      attack: {
        bonus: add(ref("abilities.charisma.modifier"), ref("core.proficiencyBonus")),
      },
      damage: [
        {
          key: "necrotic",
          type: "necrotic",
          dice: { count: 1, sides: 6 },
          modifier: ref("abilities.charisma.modifier"),
        },
      ],
    },
    source: source("curse", "Проклятие"),
  }

  const replaced = resolveCharacter(base, { currentHp: 30, tempHp: 0 }, [daggerAction, replacement])
    .actions[0]!
  assert.equal(replaced.label, "Проклятый кинжал")
  assert.equal(replaced.economy, "bonus_action")
  assert.equal(replaced.attack?.bonus.value, 7)
  assert.equal(replaced.damage[0]?.type, "necrotic")
  assert.equal(replaced.sources.length, 1)
  assert.equal(replaced.sources[0]?.source.id, "curse")
})

test("action formulas can reference resolved resources without creating a cycle", () => {
  const resource: CharacterContribution = {
    id: "heat-resource",
    kind: "grant",
    operation: "GRANT",
    target: "resource",
    key: "heat",
    payload: { max: 5 },
    source: source("heat-engine", "Heat Engine"),
  }
  const action: CharacterContribution = {
    id: "heat-blast",
    kind: "grant",
    operation: "GRANT",
    target: "action",
    key: "heat-blast",
    payload: {
      economy: "action",
      attack: { bonus: ref("resources.heat.current") },
      damage: [{ key: "fire", type: "fire", modifier: ref("resources.heat.max") }],
    },
    source: source("heat-engine", "Heat Engine"),
  }

  const resolved = resolveCharacter(
    base,
    { currentHp: 30, tempHp: 0, resources: { heat: { current: 3 } } },
    [resource, action],
  ).actions[0]!

  assert.equal(resolved.attack?.bonus.value, 3)
  assert.equal(resolved.damage[0]?.modifier.value, 5)
})

test("invalid action mechanics are rejected at the Character Core boundary", () => {
  const invalid: CharacterContribution = {
    id: "broken-action",
    kind: "grant",
    operation: "GRANT",
    target: "action",
    key: "broken",
    payload: {
      economy: "action",
      damage: [{ key: "broken", type: "force", dice: { count: 0, sides: 6 } }],
    },
    source: source("broken-source", "Broken Source"),
  }

  assert.throws(
    () => resolveCharacter(base, { currentHp: 30, tempHp: 0 }, [invalid]),
    CharacterEngineInputError,
  )
})
