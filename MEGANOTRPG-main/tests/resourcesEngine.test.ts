import assert from "node:assert/strict"
import test from "node:test"

import {
  CharacterEngineInputError,
  ResourceEngineError,
  applyResourceRecovery,
  resolveCharacter,
  resourceMaxTarget,
  spendResource,
  type BaseCharacter,
  type CharacterContribution,
  type CharacterState,
} from "../src/character-engine/index.ts"

const base: BaseCharacter = {
  id: "resource-test",
  name: "Resource Test",
  level: 4,
  abilities: {
    strength: 8,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 18,
    charisma: 10,
  },
  baseMaxHp: 20,
  baseSpeed: 30,
}

const source = (id: string, name: string) => ({ id, name })

const channelDivinity: CharacterContribution = {
  id: "channel-divinity-resource",
  kind: "grant",
  operation: "GRANT",
  target: "resource",
  key: "channel-divinity",
  payload: {
    max: { kind: "reference", key: "core.proficiencyBonus" },
    recharge: {
      triggers: ["short_rest", "long_rest"],
      restore: "full",
    },
  },
  source: source("cleric", "Клирик"),
}

test("orphaned runtime resource state does not create a visible resolved resource", () => {
  const state: CharacterState = {
    currentHp: 20,
    tempHp: 0,
    resources: { ghost: { current: 7 } },
  }

  const resolved = resolveCharacter(base, state)
  assert.deepEqual(resolved.resources, [])
})

test("resource maximum is resolved from definition and ignores deprecated state.max", () => {
  const state: CharacterState = {
    currentHp: 20,
    tempHp: 0,
    resources: {
      "channel-divinity": { current: 1, max: 999 },
    },
  }

  const resolved = resolveCharacter(base, state, [channelDivinity])
  assert.equal(resolved.resources.length, 1)
  assert.equal(resolved.resources[0]?.max.value, 2)
  assert.equal(resolved.resources[0]?.current, 1)
  assert.equal(resolved.resources[0]?.stateKey, "channel-divinity")
})

test("resource max accepts normal numeric contributions and retains their provenance", () => {
  const bonus: CharacterContribution = {
    id: "extra-channel-use",
    kind: "numeric",
    target: resourceMaxTarget("channel-divinity"),
    operation: "ADD",
    value: 1,
    source: source("boon", "Благословение"),
  }

  const resolved = resolveCharacter(
    base,
    { currentHp: 20, tempHp: 0, resources: { "channel-divinity": { current: 2 } } },
    [channelDivinity, bonus],
  )
  const resource = resolved.resources[0]!
  assert.equal(resource.max.baseValue, 2)
  assert.equal(resource.max.value, 3)
  assert.equal(resource.max.sources[0]?.source.name, "Благословение")
})

test("missing runtime state uses initial policy and defaults to full", () => {
  const emptyResource: CharacterContribution = {
    id: "empty-resource",
    kind: "grant",
    operation: "GRANT",
    target: "resource",
    key: "empty-start",
    payload: { max: 4, initial: "empty" },
    source: source("feature", "Особенность"),
  }
  const numericInitial: CharacterContribution = {
    id: "numeric-initial",
    kind: "grant",
    operation: "GRANT",
    target: "resource",
    key: "partial-start",
    payload: { max: 5, initial: 2 },
    source: source("feature-2", "Особенность 2"),
  }

  const resolved = resolveCharacter(
    base,
    { currentHp: 20, tempHp: 0 },
    [channelDivinity, emptyResource, numericInitial],
  )
  const byKey = new Map(resolved.resources.map((resource) => [resource.key, resource]))
  assert.equal(byKey.get("channel-divinity")?.current, 2)
  assert.equal(byKey.get("empty-start")?.current, 0)
  assert.equal(byKey.get("partial-start")?.current, 2)
})

test("temporary lower maximum clamps resolved current without mutating runtime state", () => {
  const fixed: CharacterContribution = {
    id: "charges",
    kind: "grant",
    operation: "GRANT",
    target: "resource",
    key: "charges",
    payload: { max: 3 },
    source: source("item", "Предмет"),
  }
  const state: CharacterState = {
    currentHp: 20,
    tempHp: 0,
    resources: { charges: { current: 5 } },
  }
  const snapshot = structuredClone(state)

  const resource = resolveCharacter(base, state, [fixed]).resources[0]!
  assert.equal(resource.rawCurrent, 5)
  assert.equal(resource.current, 3)
  assert.deepEqual(state, snapshot)
})

