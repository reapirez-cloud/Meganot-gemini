import assert from "node:assert/strict"
import test from "node:test"

import { resolveCharacterContract, type CharacterContribution, type CharacterEngineInput } from "../src/character-engine/index.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"
import type { StoredSpellMechanic } from "../src/types/characterMechanics.ts"

function classSpell(id: string, key: string, name: string, level: number): StoredSpellMechanic {
  return {
    id,
    type: "spell",
    sourceKey: "land-spells",
    key,
    variantKey: "circle-land",
    payload: {
      spell: { name, level },
      preparation: { mode: "always_prepared" },
      methods: [{
        key: "circle-land",
        kind: "subclass_feature",
        ability: "wisdom",
        requiresPrepared: false,
        resourceOptions: [{ key: `slot-${level}`, castLevel: level, costs: [{ key: `spell_slot_${level}`, amount: 1 }] }],
      }],
    },
  }
}

function bundle(kind: "class" | "subclass", id: string, level: number, parentId?: string): CharacterTemplateBundle {
  const isSubclass = kind === "subclass"
  return {
    assignment: {
      id: `assignment:${id}`,
      character_id: "pc",
      template_id: id,
      template_level: level,
      selected_choices: isSubclass ? { "land-type": "arid" } : {},
      assigned_at: "2026-08-28T00:00:00Z",
      updated_at: "2026-08-28T00:00:00Z",
    },
    template: {
      id,
      campaign_id: "campaign",
      kind,
      slug: id,
      name: isSubclass ? "Круг Земли" : "Друид",
      description: "",
      version: 1,
      mechanics: [],
      choices: [],
      parent_template_id: parentId ?? null,
      unlock_level: isSubclass ? 3 : null,
      is_active: true,
      created_by: null,
      created_at: "2026-08-28T00:00:00Z",
      updated_at: "2026-08-28T00:00:00Z",
    },
    levels: isSubclass ? [{
      id: "land-level-3",
      template_id: id,
      level: 3,
      mechanics: [],
      choices: [{
        key: "land-type",
        label: "Тип земли",
        target: "trait",
        count: 1,
        options: ["arid"],
        option_mechanics: {
          arid: [classSpell("blur", "spell:blur", "Размытие", 2)],
        },
        option_mechanics_by_level: {
          arid: {
            "5": [classSpell("fireball", "spell:fireball", "Огненный шар", 3)],
            "7": [classSpell("blight", "spell:blight", "Усыхание", 4)],
          },
        },
      }],
    }] : [],
  }
}

function slot(level: number, max: number): CharacterContribution {
  return {
    id: `slot-${level}`,
    kind: "grant",
    operation: "GRANT",
    target: "resource",
    key: `spell_slot_${level}`,
    payload: { max, initial: "full", recharge: { triggers: ["long_rest"], restore: "full" } },
    source: { id: "slots", name: "Ячейки" },
  }
}

function resolveAtDruidLevel(level: number) {
  const parsed = resolveTemplateBundles([
    bundle("class", "druid", level),
    // Deliberately stale stored subclass level: parser must use parent class level.
    bundle("subclass", "land", 3, "druid"),
  ], level)
  const input: CharacterEngineInput = {
    base: {
      id: "pc",
      name: "Druid",
      level,
      abilities: { strength: 10, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 18, charisma: 8 },
      baseMaxHp: 30,
      baseSpeed: 30,
    },
    state: { currentHp: 30, tempHp: 0 },
    contributions: [...parsed.contributions, slot(2, 3), slot(3, 2), slot(4, 1)],
  }
  return resolveCharacterContract(input)
}

function spellNames(level: number): string[] {
  return resolveAtDruidLevel(level).spells
    .map((spell) => spell.identity.name)
    .sort((left, right) => left.localeCompare(right, "ru"))
}

test("persistent subclass spell choice unlocks new class spells from parent class level", () => {
  assert.deepEqual(spellNames(3), ["Размытие"])
  assert.deepEqual(spellNames(5), ["Огненный шар", "Размытие"])

  const level5 = resolveAtDruidLevel(5)
  const fireball = level5.spells.find((spell) => spell.identity.name === "Огненный шар")
  assert.ok(fireball)
  assert.equal(fireball.accesses[0]!.preparationMode, "always_prepared")
  assert.equal(fireball.accesses[0]!.methods[0]!.resourceOptions[0]!.costs[0]!.stateKey, "spell_slot_3")

  assert.deepEqual(spellNames(7), ["Огненный шар", "Размытие", "Усыхание"])
})
