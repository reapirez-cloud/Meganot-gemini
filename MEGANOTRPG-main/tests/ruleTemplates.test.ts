import assert from "node:assert/strict"
import test from "node:test"

import { resolveLegacyCharacterEngineView } from "../src/lib/legacyCharacterEngineAdapter.ts"
import { clearCharacterTemplateBundles, registerCharacterTemplateBundles } from "../src/rule-templates/registry.ts"
import type { CharacterTemplateBundle, RuleTemplate, RuleTemplateLevel } from "../src/rule-templates/types.ts"
import type { CharacterSheet } from "../src/types/characterSheet.ts"

const characterId = "template-test-character"
const now = "2026-08-27T00:00:00Z"

function sheet(): CharacterSheet {
  return {
    character_id: characterId, race: "", background: "", alignment: "", experience: 0,
    strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10,
    armor_class: 11, initiative_bonus: 0, speed: 30, proficiency_bonus: 3,
    max_hp: 30, current_hp: 30, temp_hp: 0, hit_dice: "6d8",
    death_save_successes: 0, death_save_failures: 0, passive_perception: 10,
    saving_throw_proficiencies: [], skill_proficiencies: {}, proficiencies: "", languages: "", senses: "",
    personality_traits: "", ideals: "", bonds: "", flaws: "", backstory: "", notes: "",
    spellcasting_enabled: false, spell_change_unlocked: false, spellcasting_ability: "",
    spell_save_dc: 8, spell_attack_bonus: 0, spell_slots: {}, created_at: now, updated_at: now,
  }
}

function template(overrides: Partial<RuleTemplate>): RuleTemplate {
  return {
    id: "template", campaign_id: "campaign", kind: "race", slug: "template", name: "Template",
    description: "", version: 1, mechanics: [], choices: [], is_active: true, created_by: null,
    created_at: now, updated_at: now, ...overrides,
  }
}

function bundle(t: RuleTemplate, levels: RuleTemplateLevel[], selectedChoices: Record<string, string | string[]> = {}, templateLevel: number | null = null): CharacterTemplateBundle {
  return {
    template: t,
    levels,
    assignment: {
      id: `assignment-${t.id}`, character_id: characterId, template_id: t.id,
      template_level: templateLevel, selected_choices: selectedChoices, assigned_at: now, updated_at: now,
    },
  }
}

test("race and class templates become normal Character Engine sources with level gating and choices", () => {
  const race = template({
    id: "race-elf", kind: "race", slug: "elf", name: "Эльф",
    mechanics: [{ id: "keen", type: "numeric", target: "combat.ac", operation: "ADD", value: 1 }],
    choices: [{ key: "language", label: "Язык", target: "language", options: ["Эльфийский", "Дварфский"], count: 1 }],
  })
  const klass = template({ id: "class-warden", kind: "class", slug: "warden", name: "Страж" })
  const classLevels: RuleTemplateLevel[] = [
    { id: "warden-5", template_id: klass.id, level: 5, mechanics: [{ id: "stride", type: "numeric", target: "combat.speed", operation: "ADD", value: 10 }], choices: [{ key: "training", label: "Подготовка", target: "proficiency", options: ["Воинское оружие"], count: 1 }] },
  ]

  registerCharacterTemplateBundles(characterId, [
    bundle(race, [], { language: "Эльфийский" }),
    bundle(klass, classLevels, { training: "Воинское оружие" }, 5),
  ])

  try {
    const view = resolveLegacyCharacterEngineView({ character: { id: characterId, name: "Ниэль", level: 6 }, sheet: sheet(), spells: [], features: [] })
    assert.equal(view.contract.combat.ac.value, 12, "template ADD must apply after legacy authored AC baseline")
    assert.equal(view.contract.combat.speed.value, 40)
    assert.ok(view.input.contributions.some((item) => item.source.sourceType === "race_template"))
    assert.ok(view.input.contributions.some((item) => item.source.sourceType === "class_template"))
    assert.ok(view.input.contributions.some((item) => item.kind === "grant" && item.target === "language" && item.key === "Эльфийский"))
    assert.ok(view.input.contributions.some((item) => item.kind === "grant" && item.target === "proficiency" && item.key === "Воинское оружие"))
  } finally {
    clearCharacterTemplateBundles(characterId)
  }
})

test("class level mechanics stay locked above assigned class level", () => {
  const klass = template({ id: "class-scout", kind: "class", slug: "scout", name: "Разведчик" })
  const levels: RuleTemplateLevel[] = [{ id: "scout-5", template_id: klass.id, level: 5, mechanics: [{ id: "stride", type: "numeric", target: "combat.speed", operation: "ADD", value: 10 }], choices: [] }]
  registerCharacterTemplateBundles(characterId, [bundle(klass, levels, {}, 4)])
  try {
    const view = resolveLegacyCharacterEngineView({ character: { id: characterId, name: "Рин", level: 10 }, sheet: sheet(), spells: [], features: [] })
    assert.equal(view.contract.combat.speed.value, 30)
    assert.equal(view.input.contributions.some((item) => item.source.id.includes("level:5")), false)
  } finally {
    clearCharacterTemplateBundles(characterId)
  }
})
