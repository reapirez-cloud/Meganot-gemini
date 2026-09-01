import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { resolveCharacterContract, type CharacterEngineInput } from "../src/character-engine/index.ts"
import { presentClassPackages } from "../src/rule-templates/classPresentation.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle, RuleTemplate } from "../src/rule-templates/types.ts"
import { resourceSyncInputs } from "../src/lib/resourceRuntime.ts"

const migration = fs.readFileSync("supabase/migrations/20260830010000_cleric_runtime_completion.sql", "utf8")
const guide = fs.readFileSync("src/components/reference/ReferenceGuide.tsx", "utf8")

const domains = [
  "arcana-domain", "death-domain", "forge-domain", "grave-domain", "knowledge-domain", "life-domain", "light-domain",
  "nature-domain", "order-domain", "peace-domain", "tempest-domain", "trickery-domain", "twilight-domain", "war-domain",
]

const baseTemplate: RuleTemplate = {
  id: "cleric-template",
  campaign_id: "campaign",
  kind: "class",
  slug: "cleric",
  name: "Жрец",
  description: "Жрец использует подготовленные заклинания и Божественный канал.",
  version: 1,
  mechanics: [],
  choices: [],
  parent_template_id: null,
  unlock_level: null,
  catalog_key: "class:cleric",
  catalog_revision: "runtime-completion-test",
  source_kind: "official",
  source_label: "Official",
  is_builtin: true,
  mechanical_summary: "Подготовленные заклинания, Божественный канал и доменная прогрессия.",
  author_description: "",
  author_comment: "",
  rules_meta: {},
  is_active: true,
  created_by: null,
  created_at: "2026-08-30T00:00:00Z",
  updated_at: "2026-08-30T00:00:00Z",
}

const warTemplate: RuleTemplate = {
  ...baseTemplate,
  id: "war-template",
  kind: "subclass",
  slug: "war-domain",
  name: "Домен войны",
  description: "Боевой домен с Направленным ударом и Жрецом войны.",
  parent_template_id: baseTemplate.id,
  unlock_level: 3,
  catalog_key: "subclass:cleric:war-domain",
}

function assignment(templateId: string, level: number) {
  return {
    id: `assignment:${templateId}`,
    character_id: "hero",
    template_id: templateId,
    template_level: level,
    selected_choices: {},
    assigned_at: "2026-08-30T00:00:00Z",
    updated_at: "2026-08-30T00:00:00Z",
  }
}

function clericBundle(): CharacterTemplateBundle {
  return {
    template: baseTemplate,
    assignment: assignment(baseTemplate.id, 6),
    levels: [{
      id: "cleric-l2",
      template_id: baseTemplate.id,
      level: 2,
      choices: [],
      mechanics: [
        {
          id: "channel-feature",
          type: "grant",
          target: "feature",
          key: "class:cleric:channel-divinity",
          sourceKey: "channel-divinity",
          payload: { label: "Божественный канал", description: "Запас Божественного канала питает классовые и доменные способы его расхода." },
        },
        {
          id: "channel-resource",
          type: "resource",
          key: "channel_divinity",
          label: "Божественный канал",
          max: 3,
          recharge: "long_rest",
          recoveryRules: [
            { trigger: "short_rest", restore: "amount", amount: 1 },
            { trigger: "long_rest", restore: "full" },
          ],
          sourceKey: "channel-divinity",
        },
      ],
    }],
  }
}

function warBundle(): CharacterTemplateBundle {
  return {
    template: warTemplate,
    assignment: assignment(warTemplate.id, 6),
    levels: [{
      id: "war-l3",
      template_id: warTemplate.id,
      level: 3,
      choices: [],
      mechanics: [
        {
          id: "war-feature",
          type: "grant",
          target: "feature",
          key: "subclass:cleric:war-domain:core",
          sourceKey: "war-domain-l3-1",
          payload: { label: "Направленный удар и Жрец войны", description: "Направленный удар тратит Божественный канал. Жрец войны тратит отдельное использование на дополнительную атаку бонусным действием." },
        },
        {
          id: "war-priest-resource",
          type: "resource",
          key: "war_priest",
          label: "Жрец войны",
          max: { kind: "max", values: [{ kind: "literal", value: 1 }, { kind: "reference", key: "abilities.wisdom.modifier" }] },
          recharge: ["short_rest", "long_rest"],
          sourceKey: "war-domain-l3-1",
        },
        { id: "guided-strike", type: "action", key: "war_guided_strike", label: "Направленный удар", economy: "special", resourceKey: "channel_divinity", resourceCost: 1, sourceKey: "war-domain-l3-1" },
        { id: "war-priest-action", type: "action", key: "war_priest", label: "Жрец войны", economy: "bonus_action", resourceKey: "war_priest", resourceCost: 1, sourceKey: "war-domain-l3-1" },
        { id: "war-heavy", type: "grant", target: "proficiency", key: "category:heavy_armor", payload: { rank: 1 }, sourceKey: "war-domain-l3-1" },
      ],
    }],
  }
}

