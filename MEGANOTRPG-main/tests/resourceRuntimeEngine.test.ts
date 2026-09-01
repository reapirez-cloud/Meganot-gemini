import assert from "node:assert/strict"
import test from "node:test"

import { resolveCharacterContract, spendResource, type CharacterEngineInput } from "../src/character-engine/index.ts"
import { clearCharacterTemplateBundles, characterTemplateContributions, registerCharacterTemplateBundles } from "../src/rule-templates/registry.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"

const characterId = "runtime-resource-character"
const now = "2026-08-27T00:00:00Z"

const bundle: CharacterTemplateBundle = {
  assignment: { id: "assignment", character_id: characterId, template_id: "monk", template_level: 5, selected_choices: {}, assigned_at: now, updated_at: now },
  template: {
    id: "monk", campaign_id: "campaign", kind: "class", slug: "monk", name: "Монах", description: "", version: 1, is_active: true, created_by: null, created_at: now, updated_at: now,
    choices: [],
    mechanics: [
      { id: "ki", type: "resource", key: "resource:ki", label: "Ци", max: { kind: "reference", key: "source.level" }, recharge: ["short_rest", "long_rest"], initial: "full" },
      { id: "flurry", type: "action", key: "action:flurry", label: "Шквал ударов", economy: "bonus_action", resourceKey: "resource:ki", resourceCost: 1, damage: [{ key: "primary", damageType: "дробящий", count: 1, sides: 4 }] },
    ],
  },
  levels: [],
}

test("template resource can scale from class level and expose persistent current state", () => {
  registerCharacterTemplateBundles(characterId, [bundle])
  try {
    const input: CharacterEngineInput = {
      base: { id: characterId, name: "Ниель", level: 10, abilities: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 16, charisma: 10 }, baseMaxHp: 40, baseSpeed: 40 },
      state: { currentHp: 40, tempHp: 0, resources: { "resource:ki": { current: 3 } } },
      contributions: characterTemplateContributions(characterId, 10),
    }
    const contract = resolveCharacterContract(input)
    const ki = contract.resources.find((resource) => resource.stateKey === "resource:ki")!
    assert.equal(ki.max.value, 5, "source.level must resolve from assigned class level, not total character level")
    assert.equal(ki.current, 3)
    assert.deepEqual(ki.recharge.triggers, ["short_rest", "long_rest"])
    const flurry = contract.actions.find((action) => action.key === "action:flurry")!
    assert.equal(flurry.available, true)
    assert.equal(flurry.resourceCosts[0]?.current, 3)
    assert.equal(spendResource(input.state, ki, 1).resources?.["resource:ki"]?.current, 2)
  } finally {
    clearCharacterTemplateBundles(characterId)
  }
})
