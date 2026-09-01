import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const app = fs.readFileSync("src/App.tsx", "utf8")
const topBar = fs.readFileSync("src/components/app/TopBar.tsx", "utf8")
const reference = fs.readFileSync("src/components/reference/ReferenceGuide.tsx", "utf8")
const druid = fs.readFileSync("src/data/classes/druidReference.ts", "utf8")
const clarity = fs.readFileSync("supabase/migrations/20260828010000_druid_rule_clarity.sql", "utf8")

test("rules reference has an actual app entry point and campaign catalog", () => {
  assert.match(topBar, /onOpenReference/)
  assert.match(topBar, /aria-label="Справочник"/)
  assert.match(app, /onOpenReference=\{\(\)=>setReferenceOpen\(true\)\}/)
  assert.match(app, /<ReferenceGuide campaignId=\{campaignId\}/)
  assert.match(reference, /useRuleTemplates\(campaignId\)/)
})

test("subclasses are navigable detail pages with real level progression", () => {
  assert.match(reference, /"subclass-detail"/)
  assert.match(reference, /function openSubclass/)
  assert.match(reference, /onClick=\{\(\) => openSubclass\(subclass\)\}/)
  assert.match(reference, /Прогрессия подкласса/)
  assert.match(reference, /buildTemplateFeatures\(selectedSubclassTemplate, levels\)/)
})

test("Druid resource exchanges are explicit instead of relying on vague prose", () => {
  assert.match(druid, /ячейку(?: заклинаний)? ЛЮБОГО уровня/)
  assert.match(druid, /ячейка 1, 3 или 9 уровня всё равно возвращает только 1 использование Дикой формы/)
  assert.match(druid, /потратьте 1 использование Дикой формы и восстановите одну потраченную ячейку именно 1 уровня/)
  assert.match(druid, /1 форма → ячейка 2 уровня; 2 формы → одна ячейка 4 уровня/)
  assert.match(clarity, /уровень ячейки не влияет на обмен/i)
})
