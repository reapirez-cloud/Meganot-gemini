import assert from "node:assert/strict"
import test from "node:test"

import { resolveCharacterContract, type CharacterContribution, type CharacterEngineInput, type ResolvedCharacterContract } from "../src/character-engine/index.ts"
import { buildChatActionModel } from "../src/components/chat/chatActionModel.ts"

const classSource = { id: "template:class:monk:v1:base", name: "Монах", sourceType: "class_template" }
const subclassSource = { id: "template:subclass:cleric-life:v1:base", name: "Домен жизни", sourceType: "subclass_template" }
const clericSource = { id: "template:class:cleric:v1:base", name: "Жрец", sourceType: "class_template" }
const learnedSpellSource = { id: "legacy-spell-source:fireball", name: "Книга заклинаний", sourceType: "legacy_spell" }
const staffSource = { id: "item:fire-staff", name: "Посох Огня", sourceType: "inventory_item" }
const swordSource = { id: "item:sword", name: "Меч", sourceType: "inventory_item" }

function contract() {
  const contributions: CharacterContribution[] = [
    { id: "ki", kind: "grant", operation: "GRANT", target: "resource", key: "ki", payload: { max: 5, label: "Ци", recharge: { triggers: ["short_rest"], restore: "full" } }, source: classSource },
    { id: "flurry", kind: "grant", operation: "GRANT", target: "action", key: "flurry", payload: { label: "Шквал ударов", economy: "bonus_action", resourceCosts: [{ key: "ki", amount: 1 }] }, source: classSource },
    { id: "sword", kind: "grant", operation: "GRANT", target: "action", key: "sword", payload: { label: "Меч", economy: "action", attack: { bonus: { kind: "reference", key: "core.proficiencyBonus" } }, damage: [{ key: "slash", type: "slashing", dice: { count: 1, sides: 8 } }] }, source: swordSource },
    { id: "charges", kind: "grant", operation: "GRANT", target: "resource", key: "staff_charges", payload: { max: 10, label: "Заряды посоха", recharge: { triggers: ["dawn"], restore: "amount", amount: 2 } }, source: staffSource },
    { id: "staff-action", kind: "grant", operation: "GRANT", target: "action", key: "fire-wave", payload: { label: "Огненная волна", economy: "action", damage: [{ key: "fire", type: "fire", dice: { count: 3, sides: 6 } }], resourceCosts: [{ key: "staff_charges", amount: 2 }] }, source: staffSource },
    { id: "staff-spell", kind: "grant", operation: "GRANT", target: "spell", key: "fireball", variantKey: "staff", payload: { spell: { name: "Огненный шар", level: 3 }, preparation: { mode: "not_required" }, methods: [{ key: "staff", kind: "item", requiresPrepared: false, resourceOptions: [{ key: "cast", castLevel: 3, costs: [{ key: "staff_charges", amount: 3 }] }] }] }, source: staffSource },
  ]
  const input: CharacterEngineInput = {
    base: { id: "hero", name: "Ниель", level: 5, abilities: { strength: 14, dexterity: 18, constitution: 14, intelligence: 10, wisdom: 16, charisma: 10 }, baseMaxHp: 30, baseSpeed: 30 },
    state: { currentHp: 30, tempHp: 0, resources: { ki: { current: 3 }, staff_charges: { current: 4 } } },
    contributions,
  }
  return resolveCharacterContract(input)
}

function subclassSpellContract() {
  const contributions: CharacterContribution[] = [
    {
      id: "cleric-slot-2",
      kind: "grant",
      operation: "GRANT",
      target: "resource",
      key: "spell_slot_2",
      payload: { max: 3, label: "Ячейки 2 уровня", recharge: { triggers: ["long_rest"], restore: "full" } },
      source: clericSource,
    },
    {
      id: "life-domain-aid",
      kind: "grant",
      operation: "GRANT",
      target: "spell",
      key: "spell:aid",
      variantKey: "life-domain:aid",
      payload: {
        spell: { name: "Подмога", level: 2, school: "Abjuration" },
        preparation: { mode: "always_prepared" },
        methods: [{
          key: "life-domain-access",
          kind: "class_spell",
          ability: "wisdom",
          requiresPrepared: false,
          resourceOptions: [{ key: "slot-2", castLevel: 2, costs: [{ key: "spell_slot_2", amount: 1 }] }],
        }],
      },
      source: subclassSource,
    },
  ]
  return resolveCharacterContract({
    base: { id: "cleric", name: "Жрец", level: 5, abilities: { strength: 10, dexterity: 10, constitution: 14, intelligence: 10, wisdom: 18, charisma: 10 }, baseMaxHp: 30, baseSpeed: 30 },
    state: { currentHp: 30, tempHp: 0, resources: { spell_slot_2: { current: 2 } } },
    contributions,
  })
}