test("full and partial recovery use explicit triggers and never mutate input state", () => {
  const dawnCharges: CharacterContribution = {
    id: "dawn-charges",
    kind: "grant",
    operation: "GRANT",
    target: "resource",
    key: "staff-charges",
    payload: {
      max: 6,
      recharge: { triggers: ["dawn"], restore: "amount", amount: 2 },
    },
    source: source("staff", "Посох"),
  }
  const state: CharacterState = {
    currentHp: 20,
    tempHp: 0,
    resources: {
      "channel-divinity": { current: 0 },
      "staff-charges": { current: 3 },
    },
  }
  const resolved = resolveCharacter(base, state, [channelDivinity, dawnCharges])

  const afterShortRest = applyResourceRecovery(state, resolved.resources, "short_rest")
  assert.equal(afterShortRest.resources?.["channel-divinity"]?.current, 2)
  assert.equal(afterShortRest.resources?.["staff-charges"]?.current, 3)

  const afterDawn = applyResourceRecovery(state, resolved.resources, "dawn")
  assert.equal(afterDawn.resources?.["channel-divinity"]?.current, 0)
  assert.equal(afterDawn.resources?.["staff-charges"]?.current, 5)

  assert.equal(state.resources?.["channel-divinity"]?.current, 0)
  assert.equal(state.resources?.["staff-charges"]?.current, 3)
})

test("spending a resource is immutable and refuses overspend", () => {
  const state: CharacterState = {
    currentHp: 20,
    tempHp: 0,
    resources: { "channel-divinity": { current: 2 } },
  }
  const resource = resolveCharacter(base, state, [channelDivinity]).resources[0]!
  const next = spendResource(state, resource, 1)

  assert.equal(next.resources?.["channel-divinity"]?.current, 1)
  assert.equal(state.resources?.["channel-divinity"]?.current, 2)
  assert.throws(() => spendResource(state, resource, 3), ResourceEngineError)
})

test("resource REPLACE changes its definition while retaining the same identity", () => {
  const replacement: CharacterContribution = {
    id: "channel-replacement",
    kind: "grant",
    operation: "REPLACE",
    target: "resource",
    key: "channel-divinity",
    priority: 10,
    payload: {
      max: 5,
      recharge: { triggers: ["long_rest"], restore: "full" },
    },
    source: source("replacement", "Замена правила"),
  }

  const resource = resolveCharacter(
    base,
    { currentHp: 20, tempHp: 0, resources: { "channel-divinity": { current: 1 } } },
    [channelDivinity, replacement],
  ).resources[0]!

  assert.equal(resource.max.value, 5)
  assert.deepEqual(resource.recharge.triggers, ["long_rest"])
  assert.equal(resource.sources.length, 1)
  assert.equal(resource.sources[0]?.source.name, "Замена правила")
})

test("source-wide suppression removes the resource completely", () => {
  const suppression: CharacterContribution = {
    id: "suppress-cleric",
    kind: "suppression",
    operation: "SUPPRESS",
    selector: { kind: "source", sourceId: "cleric" },
    source: source("effect", "Подавление"),
  }

  const resolved = resolveCharacter(
    base,
    { currentHp: 20, tempHp: 0, resources: { "channel-divinity": { current: 1 } } },
    [channelDivinity, suppression],
  )
  assert.deepEqual(resolved.resources, [])
})

test("invalid resource definitions are rejected at the engine boundary", () => {
  const invalid: CharacterContribution = {
    id: "invalid-resource",
    kind: "grant",
    operation: "GRANT",
    target: "resource",
    key: "broken",
    payload: {
      max: 2,
      recharge: { triggers: ["never", "long_rest"], restore: "full" },
    },
    source: source("broken", "Сломанный ресурс"),
  }

  assert.throws(
    () => resolveCharacter(base, { currentHp: 20, tempHp: 0 }, [invalid]),
    CharacterEngineInputError,
  )
})
