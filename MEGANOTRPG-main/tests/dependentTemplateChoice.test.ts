import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"

const gameFrame = fs.readFileSync("src/components/characters/CharacterGameFrame.tsx", "utf8")

function bundle(order: string, extra = "spell:guidance"): CharacterTemplateBundle {
  return {
    template: {
      id: "cleric",
      campaign_id: "campaign",
      kind: "class",
      slug: "cleric",
      name: "Жрец",
      description: "test",
      version: 1,
      mechanics: [],
      choices: [
        {
          key: "cleric-divine-order",
          label: "Божественный сан",
          target: "trait",
          count: 1,
          options: ["divine-order:protector", "divine-order:thaumaturge"],
        },
        {
          key: "cleric-thaumaturge-cantrip",
          label: "Дополнительный заговор жреца",
          target: "trait",
          count: 1,
          options: ["spell:guidance"],
          requires_choice: { key: "cleric-divine-order", option: "divine-order:thaumaturge" },
          option_mechanics: {
            "spell:guidance": [{
              id: "thaumaturge-guidance",
              type: "spell",
              key: "spell:guidance",
              sourceKey: "divine-order:thaumaturge",
              payload: {
                spell: { name: "Указание", level: 0 },
                preparation: { mode: "always_prepared" },
                methods: [{ key: "cleric", kind: "class_spell", ability: "wisdom", requiresPrepared: false }],
              },
            }],
          },
        },
      ],
      parent_template_id: null,
      unlock_level: null,
      catalog_key: "class:cleric",
      catalog_revision: "test",
      source_kind: "official",
      source_label: "test",
      is_builtin: true,
      mechanical_summary: "test",
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
      template_id: "cleric",
      template_level: 1,
      selected_choices: {
        "cleric-divine-order": order,
        "cleric-thaumaturge-cantrip": extra,
      },
      assigned_at: "2026-08-30T00:00:00Z",
      updated_at: "2026-08-30T00:00:00Z",
    },
    levels: [],
  }
}

test("dependent choice emits only while its required parent option is selected", () => {
  const thaumaturge = resolveTemplateBundles([bundle("divine-order:thaumaturge")], 1)
  assert.ok(thaumaturge.contributions.some((entry) => entry.kind === "grant" && entry.target === "spell" && entry.key === "spell:guidance"))

  const protector = resolveTemplateBundles([bundle("divine-order:protector")], 1)
  assert.equal(protector.contributions.some((entry) => entry.kind === "grant" && entry.target === "spell" && entry.key === "spell:guidance"), false)
})

test("stale dependent selection may remain persisted but is inert until parent requirement returns", () => {
  const protector = resolveTemplateBundles([bundle("divine-order:protector")], 1)
  assert.equal(protector.sources.some((node) => node.choiceKey === "cleric-thaumaturge-cantrip"), false)

  const restored = resolveTemplateBundles([bundle("divine-order:thaumaturge")], 1)
  assert.ok(restored.sources.some((node) => node.choiceKey === "cleric-thaumaturge-cantrip" && node.optionKey === "spell:guidance"))
})

test("class binding UI uses the same dependent-choice gate and exposes no manual resource reset", () => {
  assert.match(gameFrame, /choiceDefinitionAvailable\(definition, selectedChoices\)/)
  assert.match(gameFrame, /visibleChoiceDefs\.map/)
  assert.doesNotMatch(gameFrame, /RecoveryTrigger[^\n]*manual/)
  assert.doesNotMatch(gameFrame, /Восстановить ручные/)
})
