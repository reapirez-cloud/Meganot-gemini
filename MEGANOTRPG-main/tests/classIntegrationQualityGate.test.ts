import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

import {
  CLASS_INTEGRATION_CONTRACT_VERSION,
  INTERNAL_CLASS_DEFINITION_OF_DONE,
  assertClassPackageQuality,
  auditClassPackageQuality,
} from "../src/rule-templates/internalClassQuality.ts"
import type { CharacterTemplateBundle, RuleTemplate } from "../src/rule-templates/types.ts"
import type { StoredMechanics } from "../src/types/characterMechanics.ts"

const SCOPED_MIGRATION_CUTOFF = "20260830000000"
const migrationsDir = "supabase/migrations"

type ClassMigrationScope = "mechanics" | "presentation" | "infrastructure"

function template(): RuleTemplate {
  return {
    id: "strict-class",
    campaign_id: "campaign",
    kind: "class",
    slug: "strict-class",
    name: "Тестовый класс",
    description: "Тестовый внутренний пакет класса.",
    version: 1,
    mechanics: [],
    choices: [],
    parent_template_id: null,
    unlock_level: null,
    catalog_key: "class:strict-test",
    catalog_revision: "strict-test",
    source_kind: "official",
    source_label: "Internal test",
    is_builtin: true,
    mechanical_summary: "Точный тестовый пакет для проверки внутреннего контракта интеграции классов.",
    author_description: "",
    author_comment: "",
    rules_meta: {},
    is_active: true,
    created_by: null,
    created_at: "2026-08-29T00:00:00Z",
    updated_at: "2026-08-29T00:00:00Z",
  }
}

function bundle(mechanics: StoredMechanics): CharacterTemplateBundle {
  return {
    template: { ...template(), mechanics },
    assignment: {
      id: "assignment",
      character_id: "hero",
      template_id: "strict-class",
      template_level: 10,
      selected_choices: {},
      assigned_at: "2026-08-29T00:00:00Z",
      updated_at: "2026-08-29T00:00:00Z",
    },
    levels: [],
  }
}

function sourceFiles(root: string): string[] {
  const result: string[] = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) result.push(...sourceFiles(full))
    else if (/\.(?:ts|tsx)$/.test(entry.name)) result.push(full)
  }
  return result
}

function futureClassMigrationFiles(): string[] {
  return fs.readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql") && name >= `${SCOPED_MIGRATION_CUTOFF}.sql`)
    .filter((name) => {
      const sql = fs.readFileSync(path.join(migrationsDir, name), "utf8")
      return /rule_templates|class|subclass/i.test(sql)
    })
}

function migrationScope(sql: string, name: string): ClassMigrationScope {
  const value = sql.match(/--\s*CLASS_MIGRATION_SCOPE:\s*(mechanics|presentation|infrastructure)\b/i)?.[1]?.toLowerCase()
  assert.ok(value, `${name} must declare CLASS_MIGRATION_SCOPE: mechanics|presentation|infrastructure`)
  return value as ClassMigrationScope
}

test("internal class requirements are code, not player-facing UI", () => {
  assert.equal(CLASS_INTEGRATION_CONTRACT_VERSION, "2026-08-29-strict-v1")
  assert.ok(INTERNAL_CLASS_DEFINITION_OF_DONE.length >= 18)

  for (const file of sourceFiles("src")) {
    if (file.endsWith("internalClassQuality.ts")) continue
    const source = fs.readFileSync(file, "utf8")
    assert.doesNotMatch(source, /from ["'][^"']*internalClassQuality(?:\.ts)?["']/, `${file} must not bundle the developer-only quality contract`)
  }
})

