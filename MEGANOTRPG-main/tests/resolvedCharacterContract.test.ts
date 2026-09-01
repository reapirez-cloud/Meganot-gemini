import assert from "node:assert/strict"
import test from "node:test"

import {
  RESOLVED_CHARACTER_CONTRACT_VERSION,
  ResolvedCharacterContractError,
  hasResolvedDynamicSection,
  resolveCharacterContract,
  resolvedDynamicSections,
  validateResolvedCharacterContract,
  type BaseCharacter,
  type CharacterContribution,
  type CharacterEngineInput,
  type ResolvedCharacterContract,
} from "../src/character-engine/index.ts"

const base: BaseCharacter = {
  id: "contract-test",
  name: "Contract Test",
  level: 4,
  abilities: {
    strength: 10,
    dexterity: 12,
    constitution: 14,
    intelligence: 8,
    wisdom: 16,
    charisma: 10,
  },
  baseMaxHp: 28,
  baseSpeed: 30,
}

const source = (id: string, name: string) => ({ id, name })

function input(contributions: CharacterContribution[] = []): CharacterEngineInput {
  return {
    base,
    state: { currentHp: 28, tempHp: 0 },
    contributions,
  }
}

test("empty character keeps fixed skeleton and exposes no optional content sections", () => {
  const resolved = resolveCharacterContract(input())

  assert.equal(resolved.contractVersion, RESOLVED_CHARACTER_CONTRACT_VERSION)
  assert.equal(resolved.id, base.id)
  assert.equal(resolved.abilities.wisdom.value, 16)
  assert.equal(resolved.combat.maxHp.value, 28)
  assert.deepEqual(resolved.resources, [])
  assert.deepEqual(resolved.actions, [])
  assert.deepEqual(resolved.spells, [])
  assert.deepEqual(resolved.capabilities, {
    resistances: [],
    immunities: [],
    languages: [],
    proficiencies: [],
    senses: [],
    features: [],
    traits: [],
  })
  assert.deepEqual(resolvedDynamicSections(resolved), [])
})

test("capabilities are normalized for renderer consumption while technical grants remain available", () => {
  const contributions: CharacterContribution[] = [
    {
      id: "common-language",
      kind: "grant",
      operation: "GRANT",
      target: "language",
      key: "common",
      source: source("human", "Человек"),
    },
    {
      id: "fire-resistance",
      kind: "grant",
      operation: "GRANT",
      target: "resistance",
      key: "fire",
      source: source("ring", "Огненное кольцо"),
    },
    {
      id: "darkvision",
      kind: "grant",
      operation: "GRANT",
      target: "sense",
      key: "darkvision",
      payload: { range: 60, unit: "ft" },
      source: source("race", "Раса"),
    },
    {
      id: "brave-feature",
      kind: "grant",
      operation: "GRANT",
      target: "feature",
      key: "brave",
      source: source("background", "Предыстория"),
    },
  ]

  const resolved = resolveCharacterContract(input(contributions))

  assert.equal(resolved.capabilities.languages[0]?.key, "common")
  assert.equal(resolved.capabilities.resistances[0]?.key, "fire")
  assert.equal(resolved.capabilities.senses[0]?.key, "darkvision")
  assert.equal(resolved.capabilities.features[0]?.key, "brave")
  assert.equal(resolved.grants.length, 4)
  assert.deepEqual(resolvedDynamicSections(resolved), [
    "resistances",
    "languages",
    "senses",
    "features",
  ])
})

test("resource action and spell have dedicated sections and are not duplicated as capabilities", () => {
  const contributions: CharacterContribution[] = [
    {
      id: "focus-resource",
      kind: "grant",
      operation: "GRANT",
      target: "resource",
      key: "focus",
      payload: { max: 2 },
      source: source("focus-source", "Фокус"),
    },
    {
      id: "shove-action",
      kind: "grant",
      operation: "GRANT",
      target: "action",
      key: "shove",
      payload: { economy: "action" },
      source: source("action-source", "Толчок"),
    },
    {
      id: "guidance-spell",
      kind: "grant",
      operation: "GRANT",
      target: "spell",
      key: "guidance",
      variantKey: "cleric",
      payload: {
        spell: { name: "Guidance", level: 0 },
        preparation: { mode: "not_required" },
        methods: [{ key: "class-cast", kind: "class", ability: "wisdom" }],
      },
      source: source("cleric", "Клирик"),
    },
  ]

  const resolved = resolveCharacterContract(input(contributions))

  assert.equal(resolved.resources.length, 1)
  assert.equal(resolved.actions.length, 1)
  assert.equal(resolved.spells.length, 1)
  assert.equal(
    Object.values(resolved.capabilities).flat().some(
      (grant) => grant.target === "resource" || grant.target === "action" || grant.target === "spell",
    ),
    false,
  )
  assert.deepEqual(resolvedDynamicSections(resolved), ["resources", "actions", "spells"])
})

test("suppression of the final source removes content and therefore removes the section", () => {
  const contributions: CharacterContribution[] = [
    {
      id: "fire-resistance",
      kind: "grant",
      operation: "GRANT",
      target: "resistance",
      key: "fire",
      source: source("ring", "Огненное кольцо"),
    },
    {
      id: "disable-ring",
      kind: "suppression",
      operation: "SUPPRESS",
      selector: { kind: "source", sourceId: "ring" },
      source: source("gm", "Эффект ГМа"),
    },
  ]

  const resolved = resolveCharacterContract(input(contributions))

  assert.deepEqual(resolved.capabilities.resistances, [])
  assert.equal(hasResolvedDynamicSection(resolved, "resistances"), false)
  assert.deepEqual(resolvedDynamicSections(resolved), [])
})

test("dynamic section output is deterministic under contribution shuffle", () => {
  const grants: CharacterContribution[] = [
    {
      id: "language-b",
      kind: "grant",
      operation: "GRANT",
      target: "language",
      key: "elvish",
      source: source("b", "B"),
    },
    {
      id: "language-a",
      kind: "grant",
      operation: "GRANT",
      target: "language",
      key: "common",
      source: source("a", "A"),
    },
    {
      id: "cold-resistance",
      kind: "grant",
      operation: "GRANT",
      target: "resistance",
      key: "cold",
      source: source("c", "C"),
    },
  ]

  const normal = resolveCharacterContract(input(grants))
  const reversed = resolveCharacterContract(input(grants.slice().reverse()))

  assert.deepEqual(resolvedDynamicSections(normal), resolvedDynamicSections(reversed))
  assert.deepEqual(
    normal.capabilities.languages.map((grant) => grant.key),
    ["common", "elvish"],
  )
  assert.deepEqual(normal.capabilities, reversed.capabilities)
})

test("contract validator rejects malformed renderer-facing capability placement", () => {
  const resolved = resolveCharacterContract(
    input([
      {
        id: "common-language",
        kind: "grant",
        operation: "GRANT",
        target: "language",
        key: "common",
        source: source("human", "Человек"),
      },
    ]),
  )

  const malformed = structuredClone(resolved) as ResolvedCharacterContract
  malformed.capabilities.resistances = malformed.capabilities.languages

  assert.throws(
    () => validateResolvedCharacterContract(malformed),
    ResolvedCharacterContractError,
  )
})
