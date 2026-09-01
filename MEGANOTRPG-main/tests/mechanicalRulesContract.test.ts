import assert from "node:assert/strict"
import test from "node:test"

import { resolveMechanicalRules } from "../src/character-engine/contract.ts"
import type { ResolvedGrant } from "../src/character-engine/index.ts"

const source = {
  contributionId: "c1",
  source: { id: "class:test", name: "Класс", sourceType: "class_template" },
}

function feature(key: string, mechanic: Record<string, unknown>): ResolvedGrant {
  return {
    target: "feature",
    key,
    variantKey: "default",
    payload: { label: key, description: "rule", mechanic } as never,
    sources: [source],
  }
}

test("Character Engine exposes semantic feature mechanics as structured rules", () => {
  const [rule] = resolveMechanicalRules([
    feature("disciple-of-life", {
      kind: "triggered_healing_bonus",
      trigger: { event: "spell_restores_hp" },
      effect: { amount: { flat: 2, plus: "spell_slot_level" } },
    }),
  ])

  assert.ok(rule)
  assert.equal(rule.key, "disciple-of-life")
  assert.equal(rule.integration, "structured")
  assert.equal((rule.mechanic as Record<string, unknown>).kind, "triggered_healing_bonus")
})

test("legacy dice/range hints stay visible but are never labelled fully structured", () => {
  const [rule] = resolveMechanicalRules([
    feature("legacy-feature", {
      dice: ["1d8"],
      rangeFeet: [30],
      savingThrows: ["wisdom"],
    }),
  ])

  assert.ok(rule)
  assert.equal(rule.integration, "summary")
})
