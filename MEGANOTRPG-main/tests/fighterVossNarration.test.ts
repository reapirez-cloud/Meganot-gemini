import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  fighterClassVossNarration,
  getFighterBaseVossNarration,
  getFighterSubclassFeatureVossNarration,
  getFighterSubclassVossNarration,
} from "../src/data/classes/fighterVossNarration.ts"
import {
  vossExplanationHasBoilerplate,
  vossExplanationHasRulesMeta,
  vossTextHasModernRegister,
  vossVoice,
  vossVoiceRules,
} from "../src/data/vossVoice.ts"

const guide = fs.readFileSync("src/components/reference/ReferenceGuide.tsx", "utf8")
const voiceSource = fs.readFileSync("src/data/vossVoice.ts", "utf8")
const migration = fs.readFileSync("supabase/migrations/20260829223000_fighter_voss_narration_source.sql", "utf8")

const baseFeatures: Array<[number, string]> = [
  [1, "Боевой стиль"],
  [1, "Второе дыхание"],
  [1, "Мастерство владения оружием"],
  [2, "Всплеск действий"],
  [2, "Тактическое мышление"],
  [3, "Воинский архетип"],
  [4, "Улучшение характеристик"],
  [5, "Дополнительная атака"],
  [5, "Тактическое смещение"],
  [6, "Улучшение характеристик"],
  [7, "Способность Воинского архетипа"],
  [8, "Улучшение характеристик"],
  [9, "Неукротимый"],
  [9, "Тактический мастер"],
  [10, "Способность Воинского архетипа"],
  [11, "Две дополнительные атаки"],
  [12, "Улучшение характеристик"],
  [13, "Неукротимый"],
  [13, "Изучающие атаки"],
  [14, "Улучшение характеристик"],
  [15, "Способность Воинского архетипа"],
  [16, "Улучшение характеристик"],
  [17, "Всплеск действий"],
  [17, "Неукротимый"],
  [18, "Способность Воинского архетипа"],
  [19, "Эпический дар"],
  [20, "Три дополнительные атаки"],
]

const subclassFeatures: Record<string, Array<[number, string]>> = {
  "arcane-archer": [
    [3, "Магический выстрел"],
    [7, "Зачарованная стрела"],
    [7, "Изгибающийся выстрел"],
    [7, "Дополнительный Магический выстрел"],
    [10, "Дополнительный Магический выстрел"],
    [15, "Всегда готовый выстрел"],
    [15, "Дополнительный Магический выстрел"],
    [18, "Дополнительный Магический выстрел"],
  ],
  "battle-master": [
    [3, "Боевое превосходство"], [7, "Знай своего врага"], [10, "Улучшенное боевое превосходство"], [15, "Неутомимый"], [18, "Совершенное боевое превосходство"],
  ],
  cavalier: [
    [3, "Непоколебимая метка и Рождённый в седле"], [7, "Защитный манёвр"], [10, "Держать строй"], [15, "Свирепый натиск"], [18, "Бдительный защитник"],
  ],
  champion: [
    [3, "Улучшенный критический и Выдающийся атлет"], [7, "Дополнительный Боевой стиль"], [10, "Героический воин"], [15, "Превосходный критический"], [18, "Выживший"],
  ],
  "echo-knight": [
    [3, "Проявление эха и Воплощение ярости"], [7, "Аватар эха"], [10, "Теневой мученик"], [15, "Возврат потенциала"], [18, "Легион одного"],
  ],
  "eldritch-knight": [
    [3, "Заклинания и Связь с оружием"], [7, "Боевая магия"], [10, "Мистический удар"], [15, "Магический рывок"], [18, "Улучшенная боевая магия"],
  ],
  "psi-warrior": [
    [3, "Псионическая сила"], [7, "Телекинетический адепт"], [10, "Защищённый разум"], [15, "Оплот силы"], [18, "Мастер телекинеза"],
  ],
  banneret: [
    [3, "Посланник рыцарства и Групповое оздоровление"], [7, "Групповая тактика"], [10, "Воодушевляющий всплеск"], [15, "Устойчивость команды"], [18, "Вдохновляющий командир"],
  ],
  "rune-knight": [
    [3, "Мощь великана и Рунный резчик"],
    [7, "Рунный щит"],
    [7, "Дополнительная руна"],
    [10, "Великий рост"],
    [10, "Дополнительная руна"],
    [15, "Мастер рун"],
    [15, "Дополнительная руна"],
    [18, "Рунный исполин"],
  ],
  samurai: [
    [3, "Боевой дух"], [7, "Элегантный придворный"], [10, "Неутомимая душа"], [15, "Стремительный удар"], [18, "Стойкость перед смертью"],
  ],
}

