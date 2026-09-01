import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

import {
  CLASS_RESOURCE_POLICY_VERSION,
  assertClassResourcePolicy,
  auditClassPackageResourcePolicy,
} from "../src/rule-templates/classResourcePolicy.ts"
import type { CharacterTemplateBundle, RuleTemplate } from "../src/rule-templates/types.ts"
import type { StoredMechanics } from "../src/types/characterMechanics.ts"

const RESOURCE_POLICY_MIGRATION_CUTOFF = "20260830013000"

function template(): RuleTemplate {
  return {
    id: "resource-policy-class",
    campaign_id: "campaign",
    kind: "class",
    slug: "resource-policy-class",
    name: "Проверка ресурса",
    description: "Внутренняя проверка политики ресурсов.",
    version: 1,
    mechanics: [],
    choices: [],
    parent_template_id: null,
    unlock_level: null,
    catalog_key: "class:resource-policy-test",
    catalog_revision: "test",
    source_kind: "official",
    source_label: "Internal test",
    is_builtin: true,
    mechanical_summary: "Проверяет только внутреннюю политику учёта классовых ресурсов.",
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
  const value = template()
  return {
    template: { ...value, mechanics },
    assignment: {
      id: "assignment",
      character_id: "hero",
      template_id: value.id,
      template_level: 10,
      selected_choices: {},
      assigned_at: "2026-08-29T00:00:00Z",
      updated_at: "2026-08-29T00:00:00Z",
    },
    levels: [],
  }
}

function feature(sourceKey: string, description: string): StoredMechanics[number] {
  return {
    id: `${sourceKey}-feature`,
    type: "grant",
    target: "feature",
    key: `feature:${sourceKey}`,
    sourceKey,
    payload: { label: sourceKey, description },
  }
}

test("class resource policy is a versioned developer contract", () => {
  assert.equal(CLASS_RESOURCE_POLICY_VERSION, "2026-08-29-short-long-rest-v1")
})

test("short-rest, long-rest, dawn and mixed recovery pools are valid resources", () => {
  const packageBundle = bundle([
    feature("short-pool", "Использований: 2. Весь запас восстанавливается после короткого отдыха."),
    { id: "short", type: "resource", key: "short_pool", label: "Short", max: 2, recharge: "short_rest", sourceKey: "short-pool" },
    feature("long-pool", "Использований: 3. Весь запас восстанавливается после долгого отдыха."),
    { id: "long", type: "resource", key: "long_pool", label: "Long", max: 3, recharge: "long_rest", sourceKey: "long-pool" },
    feature("dawn-pool", "Использований: 1. Использование восстанавливается на рассвете."),
    { id: "dawn", type: "resource", key: "dawn_pool", label: "Dawn", max: 1, recharge: "dawn", sourceKey: "dawn-pool" },
    feature("mixed-pool", "Есть общий запас. После короткого отдыха возвращается 1 использование, после долгого — весь запас."),
    {
      id: "mixed",
      type: "resource",
      key: "mixed_pool",
      label: "Mixed",
      max: 4,
      recharge: "long_rest",
      recoveryRules: [
        { trigger: "short_rest", restore: "amount", amount: 1 },
        { trigger: "long_rest", restore: "full" },
      ],
      sourceKey: "mixed-pool",
    },
  ])
  assert.doesNotThrow(() => assertClassResourcePolicy([packageBundle]))
})

test("manual and never are forbidden for official class counters", () => {
  for (const recharge of ["manual", "never"] as const) {
    const invalidResource = { id: `bad-${recharge}`, type: "resource", key: `bad_${recharge}`, label: recharge, max: 1, recharge, sourceKey: `bad-${recharge}` } as never
    const packageBundle = bundle([
      feature(`bad-${recharge}`, "У способности есть отдельный счётчик применений."),
      invalidResource,
    ])
    const codes = auditClassPackageResourcePolicy([packageBundle]).map((issue) => issue.code)
    assert.ok(codes.includes("class_resource_without_rest_recovery"))
    assert.ok(codes.includes("class_resource_has_forbidden_recovery"))
  }
})

test("reaction and once-per-turn cadence stay unlimited when no recovery pool exists", () => {
  const packageBundle = bundle([
    feature("reaction", "Когда враг попадает по союзнику, можете реакцией применить эту способность. За частотой реакций следит обычное правило боя."),
    { id: "reaction-action", type: "action", key: "reaction_action", label: "Реакция", economy: "reaction", sourceKey: "reaction" },
    feature("turn", "Один раз за свой ход после попадания можете добавить эффект к этой атаке. Отдельного запаса применений у способности нет."),
    { id: "turn-action", type: "action", key: "turn_action", label: "Раз за ход", economy: "special", sourceKey: "turn" },
  ])
  assert.doesNotThrow(() => assertClassResourcePolicy([packageBundle]))
})

test("a fake once-per-turn counter is rejected", () => {
  const invalidCounter = { id: "fake-turn-resource", type: "resource", key: "fake_turn", label: "Раз за ход", max: 1, recharge: "manual", sourceKey: "fake-turn" } as never
  const packageBundle = bundle([
    feature("fake-turn", "Один раз за свой ход после попадания можете применить этот эффект. Отдельного восстановления после отдыха у него нет."),
    invalidCounter,
  ])
  const codes = auditClassPackageResourcePolicy([packageBundle]).map((issue) => issue.code)
  assert.ok(codes.includes("gm_cadence_counter_forbidden"))
})

test("a reaction with a separate long-rest pool remains a real resource", () => {
  const packageBundle = bundle([
    feature("limited-reaction", "Когда существо попадает по вам, можете реакцией применить эффект. Использований равно 3; весь запас восстанавливается после долгого отдыха."),
    { id: "limited-reaction-resource", type: "resource", key: "limited_reaction", label: "Ограниченная реакция", max: 3, recharge: "long_rest", sourceKey: "limited-reaction" },
    { id: "limited-reaction-action", type: "action", key: "limited_reaction", label: "Ограниченная реакция", economy: "reaction", resourceKey: "limited_reaction", resourceCost: 1, sourceKey: "limited-reaction" },
  ])
  assert.doesNotThrow(() => assertClassResourcePolicy([packageBundle]))
})

test("new mechanics migrations must opt into the resource policy and test it", () => {
  const migrationsDir = "supabase/migrations"
  const migrations = fs.readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql") && name >= `${RESOURCE_POLICY_MIGRATION_CUTOFF}.sql`)
    .filter((name) => /CLASS_MIGRATION_SCOPE:\s*mechanics/i.test(fs.readFileSync(path.join(migrationsDir, name), "utf8")))

  for (const name of migrations) {
    const sql = fs.readFileSync(path.join(migrationsDir, name), "utf8")
    assert.match(sql, /--\s*CLASS_RESOURCE_POLICY:\s*short-long-rest-v1\b/i, `${name} must declare CLASS_RESOURCE_POLICY: short-long-rest-v1`)
    const testPath = sql.match(/--\s*CLASS_PACKAGE_TEST:\s*([^\s]+)/i)?.[1]
    assert.ok(testPath && fs.existsSync(testPath), `${name} must point to a package test`)
    const packageTest = fs.readFileSync(testPath, "utf8")
    assert.match(packageTest, /assertClassResourcePolicy/, `${testPath} must run the class resource policy`)
  }
})
