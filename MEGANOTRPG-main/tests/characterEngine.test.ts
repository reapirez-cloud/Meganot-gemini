import assert from "node:assert/strict"
import test from "node:test"

import {
  resolveCharacter,
  type BaseCharacter,
  type CharacterContribution,
  type CharacterState,
} from "../src/character-engine/index.ts"

const williamBase: BaseCharacter = {
  id: "f6647875-166c-42fc-a997-0f35f3dd7a4e",
  name: "Вильям Кидд",
  level: 4,
  abilities: {
    strength: 8,
    dexterity: 8,
    constitution: 7,
    intelligence: 10,
    wisdom: 18,
    charisma: 19,
  },
  baseMaxHp: 19,
  baseSpeed: 30,
  skillProficiencies: {
    deception: 2,
    persuasion: 2,
    religion: 1,
  },
}

const fullHealth: CharacterState = {
  currentHp: 19,
  tempHp: 0,
}

const source = (id: string, name: string) => ({ id, name })

test("William Kidd is resolved from base values instead of stale derived sheet numbers", () => {
  const resolved = resolveCharacter(williamBase, fullHealth)

  assert.equal(resolved.proficiencyBonus.value, 2)
  assert.equal(resolved.abilities.wisdom.modifier, 4)
  assert.equal(resolved.abilities.charisma.modifier, 4)
  assert.equal(resolved.combat.initiative.value, -1)
  assert.equal(resolved.passives.perception.value, 14)
  assert.equal(resolved.skills.deception.bonus.value, 8)
  assert.equal(resolved.skills.persuasion.bonus.value, 8)
  assert.equal(resolved.skills.religion.bonus.value, 2)

  // The old stored DC 9 is deliberately not an input to the engine.
  assert.equal(resolved.spellcasting.byAbility.wisdom.saveDc, 14)
  assert.equal(resolved.spellcasting.byAbility.wisdom.attackBonus, 6)
})

test("numeric sources recompute cleanly when a source is added or removed", () => {
  const frogSchool = source("frog-school", "Школа болотной магии")
  const contributions: CharacterContribution[] = [
    {
      id: "frog-int",
      kind: "numeric",
      target: "abilities.intelligence",
      operation: "ADD",
      value: 1,
      source: frogSchool,
    },
    {
      id: "frog-wis",
      kind: "numeric",
      target: "abilities.wisdom",
      operation: "SUBTRACT",
      value: 1,
      source: frogSchool,
    },
  ]

  const withSchool = resolveCharacter(williamBase, fullHealth, contributions)
  assert.equal(withSchool.abilities.intelligence.value, 11)
  assert.equal(withSchool.abilities.wisdom.value, 17)
  assert.equal(withSchool.abilities.intelligence.sources[0]?.source.name, "Школа болотной магии")

  const withoutSchool = resolveCharacter(
    williamBase,
    fullHealth,
    contributions.filter((contribution) => contribution.source.id !== frogSchool.id),
  )
  assert.equal(withoutSchool.abilities.intelligence.value, 10)
  assert.equal(withoutSchool.abilities.wisdom.value, 18)
})

test("equal boolean-like grants merge without stacking while preserving every active source", () => {
  const contributions: CharacterContribution[] = [
    {
      id: "race-fire-resistance",
      kind: "grant",
      operation: "GRANT",
      target: "resistance",
      key: "fire",
      source: source("race", "Раса"),
    },
    {
      id: "bloodied-fire-resistance",
      kind: "grant",
      operation: "GRANT",
      target: "resistance",
      key: "fire",
      condition: { kind: "hp_below_percent", percent: 50 },
      source: source("bloodied-feature", "Жар крови"),
    },
  ]

  const full = resolveCharacter(williamBase, fullHealth, contributions)
  const fullFire = full.grants.find(
    (grant) => grant.target === "resistance" && grant.key === "fire",
  )
  assert.ok(fullFire)
  assert.equal(fullFire.sources.length, 1)

  const bloodied = resolveCharacter(
    williamBase,
    { currentHp: 9, tempHp: 0 },
    contributions,
  )
  const bloodiedFire = bloodied.grants.find(
    (grant) => grant.target === "resistance" && grant.key === "fire",
  )
  assert.ok(bloodiedFire)
  assert.equal(bloodiedFire.sources.length, 2)

  // Two YES answers still produce one final resistance entry.
  assert.equal(
    bloodied.grants.filter((grant) => grant.target === "resistance" && grant.key === "fire").length,
    1,
  )
})

