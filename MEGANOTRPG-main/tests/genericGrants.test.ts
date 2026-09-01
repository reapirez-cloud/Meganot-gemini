import assert from "node:assert/strict"
import test from "node:test"

import {
  GrantConflictError,
  resolveCharacter,
  type BaseCharacter,
  type CharacterContribution,
  type CharacterState,
} from "../src/character-engine/index.ts"

const base: BaseCharacter = {
  id: "generic-grants",
  name: "Generic Grants",
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

const state: CharacterState = { currentHp: 20, tempHp: 0 }
const source = (id: string, name: string, sourceType?: string) => ({ id, name, sourceType })

test("equal set-like grants merge into one result and retain every source", () => {
  const contributions: CharacterContribution[] = [
    {
      id: "common-race",
      kind: "grant",
      operation: "GRANT",
      target: "language",
      key: "common",
      source: source("race", "Раса", "race"),
    },
    {
      id: "common-background",
      kind: "grant",
      operation: "GRANT",
      target: "language",
      key: "common",
      source: source("background", "Предыстория", "background"),
    },
  ]

  const common = resolveCharacter(base, state, contributions).grants.filter(
    (grant) => grant.target === "language" && grant.key === "common",
  )

  assert.equal(common.length, 1)
  assert.equal(common[0]?.sources.length, 2)
})

test("resistance and immunity are distinct facts even for the same damage key", () => {
  const contributions: CharacterContribution[] = [
    {
      id: "fire-resistance",
      kind: "grant",
      operation: "GRANT",
      target: "resistance",
      key: "fire",
      source: source("resistance", "Сопротивление"),
    },
    {
      id: "fire-immunity",
      kind: "grant",
      operation: "GRANT",
      target: "immunity",
      key: "fire",
      source: source("immunity", "Иммунитет"),
    },
  ]

  const grants = resolveCharacter(base, state, contributions).grants
  assert.ok(grants.some((grant) => grant.target === "resistance" && grant.key === "fire"))
  assert.ok(grants.some((grant) => grant.target === "immunity" && grant.key === "fire"))
})

test("skill proficiency grants participate in derived skill math and expertise wins naturally", () => {
  const proficiency: CharacterContribution = {
    id: "medicine-proficiency",
    kind: "grant",
    operation: "GRANT",
    target: "proficiency",
    key: "skill:medicine",
    payload: { rank: 1 },
    source: source("skill-training", "Обучение медицине"),
  }
  const expertise: CharacterContribution = {
    id: "medicine-expertise",
    kind: "grant",
    operation: "GRANT",
    target: "proficiency",
    key: "skill:medicine",
    payload: { rank: 2 },
    source: source("skill-expert", "Эксперт медицины"),
  }

  const trained = resolveCharacter(base, state, [proficiency])
  assert.equal(trained.skills.medicine.proficiencyRank, 1)
  assert.equal(trained.skills.medicine.bonus.value, 6)
  assert.equal(trained.skills.medicine.proficiencySources.length, 1)

  const expert = resolveCharacter(base, state, [proficiency, expertise])
  assert.equal(expert.skills.medicine.proficiencyRank, 2)
  assert.equal(expert.skills.medicine.bonus.value, 8)
  assert.equal(expert.skills.medicine.proficiencySources.length, 2)

  const afterExpertiseRemoved = resolveCharacter(base, state, [proficiency])
  assert.equal(afterExpertiseRemoved.skills.medicine.proficiencyRank, 1)
  assert.equal(afterExpertiseRemoved.skills.medicine.bonus.value, 6)
})

test("saving throw proficiency grants use the same generic proficiency target", () => {
  const contributions: CharacterContribution[] = [
    {
      id: "wis-save",
      kind: "grant",
      operation: "GRANT",
      target: "proficiency",
      key: "savingThrow:wisdom",
      payload: { rank: 1 },
      source: source("save-source", "Владение спасброском"),
    },
  ]

  const resolved = resolveCharacter(base, state, contributions)
  assert.equal(resolved.savingThrows.wisdom.proficiencyRank, 1)
  assert.equal(resolved.savingThrows.wisdom.bonus.value, 6)
})

test("sense grants merge by strongest range instead of duplicating the sense", () => {
  const contributions: CharacterContribution[] = [
    {
      id: "darkvision-60",
      kind: "grant",
      operation: "GRANT",
      target: "sense",
      key: "darkvision",
      payload: { range: 60, unit: "ft" },
      source: source("race", "Расовое тёмное зрение"),
    },
    {
      id: "darkvision-120",
      kind: "grant",
      operation: "GRANT",
      target: "sense",
      key: "darkvision",
      payload: { range: 120, unit: "ft" },
      source: source("feature", "Усиленное тёмное зрение"),
    },
  ]

  const darkvision = resolveCharacter(base, state, contributions).grants.filter(
    (grant) => grant.target === "sense" && grant.key === "darkvision",
  )
  assert.equal(darkvision.length, 1)
  assert.deepEqual(darkvision[0]?.payload, { range: 120, unit: "ft" })
  assert.equal(darkvision[0]?.sources.length, 2)
})

test("equivalent structured payloads merge regardless of object key insertion order", () => {
  const contributions: CharacterContribution[] = [
    {
      id: "feature-a",
      kind: "grant",
      operation: "GRANT",
      target: "feature",
      key: "frog-friend",
      payload: { uses: 1, reset: "long-rest" },
      source: source("a", "Источник A"),
    },
    {
      id: "feature-b",
      kind: "grant",
      operation: "GRANT",
      target: "feature",
      key: "frog-friend",
      payload: { reset: "long-rest", uses: 1 },
      source: source("b", "Источник B"),
    },
  ]

  const feature = resolveCharacter(base, state, contributions).grants.find(
    (grant) => grant.target === "feature" && grant.key === "frog-friend",
  )
  assert.ok(feature)
  assert.equal(feature.sources.length, 2)
})

test("different mechanics under one grant identity are an explicit conflict", () => {
  const contributions: CharacterContribution[] = [
    {
      id: "feature-a",
      kind: "grant",
      operation: "GRANT",
      target: "feature",
      key: "frog-friend",
      payload: { uses: 1 },
      source: source("a", "Источник A"),
    },
    {
      id: "feature-b",
      kind: "grant",
      operation: "GRANT",
      target: "feature",
      key: "frog-friend",
      payload: { uses: 2 },
      source: source("b", "Источник B"),
    },
  ]

  assert.throws(() => resolveCharacter(base, state, contributions), GrantConflictError)
})

test("mechanically distinct variants remain separate while the identity stays shared", () => {
  const contributions: CharacterContribution[] = [
    {
      id: "feature-passive",
      kind: "grant",
      operation: "GRANT",
      target: "trait",
      key: "frog-friend",
      variantKey: "passive",
      payload: { attitude: "friendly" },
      source: source("frog-school", "Жабья школа"),
    },
    {
      id: "feature-call",
      kind: "grant",
      operation: "GRANT",
      target: "trait",
      key: "frog-friend",
      variantKey: "call-once",
      payload: { uses: 1 },
      source: source("frog-school", "Жабья школа"),
    },
  ]

  const frogTraits = resolveCharacter(base, state, contributions).grants.filter(
    (grant) => grant.target === "trait" && grant.key === "frog-friend",
  )
  assert.equal(frogTraits.length, 2)
})
