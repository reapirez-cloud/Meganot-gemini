import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"

function classBundle(level: number): CharacterTemplateBundle {
  return {
    assignment: {
      id: "class-assignment",
      character_id: "character-1",
      template_id: "class-template",
      template_level: level,
      selected_choices: {},
      assigned_at: "2026-08-28T00:00:00Z",
      updated_at: "2026-08-28T00:00:00Z",
    },
    template: {
      id: "class-template",
      campaign_id: "campaign-1",
      kind: "class",
      slug: "test-class",
      name: "Тестовый класс",
      description: "",
      version: 1,
      mechanics: [],
      choices: [],
      parent_template_id: null,
      unlock_level: 1,
      is_active: true,
      created_by: null,
      created_at: "2026-08-28T00:00:00Z",
      updated_at: "2026-08-28T00:00:00Z",
    },
    levels: [],
  }
}

function subclassBundle(): CharacterTemplateBundle {
  return {
    assignment: {
      id: "subclass-assignment",
      character_id: "character-1",
      template_id: "subclass-template",
      template_level: 30,
      selected_choices: {},
      assigned_at: "2026-08-28T00:00:01Z",
      updated_at: "2026-08-28T00:00:01Z",
    },
    template: {
      id: "subclass-template",
      campaign_id: "campaign-1",
      kind: "subclass",
      slug: "test-subclass",
      name: "Тестовый подкласс",
      description: "",
      version: 1,
      mechanics: [],
      choices: [],
      parent_template_id: "class-template",
      unlock_level: 3,
      is_active: true,
      created_by: null,
      created_at: "2026-08-28T00:00:00Z",
      updated_at: "2026-08-28T00:00:00Z",
    },
    levels: [{
      id: "subclass-l3",
      template_id: "subclass-template",
      level: 3,
      mechanics: [{
        id: "subclass-feature",
        type: "grant",
        target: "feature",
        key: "subclass:test:feature",
        sourceKey: "subclass-feature",
        payload: { label: "Способность подкласса", description: "Точное правило." },
      }],
      choices: [],
    }],
  }
}

function hasSubclassFeature(result: ReturnType<typeof resolveTemplateBundles>) {
  return result.contributions.some((entry) => entry.kind === "grant" && entry.key === "subclass:test:feature")
}

test("subclass is visually assignable but emits no CE mechanics before parent unlock level", () => {
  const result = resolveTemplateBundles([classBundle(2), subclassBundle()], 30)
  assert.equal(hasSubclassFeature(result), false)
  const root = result.sources.find((source) => source.templateId === "subclass-template" && source.nodeKind === "template")
  assert.equal(root?.unlockLevel, 3)
})

test("subclass inherits parent class level instead of stored subclass or total character level", () => {
  const level3 = resolveTemplateBundles([classBundle(3), subclassBundle()], 20)
  assert.equal(hasSubclassFeature(level3), true)

  const level2 = resolveTemplateBundles([classBundle(2), subclassBundle()], 20)
  assert.equal(hasSubclassFeature(level2), false)
})

const frame = fs.readFileSync("src/components/characters/CharacterGameFrame.tsx", "utf8")
const sheet = fs.readFileSync("src/components/characters/ResolvedCharacterSheetBase.tsx", "utf8")
const sheetNavigation = fs.readFileSync("src/components/characters/ResolvedCharacterSheet.tsx", "utf8")
const classPanel = fs.readFileSync("src/components/characters/CharacterClassPanelBase.tsx", "utf8")
const migration = fs.readFileSync("supabase/migrations/20260828043000_character_class_binding_sync.sql", "utf8")

test("GM UI exposes explicit class binding and linked subclass controls", () => {
  assert.match(frame, /Привязать класс к листу CE/)
  assert.match(frame, /class-binding-node--class/)
  assert.match(frame, /class-binding-node--subclass/)
  assert.match(frame, /Родительский класс · уровень приходит отсюда/)
  assert.match(frame, /oracle\.characters\.assignTemplate/)
  assert.match(frame, /oracle\.characters\.removeTemplateAssignment/)
  assert.doesNotMatch(frame, /assign_character_template_v2/)
  assert.doesNotMatch(frame, /apply_class_template_sheet_profile/)
  assert.doesNotMatch(frame, /remove_character_template_assignment_v2/)
  assert.doesNotMatch(frame, /updateCharacter\(/)
})

test("resolved CE sheet keeps class and subclass linked without duplicating their full panels in overview", () => {
  assert.match(sheet, /registeredCharacterClassPackages/)
  assert.match(sheet, /classLabel/)
  assert.match(sheet, /subclassLabel/)
  assert.match(sheet, /Способности класса/)
  assert.match(sheet, /Способности подкласса/)
  assert.doesNotMatch(sheet, /sheet-v3__class-node--class/)
  assert.doesNotMatch(sheet, /sheet-v3__class-node--subclass/)
  assert.match(sheetNavigation, /meganotrpg\.character-class-focus/)
  assert.match(sheetNavigation, /\.profile-v3__class/)
  assert.match(classPanel, /class-panel__source--\$\{mechanics\.kind\}/)
  assert.match(classPanel, /mechanics\.kind === "class" \? "Класс" : "Подкласс"/)
})

test("database binding synchronizes total class level and subclass lifecycle", () => {
  assert.match(migration, /sum\(greatest\(1, coalesce\(a\.template_level, 1\)\)\)/)
  assert.match(migration, /private\.sync_character_class_progression/)
  assert.match(migration, /child_template\.parent_template_id = v_template\.id/)
  assert.match(migration, /p_template_level := greatest\(1, coalesce\(v_parent_assignment\.template_level, 1\)\)/)
})