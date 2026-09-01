import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { resolveCharacterContract } from "../src/character-engine/index.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"

const migration = fs.readFileSync("supabase/migrations/20260829114500_class_text_voss_audit.sql", "utf8")
const clericFollowup = fs.readFileSync("supabase/migrations/20260829115000_cleric_subclass_text_voss_audit.sql", "utf8")
const gmRulePass = fs.readFileSync("supabase/migrations/20260829121000_gm_rule_text_fighter_cleric.sql", "utf8")
const referenceGuide = fs.readFileSync("src/components/reference/ReferenceGuide.tsx", "utf8")
const authoringContract = fs.readFileSync("docs/REFERENCE_AUTHORING.md", "utf8")

function auditedBundle(): CharacterTemplateBundle {
  return {
    template: {
      id: "text-audit-fighter",
      campaign_id: "campaign",
      kind: "class",
      slug: "text-audit-fighter",
      name: "Тестовый воин",
      description: "Тестовый класс для проверки текстового слоя.",
      version: 1,
      mechanics: [],
      choices: [],
      parent_template_id: null,
      unlock_level: null,
      catalog_key: "class:text-audit-fighter",
      catalog_revision: "text-audit-v1",
      source_kind: "official",
      source_label: "Internal test",
      is_builtin: true,
      mechanical_summary: "Воин расходует ограниченный запас на короткий рывок, после чего запас полностью возвращается после долгого отдыха.",
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
      template_id: "text-audit-fighter",
      template_level: 1,
      selected_choices: {},
      assigned_at: "2026-08-29T00:00:00Z",
      updated_at: "2026-08-29T00:00:00Z",
    },
    levels: [{
      id: "text-audit-level-1",
      template_id: "text-audit-fighter",
      level: 1,
      choices: [],
      mechanics: [
        {
          id: "text-audit-feature",
          type: "grant",
          target: "feature",
          key: "class:text-audit-fighter:grim-step",
          sourceKey: "grim-step",
          payload: {
            label: "Мрачный шаг",
            description: "Бонусным действием потратьте 1 использование Мрачного шага и переместитесь на 15 футов, не провоцируя атаки по возможности. Запас полностью восстанавливается после долгого отдыха.",
            authorComment: "Ноги спасли больше героев, чем баллады готовы признать. Баллады вообще отвратительно считают.",
          },
        },
        {
          id: "text-audit-resource",
          type: "resource",
          key: "grim_step",
          label: "Мрачный шаг",
          max: 1,
          recharge: "long_rest",
          sourceKey: "grim-step",
        },
        {
          id: "text-audit-action",
          type: "action",
          key: "grim_step",
          label: "Мрачный шаг",
          economy: "bonus_action",
          resourceKey: "grim_step",
          resourceCost: 1,
          sourceKey: "grim-step",
        },
      ],
    }],
  }
}

