import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { resolveCharacterContract, type CharacterEngineInput } from "../src/character-engine/index.ts"
import { resolveLegacyCharacterEngineView } from "../src/lib/legacyCharacterEngineAdapter.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"
import type { CharacterSheet, CharacterSpell } from "../src/types/characterSheet.ts"

const completionMigration = readFileSync(new URL("../supabase/migrations/20260831140000_wizard_completion_runtime.sql", import.meta.url), "utf8")
const closureMigration = readFileSync(new URL("../supabase/migrations/20260831143000_wizard_completion_closure.sql", import.meta.url), "utf8")
const noticeMigration = readFileSync(new URL("../supabase/migrations/20260831143500_wizard_manual_choice_notices.sql", import.meta.url), "utf8")
const adapterSource = readFileSync(new URL("../src/lib/legacyCharacterEngineAdapter.ts", import.meta.url), "utf8")
const preparationHook = readFileSync(new URL("../src/hooks/useChatPreparation.ts", import.meta.url), "utf8")
const completionPanel = readFileSync(new URL("../src/components/characters/WizardCompletionPanel.tsx", import.meta.url), "utf8")

function sheet(): CharacterSheet {
  return {
    character_id: "wizard-1", race: "Человек", background: "", alignment: "", experience: 0,
    strength: 8, dexterity: 14, constitution: 14, intelligence: 20, wisdom: 12, charisma: 10,
    armor_class: 12, initiative_bonus: 2, speed: 30, proficiency_bonus: 6,
    max_hp: 100, current_hp: 100, temp_hp: 0, hit_dice: "20d6",
    death_save_successes: 0, death_save_failures: 0, passive_perception: 11,
    saving_throw_proficiencies: ["intelligence", "wisdom"], skill_proficiencies: {},
    proficiencies: "Простое оружие", languages: "Общий", senses: "",
    personality_traits: "", ideals: "", bonds: "", flaws: "", backstory: "", notes: "",
    spellcasting_enabled: true, spell_change_unlocked: true, spellcasting_ability: "intelligence",
    spell_save_dc: 19, spell_attack_bonus: 11,
    spell_slots: {
      "1": { max: 4, used: 0 }, "2": { max: 3, used: 0 }, "3": { max: 3, used: 0 },
    },
    created_at: "2026-08-31T00:00:00Z", updated_at: "2026-08-31T00:00:00Z",
  }
}

function spell(id: string, name: string, level: number, overrides: Partial<CharacterSpell> = {}): CharacterSpell {
  return {
    id, character_id: "wizard-1", catalog_spell_id: `catalog-${id}`, name, spell_level: level,
    school: "Evocation", casting_time: "Action", spell_range: "60 ft", duration: "Instant",
    components: "V, S", concentration: false, ritual: false, prepared: false,
    cast_mode: level === 0 ? "cantrip" : "slot", slot_level: level || null, description: "", source: "Wizard",
    sort_order: 0, created_at: "2026-08-31T00:00:00Z", updated_at: "2026-08-31T00:00:00Z",
    ...overrides,
  }
}

function strictWizardCompletionBundle(): CharacterTemplateBundle {
  return {
    assignment: {
      id: "assignment-wizard-completion",
      character_id: "wizard-1",
      template_id: "template-wizard-completion",
      template_level: 20,
      selected_choices: {},
      assigned_at: "2026-08-31T00:00:00Z",
      updated_at: "2026-08-31T00:00:00Z",
    },
    template: {
      id: "template-wizard-completion",
      campaign_id: "campaign-1",
      kind: "class",
      slug: "wizard",
      name: "Волшебник",
      description: "Волшебник хранит заклинания в физической книге, подготавливает их и использует классовые правила восстановления и особого колдовства.",
      version: 1,
      mechanics: [
        {
          id: "wizard-signature-audit-feature",
          type: "grant",
          target: "feature",
          key: "class:wizard:signature-spell-audit",
          sourceKey: "signature-spell-audit",
          payload: {
            label: "Фирменное заклинание — контроль ресурса",
            description: "Выбранное Фирменное заклинание можно один раз наложить без траты ячейки. Этот отдельный запас полностью восстанавливается после короткого или долгого отдыха.",
          },
        },
        {
          id: "wizard-signature-audit-resource",
          type: "resource",
          key: "wizard_signature_audit",
          label: "Бесплатное Фирменное заклинание",
          max: 1,
          recharge: "long_rest",
          recoveryRules: [
            { trigger: "short_rest", restore: "full" },
            { trigger: "long_rest", restore: "full" },
          ],
          sourceKey: "signature-spell-audit",
        },
        {
          id: "wizard-signature-audit-action",
          type: "action",
          key: "wizard_signature_audit",
          label: "Наложить Фирменное заклинание бесплатно",
          economy: "special",
          resourceKey: "wizard_signature_audit",
          resourceCost: 1,
          sourceKey: "signature-spell-audit",
        },
      ],
      choices: [],
      parent_template_id: null,
      unlock_level: null,
      catalog_key: "class:wizard",
      catalog_revision: "phb-2024",
      source_kind: "official",
      source_label: "Player's Handbook 2024",
      is_builtin: true,
      mechanical_summary: "Физическая книга ограничивает доступные заклинания; подготовка, ячейки, восстановление и высокоуровневые выборы Волшебника сохраняются как отдельное механическое состояние.",
      author_description: "",
      author_comment: "",
      rules_meta: {},
      is_active: true,
      created_by: null,
      created_at: "2026-08-31T00:00:00Z",
      updated_at: "2026-08-31T00:00:00Z",
    },
    levels: [],
  }
}

