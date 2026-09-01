import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"

function choiceBundle(level: number): CharacterTemplateBundle {
  return {
    assignment: {
      id: "assignment-1",
      character_id: "character-1",
      template_id: "template-1",
      template_level: level,
      selected_choices: { terrain: "land:arid" },
      assigned_at: "2026-08-27T00:00:00Z",
      updated_at: "2026-08-27T00:00:00Z",
    },
    template: {
      id: "template-1",
      campaign_id: "campaign-1",
      kind: "subclass",
      slug: "test-land",
      name: "Test Land",
      description: "",
      version: 1,
      mechanics: [],
      choices: [{
        key: "terrain",
        label: "Terrain",
        target: "trait",
        options: ["land:arid"],
        option_mechanics: {
          "land:arid": [{
            id: "terrain-base",
            type: "grant",
            target: "feature",
            key: "terrain:base",
          }],
        },
        option_mechanics_by_level: {
          "land:arid": {
            "5": [{ id: "terrain-l5", type: "grant", target: "feature", key: "terrain:l5" }],
            "10": [{ id: "terrain-l10", type: "grant", target: "feature", key: "terrain:l10" }],
          },
        },
      }],
      parent_template_id: "class-druid",
      unlock_level: 3,
      is_active: true,
      created_by: null,
      created_at: "2026-08-27T00:00:00Z",
      updated_at: "2026-08-27T00:00:00Z",
    },
    levels: [],
  }
}

function contributionHas(result: ReturnType<typeof resolveTemplateBundles>, mechanicId: string) {
  return result.contributions.some((entry) => entry.id.endsWith(`:mechanic:${mechanicId}`))
}

test("persistent subclass choice unlocks later mechanics without a second selection", () => {
  const level4 = resolveTemplateBundles([choiceBundle(4)], 4)
  assert.equal(contributionHas(level4, "terrain-base"), true)
  assert.equal(contributionHas(level4, "terrain-l5"), false)
  assert.equal(contributionHas(level4, "terrain-l10"), false)

  const level5 = resolveTemplateBundles([choiceBundle(5)], 5)
  assert.equal(contributionHas(level5, "terrain-base"), true)
  assert.equal(contributionHas(level5, "terrain-l5"), true)
  assert.equal(contributionHas(level5, "terrain-l10"), false)

  const level10 = resolveTemplateBundles([choiceBundle(10)], 10)
  assert.equal(contributionHas(level10, "terrain-base"), true)
  assert.equal(contributionHas(level10, "terrain-l5"), true)
  assert.equal(contributionHas(level10, "terrain-l10"), true)

  const choiceSources = level10.sources.filter((source) => source.nodeKind === "choice")
  assert.equal(choiceSources.length, 1)
  assert.equal(choiceSources[0]?.optionKey, "land:arid")
})

const baseV1 = fs.readFileSync("supabase/migrations/20260827160000_builtin_druid_class_catalog.sql", "utf8")
const baseV2 = fs.readFileSync("supabase/migrations/20260827170000_druid_base_mechanics_v2.sql", "utf8")
const subclasses = fs.readFileSync("supabase/migrations/20260827170100_druid_official_subclasses_2024.sql", "utf8")

test("Druid pack pins 2024 base to 2014 Wild Shape and never restores 2024 Wild Shape", () => {
  assert.match(baseV1, /"feature_overrides":\{"wild_shape":"2014"\}/)
  assert.match(baseV1, /"excluded_features":\["wild_shape@2024"\]/)
  assert.match(baseV1, /"uses":2/)
  assert.match(baseV1, /"recharge":\["short_rest","long_rest"\]/)
  assert.match(baseV2, /'uses',2/)
  assert.match(baseV2, /'uses_scale_with_2024_levels',false/)
  assert.doesNotMatch(baseV2, /wild_shape.*bonus_action/i)
})

test("official 2024 Druid package installs all four current circles", () => {
  for (const key of [
    "subclass:druid:land",
    "subclass:druid:moon",
    "subclass:druid:sea",
    "subclass:druid:stars",
  ]) assert.match(subclasses, new RegExp(key.replaceAll(":", "\\:")))

  assert.match(subclasses, /Круг Земли/)
  assert.match(subclasses, /Круг Луны/)
  assert.match(subclasses, /Круг Моря/)
  assert.match(subclasses, /Круг Звёзд/)
})

test("Moon compatibility excludes 2024 temporary HP because beast HP comes from 2014 Wild Shape", () => {
  assert.match(subclasses, /temporary_hit_points_3x_druid_level/)
  assert.match(subclasses, /wild_shape_2014_beast_hp/)
  assert.match(subclasses, /"temporaryHitPoints":0/)
  assert.match(subclasses, /2024\+wild-shape-2014@1/)
})

test("Druid class parser owns spell slots and exposes separately suppressible core sources", () => {
  assert.match(baseV2, /private\.druid_slot_mechanics/)
  assert.match(baseV2, /'parser_owns_spell_slots',true/)
  assert.match(baseV2, /"sourceKey":"saving-throw-intelligence"/)
  assert.match(baseV2, /"sourceKey":"saving-throw-wisdom"/)
  assert.match(baseV2, /"sourceKey":"spellcasting"/)
  assert.match(baseV2, /"sourceKey":"wild-resurgence"/)
  assert.match(baseV2, /"sourceKey":"elemental-fury"/)
})

test("official circles carry real CE-facing resources, actions, spells and machine-readable rules", () => {
  assert.match(subclasses, /"key":"lands_aid"/)
  assert.match(subclasses, /"key":"moonlight_step"/)
  assert.match(subclasses, /"key":"wrath_of_the_sea_activate"/)
  assert.match(subclasses, /"key":"starry_archer"/)
  assert.match(subclasses, /private\.builtin_spell_set/)
  assert.match(subclasses, /"mechanic":\{"cost"/)
  assert.match(subclasses, /"maxBeastCR"/)
  assert.match(subclasses, /"dailyMode"/)
})
