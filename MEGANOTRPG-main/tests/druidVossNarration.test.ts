import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { druidReference } from "../src/data/classes/druidReference.ts"
import {
  druidClassVossNarration,
  getDruidBaseVossNarration,
  getDruidSubclassFeatureVossNarration,
  getDruidSubclassVossNarration,
} from "../src/data/classes/druidVossNarration.ts"

const guide = fs.readFileSync("src/components/reference/ReferenceGuide.tsx", "utf8")

const subclassFeatures: Record<string, string[]> = {
  dreams: ["Бальзам Летнего Двора", "Очаг лунного света и тени", "Скрытые пути", "Странник во снах"],
  spores: ["Ореол спор и Симбиотическая сущность", "Грибковое заражение", "Распространение спор", "Грибковое тело"],
  shepherd: ["Речь леса и Духовный тотем", "Могучий призыватель", "Дух-хранитель", "Верный призыв"],
  wildfire: ["Заклинания Круга и Огненный дух", "Усиленная связь", "Прижигающее пламя", "Пылающее возрождение"],
  land: ["Заклинания Круга Земли", "Помощь земли", "Природное восстановление", "Защита природы", "Святилище природы"],
  moon: ["Формы круга и заклинания Луны", "Улучшенные формы круга", "Лунный шаг", "Лунная форма", "Лунный шаг · спутник"],
  sea: ["Гнев моря и заклинания Круга", "Связь с водой", "Рождённый бурей", "Дар океана"],
  stars: ["Звёздная карта", "Звёздная форма", "Космическое знамение", "Мерцающие созвездия", "Звёздная форма · усиление", "Полон звёзд"],
}

const rulesMeta = /(?:\b\d+к\d+\b|\bСл\b|\bCR\b|\bHP\b|ячейк|модификатор|бонусн(?:ым|ое) действ|магическ(?:им|ое) действ|\bреакци(?:я|ей|ю)\b|использовани[ея]|\b\d+\s*фут)/iu

function assertNarrative(text: string, label: string) {
  assert.ok(text.trim().length >= 90, `${label}: Voss narration is too thin`)
  assert.doesNotMatch(text, rulesMeta, `${label}: rules/meta language leaked into Voss narration`)
}

test("Druid class and every base feature have authored in-world Voss narration", () => {
  assertNarrative(druidClassVossNarration, "class:druid")
  for (const feature of druidReference.features) {
    const text = getDruidBaseVossNarration(feature.level, feature.name)
    assert.ok(text, `${feature.level}: ${feature.name} is missing authored narration`)
    assertNarrative(text, `${feature.level}: ${feature.name}`)
  }
})

test("all eight Druid circles and every supported circle feature have authored narration", () => {
  const all: string[] = [druidClassVossNarration]

  for (const subclass of druidReference.subclasses) {
    const text = getDruidSubclassVossNarration(subclass.id)
    assert.ok(text, `${subclass.id} is missing subclass narration`)
    assertNarrative(text, subclass.name)
    all.push(text)
  }

  for (const [subclassId, names] of Object.entries(subclassFeatures)) {
    for (const name of names) {
      const text = getDruidSubclassFeatureVossNarration(subclassId, name)
      assert.ok(text, `${subclassId}: ${name} is missing feature narration`)
      assertNarrative(text, `${subclassId}: ${name}`)
      all.push(text)
    }
  }

  for (const feature of druidReference.features) all.push(getDruidBaseVossNarration(feature.level, feature.name))
  assert.equal(new Set(all).size, all.length, "Druid Voss narration must not reuse one text across different cards")
})

test("catalog aliases resolve to the same authored circle voice", () => {
  assert.equal(getDruidSubclassVossNarration("circle-of-dreams"), getDruidSubclassVossNarration("dreams"))
  assert.equal(getDruidSubclassVossNarration("circle-of-spores"), getDruidSubclassVossNarration("spores"))
  assert.equal(getDruidSubclassVossNarration("circle-of-the-shepherd"), getDruidSubclassVossNarration("shepherd"))
  assert.equal(getDruidSubclassVossNarration("circle-of-wildfire"), getDruidSubclassVossNarration("wildfire"))
})

test("ReferenceGuide overrides old Druid rule-paraphrase explanations with authored narration", () => {
  assert.match(guide, /druidClassVossNarration/)
  assert.match(guide, /getDruidBaseVossNarration\(feature\.level, feature\.name\)/)
  assert.match(guide, /getDruidSubclassVossNarration/)
  assert.match(guide, /getDruidSubclassFeatureVossNarration\(selectedSubclass\.id, feature\.name\)/)
})
