import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { resolveCharacterContract, type CharacterEngineInput } from "../src/character-engine/index.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"
import type { StoredResourceMechanic } from "../src/types/characterMechanics.ts"

const migration = fs.readFileSync(
  "supabase/migrations/20260831120000_wizard_arcane_recovery_runtime.sql",
  "utf8",
)
const panel = fs.readFileSync("src/components/characters/WizardArcaneRecoveryPanel.tsx", "utf8")
const picker = fs.readFileSync("src/components/characters/SpellSlotRecoveryPicker.tsx", "utf8")
const runtime = fs.readFileSync("src/lib/wizardArcaneRecovery.ts", "utf8")

function section(start: string, end: string) {
  const from = migration.indexOf(start)
  assert.ok(from >= 0, `missing section ${start}`)
  const to = migration.indexOf(end, from + start.length)
  return migration.slice(from, to >= 0 ? to : undefined)
}

const arcaneResource: StoredResourceMechanic = {
  id: "wizard-arcane-recovery-resource",
  type: "resource",
  key: "wizard_arcane_recovery",
  label: "Магическое восстановление",
  max: 1,
  recharge: ["long_rest"],
  sourceKey: "arcane-recovery",
}

function wizardBundle(): CharacterTemplateBundle {
  return {
    assignment: {
      id: "wizard-assignment",
      character_id: "wizard-character",
      template_id: "wizard-template",
      template_level: 7,
      selected_choices: {},
      assigned_at: "2026-08-31T00:00:00Z",
      updated_at: "2026-08-31T00:00:00Z",
    },
    template: {
      id: "wizard-template",
      campaign_id: "campaign-1",
      kind: "class",
      slug: "wizard-core",
      name: "Волшебник",
      description: "Волшебник изучает заклинания через книгу и восстанавливает часть потраченной магической энергии после отдыха.",
      version: 1,
      mechanics: [
        {
          id: "wizard-arcane-recovery-feature",
          type: "grant",
          target: "feature",
          key: "class:wizard:arcane-recovery",
          sourceKey: "arcane-recovery",
          payload: {
            label: "Магическое восстановление",
            description: "После завершённого короткого отдыха один раз до следующего долгого отдыха восстановите потраченные ячейки суммарным уровнем не выше половины уровня Волшебника с округлением вверх; ячейки 6 уровня и выше недоступны.",
            mechanic: { kind: "spell_slot_recovery", budget: "ceil(source.level/2)", maximumSlotLevel: 5 },
          },
        },
        arcaneResource,
      ],
      choices: [],
      mechanical_summary: "Волшебник использует полный набор ячеек заклинаний и один раз между долгими отдыхами возвращает ограниченную комбинацию потраченных ячеек после короткого отдыха.",
      rules_meta: { mechanics_status: "IN_PROGRESS", parser_owns_spell_slots: true },
      is_active: true,
      created_by: null,
      created_at: "2026-08-31T00:00:00Z",
      updated_at: "2026-08-31T00:00:00Z",
    },
    levels: [],
  }
}

function engineInput(contributions: CharacterEngineInput["contributions"]): CharacterEngineInput {
  return {
    base: {
      id: "wizard-character",
      name: "Волшебник",
      level: 7,
      abilities: { strength: 8, dexterity: 14, constitution: 14, intelligence: 18, wisdom: 12, charisma: 10 },
      baseMaxHp: 38,
      baseSpeed: 30,
    },
    state: { currentHp: 38, tempHp: 0, resources: { wizard_arcane_recovery: { current: 1 } } },
    contributions,
  }
}

