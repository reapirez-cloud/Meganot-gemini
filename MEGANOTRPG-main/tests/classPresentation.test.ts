import assert from "node:assert/strict"
import test from "node:test"

import {
  resolveCharacterContract,
  type CharacterContribution,
  type CharacterEngineInput,
  type CharacterSource,
} from "../src/character-engine/index.ts"
import { presentClassPackages } from "../src/rule-templates/classPresentation.ts"

const druid: CharacterSource = {
  id: "template:class:druid-template:v4:source:spellcasting",
  name: "Заклинания друида",
  sourceType: "class_template",
}
const land: CharacterSource = {
  id: "template:subclass:land-template:v2:choice:land-type:arid",
  name: "Круг Земли: Засушливая земля",
  sourceType: "subclass_template",
}
const item: CharacterSource = { id: "item:wand", name: "Палочка", sourceType: "inventory_item" }

function resource(id: string, key: string, max: number, source: CharacterSource): CharacterContribution {
  return {
    id,
    kind: "grant",
    operation: "GRANT",
    target: "resource",
    key,
    payload: { max, recharge: { triggers: ["long_rest"], restore: "full" }, initial: "full", label: key },
    source,
  }
}

function spell(id: string, key: string, name: string, level: number, source: CharacterSource): CharacterContribution {
  return {
    id,
    kind: "grant",
    operation: "GRANT",
    target: "spell",
    key,
    variantKey: id,
    payload: {
      spell: { name, level },
      preparation: { mode: "always_prepared" },
      methods: [{
        key: id,
        kind: "class_feature",
        ability: "wisdom",
        requiresPrepared: false,
        ...(level > 0 ? { resourceOptions: [{ key: `slot-${level}`, castLevel: level, costs: [{ key: `spell_slot_${level}`, amount: 1 }] }] } : {}),
      }],
    },
    source,
  }
}

function input(): CharacterEngineInput {
  const wildShapeSource: CharacterSource = { ...druid, id: "template:class:druid-template:v4:source:wild-shape", name: "Дикая форма" }
  return {
    base: {
      id: "pc",
      name: "Druid",
      level: 5,
      abilities: { strength: 10, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 18, charisma: 8 },
      baseMaxHp: 36,
      baseSpeed: 30,
    },
    state: {
      currentHp: 36,
      tempHp: 0,
      resources: { spell_slot_1: { current: 4 }, spell_slot_3: { current: 2 }, wild_shape: { current: 2 } },
    },
    contributions: [
      resource("slot-1", "spell_slot_1", 4, druid),
      resource("slot-3", "spell_slot_3", 2, druid),
      resource("wild-shape", "wild_shape", 2, wildShapeSource),
      {
        id: "wild-shape-feature",
        kind: "grant",
        operation: "GRANT",
        target: "feature",
        key: "wild_shape_feature",
        variantKey: "wild_shape_feature",
        payload: {
          label: "Дикая форма",
          description: "Меняет форму по правилу способности.",
          mechanic: { kind: "transformation", formSource: "beast" },
        },
        source: wildShapeSource,
      },
      {
        id: "wild-shape-action",
        kind: "grant",
        operation: "GRANT",
        target: "action",
        key: "wild_shape",
        payload: { label: "Дикая форма", economy: "action", resourceCosts: [{ key: "wild_shape", amount: 1 }] },
        source: wildShapeSource,
      },
      {
        id: "medium-armor",
        kind: "grant",
        operation: "GRANT",
        target: "proficiency",
        key: "armor:medium",
        payload: { rank: 1, label: "Средняя броня" },
        source: druid,
      },
      {
        id: "land-resistance",
        kind: "grant",
        operation: "GRANT",
        target: "resistance",
        key: "fire",
        payload: { label: "Огонь" },
        source: land,
      },
      spell("speak", "spell:speak-with-animals", "Разговор с животными", 1, druid),
      spell("plant", "spell:plant-growth", "Рост растений", 3, land),
      spell("wand-fire", "spell:fire-bolt", "Огненный снаряд", 0, item),
    ],
  }
}

test("class presentation keeps class/subclass mechanics separate and excludes item spells", () => {
  const contract = resolveCharacterContract(input())
  const presented = presentClassPackages(contract, [{
    classTemplateId: "druid-template",
    className: "Друид",
    level: 5,
    subclassTemplateId: "land-template",
    subclassName: "Круг Земли",
    subclassUnlockLevel: 3,
    subclassActive: true,
  }])

  assert.equal(presented.length, 1)
  const classBlock = presented[0]!.classMechanics
  const subclassBlock = presented[0]!.subclassMechanics
  assert.ok(subclassBlock)

  assert.deepEqual(classBlock.resources.map((entry) => entry.key), ["wild_shape"])
  assert.deepEqual(classBlock.actions.map((entry) => entry.key), ["wild_shape"])
  assert.deepEqual(classBlock.spells.map((entry) => entry.spell.identity.name), ["Разговор с животными"])
  assert.deepEqual(subclassBlock.spells.map((entry) => entry.spell.identity.name), ["Рост растений"])
  assert.equal(classBlock.spells[0]!.access.preparationMode, "always_prepared")
  assert.equal(classBlock.spells[0]!.access.methods[0]!.resourceOptions[0]!.costs[0]!.stateKey, "spell_slot_1")
  assert.equal(contract.spells.some((entry) => entry.identity.name === "Огненный снаряд"), true)
  assert.equal(classBlock.spells.some((entry) => entry.spell.identity.name === "Огненный снаряд"), false)
})

test("Class tab read model exposes stable machine types from CE rather than display labels", () => {
  const contract = resolveCharacterContract(input())
  const presented = presentClassPackages(contract, [{
    classTemplateId: "druid-template",
    className: "Друид",
    level: 5,
    subclassTemplateId: "land-template",
    subclassName: "Круг Земли",
    subclassUnlockLevel: 3,
    subclassActive: true,
  }])

  const classBlock = presented[0]!.classMechanics
  const subclassBlock = presented[0]!.subclassMechanics!

  assert.ok(classBlock.entries.some((entry) => entry.type === "special_action" && entry.label === "Дикая форма" && entry.integration === "runtime"))
  assert.ok(classBlock.entries.some((entry) => entry.type === "class_spell" && entry.label === "Разговор с животными" && entry.sourceKind === "class"))
  assert.ok(subclassBlock.entries.some((entry) => entry.type === "class_spell" && entry.label === "Рост растений" && entry.sourceKind === "subclass"))
  assert.ok(classBlock.entries.some((entry) => entry.type === "resource" && entry.integration === "runtime"))
  assert.ok(classBlock.entries.some((entry) => entry.type === "passive_rule" && entry.label === "Дикая форма" && entry.integration === "structured"))
  assert.ok(classBlock.entries.some((entry) => entry.type === "proficiency" && entry.label === "Средняя броня"))
  assert.ok(subclassBlock.entries.some((entry) => entry.type === "resistance" && entry.label === "Огонь"))

  assert.deepEqual(classBlock.proficiencies.map((entry) => entry.key), ["armor:medium"])
  assert.deepEqual(subclassBlock.resistances.map((entry) => entry.key), ["fire"])
})