function routedSpellContract(): ResolvedCharacterContract {
  const contributions: CharacterContribution[] = [
    {
      id: "slot-3",
      kind: "grant",
      operation: "GRANT",
      target: "resource",
      key: "spell_slot_3",
      payload: { max: 2, label: "Ячейки 3 уровня", recharge: { triggers: ["long_rest"], restore: "full" } },
      source: clericSource,
    },
    {
      id: "learned-fireball",
      kind: "grant",
      operation: "GRANT",
      target: "spell",
      key: "spell:fireball",
      variantKey: "legacy-fireball",
      payload: {
        spell: { name: "Огненный шар", level: 3, school: "Evocation" },
        preparation: { mode: "not_required" },
        methods: [{ key: "learned-cast", kind: "spellcasting", requiresPrepared: false, resourceOptions: [{ key: "slot-3", castLevel: 3, costs: [{ key: "spell_slot_3", amount: 1 }] }] }],
      },
      source: learnedSpellSource,
    },
    {
      id: "domain-fireball",
      kind: "grant",
      operation: "GRANT",
      target: "spell",
      key: "spell:fireball",
      variantKey: "life-domain:fireball",
      payload: {
        spell: { name: "Огненный шар", level: 3, school: "Evocation" },
        preparation: { mode: "always_prepared" },
        methods: [{ key: "domain-cast", kind: "class_spell", ability: "wisdom", requiresPrepared: false, resourceOptions: [{ key: "slot-3", castLevel: 3, costs: [{ key: "spell_slot_3", amount: 1 }] }] }],
      },
      source: subclassSource,
    },
    {
      id: "domain-aid",
      kind: "grant",
      operation: "GRANT",
      target: "spell",
      key: "spell:aid",
      variantKey: "life-domain:aid",
      payload: {
        spell: { name: "Подмога", level: 2, school: "Abjuration" },
        preparation: { mode: "always_prepared" },
        methods: [{ key: "aid-cast", kind: "class_spell", ability: "wisdom", requiresPrepared: false, resourceOptions: [{ key: "slot-3", castLevel: 3, costs: [{ key: "spell_slot_3", amount: 1 }] }] }],
      },
      source: subclassSource,
    },
  ]
  const resolved = resolveCharacterContract({
    base: { id: "cleric", name: "Жрец", level: 5, abilities: { strength: 10, dexterity: 10, constitution: 14, intelligence: 10, wisdom: 18, charisma: 10 }, baseMaxHp: 30, baseSpeed: 30 },
    state: { currentHp: 30, tempHp: 0, resources: { spell_slot_3: { current: 2 } } },
    contributions,
  })
  const spells = resolved.spells.map((spell) => ({
    ...spell,
    identity: { ...spell.identity, dealsDamage: spell.key === "spell:fireball" },
  }))
  return { ...resolved, spells }
}

test("chat action model separates ordinary attacks from class and unique source groups", () => {
  const model = buildChatActionModel(contract())

  assert.deepEqual(model.attacks.map((action) => action.key), ["sword"])
  assert.equal(model.classGroups.length, 1)
  assert.equal(model.classGroups[0]?.name, "Монах")
  assert.deepEqual(model.classGroups[0]?.resources.map((resource) => resource.key), ["ki"])
  assert.deepEqual(model.classGroups[0]?.actions.map((action) => action.key), ["flurry"])

  assert.equal(model.uniqueGroups.length, 1)
  assert.equal(model.uniqueGroups[0]?.name, "Посох Огня")
  assert.deepEqual(model.uniqueGroups[0]?.resources.map((resource) => resource.key), ["staff_charges"])
  assert.deepEqual(model.uniqueGroups[0]?.actions.map((action) => action.key), ["fire-wave"])
  assert.deepEqual(model.uniqueGroups[0]?.spells.map((spell) => spell.key), ["fireball"])
})

test("powered item actions stay unique while an ordinary weapon stays in attacks", () => {
  const resolved = contract()
  const model = buildChatActionModel(resolved)
  const staff = model.uniqueGroups.find((group) => group.name === "Посох Огня")
  assert.equal(staff?.resources[0]?.current, 4)
  assert.equal(staff?.resources[0]?.max.value, 10)
  assert.equal(staff?.actions[0]?.available, true)
  assert.equal(model.attacks.some((action) => action.key === "fire-wave"), false)
})

test("subclass spell access stays in the Class chat bucket and spends ordinary class slots", () => {
  const resolved = subclassSpellContract()
  const model = buildChatActionModel(resolved)
  const domain = model.classGroups.find((group) => group.name === "Домен жизни")
  const spell = domain?.spells.find((entry) => entry.key === "spell:aid")
  const option = spell?.accesses[0]?.methods[0]?.resourceOptions[0]

  assert.ok(domain)
  assert.ok(spell)
  assert.equal(model.uniqueGroups.some((group) => group.spells.some((entry) => entry.key === "spell:aid")), false)
  assert.equal(model.spells.some((entry) => entry.key === "spell:aid"), false)
  assert.equal(spell?.accesses[0]?.sources[0]?.source.sourceType, "subclass_template")
  assert.equal(spell?.accesses[0]?.methods[0]?.kind, "class_spell")
  assert.equal(option?.costs[0]?.stateKey, "spell_slot_2")
  assert.equal(option?.costs[0]?.amount, 1)
})

test("one spell can route to Attacks, Magic and Class through independent rules", () => {
  const model = buildChatActionModel(routedSpellContract())
  const domain = model.classGroups.find((group) => group.name === "Домен жизни")
  const magicFireball = model.spells.find((spell) => spell.key === "spell:fireball")
  const classFireball = domain?.spells.find((spell) => spell.key === "spell:fireball")
  const classAid = domain?.spells.find((spell) => spell.key === "spell:aid")

  assert.deepEqual(model.attackSpells.map((spell) => spell.key), ["spell:fireball"])
  assert.ok(magicFireball)
  assert.ok(classFireball)
  assert.ok(classAid)
  assert.equal(model.spells.some((spell) => spell.key === "spell:aid"), false)
  assert.equal(magicFireball?.accesses.length, 1)
  assert.equal(magicFireball?.accesses[0]?.sources[0]?.source.sourceType, "legacy_spell")
  assert.equal(classFireball?.accesses.length, 1)
  assert.equal(classFireball?.accesses[0]?.sources[0]?.source.sourceType, "subclass_template")
})
