import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { resolveCharacterContract, type CharacterEngineInput } from "../src/character-engine/index.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle, RuleTemplate } from "../src/rule-templates/types.ts"

const migration = fs.readFileSync(
  "supabase/migrations/20260831110000_wizard_spellbook_runtime.sql",
  "utf8",
)
const panel = fs.readFileSync("src/components/characters/WizardSpellbookPanel.tsx", "utf8")
const preparationHook = fs.readFileSync("src/hooks/useChatPreparation.ts", "utf8")
const runtime = fs.readFileSync("src/lib/wizardSpellbook.ts", "utf8")

const template: RuleTemplate = {
  id: "wizard-template",
  campaign_id: "campaign-1",
  kind: "class",
  slug: "wizard-core",
  name: "Волшебник",
  description: "Волшебник хранит изученные заклинания в физической книге и готовит магию только из доступных записей.",
  version: 1,
  mechanics: [{
    id: "wizard-spellbook-feature",
    type: "grant",
    target: "feature",
    key: "class:wizard:spellbook",
    sourceKey: "spellbook",
    payload: {
      label: "Книга заклинаний",
      description: "Книга является физическим предметом. Записанные в ней заклинания доступны для подготовки, только пока этот экземпляр находится в инвентаре Волшебника.",
      mechanic: { kind: "owned_spellbook", classKey: "wizard", requiresOwnedItem: true },
    },
  }],
  choices: [],
  parent_template_id: null,
  unlock_level: null,
  catalog_key: "class:wizard",
  catalog_revision: "spellbook-runtime-test",
  source_kind: "official",
  source_label: "Player's Handbook 2024",
  is_builtin: true,
  mechanical_summary: "Физическая книга хранит канонический список известных заклинаний Волшебника и ограничивает ежедневную подготовку этим списком.",
  author_description: "",
  author_comment: "",
  rules_meta: { spell_preparation_refresh: "long_rest", wizard_spellbook_required: true },
  is_active: true,
  created_by: null,
  created_at: "2026-08-31T00:00:00Z",
  updated_at: "2026-08-31T00:00:00Z",
}

function wizardBundle(): CharacterTemplateBundle {
  return {
    assignment: {
      id: "wizard-assignment",
      character_id: "wizard-character",
      template_id: template.id,
      template_level: 5,
      selected_choices: {},
      assigned_at: "2026-08-31T00:00:00Z",
      updated_at: "2026-08-31T00:00:00Z",
    },
    template,
    levels: [],
  }
}

function engineInput(contributions: CharacterEngineInput["contributions"]): CharacterEngineInput {
  return {
    base: {
      id: "wizard-character",
      name: "Волшебник",
      level: 5,
      abilities: { strength: 8, dexterity: 14, constitution: 14, intelligence: 18, wisdom: 12, charisma: 10 },
      baseMaxHp: 30,
      baseSpeed: 30,
    },
    state: { currentHp: 30, tempHp: 0 },
    contributions,
  }
}

test("Wizard spellbook runtime remains a real inventory-instance dependency", () => {
  assert.match(migration, /wizard_spellbook_entries/)
  assert.match(migration, /spellbook_item_id uuid not null references public\.character_inventory_items\(id\) on delete cascade/)
  assert.match(migration, /left join public\.reference_definitions definition on definition\.id=item\.definition_id/)
  assert.match(migration, /definition\.slug='wizard-spellbook'/)
  assert.match(migration, /'definitionId',item\.definition_id/)
})

test("GM authors concrete book contents from the canonical Wizard catalog", () => {
  assert.match(migration, /grant_character_wizard_spellbook_spell_v1/)
  assert.match(migration, /private\.can_manage_character/)
  assert.match(migration, /class_link\.class_key='wizard'/)
  assert.match(migration, /character_wizard_max_spell_level/)
  assert.match(migration, /Cantrips are not written into the Wizard spellbook/)
  assert.match(migration, /insert into public\.character_spells\(character_id,catalog_spell_id,prepared\)/)
})

test("GENA cannot prepare Wizard spells without the physical book or outside its pages", () => {
  assert.match(migration, /Wizard spell preparation requires a spellbook in inventory/)
  assert.match(migration, /wizard_spellbook_entries/)
  assert.match(migration, /Wizard preparation contains a spell that is not written in a held spellbook/)
  assert.match(migration, /private\.character_wizard_level/)
  assert.match(migration, /private\.character_wizard_max_spell_level/)
})

test("Wizard class UI exposes My Book and manager grant flow", () => {
  assert.match(panel, /Моя книга/)
  assert.match(panel, /Выдать закл/)
  assert.match(panel, /loadWizardSpellbook/)
  assert.match(panel, /loadWizardSpellbookOptions/)
  assert.match(panel, /grantWizardSpellbookSpell/)
  assert.match(runtime, /get_character_wizard_spellbook_v1/)
  assert.match(runtime, /grant_character_wizard_spellbook_spell_v1/)
})

test("chat preparation reads the server-owned spellbook availability", () => {
  assert.match(preparationHook, /loadWizardSpellbook/)
  assert.match(preparationHook, /spellCatalogId/)
  assert.match(preparationHook, /catalog_spell_id/)
  assert.match(preparationHook, /task\.classKey === "wizard"/)
})

test("spellbook mechanics package passes quality, parser, CE and persistent-resource policy gates", () => {
  const packages = [wizardBundle()]
  assert.doesNotThrow(() => assertClassPackageQuality(packages))
  assert.doesNotThrow(() => assertClassResourcePolicy(packages))
  const parsed = resolveTemplateBundles(packages, 5)
  assert.ok(parsed.contributions.length > 0)
  assert.doesNotThrow(() => resolveCharacterContract(engineInput(parsed.contributions)))
})
