import assert from "node:assert/strict"
import test from "node:test"

import { resolveCharacterContract, type CharacterContribution, type CharacterEngineInput } from "../src/character-engine/index.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle, RuleTemplate } from "../src/rule-templates/types.ts"

const template: RuleTemplate = {
  id: "druid-template",
  campaign_id: "campaign",
  kind: "class",
  slug: "druid-core",
  name: "Друид",
  description: "",
  version: 1,
  mechanics: [
    {
      id: "druid-save-wis",
      type: "grant",
      target: "proficiency",
      key: "savingThrow:wisdom",
      payload: { rank: 1, label: "Спасбросок: Мудрость" },
      sourceKey: "saving-throw:wisdom",
    },
  ],
  choices: [],
  parent_template_id: null,
  unlock_level: null,
  catalog_key: "class:druid",
  catalog_revision: "2024-base+2014-wild-shape@1",
  source_kind: "official",
  source_label: "Official",
  is_builtin: true,
  mechanical_summary: "",
  author_description: "",
  author_comment: "",
  rules_meta: {},
  is_active: true,
  created_by: null,
  created_at: "2026-08-27T00:00:00Z",
  updated_at: "2026-08-27T00:00:00Z",
}

function druidBundle(level: number): CharacterTemplateBundle {
  return {
    template,
    assignment: {
      id: "assignment",
      character_id: "hero",
      template_id: template.id,
      template_level: level,
      selected_choices: {},
      assigned_at: "2026-08-27T00:00:00Z",
      updated_at: "2026-08-27T00:00:00Z",
    },
    levels: [
      {
        id: "level-2",
        template_id: template.id,
        level: 2,
        mechanics: [
          {
            id: "wild-shape-resource",
            type: "resource",
            key: "wild_shape",
            label: "Дикая форма",
            max: 2,
            recharge: ["short_rest", "long_rest"],
            sourceKey: "wild-shape",
          },
          {
            id: "wild-shape-action",
            type: "action",
            key: "wild_shape",
            label: "Дикая форма",
            economy: "action",
            resourceKey: "wild_shape",
            resourceCost: 1,
            sourceKey: "wild-shape",
          },
          {
            id: "wild-shape-rules",
            type: "grant",
            target: "feature",
            key: "class:druid:wild-shape",
            payload: { label: "Дикая форма · 2014" },
            sourceKey: "wild-shape",
          },
        ],
        choices: [],
      },
      {
        id: "level-7",
        template_id: template.id,
        level: 7,
        mechanics: [
          {
            id: "elemental-fury",
            type: "grant",
            target: "feature",
            key: "class:druid:elemental-fury",
            payload: { label: "Стихийная ярость" },
            sourceKey: "elemental-fury",
          },
        ],
        choices: [],
      },
    ],
  }
}

function engineInput(contributions: CharacterContribution[]): CharacterEngineInput {
  return {
    base: {
      id: "hero",
      name: "Друид",
      level: 6,
      abilities: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 16,
        charisma: 10,
      },
      baseMaxHp: 30,
      baseSpeed: 30,
    },
    state: {
      currentHp: 30,
      tempHp: 0,
      resources: { wild_shape: { current: 2 } },
    },
    contributions,
  }
}

test("class parser emits base and every unlocked level, but nothing from future levels", () => {
  const parsed = resolveTemplateBundles([druidBundle(6)], 6)

  assert.equal(parsed.contributions.some((entry) => entry.id.includes("elemental-fury")), false)
  assert.equal(parsed.contributions.some((entry) => entry.kind === "grant" && entry.target === "resource" && entry.key === "wild_shape"), true)
  assert.equal(parsed.contributions.some((entry) => entry.kind === "grant" && entry.target === "action" && entry.key === "wild_shape"), true)

  const wildShape = parsed.sources.find((source) => source.id.endsWith(":source:wild-shape"))
  assert.ok(wildShape)
  assert.equal(wildShape.unlockLevel, 2)
  assert.deepEqual(new Set(wildShape.mechanicIds), new Set(["wild-shape-resource", "wild-shape-action", "wild-shape-rules"]))
})

test("GM suppression removes a parsed class saving throw without mutating the class", () => {
  const parsed = resolveTemplateBundles([druidBundle(6)], 6)
  const saveSource = parsed.sources.find((source) => source.id.endsWith(":source:saving-throw:wisdom"))
  assert.ok(saveSource)

  const normal = resolveCharacterContract(engineInput(parsed.contributions))
  assert.equal(normal.savingThrows.wisdom.proficiencyRank, 1)

  const suppression: CharacterContribution = {
    id: "gm:disable:druid-wisdom-save",
    kind: "suppression",
    operation: "SUPPRESS",
    selector: { kind: "source", sourceId: saveSource.id, includeDescendants: true },
    source: { id: "gm:controls", name: "Отключено ведущим", sourceType: "gm_control" },
  }
  const disabled = resolveCharacterContract(engineInput([...parsed.contributions, suppression]))
  assert.equal(disabled.savingThrows.wisdom.proficiencyRank, 0)

  // The parser still emits the standard class mechanic. OFF is a separate layer.
  assert.equal(parsed.contributions.some((entry) => entry.source.id === saveSource.id), true)
})

test("one Wild Shape source switch removes its resource, action and feature together", () => {
  const parsed = resolveTemplateBundles([druidBundle(6)], 6)
  const wildShape = parsed.sources.find((source) => source.id.endsWith(":source:wild-shape"))
  assert.ok(wildShape)

  const suppression: CharacterContribution = {
    id: "gm:disable:wild-shape",
    kind: "suppression",
    operation: "SUPPRESS",
    selector: { kind: "source", sourceId: wildShape.id, includeDescendants: true },
    source: { id: "gm:controls", name: "Отключено ведущим", sourceType: "gm_control" },
  }
  const contract = resolveCharacterContract(engineInput([...parsed.contributions, suppression]))

  assert.equal(contract.resources.some((resource) => resource.key === "wild_shape"), false)
  assert.equal(contract.actions.some((action) => action.key === "wild_shape"), false)
  assert.equal(contract.capabilities.features.some((feature) => feature.key === "class:druid:wild-shape"), false)
})
