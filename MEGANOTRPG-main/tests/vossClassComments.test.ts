import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { druidReference } from "../src/data/classes/druidReference.ts"
import { spellAuthorAttitudes, spellAuthorVoiceRules } from "../src/data/spellReferenceAuthor.ts"
import {
  vossCommentHasDeveloperLeak,
  vossExplanationHasRulesMeta,
  vossTextHasModernRegister,
  vossTextViolatesVoice,
  vossVoice,
  vossVoiceRules,
} from "../src/data/vossVoice.ts"

const migration = fs.readFileSync("supabase/migrations/20260829162500_voss_reference_voice_contract.sql", "utf8")
const referenceGuide = fs.readFileSync("src/components/reference/ReferenceGuide.tsx", "utf8")
const mechanicTypes = fs.readFileSync("src/types/characterMechanics.ts", "utf8")

test("Reynar Voss has one explicit adventurer voice and worldview", () => {
  assert.equal(vossVoice.name, "Рейнар Восс")
  assert.ok(vossVoice.traits.includes("саркастичный"))
  assert.ok(vossVoice.traits.includes("ироничный"))
  assert.ok(vossVoice.traits.includes("циничный"))
  assert.ok(vossVoice.traits.includes("чёрный юмор"))
  assert.match(vossVoice.magicStance, /не уважает магию|опасн/i)
  assert.match(vossVoice.mundaneStance, /немагическ|профессионал/i)
  assert.match(vossVoice.clericStance, /чужой щит/i)
  assert.match(vossVoice.clericStance, /Жизнь.*Могил.*Кузн.*Войн/i)
  assert.match(vossVoice.druidStance, /Круг Луны|рук/i)
  assert.match(vossVoice.fighterStance, /Воинов Восс любит/i)
  assert.equal(spellAuthorVoiceRules, vossVoiceRules)
})

test("Voss contract fixes authored explanation -> exact rule -> personal comment order", () => {
  assert.ok(vossVoiceRules.some((rule) => /«Восс объясняет».*точное правило.*Комментарий Восса/i.test(rule)))
  assert.ok(vossVoiceRules.some((rule) => /authorExplanation/i.test(rule)))
  assert.ok(vossVoiceRules.some((rule) => /authorComment/i.test(rule)))
  assert.ok(vossVoiceRules.some((rule) => /НЕ объясняет механику простыми словами/i.test(rule)))
  assert.ok(vossVoiceRules.some((rule) => /Запрещён шаблон.*пересказать эффект.*шутк/i.test(rule)))

  const start = referenceGuide.indexOf('className="reference-feature-detail-content"')
  const end = referenceGuide.indexOf("</main>", start)
  const detail = referenceGuide.slice(start, end)
  const explanationIndex = detail.indexOf("Восс объясняет")
  const ruleIndex = detail.indexOf("Точное правило")
  const commentIndex = detail.indexOf("Комментарий Восса")
  assert.ok(explanationIndex >= 0)
  assert.ok(ruleIndex > explanationIndex, "exact rule must render after Voss explanation")
  assert.ok(commentIndex > ruleIndex, "Voss personal comment must render after the exact rule")
})

test("developer, tabletop-meta and modern office register are rejected from Voss copy", () => {
  assert.equal(vossCommentHasDeveloperLeak("Могильщики любят, когда вы ошибаетесь."), false)
  assert.equal(vossCommentHasDeveloperLeak("В этой кампании Character Engine спишет ресурс."), true)
  assert.equal(vossTextHasModernRegister("Профсоюз требует страховку и отдел кадров."), true)
  assert.equal(vossTextHasModernRegister("Если медведь смотрит слишком умно, не гладьте его."), false)
  assert.equal(vossTextViolatesVoice("Юрист проверил лицензию."), true)
  assert.equal(vossExplanationHasRulesMeta("Потратьте 1к8 и добавьте модификатор к спасброску."), true)
  assert.equal(vossExplanationHasRulesMeta("Старый воин видит ошибку раньше, чем враг понимает, что её совершил."), false)
})

