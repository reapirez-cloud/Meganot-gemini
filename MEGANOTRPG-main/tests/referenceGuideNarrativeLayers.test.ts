import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const source = readFileSync(new URL("../src/components/reference/ReferenceGuide.tsx", import.meta.url), "utf8")

test("class and subclass reference keep explanation, exact description, summary and comment separate", () => {
  assert.match(source, /const classExplanation =/)
  assert.match(source, /const classDescription =/)
  assert.match(source, /const classSummary =/)
  assert.match(source, /const classComment =/)
  assert.match(source, /const subclassExplanation =/)
  assert.match(source, /const subclassDescription =/)
  assert.match(source, /const subclassSummary =/)
  assert.match(source, /const subclassComment =/)

  assert.match(source, /reference-voss-explanation surface"><span>Восс объясняет<\/span><p>\{classExplanation\}<\/p>/)
  assert.match(source, /<section className="reference-class-description"><span>Описание класса<\/span><p>\{classDescription\}<\/p><\/section>/)
  assert.match(source, /reference-voss-note surface"><span>Комментарий Восса<\/span><p>\{classComment\}<\/p>/)

  assert.match(source, /reference-voss-explanation surface"><span>Восс объясняет<\/span><p>\{subclassExplanation\}<\/p>/)
  assert.match(source, /Описание подкласса<\/span><p>\{subclassDescription\}/)
  assert.match(source, /Комментарий Восса<\/span><p>\{subclassComment\}/)

  assert.doesNotMatch(source, /const subclassExplanation =[^\n]*selectedSubclass\?\.voss/)
})

test("feature detail renders Voss explanation before the exact rule and comment after it", () => {
  const start = source.indexOf('className="reference-feature-detail-content"')
  const end = source.indexOf("</main>", start)
  const detail = source.slice(start, end)

  const explanation = detail.indexOf("Восс объясняет")
  const rule = detail.indexOf("Точное правило")
  const comment = detail.indexOf("Комментарий Восса")

  assert.ok(explanation >= 0, "feature detail must contain the Voss explanation layer")
  assert.ok(rule > explanation, "exact rule must follow the Voss explanation")
  assert.ok(comment > rule, "Voss personal comment must follow the exact rule")
})
