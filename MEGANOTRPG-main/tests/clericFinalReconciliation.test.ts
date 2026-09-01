import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { resolveCharacterContract } from "../src/character-engine/index.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"

const migration = fs.readFileSync("supabase/migrations/20260830014000_cleric_final_reconciliation.sql", "utf8")

function clericBundle(order: "divine-order:protector" | "divine-order:thaumaturge"): CharacterTemplateBundle {
  return {
    template: {
      id: "cleric-final",
      campaign_id: "campaign",
      kind: "class",
      slug: "cleric",
      name: "Жрец",
      description: "Жрец",
      version: 1,
      mechanics: [],
      choices: [
        {
          key: "cleric-divine-order",
          label: "Божественный сан",
          target: "trait",
          count: 1,
          options: ["divine-order:protector", "divine-order:thaumaturge"],
          option_mechanics: {
            "divine-order:protector": [{ id: "heavy", type: "grant", target: "proficiency", key: "category:heavy_armor", payload: { rank: 1 }, sourceKey: "divine-order:protector" }],
            "divine-order:thaumaturge": [{
              id: "thaumaturge-rule",
              type: "grant",
              target: "feature",
              key: "class:cleric:divine-order:thaumaturge",
              sourceKey: "divine-order:thaumaturge",
              payload: { label: "Чудотворец", description: "Даёт дополнительный заговор Жреца и бонус к указанным проверкам.", mechanic: { kind: "check_bonus" } },
            }],
          },
        },
        {
          key: "cleric-thaumaturge-cantrip",
          label: "Чудотворец · дополнительный заговор",
          target: "trait",
          count: 1,
          options: ["spell:guidance"],
          requires_choice: { key: "cleric-divine-order", option: "divine-order:thaumaturge" },
          option_mechanics: {
            "spell:guidance": [{
              id: "guidance",
              type: "spell",
              key: "spell:guidance",
              catalogSlug: "guidance",
              sourceKey: "divine-order:thaumaturge",
              payload: {
                spell: { name: "Указание", level: 0 },
                preparation: { mode: "not_required" },
                methods: [{ key: "thaumaturge:guidance", kind: "class_spell", ability: "wisdom", requiresPrepared: false }],
              },
            }],
          },
        },
      ],
      parent_template_id: null,
      unlock_level: null,
      catalog_key: "class:cleric",
      catalog_revision: "final-test",
      source_kind: "official",
      source_label: "Official",
      is_builtin: true,
      mechanical_summary: "Жрец выбирает Божественный сан; Защитник получает боевые владения, а Чудотворец — дополнительный заговор Жреца и бонус Мудрости к указанным проверкам Интеллекта.",
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
      template_id: "cleric-final",
      template_level: 5,
      selected_choices: {
        "cleric-divine-order": order,
        "cleric-thaumaturge-cantrip": "spell:guidance",
      },
      assigned_at: "2026-08-30T00:00:00Z",
      updated_at: "2026-08-30T00:00:00Z",
    },
    levels: [],
  }
}

function contract(bundle: CharacterTemplateBundle) {
  const parsed = resolveTemplateBundles([bundle], 5)
  return resolveCharacterContract({
    base: {
      id: "hero",
      name: "Жрец",
      level: 5,
      abilities: { strength: 10, dexterity: 10, constitution: 14, intelligence: 12, wisdom: 18, charisma: 10 },
      baseMaxHp: 35,
      baseSpeed: 30,
    },
    state: { currentHp: 35, tempHp: 0 },
    contributions: parsed.contributions,
  })
}

test("final Cleric package passes reusable class quality and resource policy gates", () => {
  const packages = [clericBundle("divine-order:thaumaturge")]
  assert.doesNotThrow(() => assertClassPackageQuality(packages))
  assert.doesNotThrow(() => assertClassResourcePolicy(packages))
})

test("Thaumaturge child cantrip is active only for the Thaumaturge Divine Order", () => {
  const thaumaturge = contract(clericBundle("divine-order:thaumaturge"))
  assert.ok(thaumaturge.spells.some((spell) => spell.key === "spell:guidance"))
  assert.ok(thaumaturge.rules.some((rule) => rule.key === "class:cleric:divine-order:thaumaturge"))

  const protector = contract(clericBundle("divine-order:protector"))
  assert.equal(protector.spells.some((spell) => spell.key === "spell:guidance"), false)
  assert.ok(protector.grants.some((grant) => grant.target === "proficiency" && grant.key === "category:heavy_armor"))
})

test("final migration explicitly reconciles every remaining Cleric gap", () => {
  for (const token of [
    "cleric-thaumaturge-cantrip",
    "nature-domain-skill",
    "nature-domain-cantrip",
    "forge_blessing_of_the_forge",
    "trickery_blessing_of_the_trickster",
    "twilight_vigilant_blessing",
    "class_spell",
    "short_rest','long_rest','dawn",
  ]) assert.ok(migration.includes(token), `missing ${token}`)

  assert.match(migration, /v_domains<>14/)
  assert.doesNotMatch(migration, /p_trigger\s+not\s+in\s*\([^)]*manual/i)
})