test("one spell card contains distinct access paths while equal access grants merge provenance", () => {
  const spell = { name: "Cure Wounds", level: 1, school: "evocation" }
  const clericAccess = {
    spell,
    preparation: { mode: "prepared" as const, defaultPrepared: true },
    methods: [{ key: "slots", kind: "spell_slots", ability: "wisdom" as const }],
  }

  const contributions: CharacterContribution[] = [
    {
      id: "cleric-cure-wounds",
      kind: "grant",
      operation: "GRANT",
      target: "spell",
      key: "cure-wounds",
      variantKey: "cleric",
      payload: clericAccess,
      source: source("cleric", "Клирик"),
    },
    {
      id: "second-cleric-source",
      kind: "grant",
      operation: "GRANT",
      target: "spell",
      key: "cure-wounds",
      variantKey: "cleric",
      payload: clericAccess,
      source: source("blessing", "Благословение"),
    },
    {
      id: "frog-cure-wounds",
      kind: "grant",
      operation: "GRANT",
      target: "spell",
      key: "cure-wounds",
      variantKey: "frog-daily",
      payload: {
        spell,
        preparation: { mode: "not_required" },
        methods: [{ key: "free", kind: "free_use", ability: "wisdom" }],
      },
      source: source("frog", "Жабья школа"),
    },
    {
      id: "staff-cure-wounds",
      kind: "grant",
      operation: "GRANT",
      target: "spell",
      key: "cure-wounds",
      variantKey: "staff-charges",
      payload: {
        spell,
        preparation: { mode: "not_required" },
        methods: [
          {
            key: "charges",
            kind: "item_charges",
            resourceOptions: [
              {
                key: "base",
                castLevel: 1,
                costs: [{ key: "staff-charge", amount: 2 }],
              },
            ],
          },
        ],
      },
      source: source("staff", "Посох"),
    },
  ]

  const resolved = resolveCharacter(williamBase, fullHealth, contributions)
  assert.equal(resolved.spells.length, 1)
  const cureWounds = resolved.spells[0]!
  assert.equal(cureWounds.key, "cure-wounds")
  assert.equal(cureWounds.accesses.length, 3)
  assert.deepEqual(
    cureWounds.accesses.map((access) => access.key).sort(),
    ["cleric", "frog-daily", "staff-charges"],
  )

  const cleric = cureWounds.accesses.find((access) => access.key === "cleric")
  assert.ok(cleric)
  assert.equal(cleric.sources.length, 2)
  assert.equal(cleric.methods[0]?.attackBonus?.value, 6)
  assert.equal(cleric.methods[0]?.saveDc?.value, 14)
})

test("priority makes mixed numeric operations deterministic", () => {
  const contributions: CharacterContribution[] = [
    {
      id: "feat-strength",
      kind: "numeric",
      target: "abilities.strength",
      operation: "ADD",
      value: 2,
      priority: 10,
      source: source("feat", "Фит"),
    },
    {
      id: "belt-strength",
      kind: "numeric",
      target: "abilities.strength",
      operation: "MIN",
      value: 19,
      priority: 20,
      source: source("belt", "Пояс"),
    },
    {
      id: "curse-strength",
      kind: "numeric",
      target: "abilities.strength",
      operation: "SUBTRACT",
      value: 4,
      priority: 30,
      source: source("curse", "Проклятие"),
    },
  ]

  const resolved = resolveCharacter(williamBase, fullHealth, contributions)
  assert.equal(resolved.abilities.strength.value, 15)

  const withoutBelt = resolveCharacter(
    williamBase,
    fullHealth,
    contributions.filter((contribution) => contribution.source.id !== "belt"),
  )
  assert.equal(withoutBelt.abilities.strength.value, 6)
})
