import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  clericClassVossNarration,
  clericVossNarrationCoverage,
  getClericBaseVossNarration,
  getClericSubclassFeatureVossNarration,
  getClericSubclassVossNarration,
  normalizeClericDomainId,
} from "../src/data/classes/clericVossNarration.ts"
import { clericVossNarrationRules } from "../src/data/classes/clericVossNarrationContract.ts"
import {
  vossExplanationHasBoilerplate,
  vossExplanationHasRulesMeta,
  vossTextHasModernRegister,
} from "../src/data/vossVoice.ts"

const guide = fs.readFileSync("src/components/reference/ReferenceGuide.tsx", "utf8")
const migration = fs.readFileSync("supabase/migrations/20260829233000_cleric_voss_narration_source.sql", "utf8")
const spellAuthor = fs.readFileSync("src/data/spellReferenceAuthor.ts", "utf8")
const sharedVoice = fs.readFileSync("src/data/vossVoice.ts", "utf8")

function assertNarration(text: string, label: string) {
  assert.ok(text.trim().length >= 100, `${label}: authored narration is too thin`)
  assert.equal(vossExplanationHasRulesMeta(text), false, `${label}: tabletop mechanics leaked into Voss narration`)
  assert.equal(vossExplanationHasBoilerplate(text), false, `${label}: renderer/rules boilerplate leaked into Voss narration`)
  assert.equal(vossTextHasModernRegister(text), false, `${label}: modern/office register leaked into Voss narration`)
}

test("Cleric narration covers the final 84 feature grants plus class and fourteen domains", () => {
  assert.equal(clericVossNarrationCoverage.base.length, 17)
  assert.equal(clericVossNarrationCoverage.subclasses.length, 14)

  const subclassFeatureCount = Object.values(clericVossNarrationCoverage.subclassFeatures)
    .reduce((total, entries) => total + entries.length, 0)
  assert.equal(subclassFeatureCount, 67)
  assert.equal(clericVossNarrationCoverage.base.length + subclassFeatureCount, 84)
})

test("every Cleric card has unique in-world narration without rules vocabulary", () => {
  const all: string[] = [clericClassVossNarration]
  assertNarration(clericClassVossNarration, "class:cleric")

  for (const entry of clericVossNarrationCoverage.base) {
    const separator = entry.indexOf(":")
    const level = Number(entry.slice(0, separator))
    const sourceKey = entry.slice(separator + 1)
    const text = getClericBaseVossNarration(level, sourceKey)
    assert.ok(text, `missing Cleric base narration for ${entry}`)
    assertNarration(text, `class:cleric:${entry}`)
    all.push(text)
  }

  for (const subclassId of clericVossNarrationCoverage.subclasses) {
    const intro = getClericSubclassVossNarration(subclassId)
    assert.ok(intro, `missing Cleric domain narration for ${subclassId}`)
    assertNarration(intro, `subclass:cleric:${subclassId}`)
    all.push(intro)

    const sourceKeys = clericVossNarrationCoverage.subclassFeatures[subclassId] || []
    for (const sourceKey of sourceKeys) {
      const text = getClericSubclassFeatureVossNarration(subclassId, sourceKey)
      assert.ok(text, `missing Cleric feature narration for ${subclassId}:${sourceKey}`)
      assertNarration(text, `subclass:cleric:${subclassId}:${sourceKey}`)
      all.push(text)
    }
  }

  assert.equal(all.length, 99)
  assert.equal(new Set(all).size, all.length, "Cleric Voss narration must not reuse one text across cards")
})

test("Cleric-only contract varies Voss attitude by domain instead of repeating one priest joke", () => {
  assert.ok(clericVossNarrationRules.some((rule) => /нельзя повторять.*трус.*проповед.*чужой щит/iu.test(rule)))
  assert.ok(clericVossNarrationRules.some((rule) => /Жизнь.*Могил.*Кузн.*Войн.*Бур.*Сумер.*Знани/iu.test(rule)))
  assert.ok(clericVossNarrationRules.some((rule) => /домену и sourceKey/iu.test(rule)))

  assert.doesNotMatch(sharedVoice, /Домен меняет угол рассказа\. Жизнь и Могила/)
  assert.doesNotMatch(spellAuthor, /clericVossNarrationContract|clericVossNarrationRules/)
})

test("Cleric domain aliases normalize DB catalog tails without duplicating static domains", () => {
  assert.equal(normalizeClericDomainId("arcana-domain"), "arcana")
  assert.equal(normalizeClericDomainId("life-domain"), "life")
  assert.equal(normalizeClericDomainId("war"), "war")
  assert.match(guide, /selectedClass\.id === "cleric" \? normalizeClericDomainId\(rawId\) : rawId/)
  assert.match(guide, /getClericSubclassVossNarration\(id\)/)
})

test("ReferenceGuide resolves Cleric abilities by sourceKey rather than repeated display names", () => {
  assert.match(guide, /sourceKey: string/)
  assert.match(guide, /for \(const \[groupSourceKey, mechanics\] of groups\.entries\(\)\)/)
  assert.match(guide, /sourceKey: groupSourceKey/)
  assert.match(guide, /getClericBaseVossNarration\(feature\.level, feature\.sourceKey\)/)
  assert.match(guide, /getClericSubclassFeatureVossNarration\(selectedSubclass\.id, feature\.sourceKey\)/)

  const deathStrike = getClericSubclassFeatureVossNarration("death-domain", "divine-strike-l8-1")
  const forgeStrike = getClericSubclassFeatureVossNarration("forge-domain", "divine-strike-l8-1")
  const tempestStrike = getClericSubclassFeatureVossNarration("tempest-domain", "divine-strike-l8-1")
  assert.ok(deathStrike && forgeStrike && tempestStrike)
  assert.notEqual(deathStrike, forgeStrike)
  assert.notEqual(forgeStrike, tempestStrike)
})

test("database cleanup strips only legacy Cleric narration and leaves exact rules and spells alone", () => {
  assert.match(migration, /PRESENTATION ONLY/)
  assert.match(migration, /src\/data\/classes\/clericVossNarration\.ts/)
  assert.match(migration, /domain_and_source_key/)
  assert.match(migration, /never_derive_from_mechanics/)
  assert.match(migration, /#- '\{payload,authorExplanation\}'/)
  assert.match(migration, /#- '\{presentation,authorExplanation\}'/)
  assert.match(migration, /option_mechanics_by_level/)
  assert.match(migration, /class:cleric/)
  assert.match(migration, /subclass:cleric:%/)
  assert.doesNotMatch(migration, /\{payload,description\}/)
  assert.doesNotMatch(migration, /\{payload,authorComment\}/)
  assert.doesNotMatch(migration, /spell_catalog|spell_reference/)
})