function assertNarration(text: string, label: string) {
  assert.ok(text.trim().length >= 100, `${label}: authored narration is too thin`)
  assert.equal(vossExplanationHasRulesMeta(text), false, `${label}: tabletop mechanics leaked into Voss narration`)
  assert.equal(vossExplanationHasBoilerplate(text), false, `${label}: renderer/rules boilerplate leaked into Voss narration`)
  assert.equal(vossTextHasModernRegister(text), false, `${label}: modern/office register leaked into Voss narration`)
}

test("Voss authoring contract explicitly forbids mechanics-first explanations", () => {
  assert.match(vossVoice.explanationStyle, /не упрощённое правило и не перевод механики/iu)
  assert.match(vossVoice.explanationStyle, /рассказ прожжённого приключенца/iu)
  assert.ok(vossVoiceRules.some((rule) => /Запрещён шаблон.*пересказать эффект.*шутк/iu.test(rule)))
  assert.ok(vossVoiceRules.some((rule) => /Нельзя строить authorExplanation из description/iu.test(rule)))
  assert.ok(vossVoiceRules.some((rule) => /не обязан помогать восстановить правило/iu.test(rule)))
  assert.doesNotMatch(voiceSource, /сначала скажите, что способность фактически позволяет сделать/iu)
  assert.doesNotMatch(voiceSource, /Тридцать футов мгновенного перемещения/iu)
})

test("Fighter class and every base progression card have unique in-world narration", () => {
  const all = [fighterClassVossNarration]
  assertNarration(fighterClassVossNarration, "class:fighter")

  for (const [level, name] of baseFeatures) {
    const text = getFighterBaseVossNarration(level, name)
    assert.ok(text, `${level}: ${name} is missing authored narration`)
    assertNarration(text, `${level}: ${name}`)
    all.push(text)
  }

  assert.equal(new Set(all).size, all.length, "base Fighter narration must not reuse one text across progression cards")
})

test("all ten Fighter archetypes and every supported archetype feature have unique narration", () => {
  const all: string[] = []

  for (const subclassId of Object.keys(subclassFeatures)) {
    const intro = getFighterSubclassVossNarration(subclassId)
    assert.ok(intro, `${subclassId} is missing subclass narration`)
    assertNarration(intro, `subclass:${subclassId}`)
    all.push(intro)

    for (const [level, name] of subclassFeatures[subclassId]) {
      const text = getFighterSubclassFeatureVossNarration(subclassId, level, name)
      assert.ok(text, `${subclassId} ${level}: ${name} is missing authored narration`)
      assertNarration(text, `${subclassId} ${level}: ${name}`)
      all.push(text)
    }
  }

  assert.equal(new Set(all).size, all.length, "Fighter subclass narration must not reuse one text across different cards")
})

test("ReferenceGuide overrides stored Fighter paraphrases with the authored narration registry", () => {
  assert.match(guide, /fighterClassVossNarration/)
  assert.match(guide, /getFighterBaseVossNarration\(feature\.level, feature\.name\)/)
  assert.match(guide, /getFighterSubclassVossNarration\(id\)/)
  assert.match(guide, /getFighterSubclassFeatureVossNarration\(selectedSubclass\.id, feature\.level, feature\.name\)/)
  assert.match(guide, /function fallbackFeatureExplanation\(\)\s*\{\s*return ""/)
})

test("database cleanup removes legacy Fighter paraphrases without touching exact mechanics", () => {
  assert.match(migration, /PRESENTATION ONLY/)
  assert.match(migration, /src\/data\/classes\/fighterVossNarration\.ts/)
  assert.match(migration, /never_derive_from_mechanics/)
  assert.match(migration, /#- '\{payload,authorExplanation\}'/)
  assert.match(migration, /#- '\{presentation,authorExplanation\}'/)
  assert.match(migration, /rt\.mechanics/)
  assert.match(migration, /rtl\.mechanics/)
  assert.match(migration, /class:fighter/)
  assert.match(migration, /subclass:fighter:%/)
  assert.doesNotMatch(migration, /\{payload,description\}/)
  assert.doesNotMatch(migration, /\{payload,authorComment\}/)
  assert.doesNotMatch(migration, /spell_catalog|spell_reference/)
})
