import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  resolveCharacterContract,
  type CharacterContribution,
  type CharacterEngineInput,
  type CharacterSource,
  type ResolvedGrant,
} from "../src/character-engine/index.ts"

const migration = fs.readFileSync(
  "supabase/migrations/20260828124500_druid_wild_shape_dependency.sql",
  "utf8",
)

const baseSource: CharacterSource = {
  id: "template:class:druid:source:wild-shape",
  name: "Дикая форма",
  sourceType: "class_template",
}
const moonSource: CharacterSource = {
  id: "template:subclass:moon:source:circle-forms",
  name: "Формы круга",
  sourceType: "subclass_template",
}

function trait(
  id: string,
  key: string,
  description: string,
  priority: number,
  source: CharacterSource,
): CharacterContribution {
  return {
    id,
    kind: "grant",
    operation: "REPLACE",
    target: "trait",
    key,
    priority,
    payload: { label: key, description },
    source,
  }
}

function input(contributions: CharacterContribution[]): CharacterEngineInput {
  return {
    base: {
      id: "vita",
      name: "Вита Морр",
      level: 4,
      abilities: {
        strength: 4,
        dexterity: 10,
        constitution: 12,
        intelligence: 10,
        wisdom: 20,
        charisma: 8,
      },
      baseMaxHp: 27,
      baseSpeed: 30,
    },
    state: { currentHp: 27, tempHp: 0, resources: {} },
    contributions,
  }
}

function description(grant: ResolvedGrant | undefined): string {
  assert.ok(grant)
  const payload = grant.payload
  assert.equal(typeof payload, "object")
  assert.ok(payload && !Array.isArray(payload))
  const value = (payload as Record<string, unknown>).description
  assert.equal(typeof value, "string")
  return value as string
}

test("Moon replaces only Wild Shape max CR while base movement progression remains", () => {
  const contributions: CharacterContribution[] = [
    trait("base-cr-2", "class:druid:wild-shape:max-cr", "Максимальный CR зверя: 1/4.", 2, baseSource),
    trait("base-move-2", "class:druid:wild-shape:movement", "Без плавания и полёта.", 2, baseSource),
    trait("base-cr-4", "class:druid:wild-shape:max-cr", "Максимальный CR зверя: 1/2.", 4, baseSource),
    trait("base-move-4", "class:druid:wild-shape:movement", "Плавание разрешено; полёт ещё недоступен.", 4, baseSource),
    trait("moon-cr", "class:druid:wild-shape:max-cr", "Максимальный CR зверя равен уровню друида / 3. На 4 уровне это CR 1.", 100, moonSource),
  ]

  const contract = resolveCharacterContract(input(contributions))
  const maxCr = contract.capabilities.traits.filter((entry) => entry.key === "class:druid:wild-shape:max-cr")
  const movement = contract.capabilities.traits.filter((entry) => entry.key === "class:druid:wild-shape:movement")

  assert.equal(maxCr.length, 1)
  assert.match(description(maxCr[0]), /4 уровне.*CR 1/)
  assert.equal(movement.length, 1)
  assert.match(description(movement[0]), /Плавание разрешено/)
})

test("disabling Circle Forms falls back to the base Druid CR instead of deleting Wild Shape limits", () => {
  const contributions: CharacterContribution[] = [
    trait("base-cr-4", "class:druid:wild-shape:max-cr", "Максимальный CR зверя: 1/2.", 4, baseSource),
    trait("moon-cr", "class:druid:wild-shape:max-cr", "На 4 уровне это CR 1.", 100, moonSource),
    {
      id: "gm:disable-circle-forms",
      kind: "suppression",
      operation: "SUPPRESS",
      selector: { kind: "source", sourceId: moonSource.id, includeDescendants: true },
      source: { id: "gm", name: "ГМ", sourceType: "gm_control" },
    },
  ]

  const contract = resolveCharacterContract(input(contributions))
  const maxCr = contract.capabilities.traits.find((entry) => entry.key === "class:druid:wild-shape:max-cr")
  assert.match(description(maxCr), /1\/2/)
})

test("catalog normalization installs one shared max-CR identity and a separate movement identity", () => {
  assert.match(migration, /class:druid:wild-shape:max-cr/g)
  assert.match(migration, /class:druid:wild-shape:movement/g)
  assert.match(migration, /moon-circle-forms-max-cr/)
  assert.match(migration, /'grantOperation','REPLACE'/)
  assert.match(migration, /'priority',100/)
  assert.match(migration, /zzz_campaigns_normalize_druid_wild_shape_dependencies/)
})