test("the definition of done preserves the Fighter-grade requirements for future classes", () => {
  const text = INTERNAL_CLASS_DEFINITION_OF_DONE.join("\n")
  for (const required of [
    "trigger/condition",
    "vague or placeholder",
    "Finite uses",
    "server-authoritative",
    "Granted spells",
    "Passive numeric",
    "Dependencies",
    "Scene or fiction",
    "Persistent choices",
    "parent class level",
    "sourceKey",
    "low, mid, and high",
    "character sheet and chat",
    "implementation meta",
    "Russian terminology",
    "ambiguity",
    "Build, lint",
  ]) assert.match(text, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"))
})

test("vague or placeholder feature text is rejected", () => {
  const vague = bundle([
    {
      id: "vague",
      type: "grant",
      target: "feature",
      key: "class:strict-test:vague",
      sourceKey: "vague",
      payload: { label: "Нечёткая способность", description: "У вас что-то есть, и вы можете что-то применять по ситуации." },
    },
  ])
  const codes = auditClassPackageQuality([vague]).map((issue) => issue.code)
  assert.ok(codes.includes("vague_description"))
  assert.throws(() => assertClassPackageQuality([vague]), /quality gate failed/)
})

test("vague mechanical summaries are rejected before a class is called complete", () => {
  const vagueSummary = bundle([])
  vagueSummary.template.mechanical_summary = "Этот класс расширяет возможности персонажа особым образом и становится эффективнее."
  const codes = auditClassPackageQuality([vagueSummary]).map((issue) => issue.code)
  assert.ok(codes.includes("unclear_summary"))
})

test("finite rest-recharging abilities cannot hide behind prose-only accounting", () => {
  const incomplete = bundle([
    {
      id: "finite-feature",
      type: "grant",
      target: "feature",
      key: "class:strict-test:finite",
      sourceKey: "finite",
      payload: {
        label: "Точный рывок",
        description: "Бонусным действием переместитесь на 30 футов. Использований: 1; запас полностью восстанавливается после долгого отдыха.",
      },
    },
    {
      id: "finite-action",
      type: "action",
      key: "finite_dash",
      label: "Точный рывок",
      economy: "bonus_action",
      sourceKey: "finite",
    },
  ])
  const codes = auditClassPackageQuality([incomplete]).map((issue) => issue.code)
  assert.ok(codes.includes("finite_use_without_resource"))
})

test("a finite deliberate action cannot have only a resource and prose", () => {
  const incomplete = bundle([
    {
      id: "finite-feature",
      type: "grant",
      target: "feature",
      key: "class:strict-test:finite",
      sourceKey: "finite",
      payload: {
        label: "Точный рывок",
        description: "Бонусным действием переместитесь на 30 футов. Использований: 1; запас полностью восстанавливается после долгого отдыха.",
      },
    },
    {
      id: "finite-resource",
      type: "resource",
      key: "finite_dash",
      label: "Точный рывок",
      max: 1,
      recharge: "long_rest",
      sourceKey: "finite",
    },
  ])
  const codes = auditClassPackageQuality([incomplete]).map((issue) => issue.code)
  assert.ok(codes.includes("finite_action_without_action"))
})

test("class actions cannot exist without a matching player-facing explanation", () => {
  const unexplained = bundle([
    {
      id: "hidden-action",
      type: "action",
      key: "mystery_button",
      label: "Непонятная кнопка",
      economy: "action",
      sourceKey: "mystery-button",
    },
  ])
  const codes = auditClassPackageQuality([unexplained]).map((issue) => issue.code)
  assert.ok(codes.includes("action_without_explanation"))
})

test("a precise feature with matching resource and action passes the internal audit", () => {
  const precise = bundle([
    {
      id: "finite-feature",
      type: "grant",
      target: "feature",
      key: "class:strict-test:finite",
      sourceKey: "finite",
      payload: {
        label: "Точный рывок",
        description: "Бонусным действием переместитесь на 30 футов, не провоцируя атаки по возможности. Использований: 1; запас полностью восстанавливается после долгого отдыха.",
      },
    },
    {
      id: "finite-resource",
      type: "resource",
      key: "finite_dash",
      label: "Точный рывок",
      max: 1,
      recharge: "long_rest",
      sourceKey: "finite",
    },
    {
      id: "finite-action",
      type: "action",
      key: "finite_dash",
      label: "Точный рывок",
      economy: "bonus_action",
      resourceKey: "finite_dash",
      resourceCost: 1,
      sourceKey: "finite",
    },
  ])
  assert.doesNotThrow(() => assertClassPackageQuality([precise]))
})

test("implementation language is rejected from player-facing class rules", () => {
  const leaked = bundle([
    {
      id: "meta",
      type: "grant",
      target: "feature",
      key: "class:strict-test:meta",
      sourceKey: "meta",
      payload: {
        label: "Сбойная карточка",
        description: "Character Engine через парсер применяет этот эффект после миграции и показывает его игроку как возможность.",
      },
    },
  ])
  const codes = auditClassPackageQuality([leaked]).map((issue) => issue.code)
  assert.ok(codes.includes("implementation_meta"))
})

test("future class migrations declare scope and mechanics migrations pass the strict package gate", () => {
  const migrations = futureClassMigrationFiles()
  assert.ok(migrations.length > 0, "scope cutoff must cover current class infrastructure work")

  for (const name of migrations) {
    const sql = fs.readFileSync(path.join(migrationsDir, name), "utf8")
    const scope = migrationScope(sql, name)
    if (scope !== "mechanics") continue

    assert.match(sql, /--\s*CLASS_INTEGRATION_STRICT:\s*(?:class|subclass):[a-z0-9:_-]+/i, `${name} must declare the strict class integration contract`)
    const testPath = sql.match(/--\s*CLASS_PACKAGE_TEST:\s*([^\s]+)/i)?.[1]
    assert.ok(testPath, `${name} must point to its class package test`)
    assert.ok(fs.existsSync(testPath), `${name} points to missing ${testPath}`)
    const packageTest = fs.readFileSync(testPath, "utf8")
    assert.match(packageTest, /assertClassPackageQuality/, `${testPath} must run the internal quality auditor`)
    assert.match(packageTest, /resolveTemplateBundles/, `${testPath} must exercise the real class parser`)
    assert.match(packageTest, /resolveCharacterContract/, `${testPath} must reach the resolved CE contract`)

    assert.doesNotMatch(sql, /расширяет возможности|усиливает возможности|становится эффективнее|TODO|TBD|FIXME/i, `${name} contains vague or placeholder class text`)
    assert.doesNotMatch(sql, /["']enforcement["']\s*[:,]\s*["']gm["']|_confirmed\b|_available\b/i, `${name} invents fake GM/runtime state`)
  }
})

test("developer notes make migration scope and the strict mechanics gate mandatory", () => {
  const notes = fs.readFileSync("src/rule-templates/CLASS_INTEGRATION_NOTES.md", "utf8")
  assert.match(notes, /CLASS_MIGRATION_SCOPE/)
  assert.match(notes, /mechanics\|presentation\|infrastructure/)
  assert.match(notes, /internalClassQuality\.ts/)
  assert.match(notes, /assertClassPackageQuality/)
  assert.match(notes, /CLASS_INTEGRATION_STRICT/)
  assert.match(notes, /CLASS_PACKAGE_TEST/)
  assert.match(notes, /недосказан/i)
})
