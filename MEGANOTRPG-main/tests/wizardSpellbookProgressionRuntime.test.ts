import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { resolveCharacterContract, type CharacterEngineInput } from "../src/character-engine/index.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle, RuleTemplate } from "../src/rule-templates/types.ts"

const migration = fs.readFileSync("supabase/migrations/20260831130000_wizard_spellbook_progression_runtime.sql", "utf8")
const panel = fs.readFileSync("src/components/characters/WizardSpellbookPanel.tsx", "utf8")
const runtime = fs.readFileSync("src/lib/wizardSpellbook.ts", "utf8")

const template: RuleTemplate = {
  id: "wizard-template",
  campaign_id: "campaign",
  kind: "class",
  slug: "wizard",
  name: "Волшебник",
  description: "Волшебник записывает изученные заклинания в физическую книгу и получает новые записи при каждом уровне класса.",
  version: 1,
  mechanics: [{
    id: "wizard-spellbook-progression-feature",
    type: "grant",
    target: "feature",
    key: "class:wizard:spellbook-progression",
    sourceKey: "spellcasting",
    payload: {
      label: "Заклинания Волшебника",
      description: "На 1 уровне выберите шесть заклинаний Волшебника 1 уровня для книги. На каждом следующем уровне Волшебника выберите ещё два заклинания Волшебника уровней, для которых на этом уровне класса доступны ячейки.",
      mechanic: { kind: "spellbook_level_progression", startingCount: 6, perLevelCount: 2 },
    },
  }],
  choices: [],
  parent_template_id: null,
  unlock_level: null,
  catalog_key: "class:wizard",
  catalog_revision: "spellbook-progression-test",
  source_kind: "official",
  source_label: "Player's Handbook 2024",
  is_builtin: true,
  mechanical_summary: "Книга Волшебника хранит физические записи, а серверный журнал уровня выдаёт ровно шесть стартовых и по два новых заклинания на каждом последующем уровне класса.",
  author_description: "",
  author_comment: "",
  rules_meta: { wizard_spellbook_required: true },
  is_active: true,
  created_by: null,
  created_at: "2026-08-31T00:00:00Z",
  updated_at: "2026-08-31T00:00:00Z",
}

function bundle(): CharacterTemplateBundle {
  return {
    template,
    assignment: {
      id: "wizard-assignment",
      character_id: "hero",
      template_id: template.id,
      template_level: 5,
      selected_choices: {},
      assigned_at: "2026-08-31T00:00:00Z",
      updated_at: "2026-08-31T00:00:00Z",
    },
    levels: [],
  }
}

function engineInput(contributions: CharacterEngineInput["contributions"]): CharacterEngineInput {
  return {
    base: {
      id: "hero",
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

test("Wizard spellbook progression package reaches strict parser and CE gates", () => {
  const packages = [bundle()]
  assert.doesNotThrow(() => assertClassPackageQuality(packages))
  assert.doesNotThrow(() => assertClassResourcePolicy(packages))
  const parsed = resolveTemplateBundles(packages, 5)
  const contract = resolveCharacterContract(engineInput(parsed.contributions))
  assert.ok(contract.grants.some((entry) => entry.target === "feature" && entry.key === "class:wizard:spellbook-progression"))
})

test("progression ledger separates class entitlements from physical book pages", () => {
  assert.match(migration, /create table if not exists public\.wizard_spellbook_level_grants/)
  assert.match(migration, /primary key \(character_id,wizard_level,spell_catalog_id\)/)
  assert.match(migration, /unique \(character_id,spell_catalog_id\)/)
  assert.match(migration, /spellbook_item_id uuid references public\.character_inventory_items\(id\) on delete set null/)
  assert.match(migration, /wizard_spellbook_entries/)
})

test("level one grants six spells and every later Wizard level grants exactly two", () => {
  assert.match(migration, /case when p_wizard_level=1 then 6 else 2 end/)
  assert.match(migration, /Starting Wizard spellbook choices must be level 1 spells/)
  assert.match(migration, /generate_series\(1,v_level\)/)
})

test("old pending choices keep the spell ceiling of their source Wizard level", () => {
  assert.match(migration, /wizard_spellbook_grant_max_spell_level/)
  assert.match(migration, /ceil\(greatest\(1,p_wizard_level\)::numeric\/2\)/)
  assert.match(migration, /Complete Wizard spellbook choices for level % first/)
  assert.match(migration, /v_spell\.spell_level>v_max_spell_level/)
  assert.match(migration, /class_link\.class_key='wizard'/)
})

test("assigned player and manager can consume progression only into a held physical spellbook", () => {
  assert.match(migration, /assigned_user_id/)
  assert.match(migration, /private\.can_manage_character/)
  assert.match(migration, /private\.is_wizard_spellbook_item/)
  assert.match(migration, /Wizard spellbook is required before choosing progression spells/)
  assert.match(migration, /insert into public\.wizard_spellbook_entries/)
  assert.match(migration, /insert into public\.character_spells/)
})

test("Wizard book UI exposes pending level choices through server progression RPCs", () => {
  assert.match(runtime, /get_character_wizard_spellbook_progression_v1/)
  assert.match(runtime, /choose_character_wizard_spellbook_progression_v1/)
  assert.match(panel, /Выборы по уровню/)
  assert.match(panel, /Выбрать заклинание/)
  assert.match(panel, /nextSourceLevel/)
})
