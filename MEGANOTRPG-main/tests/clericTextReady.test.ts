import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const migration = fs.readFileSync("supabase/migrations/20260829153500_cleric_text_ready_finalization.sql", "utf8")
const ledger = fs.readFileSync("src/rule-templates/CLASS_WORK_STATUS.md", "utf8")

const domains = [
  "arcana-domain",
  "death-domain",
  "forge-domain",
  "grave-domain",
  "knowledge-domain",
  "life-domain",
  "light-domain",
  "nature-domain",
  "order-domain",
  "peace-domain",
  "tempest-domain",
  "trickery-domain",
  "twilight-domain",
  "war-domain",
]

test("Cleric closure is presentation-only and declares the correct historical work status", () => {
  assert.match(migration, /CLASS_INTEGRATION_STRICT: class:cleric/)
  assert.match(migration, /CLASS_PACKAGE_TEST: tests\/clericTextReady\.test\.ts/)
  assert.match(migration, /CLASS_WORK_STATUS: cleric:text=READY;mechanics=NOT_AUDITED/)
  assert.match(migration, /CLASS_STATUS_LEDGER: src\/rule-templates\/CLASS_WORK_STATUS\.md/)
  assert.match(migration, /Presentation-only Cleric closure/)
  assert.doesNotMatch(migration, /jsonb_build_object\([^\n]*(?:resourceCosts|effects|requirements|max)/)
  assert.doesNotMatch(migration, /private\.(?:cleric_)?(?:resource|action|value)\s*\(/i)
})

test("Cleric closure covers the base class and all fourteen domains", () => {
  assert.match(migration, /'class:cleric'/)
  for (const domain of domains) assert.match(migration, new RegExp(`subclass:cleric:${domain}`), `missing ${domain}`)
  assert.match(migration, /'spellcasting','Заклинания'/)
  assert.match(migration, /'divine-order','Божественный сан'/)
  assert.match(migration, /'channel-divinity','Божественный канал'/)
  assert.match(migration, /'sear-undead','Испепеление нежити'/)
  assert.match(migration, /'blessed-strikes','Благословенные удары'/)
  assert.match(migration, /'divine-intervention','Божественное вмешательство'/)
  assert.match(migration, /'improved-blessed-strikes','Улучшенные благословенные удары'/)
  assert.match(migration, /'greater-divine-intervention','Высшее божественное вмешательство'/)
})

test("Cleric spellcasting text is self-contained instead of pointing at an unseen table", () => {
  assert.match(migration, /Сл спасброска от ваших заклинаний Жреца = 8 \+ бонус мастерства \+ модификатор Мудрости/)
  assert.match(migration, /Число подготовленных заклинаний Жреца по уровням 1–20/)
  assert.match(migration, /Прогрессия ячеек по уровням Жреца 1–20/)
  assert.match(migration, /4\/3\/3\/3\/3\/2\/2\/1\/1/)
  assert.match(migration, /Все потраченные ячейки восстанавливаются после долгого отдыха/)
})

test("Cleric closure guards every openable reference card and nested feature choice", () => {
  assert.match(migration, /v_features<>84/)
  assert.match(migration, /v_openable<>156/)
  assert.match(migration, /v_missing_openable_voss<>0/)
  assert.match(migration, /option_mechanics_by_level/)
  assert.match(migration, /nested selectable feature rules without Voss/)
  assert.match(migration, /cleric_domain_voss/)
  assert.match(migration, /cleric_template_group_voss/)
})

test("Cleric player text has an immersion regression gate", () => {
  assert.match(migration, /character engine\|runtime\|парсер\|миграц/i)
  assert.match(migration, /в этой кампании\|мы используем\|мы изменили/i)
  assert.match(migration, /совместимост\|редакция правил\|2014\|2024/i)
  assert.match(migration, /developer\/meta leaks/)
})

test("Cleric ledger keeps text READY while the mechanics audit remains open", () => {
  const cleric = ledger.split("## Cleric (`class:cleric`)")[1]?.split("\n---")[0] ?? ""
  assert.match(cleric, /\*\*Text:\*\* `READY`/)
  assert.match(cleric, /\*\*Mechanics\/runtime:\*\* `IN_PROGRESS`/)
  assert.match(cleric, /last_text_audit: 2026-08-29/)
  assert.match(cleric, /last_mechanics_audit_started: 2026-08-29/)
  assert.match(cleric, /fourteen-domain runtime coverage is not yet certified/i)
  assert.match(cleric, /Do not promote Cleric mechanics to `READY`/)
})
