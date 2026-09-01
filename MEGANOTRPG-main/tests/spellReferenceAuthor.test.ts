import assert from "node:assert/strict"
import test from "node:test"

import { spellAuthorAttitudes, spellAuthorVoiceRules, spellReferenceAuthor } from "../src/data/spellReferenceAuthor.ts"
import { spellClassOptions } from "../src/lib/spellCatalog.ts"

test("spellbook author has one stable attitude for every supported base class", () => {
  const expected = new Set(spellClassOptions.map((item) => item.value))
  const actual = new Set(spellAuthorAttitudes.map((item) => item.classKey))

  assert.equal(actual.size, expected.size)
  for (const classKey of expected) assert.ok(actual.has(classKey), `Missing author attitude for ${classKey}`)
})

test("Reynar Voss voice keeps explanation, exact rules and personal sarcasm separate", () => {
  assert.equal(spellReferenceAuthor.name, "Рейнар Восс")
  assert.ok(spellAuthorVoiceRules.some((rule) => rule.includes("authorExplanation")))
  assert.ok(spellAuthorVoiceRules.some((rule) => rule.includes("authorComment")))
  assert.ok(spellAuthorVoiceRules.some((rule) => rule.includes("Восс объясняет")))
  assert.ok(spellAuthorVoiceRules.some((rule) => /услов|цен|огранич/i.test(rule)))
})

test("author relationships keep the agreed class bias", () => {
  const byClass = new Map(spellAuthorAttitudes.map((item) => [item.classKey, item]))

  assert.equal(byClass.get("ranger")?.respect, "любит")
  assert.equal(byClass.get("fighter")?.respect, "любит")
  assert.equal(byClass.get("cleric")?.respect, "презирает")
  assert.equal(byClass.get("druid")?.respect, "не доверяет")
  assert.equal(byClass.get("rogue")?.respect, "терпит")
  assert.equal(byClass.get("artificer")?.respect, "терпит")
  assert.equal(byClass.get("wizard")?.respect, "не доверяет")
  assert.match(byClass.get("druid")?.summary || "", /Круг Луны/)
  assert.match(byClass.get("cleric")?.summary || "", /тыл|выход/i)
})