test("static Druid reference has separate plain explanations and clean Voss comments", () => {
  assert.ok(druidReference.features.length > 0)
  for (const feature of druidReference.features) {
    assert.ok(feature.explanation.trim(), `Missing Voss explanation on Druid feature: ${feature.name}`)
    assert.ok(feature.voss.trim(), `Missing Voss comment on Druid feature: ${feature.name}`)
    assert.equal(vossTextViolatesVoice(feature.explanation), false, `Voice leak in Druid explanation: ${feature.name}`)
    assert.equal(vossTextViolatesVoice(feature.voss), false, `Voice leak in Druid comment: ${feature.name}`)
  }

  for (const subclass of druidReference.subclasses) {
    assert.ok(subclass.explanation.trim(), `Missing Voss explanation on Druid subclass: ${subclass.name}`)
    assert.ok(subclass.voss.trim(), `Missing Voss comment on Druid subclass: ${subclass.name}`)
    assert.equal(vossTextViolatesVoice(subclass.explanation), false, `Voice leak in Druid subclass explanation: ${subclass.name}`)
    assert.equal(vossTextViolatesVoice(subclass.voss), false, `Voice leak in Druid subclass comment: ${subclass.name}`)
  }

  const moon = druidReference.subclasses.find((entry) => entry.id === "moon")
  assert.match(moon?.voss || "", /ест вашу руку.*Отдельную от вас/i)
})

test("class attitude samples obey the same narrator register", () => {
  for (const attitude of spellAuthorAttitudes) {
    assert.equal(vossTextViolatesVoice(attitude.summary), false, `Voice leak in ${attitude.classKey} summary`)
    assert.equal(vossTextViolatesVoice(attitude.sample), false, `Voice leak in ${attitude.classKey} sample`)
  }
  assert.match(spellAuthorAttitudes.find((item) => item.classKey === "fighter")?.summary || "", /оруж|оста/i)
  assert.match(spellAuthorAttitudes.find((item) => item.classKey === "cleric")?.summary || "", /тыл|выход/i)
  assert.match(spellAuthorAttitudes.find((item) => item.classKey === "druid")?.sample || "", /руку.*Отдельно/i)
})

test("renderer can read explanation and comment from feature payload or generic presentation", () => {
  assert.match(mechanicTypes, /authorExplanation\?: string/)
  assert.match(mechanicTypes, /authorComment\?: string/)
  assert.match(referenceGuide, /mechanic\.presentation\?\.authorExplanation\?\.trim\(\)/)
  assert.match(referenceGuide, /payloadText\(mechanic, "authorExplanation"\)/)
  assert.match(referenceGuide, /mechanic\.presentation\?\.authorComment\?\.trim\(\)/)
  assert.match(referenceGuide, /payloadText\(mechanic, "authorComment"\)/)
  assert.match(referenceGuide, /function fallbackFeatureExplanation\(\)\s*\{\s*return ""/)
})

test("Voss reference migration is presentation-only, authored and regression-gated", () => {
  assert.match(migration, /CLASS_WORK_STATUS: fighter:text=READY;mechanics=NOT_AUDITED; druid:text=READY;mechanics=NOT_AUDITED; cleric:text=READY;mechanics=NOT_AUDITED/)
  assert.match(migration, /CLASS_STATUS_LEDGER: src\/rule-templates\/CLASS_WORK_STATUS\.md/)
  assert.match(migration, /PRESENTATION ONLY/)
  assert.match(migration, /authorExplanation/)
  assert.match(migration, /authorComment/)
  assert.match(migration, /authorExplanation values authored by 20260829151113 are intentionally preserved/)
  assert.match(migration, /Воин — редкий случай/)
  assert.match(migration, /Друид смотрит на человеческое тело/)
  assert.match(migration, /Жрец договаривается с небесами/)
  assert.doesNotMatch(migration, /voss_plain_explanation/i)
  assert.doesNotMatch(migration, /Это запас применений|Это отдельное действие|Это постоянное владение/)

  assert.doesNotMatch(migration, /jsonb_build_object\([^\n]*(?:resourceCosts|effects|requirements|max)/)
  assert.doesNotMatch(migration, /private\.(?:fighter|druid|cleric)_(?:resource|action|value)\s*\(/i)
})
