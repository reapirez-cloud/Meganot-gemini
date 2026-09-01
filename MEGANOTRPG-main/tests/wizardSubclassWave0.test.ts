import assert from "node:assert/strict"
import test from "node:test"

import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle, RuleTemplate, RuleTemplateLevel } from "../src/rule-templates/types.ts"
import {
  WIZARD_SUBCLASS_FEATURE_LEVELS,
  WIZARD_SUBCLASS_PARENT_CATALOG_KEY,
  WIZARD_SUBCLASS_UNLOCK_LEVEL,
  WIZARD_SUBCLASSES,
  assertWizardSubclassPackage,
  wizardSubclassPackageErrors,
} from "../src/rule-templates/wizardSubclasses.ts"

const now = "2026-08-31T00:00:00Z"

const wizardTemplate: RuleTemplate = {
  id: "wizard-template",
  campaign_id: "campaign",
  kind: "class",
  slug: "wizard",
  name: "Волшебник",
  description: "",
  version: 1,
  mechanics: [],
  choices: [],
  parent_template_id: null,
  unlock_level: null,
  catalog_key: WIZARD_SUBCLASS_PARENT_CATALOG_KEY,
  catalog_revision: "2024-base@1",
  source_kind: "official",
  source_label: "Player's Handbook 2024",
  is_builtin: true,
  rules_meta: {},
  is_active: true,
  created_by: null,
  created_at: now,
  updated_at: now,
}

function evokerTemplate(): RuleTemplate {
  return {
    id: "wizard-evoker-template",
    campaign_id: "campaign",
    kind: "subclass",
    slug: "wizard-evoker",
    name: "Эвокер",
    description: "",
    version: 1,
    mechanics: [],
    choices: [],
    parent_template_id: wizardTemplate.id,
    unlock_level: WIZARD_SUBCLASS_UNLOCK_LEVEL,
    catalog_key: "subclass:wizard:evoker",
    catalog_revision: "phb-2024@1",
    source_kind: "official",
    source_label: "Player's Handbook 2024",
    is_builtin: true,
    rules_meta: { visual_key: "wizard-subclass:evoker" },
    is_active: true,
    created_by: null,
    created_at: now,
    updated_at: now,
  }
}

function subclassLevels(templateId: string): RuleTemplateLevel[] {
  return WIZARD_SUBCLASS_FEATURE_LEVELS.map((level) => ({
    id: `evoker-level-${level}`,
    template_id: templateId,
    level,
    mechanics: [
      {
        id: `evoker-feature-${level}`,
        type: "grant" as const,
        target: "feature",
        key: `subclass:wizard:evoker:level-${level}`,
        payload: { label: `Evoker ${level}` },
        sourceKey: `evoker:level-${level}`,
      },
    ],
    choices: [],
  }))
}

function bundle(template: RuleTemplate, level: number, levels: RuleTemplateLevel[] = []): CharacterTemplateBundle {
  return {
    template,
    assignment: {
      id: `${template.id}-assignment`,
      character_id: "hero",
      template_id: template.id,
      template_level: level,
      selected_choices: {},
      assigned_at: now,
      updated_at: now,
    },
    levels,
  }
}

function resolvedWizardAtLevel(level: number) {
  const subclass = evokerTemplate()
  return resolveTemplateBundles(
    [bundle(wizardTemplate, level), bundle(subclass, 20, subclassLevels(subclass.id))],
    20,
  )
}

test("Wave 0 fixes exactly thirteen stable Wizard subclass identities", () => {
  assert.equal(WIZARD_SUBCLASSES.length, 13)
  assert.equal(new Set(WIZARD_SUBCLASSES.map((entry) => entry.catalogKey)).size, 13)
  assert.equal(new Set(WIZARD_SUBCLASSES.map((entry) => entry.slug)).size, 13)
  assert.equal(new Set(WIZARD_SUBCLASSES.map((entry) => entry.visualKey)).size, 13)

  for (const entry of WIZARD_SUBCLASSES) {
    assert.match(entry.catalogKey, /^subclass:wizard:/)
    assert.match(entry.visualKey, /^wizard-subclass:/)
    assert.equal(entry.unlockLevel, 3)
    assert.deepEqual(entry.featureLevels, [3, 6, 10, 14])
  }
})

test("PHB 2024 replaces the four duplicated 2014 school identities", () => {
  const phb2024 = WIZARD_SUBCLASSES.filter((entry) => entry.source === "phb-2024").map((entry) => entry.catalogKey).sort()
  assert.deepEqual(phb2024, [
    "subclass:wizard:abjurer",
    "subclass:wizard:diviner",
    "subclass:wizard:evoker",
    "subclass:wizard:illusionist",
  ])

  assert.equal(WIZARD_SUBCLASSES.some((entry) => (entry.catalogKey as string) === "subclass:wizard:abjuration"), false)
  assert.equal(WIZARD_SUBCLASSES.some((entry) => (entry.catalogKey as string) === "subclass:wizard:divination"), false)
  assert.equal(WIZARD_SUBCLASSES.some((entry) => (entry.catalogKey as string) === "subclass:wizard:evocation"), false)
  assert.equal(WIZARD_SUBCLASSES.some((entry) => (entry.catalogKey as string) === "subclass:wizard:illusion"), false)
})

test("future Wizard subclass packages must attach to Wizard, unlock at 3 and use 3/6/10/14 rows", () => {
  const subclass = evokerTemplate()
  assert.doesNotThrow(() => assertWizardSubclassPackage({
    template: subclass,
    parent: wizardTemplate,
    levels: subclassLevels(subclass.id),
  }))

  assert.deepEqual(wizardSubclassPackageErrors({
    template: { ...subclass, parent_template_id: "fighter-template", unlock_level: 2 },
    parent: { ...wizardTemplate, id: "fighter-template", catalog_key: "class:fighter" },
    levels: [...subclassLevels(subclass.id), { id: "legacy-2", template_id: subclass.id, level: 2, mechanics: [], choices: [] }],
  }), [
    "parent must be class:wizard",
    "unlock_level must be 3",
    "unsupported Wizard subclass feature levels: 2",
  ])
})

test("subclass mechanics use parent Wizard level, not total character or stale subclass assignment level", () => {
  assert.equal(resolvedWizardAtLevel(2).contributions.some((entry) => entry.id.includes("evoker-feature")), false)

  for (const [wizardLevel, expectedFeatureLevels] of [
    [3, [3]],
    [6, [3, 6]],
    [10, [3, 6, 10]],
    [14, [3, 6, 10, 14]],
  ] as const) {
    const parsed = resolvedWizardAtLevel(wizardLevel)
    const unlocked = WIZARD_SUBCLASS_FEATURE_LEVELS.filter((level) =>
      parsed.contributions.some((entry) => entry.id.includes(`evoker-feature-${level}`)),
    )
    assert.deepEqual(unlocked, expectedFeatureLevels)
  }
})
