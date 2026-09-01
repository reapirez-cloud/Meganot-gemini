import assert from "node:assert/strict"
import test from "node:test"

import {
  GrantConflictError,
  resolveCharacter,
  type BaseCharacter,
  type CharacterContribution,
  type CharacterSource,
  type CharacterState,
} from "../src/character-engine/index.ts"

const base: BaseCharacter = {
  id: "suppress-replace",
  name: "Suppress Replace",
  level: 4,
  abilities: {
    strength: 10,
    dexterity: 12,
    constitution: 10,
    intelligence: 10,
    wisdom: 16,
    charisma: 10,
  },
  baseMaxHp: 20,
  baseSpeed: 30,
  skillProficiencies: { medicine: 2 },
}

const state: CharacterState = { currentHp: 20, tempHp: 0 }
const source = (id: string, name: string, parentSourceId?: string): CharacterSource => ({
  id,
  name,
  ...(parentSourceId ? { parentSourceId } : {}),
})

test("higher-priority SUPPRESS removes a grant deterministically", () => {
  const contributions: CharacterContribution[] = [
    {
      id: "common-grant",
      kind: "grant",
      operation: "GRANT",
      target: "language",
      key: "common",
      priority: 10,
      source: source("race", "Раса"),
    },
    {
      id: "common-suppress",
      kind: "grant",
      operation: "SUPPRESS",
      target: "language",
      key: "common",
      priority: 20,
      source: source("curse", "Проклятие"),
    },
  ]

  for (const ordered of [contributions, contributions.slice().reverse()]) {
    const common = resolveCharacter(base, state, ordered).grants.find(
      (grant) => grant.target === "language" && grant.key === "common",
    )
    assert.equal(common, undefined)
  }
})

test("higher-priority GRANT can restore an identity suppressed at a lower priority", () => {
  const contributions: CharacterContribution[] = [
    {
      id: "common-suppress",
      kind: "grant",
      operation: "SUPPRESS",
      target: "language",
      key: "common",
      priority: 10,
      source: source("curse", "Проклятие"),
    },
    {
      id: "common-restore",
      kind: "grant",
      operation: "GRANT",
      target: "language",
      key: "common",
      priority: 20,
      source: source("boon", "Благословение"),
    },
  ]

  const common = resolveCharacter(base, state, contributions).grants.find(
    (grant) => grant.target === "language" && grant.key === "common",
  )
  assert.ok(common)
  assert.equal(common.sources.length, 1)
  assert.equal(common.sources[0]?.source.name, "Благословение")
})

test("different grant operations at equal priority are an explicit conflict", () => {
  const contributions: CharacterContribution[] = [
    {
      id: "grant",
      kind: "grant",
      operation: "GRANT",
      target: "language",
      key: "common",
      priority: 10,
      source: source("a", "A"),
    },
    {
      id: "suppress",
      kind: "grant",
      operation: "SUPPRESS",
      target: "language",
      key: "common",
      priority: 10,
      source: source("b", "B"),
    },
  ]

  assert.throws(() => resolveCharacter(base, state, contributions), GrantConflictError)
})

test("REPLACE discards lower-priority grant mechanics and provenance", () => {
  const contributions: CharacterContribution[] = [
    {
      id: "old-feature",
      kind: "grant",
      operation: "GRANT",
      target: "feature",
      key: "frog-call",
      payload: { uses: 1 },
      priority: 10,
      source: source("old", "Старая версия"),
    },
    {
      id: "replacement",
      kind: "grant",
      operation: "REPLACE",
      target: "feature",
      key: "frog-call",
      payload: { uses: 2 },
      priority: 20,
      source: source("new", "Новая версия"),
    },
    {
      id: "same-higher-grant",
      kind: "grant",
      operation: "GRANT",
      target: "feature",
      key: "frog-call",
      payload: { uses: 2 },
      priority: 30,
      source: source("boon", "Подтверждающий источник"),
    },
  ]

  const feature = resolveCharacter(base, state, contributions).grants.find(
    (grant) => grant.target === "feature" && grant.key === "frog-call",
  )
  assert.ok(feature)
  assert.deepEqual(feature.payload, { uses: 2 })
  assert.deepEqual(
    feature.sources.map((item) => item.source.name),
    ["Новая версия", "Подтверждающий источник"],
  )
})

