import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { resolveCharacterContract } from "../src/character-engine/index.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"

const migration = fs.readFileSync("supabase/migrations/20260830012000_cleric_choice_key_and_free_actions.sql", "utf8")

function cleric(selected: "divine-order:protector" | "divine-order:thaumaturge"): CharacterTemplateBundle {
  return {
    template: {
      id: "cleric-template",
      campaign_id: "campaign",
      kind: "class",
      slug: "cleric",
      name: "Жрец",
      description: "Жрец",
      version: 1,
      mechanics: [],
      choices: [{
        key: "cleric-divine-order",
        label: "Божественный сан",
        target: "trait",
        count: 1,
        options: ["divine-order:protector", "divine-order:thaumaturge"],
        option_labels: {
          "divine-order:protector": "Защитник",
          "divine-order:thaumaturge": "Чудотворец",
        },
        option_mechanics: {
          "divine-order:protector": [
            { id: "protector-weapons", type: "grant", target: "proficiency", key: "category:martial_weapons", payload: { rank: 1 }, sourceKey: "divine-order:protector" },
            { id: "protector-armor", type: "grant", target: "proficiency", key: "category:heavy_armor", payload: { rank: 1 }, sourceKey: "divine-order:protector" },
          ],
          "divine-order:thaumaturge": [{
            id: "thaumaturge-rule",
            type: "grant",
            target: "feature",
            key: "class:cleric:divine-order:thaumaturge",
            sourceKey: "divine-order:thaumaturge",
            payload: { label: "Чудотворец", description: "Даёт дополнительный заговор и бонус к указанным проверкам.", mechanic: { kind: "check_bonus" } },
          }],
        },
      }],
      parent_template_id: null,
      unlock_level: null,
      catalog_key: "class:cleric",
      catalog_revision: "test",
      source_kind: "official",
      source_label: "Official",
      is_builtin: true,
      mechanical_summary: "Божественный сан",
      author_description: "",
      author_comment: "",
      rules_meta: {},
      is_active: true,
      created_by: null,
      created_at: "2026-08-30T00:00:00Z",
      updated_at: "2026-08-30T00:00:00Z",
    },
    assignment: {
      id: "assignment",
      character_id: "hero",
      template_id: "cleric-template",
      template_level: 4,
      selected_choices: { "cleric-divine-order": selected },
      assigned_at: "2026-08-30T00:00:00Z",
      updated_at: "2026-08-30T00:00:00Z",
    },
    levels: [],
  }
}

function contractFor(bundle: CharacterTemplateBundle) {
  const parsed = resolveTemplateBundles([bundle], 4)
  return resolveCharacterContract({
    base: {
      id: "hero",
      name: "Жрец",
      level: 4,
      abilities: { strength: 10, dexterity: 10, constitution: 12, intelligence: 10, wisdom: 16, charisma: 10 },
      baseMaxHp: 30,
      baseSpeed: 30,
    },
    state: { currentHp: 30, tempHp: 0 },
    contributions: parsed.contributions,
  })
}

test("persisted Protector key emits its actual CE proficiencies", () => {
  const contract = contractFor(cleric("divine-order:protector"))
  assert.ok(contract.grants.some((grant) => grant.target === "proficiency" && grant.key === "category:martial_weapons"))
  assert.ok(contract.grants.some((grant) => grant.target === "proficiency" && grant.key === "category:heavy_armor"))
})

test("persisted Thaumaturge key reaches its structured rule instead of becoming inert", () => {
  const contract = contractFor(cleric("divine-order:thaumaturge"))
  assert.ok(contract.rules.some((rule) => rule.key === "class:cleric:divine-order:thaumaturge" && rule.integration === "structured"))
})

test("forward migration repairs the historical prefixed choice keys without rewriting assignments", () => {
  assert.match(migration, /divine-order:protector/)
  assert.match(migration, /divine-order:thaumaturge/)
  assert.match(migration, /option_mechanics/)
  assert.doesNotMatch(migration, /update\s+public\.character_template_assignments/i)
})