function strictWizardEngineInput(contributions: CharacterEngineInput["contributions"]): CharacterEngineInput {
  return {
    base: {
      id: "wizard-1",
      name: "Волшебник",
      level: 20,
      abilities: { strength: 8, dexterity: 14, constitution: 14, intelligence: 20, wisdom: 12, charisma: 10 },
      baseMaxHp: 100,
      baseSpeed: 30,
    },
    state: { currentHp: 100, tempHp: 0, resources: { wizard_signature_audit: { current: 1 } } },
    contributions,
  }
}

test("Wizard completion package passes strict class quality/resource policy, parser, and CE resolution", () => {
  const packages = [strictWizardCompletionBundle()]
  assert.doesNotThrow(() => assertClassPackageQuality(packages))
  assert.doesNotThrow(() => assertClassResourcePolicy(packages))
  const parsed = resolveTemplateBundles(packages, 20)
  const contract = resolveCharacterContract(strictWizardEngineInput(parsed.contributions))
  assert.ok(contract.resources.find((entry) => entry.key === "wizard_signature_audit"))
  assert.ok(contract.actions.find((entry) => entry.key === "wizard_signature_audit"))
})

test("Wizard ordinary slots require preparation while held-book rituals bypass preparation without spending a slot", () => {
  const normal = spell("normal", "Normal", 1)
  const ritual = spell("ritual", "Ritual", 1, { ritual: true })
  const view = resolveLegacyCharacterEngineView({
    character: { id: "wizard-1", name: "Wizard", level: 20 },
    sheet: sheet(),
    spells: [normal, ritual],
    features: [],
    templateBundles: [],
    resourceStates: {},
    wizardSpellbookCatalogIds: ["catalog-ritual"],
  })

  const normalAccess = view.contract.spells.find((entry) => entry.identity.name === "Normal")!.accesses[0]!
  assert.equal(normalAccess.prepared, false)
  assert.equal(normalAccess.methods.find((method) => method.key === "legacy-cast")!.available, false)

  const ritualAccess = view.contract.spells.find((entry) => entry.identity.name === "Ritual")!.accesses[0]!
  assert.equal(ritualAccess.methods.find((method) => method.key === "legacy-cast")!.available, false)
  const ritualMethod = ritualAccess.methods.find((method) => method.key === "wizard-ritual")!
  assert.equal(ritualMethod.requiresPrepared, false)
  assert.equal(ritualMethod.resourceOptions.length, 0)
  assert.equal(ritualMethod.available, true)
})

test("Spell Mastery is a true no-resource cast and Signature Spell uses its own rest resource", () => {
  const mastery = spell("mastery", "Mastery", 1, { prepared: true, wizard_spell_mastery: true })
  const signature = spell("signature", "Signature", 3, { prepared: true, wizard_signature_spell: true })
  const view = resolveLegacyCharacterEngineView({
    character: { id: "wizard-1", name: "Wizard", level: 20 },
    sheet: sheet(),
    spells: [mastery, signature],
    features: [],
    templateBundles: [],
    resourceStates: {},
    wizardSpellbookCatalogIds: ["catalog-mastery", "catalog-signature"],
  })

  const masteryAccess = view.contract.spells.find((entry) => entry.identity.name === "Mastery")!.accesses[0]!
  assert.equal(masteryAccess.preparationMode, "always_prepared")
  const masteryMethod = masteryAccess.methods.find((method) => method.key === "wizard-spell-mastery")!
  assert.equal(masteryMethod.resourceOptions.length, 0)
  assert.equal(masteryMethod.available, true)

  const signatureAccess = view.contract.spells.find((entry) => entry.identity.name === "Signature")!.accesses[0]!
  assert.equal(signatureAccess.preparationMode, "always_prepared")
  const signatureMethod = signatureAccess.methods.find((method) => method.key === "wizard-signature-free")!
  assert.equal(signatureMethod.resourceOptions.length, 1)
  assert.equal(signatureMethod.resourceOptions[0]!.costs.length, 1)
  assert.equal(signatureMethod.available, true)
  const resource = view.contract.resources.find((entry) => entry.key === "wizard_signature_signature")
  assert.ok(resource)
  assert.equal(resource.max.value, 1)
  assert.deepEqual(resource.recharge?.triggers, ["short_rest", "long_rest"])
})

test("Wizard completion SQL enforces Short Rest Memorize, one Mastery replacement, and immutable Signature selections", () => {
  assert.match(completionMigration, /Memorize Spell is available only immediately after a granted Short Rest/)
  assert.match(completionMigration, /wizard_memorize_spell_uses/)
  assert.match(closureMigration, /wizard_spell_mastery_replacements/)
  assert.match(closureMigration, /Spell Mastery can replace only one mastered spell after a Long Rest/)
  assert.match(closureMigration, /Spell Mastery already replaced one spell after this Long Rest/)
  assert.match(closureMigration, /Signature Spells has no player replacement rule after the initial selection/)
})

test("Gena and My Book expose the remaining Wizard decisions without inventing a second rules engine", () => {
  assert.match(preparationHook, /!spell\.wizard_spell_mastery/)
  assert.match(preparationHook, /!spell\.wizard_signature_spell/)
  assert.match(noticeMigration, /wizard-cantrip-replacement-notice/)
  assert.match(noticeMigration, /gena_notice_then_gm_sheet_edit/)
  assert.match(completionPanel, /memorizeWizardSpell/)
  assert.match(completionPanel, /setWizardSpellMastery/)
  assert.match(completionPanel, /setWizardSignatureSpells/)
  assert.match(completionPanel, /Учёный/)
  assert.doesNotMatch(adapterSource, /costs:\s*\[\s*\]/)
})