test("Wizard Arcane Recovery package passes strict quality, parser, CE and resource gates", () => {
  const packages = [wizardBundle()]
  assert.doesNotThrow(() => assertClassPackageQuality(packages))
  assert.doesNotThrow(() => assertClassResourcePolicy(packages))
  const parsed = resolveTemplateBundles(packages, 7)
  const contract = resolveCharacterContract(engineInput(parsed.contributions))
  const resource = contract.resources.find((entry) => entry.stateKey === "wizard_arcane_recovery")
  assert.equal(resource?.current, 1)
  assert.equal(resource?.max.value, 1)
  assert.ok(contract.grants.some((entry) => entry.target === "feature" && entry.key === "class:wizard:arcane-recovery"))
})

test("full-caster slot capacity is parser-owned and uses the shared resource ledger", () => {
  assert.match(migration, /private\.full_caster_slot_mechanics/)
  assert.match(migration, /'key','spell_slot_' \|\| e\.key/)
  assert.match(migration, /'grantOperation','REPLACE'/)
  assert.match(migration, /'recharge',jsonb_build_array\('long_rest'\)/)
  assert.match(migration, /'parser_owns_spell_slots',true/)
  assert.match(migration, /private\.full_caster_slot_mechanics\('wizard',v_level,'spellcasting'\)/)
})

test("short rest is an authoritative reusable server window", () => {
  assert.match(migration, /character_short_rest_sessions/)
  assert.match(migration, /create or replace function public\.grant_character_short_rest/)
  assert.match(migration, /private\.can_manage_campaign/)
  assert.match(migration, /recover_character_resources\(p_character_id,'short_rest'\)/)
  assert.match(migration, /close_character_short_rest_on_player_text/)
  assert.match(migration, /new\.event_kind is not null/)
})

test("long rest closes stale short-rest windows and restores Arcane Recovery through normal resource recharge", () => {
  const longRest = section("create or replace function public.grant_character_long_rest", "create or replace function private.close_character_short_rest_from_chat")
  assert.match(longRest, /character_short_rest_sessions/)
  assert.match(longRest, /is_open=false/)
  assert.match(longRest, /recover_character_resources\(p_character_id,'long_rest'\)/)
})

test("generic slot recovery validates weighted budget and never writes legacy sheet slot state", () => {
  const restore = section("create or replace function private.restore_spell_slot_resources_v1", "create or replace function public.use_wizard_arcane_recovery_v1")
  assert.match(restore, /character_resource_states/)
  assert.match(restore, /v_total:=v_total \+ v_level\*v_amount/)
  assert.match(restore, /v_total>p_budget/)
  assert.match(restore, /v_amount>v_max-v_current/)
  assert.match(restore, /current=least\(max_snapshot,current\+v_amount\)/)
  assert.doesNotMatch(restore, /character_sheets/)
})

test("Wizard wrapper proves class, short-rest timing, level budget, level-five cap and one-use resource", () => {
  const arcane = section("create or replace function public.use_wizard_arcane_recovery_v1", "create or replace function private.install_wizard_2024_mechanics_v1")
  assert.match(arcane, /catalog_key='class:wizard'/)
  assert.match(arcane, /is_character_short_rest_open/)
  assert.match(arcane, /v_budget:=\(v_level\+1\)\/2/)
  assert.match(arcane, /coalesce\(p_recovery,'\{\}'::jsonb\),v_budget,5,auth\.uid\(\)/)
  assert.match(arcane, /state_key='wizard_arcane_recovery'/)
  assert.match(arcane, /current=current-1/)
})

test("Arcane Recovery UI allocates real spent slots and GM opens the generic short-rest window through Oracle", () => {
  assert.match(panel, /oracle\.characters\.recover/)
  assert.match(panel, /"short_rest"/)
  assert.match(panel, /runWizardArcaneRecovery/)
  assert.match(panel, /Math\.ceil\(Math\.max\(1, wizardLevel\) \/ 2\)/)
  assert.match(picker, /\^spell_slot_\(\[1-9\]\)\$/)
  assert.match(picker, /spentBudget \+ level > budget/)
  assert.match(runtime, /syncResolvedCharacterResources/)
  assert.match(runtime, /use_wizard_arcane_recovery_v1/)
})
