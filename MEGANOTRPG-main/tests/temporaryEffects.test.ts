import assert from "node:assert/strict"
import test from "node:test"

import {
  TemporaryEffectEngineError,
  applyCharacterEvent,
  createTemporaryEffectController,
  createTemporaryEffectLifetime,
  eventSequence,
  isTemporaryEffectExpired,
  remainingTemporaryEffectEvents,
  resolveCharacter,
  type BaseCharacter,
  type CharacterContribution,
  type CharacterSource,
  type CharacterState,
} from "../src/character-engine/index.ts"

const base: BaseCharacter = {
  id: "temporary-effects-test",
  name: "Temporary Effects Test",
  level: 4,
  abilities: {
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
  },
  baseMaxHp: 24,
  baseSpeed: 30,
}

const limpSource: CharacterSource = {
  id: "gm-effect-limp",
  name: "Хромота",
  sourceType: "gm_effect",
}

function limpContribution(): CharacterContribution {
  return {
    id: "limp-speed",
    kind: "numeric",
    target: "combat.speed",
    operation: "SUBTRACT",
    value: 10,
    source: limpSource,
  }
}

test("GM effect can last for exactly three long rests", () => {
  const initial: CharacterState = { currentHp: 24, tempHp: 0 }
  const controller = createTemporaryEffectController({
    id: "limp-expiration",
    effectSource: limpSource,
    state: initial,
    event: "long_rest",
    durationEvents: 3,
  })
  const contributions = [limpContribution(), controller.suppression]

  assert.equal(resolveCharacter(base, initial, contributions).combat.speed.value, 20)
  assert.equal(remainingTemporaryEffectEvents(initial, controller.lifetime), 3)

  const afterOne = applyCharacterEvent(initial, [], "long_rest")
  assert.equal(eventSequence(afterOne, "long_rest"), 1)
  assert.equal(resolveCharacter(base, afterOne, contributions).combat.speed.value, 20)
  assert.equal(remainingTemporaryEffectEvents(afterOne, controller.lifetime), 2)

  const afterTwo = applyCharacterEvent(afterOne, [], "long_rest")
  assert.equal(resolveCharacter(base, afterTwo, contributions).combat.speed.value, 20)
  assert.equal(remainingTemporaryEffectEvents(afterTwo, controller.lifetime), 1)

  const afterThree = applyCharacterEvent(afterTwo, [], "long_rest")
  assert.equal(eventSequence(afterThree, "long_rest"), 3)
  assert.equal(resolveCharacter(base, afterThree, contributions).combat.speed.value, 30)
  assert.equal(remainingTemporaryEffectEvents(afterThree, controller.lifetime), 0)
  assert.equal(isTemporaryEffectExpired(afterThree, controller.lifetime), true)
})

test("short-rest and long-rest lifetimes use independent counters", () => {
  const initial: CharacterState = { currentHp: 24, tempHp: 0 }
  const controller = createTemporaryEffectController({
    id: "limp-short-expiration",
    effectSource: limpSource,
    state: initial,
    event: "short_rest",
  })
  const contributions = [limpContribution(), controller.suppression]

  const afterLongRest = applyCharacterEvent(initial, [], "long_rest")
  assert.equal(resolveCharacter(base, afterLongRest, contributions).combat.speed.value, 20)
  assert.equal(eventSequence(afterLongRest, "short_rest"), 0)

  const afterShortRest = applyCharacterEvent(afterLongRest, [], "short_rest")
  assert.equal(resolveCharacter(base, afterShortRest, contributions).combat.speed.value, 30)
})

test("dawn can represent calendar-like day expiration independently from resting", () => {
  const initial: CharacterState = { currentHp: 24, tempHp: 0 }
  const lifetime = createTemporaryEffectLifetime(initial, "dawn", 3)

  const afterRest = applyCharacterEvent(initial, [], "long_rest")
  assert.equal(remainingTemporaryEffectEvents(afterRest, lifetime), 3)

  const dayOne = applyCharacterEvent(afterRest, [], "dawn")
  const dayTwo = applyCharacterEvent(dayOne, [], "dawn")
  const dayThree = applyCharacterEvent(dayTwo, [], "dawn")
  assert.equal(isTemporaryEffectExpired(dayTwo, lifetime), false)
  assert.equal(isTemporaryEffectExpired(dayThree, lifetime), true)
})

test("one long-rest event recovers resources and expires effects in the same immutable transition", () => {
  const resourceSource: CharacterSource = { id: "resource-source", name: "Класс" }
  const resourceGrant: CharacterContribution = {
    id: "class-resource",
    kind: "grant",
    operation: "GRANT",
    target: "resource",
    key: "class-charge",
    payload: {
      max: 2,
      recharge: { triggers: ["long_rest"], restore: "full" },
    },
    source: resourceSource,
  }
  const initial: CharacterState = {
    currentHp: 24,
    tempHp: 0,
    resources: { "class-charge": { current: 0 } },
  }
  const controller = createTemporaryEffectController({
    id: "limp-next-long-rest",
    effectSource: limpSource,
    state: initial,
    event: "long_rest",
  })
  const contributions = [resourceGrant, limpContribution(), controller.suppression]
  const before = resolveCharacter(base, initial, contributions)

  assert.equal(before.resources[0]?.current, 0)
  assert.equal(before.combat.speed.value, 20)

  const afterState = applyCharacterEvent(initial, before.resources, "long_rest")
  const after = resolveCharacter(base, afterState, contributions)

  assert.equal(after.resources[0]?.current, 2)
  assert.equal(after.combat.speed.value, 30)
  assert.equal(eventSequence(afterState, "long_rest"), 1)
  assert.equal(initial.resources?.["class-charge"]?.current, 0)
  assert.equal(initial.facts?.["rest.long.sequence"], undefined)
})

test("a temporary source may contain several mechanics and they expire together", () => {
  const initial: CharacterState = { currentHp: 24, tempHp: 0 }
  const controller = createTemporaryEffectController({
    id: "gm-buff-expiration",
    effectSource: limpSource,
    state: initial,
    event: "long_rest",
  })
  const contributions: CharacterContribution[] = [
    limpContribution(),
    {
      id: "limp-feature",
      kind: "grant",
      operation: "GRANT",
      target: "feature",
      key: "limping",
      source: limpSource,
    },
    controller.suppression,
  ]

  const before = resolveCharacter(base, initial, contributions)
  assert.equal(before.combat.speed.value, 20)
  assert.equal(before.grants.some((grant) => grant.key === "limping"), true)

  const afterState = applyCharacterEvent(initial, [], "long_rest")
  const after = resolveCharacter(base, afterState, contributions)
  assert.equal(after.combat.speed.value, 30)
  assert.equal(after.grants.some((grant) => grant.key === "limping"), false)
})

test("invalid temporary-effect duration and corrupted event counters are rejected", () => {
  const clean: CharacterState = { currentHp: 24, tempHp: 0 }
  assert.throws(
    () => createTemporaryEffectLifetime(clean, "long_rest", 0),
    TemporaryEffectEngineError,
  )

  const corrupted: CharacterState = {
    currentHp: 24,
    tempHp: 0,
    facts: { "rest.long.sequence": 1.5 },
  }
  assert.throws(() => eventSequence(corrupted, "long_rest"), TemporaryEffectEngineError)
})
