import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  vossExplanationHasBoilerplate,
  vossExplanationHasRulesMeta,
  vossTextHasModernRegister,
} from "../src/data/vossVoice.ts"

const migration = fs.readFileSync("supabase/migrations/20260831100000_wizard_2024_text_pack.sql", "utf8")
const bootstrap = fs.readFileSync("supabase/migrations/20260831100100_wizard_catalog_bootstrap.sql", "utf8")
const reference = fs.readFileSync("src/data/classReference.ts", "utf8")
const ledger = fs.readFileSync("src/rule-templates/CLASS_WORK_STATUS.md", "utf8")

const baseFeatures = [
  "Заклинания",
  "Знаток ритуалов",
  "Магическое восстановление",
  "Учёный",
  "Улучшение характеристик",
  "Запоминание заклинания",
  "Мастерство заклинаний",
  "Эпический дар",
  "Фирменные заклинания",
]

function wizardReferenceBlock() {
  return reference.split('id: "wizard"')[1]?.split("\n  },")[0] ?? ""
}

function wizardLedgerBlock() {
  return ledger.split("## Wizard (`class:wizard`)")[1]?.split("\n---")[0] ?? ""
}

test("Wizard 2024 text package explicitly stops before runtime mechanics", () => {
  assert.match(migration, /CLASS_MIGRATION_SCOPE: presentation/)
  assert.match(migration, /CLASS_WORK_STATUS: wizard:text=READY;mechanics=NOT_STARTED/)
  assert.match(migration, /CLASS_STATUS_LEDGER: src\/rule-templates\/CLASS_WORK_STATUS\.md/)
  assert.match(migration, /spellbook_runtime_required_before_mechanics_ready/)
  assert.match(migration, /Wizard text pass must not smuggle runtime mechanics into presentation scope/)
  assert.doesNotMatch(migration, /'type'\s*,\s*'(?:action|resource|spell|numeric)'/)
  assert.doesNotMatch(migration, /subclass:wizard:/)
})

test("Wizard reference exposes the rebuilt base class and no subclasses", () => {
  const wizard = wizardReferenceBlock()
  assert.match(wizard, /name: "Волшебник"/)
  assert.match(wizard, /nameEn: "Wizard"/)
  assert.match(wizard, /книг(?:а|ой) заклинаний/i)
  assert.match(wizard, /subclasses: \[\]/)
})

test("Wizard exact text covers every base feature present in this subclass-free pass", () => {
  for (const feature of baseFeatures) assert.match(migration, new RegExp(feature), `missing ${feature}`)
  assert.match(migration, /v_feature_count <> 12/)
  assert.match(migration, /wizard-asi-l4/)
  assert.match(migration, /wizard-asi-l8/)
  assert.match(migration, /wizard-asi-l12/)
  assert.match(migration, /wizard-asi-l16/)
})

test("Wizard Spellcasting is self-contained instead of pointing at an unseen table", () => {
  assert.match(migration, /Сл спасброска от ваших заклинаний Волшебника = 8 \+ бонус мастерства \+ модификатор Интеллекта/)
  assert.match(migration, /Число подготовленных заклинаний Волшебника по уровням 1–20: 4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 18, 19, 21, 22, 23, 24, 25/)
  assert.match(migration, /20 — 4\/3\/3\/3\/3\/2\/2\/1\/1/)
  assert.match(migration, /На 1 уровне запишите в книгу 6 заклинаний Волшебника 1 уровня/)
  assert.match(migration, /получаете новый уровень Волшебника, бесплатно добавьте в книгу ещё 2 заклинания/)
  assert.match(migration, /2 часа работы и 50 зм/)
  assert.match(migration, /1 час и 10 зм/)
  assert.match(migration, /Все потраченные ячейки восстанавливаются после долгого отдыха/)
})

test("Wizard high-level rules keep the important 2024 eligibility and recharge limits", () => {
  assert.match(migration, /сумма уровней восстановленных ячеек не может превышать половину вашего уровня Волшебника с округлением вверх/i)
  assert.match(migration, /ни одна восстановленная ячейка не может быть 6 уровня или выше/i)
  assert.match(migration, /оба выбранных заклинания должны иметь время накладывания «Действие»/i)
  assert.match(migration, /после каждого долгого отдыха можно заменить одно из двух выбранных заклинаний/i)
  assert.match(migration, /каждое из двух заклинаний можно один раз наложить как заклинание 3 уровня без траты ячейки/i)
  assert.match(migration, /бесплатное использование каждого заклинания восстанавливается отдельно после короткого или долгого отдыха/i)
})

test("every Wizard feature card has genuinely authored in-world Voss narration", () => {
  const narrations = [...migration.matchAll(/\$voss\$([\s\S]*?)\$voss\$/g)].map((match) => match[1].trim())
  assert.equal(narrations.length, 12)
  assert.equal(new Set(narrations).size, narrations.length, "Wizard Voss narration must be unique per feature card")

  for (const [index, narration] of narrations.entries()) {
    assert.ok(narration.length >= 180, `Wizard Voss narration ${index + 1} is too thin`)
    assert.equal(vossExplanationHasRulesMeta(narration), false, `Wizard Voss narration ${index + 1} leaked mechanics`)
    assert.equal(vossExplanationHasBoilerplate(narration), false, `Wizard Voss narration ${index + 1} leaked boilerplate`)
    assert.equal(vossTextHasModernRegister(narration), false, `Wizard Voss narration ${index + 1} leaked modern register`)
  }

  assert.match(migration, /человек, который посмотрел на устройство мироздания и решил, что главная его проблема — отсутствие хорошего конспекта/)
  assert.match(migration, /Книгу волшебника лучше не мочить/)
})

test("Wizard catalog lifecycle survives the legacy builtin prune without reviving other removed classes", () => {
  assert.match(bootstrap, /CLASS_MIGRATION_SCOPE: infrastructure/)
  assert.match(bootstrap, /'class:fighter', 'class:druid', 'class:cleric', 'class:wizard'/)
  assert.match(bootstrap, /zzzz_campaigns_install_wizard_2024_text_pack/)
  assert.match(bootstrap, /private\.install_wizard_2024_text_pack\(new\.id\)/)
  assert.match(bootstrap, /private\.prune_removed_builtin_class_catalog\(v_campaign\.id\)/)
  assert.doesNotMatch(bootstrap, /class:(?:artificer|bard|barbarian|warlock|monk|paladin|rogue|ranger|sorcerer)'/)
})

test("Wizard ledger keeps text ready while mechanics and subclass work advance honestly", () => {
  const wizard = wizardLedgerBlock()
  assert.match(wizard, /\*\*Text:\*\* `READY`/)
  assert.match(wizard, /\*\*Mechanics\/runtime:\*\* `IN_PROGRESS`/)
  assert.match(wizard, /last_text_audit: 2026-08-31/)
  assert.match(wizard, /last_mechanics_audit_started: 2026-08-31/)
  assert.match(wizard, /subclasses: WAVE_0_CONTRACT_READY_CONTENT_NOT_INCLUDED/)
  assert.match(wizard, /subclass_wave_0: READY_2026_08_31/)
  assert.match(wizard, /subclass_supported_count: 13/)
  assert.match(wizard, /physical spellbook and book-gated preparation are implemented/i)
  assert.match(wizard, /Spellbook as authoritative owned-spell state/)
  assert.match(wizard, /Arcane Recovery: implemented in dev/i)
  assert.match(wizard, /does \*\*not\*\* install empty or unfinished subclass rows/i)
  assert.doesNotMatch(wizard, /\*\*Mechanics\/runtime:\*\* `READY`/)
})