test("SUPPRESS can remove Base proficiency and REPLACE can lower Base expertise", () => {
  const normal = resolveCharacter(base, state)
  assert.equal(normal.skills.medicine.proficiencyRank, 2)
  assert.equal(normal.skills.medicine.bonus.value, 7)

  const suppressed = resolveCharacter(base, state, [
    {
      id: "suppress-medicine",
      kind: "grant",
      operation: "SUPPRESS",
      target: "proficiency",
      key: "skill:medicine",
      priority: 10,
      source: source("curse", "Забытая медицина"),
    },
  ])
  assert.equal(suppressed.skills.medicine.proficiencyRank, 0)
  assert.equal(suppressed.skills.medicine.bonus.value, 3)

  const replaced = resolveCharacter(base, state, [
    {
      id: "replace-medicine",
      kind: "grant",
      operation: "REPLACE",
      target: "proficiency",
      key: "skill:medicine",
      payload: { rank: 1 },
      priority: 10,
      source: source("effect", "Ослабленное обучение"),
    },
  ])
  assert.equal(replaced.skills.medicine.proficiencyRank, 1)
  assert.equal(replaced.skills.medicine.bonus.value, 5)
})

test("source-wide suppression disables numeric, formula and grant effects including descendants", () => {
  const item = source("item", "Артефакт")
  const child = source("item-feature", "Свойство артефакта", "item")
  const effects: CharacterContribution[] = [
    {
      id: "item-strength",
      kind: "numeric",
      target: "abilities.strength",
      operation: "ADD",
      value: 4,
      source: item,
    },
    {
      id: "item-language",
      kind: "grant",
      operation: "GRANT",
      target: "language",
      key: "elvish",
      source: item,
    },
    {
      id: "item-ac",
      kind: "formula",
      target: "combat.ac",
      operation: "SET_FORMULA",
      formula: { kind: "literal", value: 17 },
      source: child,
    },
  ]

  const active = resolveCharacter(base, state, effects)
  assert.equal(active.abilities.strength.value, 14)
  assert.equal(active.combat.ac.value, 17)
  assert.ok(active.grants.some((grant) => grant.target === "language" && grant.key === "elvish"))

  const suppressed = resolveCharacter(base, state, [
    ...effects,
    {
      id: "disable-item",
      kind: "suppression",
      operation: "SUPPRESS",
      selector: { kind: "source", sourceId: "item" },
      source: source("antimagic", "Антимагия"),
    },
  ])

  assert.equal(suppressed.abilities.strength.value, 10)
  assert.equal(suppressed.combat.ac.value, 11)
  assert.equal(
    suppressed.grants.some((grant) => grant.target === "language" && grant.key === "elvish"),
    false,
  )
})

test("source-wide suppression can be conditional on raw State facts", () => {
  const effect: CharacterContribution = {
    id: "ring-strength",
    kind: "numeric",
    target: "abilities.strength",
    operation: "ADD",
    value: 2,
    source: source("ring", "Кольцо"),
  }
  const suppression: CharacterContribution = {
    id: "antimagic-zone",
    kind: "suppression",
    operation: "SUPPRESS",
    selector: { kind: "source", sourceId: "ring" },
    condition: {
      kind: "state",
      key: "zone.antimagic",
      operator: "EQUALS",
      value: true,
    },
    source: source("zone", "Антимагическая зона"),
  }

  assert.equal(resolveCharacter(base, state, [effect, suppression]).abilities.strength.value, 12)
  assert.equal(
    resolveCharacter(
      base,
      { ...state, facts: { "zone.antimagic": true } },
      [effect, suppression],
    ).abilities.strength.value,
    10,
  )
})

test("contribution suppression removes only the selected effect", () => {
  const effects: CharacterContribution[] = [
    {
      id: "ring-strength",
      kind: "numeric",
      target: "abilities.strength",
      operation: "ADD",
      value: 2,
      source: source("ring", "Кольцо"),
    },
    {
      id: "ring-language",
      kind: "grant",
      operation: "GRANT",
      target: "language",
      key: "dwarvish",
      source: source("ring", "Кольцо"),
    },
    {
      id: "disable-strength-only",
      kind: "suppression",
      operation: "SUPPRESS",
      selector: { kind: "contribution", contributionId: "ring-strength" },
      source: source("effect", "Точечное подавление"),
    },
  ]

  const resolved = resolveCharacter(base, state, effects)
  assert.equal(resolved.abilities.strength.value, 10)
  assert.ok(resolved.grants.some((grant) => grant.target === "language" && grant.key === "dwarvish"))
})