test("text audit is presentation-only and does not rewrite structured class mechanics", () => {
  assert.match(migration, /Text-only audit/)
  assert.match(clericFollowup, /Presentation-only continuation/)
  assert.match(gmRulePass, /Text-only GM adjudication pass/)
  assert.match(migration, /\{payload,authorComment\}/)
  assert.match(migration, /\{payload,description\}/)
  assert.match(gmRulePass, /\{payload,description\}/)
  for (const source of [migration, clericFollowup, gmRulePass]) {
    assert.doesNotMatch(source, /jsonb_set\([^\n]*\{payload,mechanic\}/)
    assert.doesNotMatch(source, /jsonb_set\([^\n]*\{resourceCosts\}/)
    assert.doesNotMatch(source, /jsonb_set\([^\n]*\{effects\}/)
    assert.doesNotMatch(source, /jsonb_set\([^\n]*\{max\}/)
  }
})

test("rules-facing text rejects placeholder language and spells out the audited choices", () => {
  for (const source of [migration, clericFollowup, gmRulePass]) {
    assert.doesNotMatch(source, /расширяет возможности/iu)
    assert.doesNotMatch(source, /усиливает возможности/iu)
    assert.doesNotMatch(source, /становится эффективнее/iu)
    assert.doesNotMatch(source, /развивает направление/iu)
  }
  assert.match(migration, /Если выбран «Улучшение характеристик», увеличьте одну характеристику на 2 либо две характеристики на 1/)
  assert.match(migration, /На 3 уровне выберите Воинский архетип/)
  assert.match(migration, /На 3 уровне выберите домен Жреца/)
  assert.match(migration, /Посланник рыцарства даёт три эффекта/)
  assert.match(clericFollowup, /уровень которой не ниже уровня заклинания/)
  assert.match(gmRulePass, /провалили проверку характеристики/)
  assert.match(gmRulePass, /применение Второго дыхания по этому правилу не расходуется/)
  assert.match(gmRulePass, /Божественная искра/)
  assert.match(gmRulePass, /Изгнание нежити/)
  assert.match(gmRulePass, /subclass:cleric:grave-domain/)
  assert.match(gmRulePass, /subclass:cleric:knowledge-domain/)
})

test("authoring contract makes GM adjudication authoritative and CE bookkeeping explicit", () => {
  assert.match(authoringContract, /GM-facing text adjudicates the outcome/)
  assert.match(authoringContract, /Character Engine is bookkeeping/)
  assert.match(authoringContract, /not automatically refunded/)
  assert.match(authoringContract, /separate explicit rule says it does/)
  assert.match(authoringContract, /what the GM checks/)
  assert.match(gmRulePass, /'ce_role','resource_bookkeeping'/)
  assert.match(gmRulePass, /spend_on_activation_unless_feature_explicitly_refunds/)
})

test("Voss voice is explicit and feature comments are attached at every feature layer", () => {
  assert.match(migration, /'feature_author','Рейнар Восс'/)
  assert.match(migration, /'циничный','саркастичный','чёрный юмор'/)
  assert.match(migration, /audit_feature_mechanics_text\(t\.mechanics\)/)
  assert.match(migration, /audit_feature_choices_text\(t\.choices\)/)
  assert.match(migration, /audit_feature_mechanics_text\(l\.mechanics\)/)
  assert.match(migration, /audit_feature_choices_text\(l\.choices\)/)
  assert.match(clericFollowup, /subclass:cleric:%/)
  assert.match(gmRulePass, /'feature_author','Рейнар Восс'/)
  assert.match(gmRulePass, /'циничный','саркастичный','чёрный юмор'/)
  assert.match(authoringContract, /Рейнар Восс/)
  assert.match(authoringContract, /цинич|цинизм/i)
  assert.match(authoringContract, /саркаст/i)
  assert.match(authoringContract, /ч[её]рн/i)
})

test("generic class and subclass cards render explanation, exact rule and separate Voss comment", () => {
  assert.match(referenceGuide, /authorExplanation/)
  assert.match(referenceGuide, /authorComment/)
  assert.match(referenceGuide, /payloadText\(mechanic, "authorExplanation"\)/)
  assert.match(referenceGuide, /payloadText\(mechanic, "authorComment"\)/)

  const start = referenceGuide.indexOf('className="reference-feature-detail-content"')
  const end = referenceGuide.indexOf("</main>", start)
  const detail = referenceGuide.slice(start, end)
  const explanationIndex = detail.indexOf("Восс объясняет")
  const ruleIndex = detail.indexOf("Точное правило")
  const commentIndex = detail.indexOf("Комментарий Восса")
  assert.ok(explanationIndex >= 0 && ruleIndex > explanationIndex && commentIndex > ruleIndex)
})

test("the audited text shape still passes the strict class gate and reaches the real resolver and CE", () => {
  const bundle = auditedBundle()
  assert.doesNotThrow(() => assertClassPackageQuality([bundle]))

  const resolution = resolveTemplateBundles([bundle], 1)
  assert.ok(resolution.contributions.length >= 3)

  const contract = resolveCharacterContract({
    base: {
      id: "hero",
      name: "Hero",
      level: 1,
      abilities: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 },
      baseMaxHp: 12,
      baseSpeed: 30,
    },
    state: { currentHp: 12, tempHp: 0, resources: {} },
    contributions: resolution.contributions,
  })

  assert.ok(contract.actions.some((action) => action.key === "grim_step"))
  assert.ok(contract.resources.some((resource) => resource.key === "grim_step"))
})