function engineInput(contributions: CharacterEngineInput["contributions"]): CharacterEngineInput {
  return {
    base: {
      id: "hero",
      name: "Жрец",
      level: 6,
      abilities: { strength: 14, dexterity: 10, constitution: 14, intelligence: 10, wisdom: 18, charisma: 10 },
      baseMaxHp: 48,
      baseSpeed: 30,
    },
    state: { currentHp: 48, tempHp: 0, resources: { channel_divinity: { current: 2 }, war_priest: { current: 4 } } },
    contributions,
  }
}

test("Cleric runtime migration keeps all fourteen active domain families in scope", () => {
  assert.match(migration, /v_domains<>14/)
  for (const domain of domains) {
    if (domain === "arcana-domain" || domain === "life-domain" || domain === "nature-domain") continue
    assert.match(migration, new RegExp(`subclass:cleric:${domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`))
  }
})

test("subclass reference clamps legacy feature rows to the real subclass unlock level", () => {
  assert.match(guide, /template\.kind === "subclass" \? Math\.max\(row\.level, template\.unlock_level \|\| 1\) : row\.level/)
})

test("Channel Divinity persists one short-rest use and full long-rest recovery", () => {
  const packages = [clericBundle(), warBundle()]
  assert.doesNotThrow(() => assertClassPackageQuality(packages))
  const parsed = resolveTemplateBundles(packages, 6)
  const contract = resolveCharacterContract(engineInput(parsed.contributions))
  const channel = contract.resources.find((resource) => resource.key === "channel_divinity")
  assert.ok(channel)
  assert.equal(channel.max.value, 3)

  const sync = resourceSyncInputs(contract).find((resource) => resource.stateKey === "channel_divinity")
  assert.ok(sync)
  assert.deepEqual(sync.recharge, {
    rules: [
      { trigger: "short_rest", restore: "amount", amount: 1 },
      { trigger: "long_rest", restore: "full" },
    ],
  })
  assert.match(migration, /s\.recharge->'rules'/)
})

test("War Domain reaches parser, CE and Class tab with real finite resources and typed actions", () => {
  const packages = [clericBundle(), warBundle()]
  const parsed = resolveTemplateBundles(packages, 6)
  const contract = resolveCharacterContract(engineInput(parsed.contributions))

  const warPriest = contract.resources.find((resource) => resource.key === "war_priest")
  assert.ok(warPriest)
  assert.equal(warPriest.max.value, 4)
  assert.ok(contract.actions.some((action) => action.key === "war_guided_strike" && action.resourceCosts.some((cost) => cost.stateKey === "channel_divinity" && cost.amount === 1)))
  assert.ok(contract.actions.some((action) => action.key === "war_priest" && action.resourceCosts.some((cost) => cost.stateKey === "war_priest" && cost.amount === 1)))

  const presented = presentClassPackages(contract, [{
    classTemplateId: baseTemplate.id,
    className: baseTemplate.name,
    level: 6,
    subclassTemplateId: warTemplate.id,
    subclassName: warTemplate.name,
    subclassUnlockLevel: 3,
    subclassActive: true,
  }])
  const subclass = presented[0]?.subclassMechanics
  assert.ok(subclass)
  assert.ok(subclass.entries.some((entry) => entry.type === "resource" && entry.label === "Жрец войны" && entry.integration === "runtime"))
  assert.ok(subclass.entries.some((entry) => entry.type === "special_action" && entry.label === "Направленный удар" && entry.integration === "runtime"))
  assert.ok(subclass.entries.some((entry) => entry.type === "proficiency"))
})

test("runtime completion wires every audited finite pool and missing Channel Divinity spender", () => {
  for (const token of [
    "grave_sentinel", "grave_keeper_of_souls", "knowledge_foreknowledge", "light_warding_flare",
    "order_embodiment_law", "peace_emboldening_bond", "tempest_wrath_of_storm", "twilight_steps_of_night", "war_priest",
    "death_touch_of_death", "forge_artisans_blessing", "grave_path_to_the_grave", "knowledge_mind_magic",
    "light_radiance_of_dawn", "tempest_destructive_wrath", "trickery_invoke_duplicity", "war_guided_strike",
  ]) assert.match(migration, new RegExp(token))

  assert.match(migration, /'target','immunity','key','fire'/)
  assert.match(migration, /'target','sense','key','darkvision'/)
  assert.match(migration, /'target','resistance','key','bludgeoning'/)
})
