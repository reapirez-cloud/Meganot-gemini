import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { resolveCharacterContract } from "../src/character-engine/index.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"

const migration = fs.readFileSync("supabase/migrations/20260829151113_voss_spell_style_ability_explanations.sql", "utf8")
const druidStatic = fs.readFileSync("src/data/classes/druidReference.ts", "utf8")

function pipelineBundle(): CharacterTemplateBundle {
  return {
    template: {
      id: "voss-explanation-test",
      campaign_id: "campaign",
      kind: "class",
      slug: "voss-explanation-test",
      name: "Тестовый воин",
      description: "Тестовый пакет для проверки presentation-слоя Восса.",
      version: 1,
      mechanics: [],
      choices: [],
      parent_template_id: null,
      unlock_level: null,
      catalog_key: "class:voss-explanation-test",
      catalog_revision: "v1",
      source_kind: "official",
      source_label: "Internal test",
      is_builtin: true,
      mechanical_summary: "Один ограниченный приём расходует ресурс и восстанавливается после долгого отдыха.",
      author_description: "",
      author_comment: "",
      rules_meta: {},
      is_active: true,
      created_by: null,
      created_at: "2026-08-29T00:00:00Z",
      updated_at: "2026-08-29T00:00:00Z",
    },
    assignment: {
      id: "assignment",
      character_id: "hero",
      template_id: "voss-explanation-test",
      template_level: 1,
      selected_choices: {},
      assigned_at: "2026-08-29T00:00:00Z",
      updated_at: "2026-08-29T00:00:00Z",
    },
    levels: [{
      id: "voss-explanation-level-1",
      template_id: "voss-explanation-test",
      level: 1,
      choices: [],
      mechanics: [
        {
          id: "field-breath-feature",
          type: "grant",
          target: "feature",
          key: "class:voss-explanation-test:field-breath",
          sourceKey: "field-breath",
          payload: {
            label: "Полевое дыхание",
            description: "Бонусным действием потратьте 1 использование Полевого дыхания и восстановите 1к6 HP.",
            authorComment: "Если человек ещё ругается, значит, лечить пока есть кого.",
          },
        },
        {
          id: "field-breath-resource",
          type: "resource",
          key: "field_breath",
          label: "Полевое дыхание",
          max: 1,
          recharge: "long_rest",
          sourceKey: "field-breath",
        },
        {
          id: "field-breath-action",
          type: "action",
          key: "field_breath",
          label: "Полевое дыхание",
          economy: "bonus_action",
          resourceKey: "field_breath",
          resourceCost: 1,
          sourceKey: "field-breath",
        },
      ],
    }],
  }
}

test("ability narration migration is presentation-only and covers all three audited classes", () => {
  assert.match(migration, /PRESENTATION ONLY/)
  assert.match(migration, /class:fighter/)
  assert.match(migration, /class:druid/)
  assert.match(migration, /class:cleric/)
  assert.match(migration, /subclass:fighter/)
  assert.match(migration, /subclass:druid/)
  assert.match(migration, /subclass:cleric/)
  assert.match(migration, /authorExplanation/)
  assert.doesNotMatch(migration, /jsonb_set\([^\n]*\{payload,description\}/)
  assert.doesNotMatch(migration, /jsonb_build_object\([^\n]*(?:resourceCosts|effects|requirements|max)/)
})

test("base class explanations use spellbook-style field prose instead of renderer instructions", () => {
  assert.match(migration, /Получили по рёбрам, отдышались и решили, что умирать сегодня неудобно/)
  assert.match(migration, /Когда человеческое тело перестаёт подходить задаче, друид берёт другое/)
  assert.match(migration, /Есть обычные молитвы, а есть момент, когда жрец требует внимания небес прямо сейчас/)
  assert.doesNotMatch(migration, /return '[^']*Это постоянное владение/)
  assert.doesNotMatch(migration, /return '[^']*Это отдельная активация/)
})

test("static Druid fallback follows the same Voss explanation voice", () => {
  assert.match(druidStatic, /После отдыха друид решает, какую часть природы сегодня держать наготове/)
  assert.match(druidStatic, /Когда человеческое тело перестаёт подходить задаче, друид берёт другое/)
  assert.match(druidStatic, /Раньше медведь хотя бы не колдовал/)
  assert.doesNotMatch(druidStatic, /explanation: "[^"]*(?:отдельного ресурса|собственной карточке|точный эффект определяется|отдельной активации)/i)
})

test("presentation rewrite leaves parser and Character Engine mechanics intact", () => {
  const bundle = pipelineBundle()
  assert.doesNotThrow(() => assertClassPackageQuality([bundle]))
  const resolution = resolveTemplateBundles([bundle], 1)
  assert.ok(resolution.contributions.length >= 3)

  const contract = resolveCharacterContract({
    base: {
      id: "hero",
      name: "Hero",
      level: 1,
      abilities: { strength: 14, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
      baseMaxHp: 10,
      baseSpeed: 30,
    },
    state: { currentHp: 10, tempHp: 0, resources: {} },
    contributions: resolution.contributions,
  })

  assert.ok(contract.actions.some((action) => action.key === "field_breath"))
  assert.ok(contract.resources.some((resource) => resource.key === "field_breath"))
})
