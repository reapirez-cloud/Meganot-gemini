import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const SCOPED_MIGRATION_CUTOFF = "20260830000000"
const migrationsDir = "supabase/migrations"
const ledger = fs.readFileSync("src/rule-templates/CLASS_WORK_STATUS.md", "utf8")
const pointer = fs.readFileSync("src/rule-templates/INTERNAL_CLASS_QUALITY_README.txt", "utf8")
const fighterReadyPass = fs.readFileSync("supabase/migrations/20260829124500_fighter_text_ready_finalization.sql", "utf8")

function scopedClassMigrations(): string[] {
  return fs.readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql") && name >= `${SCOPED_MIGRATION_CUTOFF}.sql`)
    .filter((name) => /class|subclass/i.test(fs.readFileSync(`${migrationsDir}/${name}`, "utf8")))
}

test("class work status ledger is a mandatory maintained checkpoint", () => {
  assert.match(ledger, /REQUIRED MAINTENANCE FILE/)
  assert.match(ledger, /update this file in the same work session/i)
  assert.match(ledger, /TEXT READY does not mean MECHANICS READY/)

  for (const classKey of ["fighter", "druid", "cleric"]) {
    const heading = classKey === "fighter" ? "Fighter" : classKey === "druid" ? "Druid" : "Cleric"
    const section = ledger.split(`## ${heading} (\`class:${classKey}\`)`)[1]?.split("\n---")[0] ?? ""
    assert.match(section, /\*\*Text:\*\* `READY`/)
    assert.match(section, /\*\*Mechanics\/runtime:\*\* `IN_PROGRESS`/)
  }

  assert.match(pointer, /Read CLASS_WORK_STATUS\.md FIRST/)
  assert.match(pointer, /mark it IN_PROGRESS/i)
  assert.match(pointer, /Update CLASS_WORK_STATUS\.md before finishing/)
  assert.match(pointer, /status ledger entry is stale/)
})

test("future class migrations declare scope; class-content scopes also point to the ledger", () => {
  const migrations = scopedClassMigrations()
  assert.ok(migrations.length > 0, "scoped cutoff must include current class infrastructure work")

  for (const name of migrations) {
    const sql = fs.readFileSync(`${migrationsDir}/${name}`, "utf8")
    const scope = sql.match(/--\s*CLASS_MIGRATION_SCOPE:\s*(mechanics|presentation|infrastructure)\b/i)?.[1]?.toLowerCase()
    assert.ok(scope, `${name} must declare CLASS_MIGRATION_SCOPE`)
    if (scope === "infrastructure") continue
    assert.match(sql, /--\s*CLASS_WORK_STATUS:\s*[^\n]+/i, `${name} must declare the affected class work status`)
    assert.match(sql, /--\s*CLASS_STATUS_LEDGER:\s*src\/rule-templates\/CLASS_WORK_STATUS\.md/i, `${name} must point back to the canonical status ledger`)
  }
})

test("historical Fighter description closure declares text ready without claiming mechanics ready", () => {
  assert.match(fighterReadyPass, /CLASS_WORK_STATUS: fighter:text=READY;mechanics=NOT_AUDITED/)
  assert.match(fighterReadyPass, /CLASS_STATUS_LEDGER: src\/rule-templates\/CLASS_WORK_STATUS\.md/)
  assert.match(fighterReadyPass, /Presentation-only Fighter closure/)
  assert.match(fighterReadyPass, /'text','READY'/)
  assert.match(fighterReadyPass, /'mechanics','NOT_AUDITED'/)

  assert.doesNotMatch(fighterReadyPass, /private\.fighter_resource\s*\(/)
  assert.doesNotMatch(fighterReadyPass, /private\.fighter_action\s*\(/)
  assert.doesNotMatch(fighterReadyPass, /private\.fighter_value\s*\(/)
  assert.doesNotMatch(fighterReadyPass, /jsonb_set\([^\n]*(?:resourceCosts|effects|payload,mechanic|max)/)
})

test("Fighter final text pass closes the known GM-facing prose gaps", () => {
  assert.match(fighterReadyPass, /Воплощение ярости/)
  assert.match(fighterReadyPass, /модификатору Телосложения, минимум 1/)
  assert.match(fighterReadyPass, /Число подготовленных заклинаний Волшебника равно/)
  assert.match(fighterReadyPass, /Прогрессия ячеек подкласса/)
  assert.match(fighterReadyPass, /Это отдельный дополнительный Боевой стиль/)
  assert.match(fighterReadyPass, /subclass:fighter:cavalier/)
  assert.match(fighterReadyPass, /subclass:fighter:champion/)
  assert.match(fighterReadyPass, /subclass:fighter:echo-knight/)
  assert.match(fighterReadyPass, /subclass:fighter:samurai/)
})
