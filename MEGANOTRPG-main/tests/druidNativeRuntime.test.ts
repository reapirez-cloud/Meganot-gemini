import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  resolveCharacterContract,
  type CharacterEngineInput,
  type CharacterSource,
} from "../src/character-engine/index.ts"
import { contributionForStoredMechanic } from "../src/lib/characterMechanics.ts"
import type { StoredActionMechanic, StoredResourceMechanic } from "../src/types/characterMechanics.ts"

const migration = fs.readFileSync(
  "supabase/migrations/20260828184500_druid_resource_runtime_finalization.sql",
  "utf8",
)

const notes = fs.readFileSync("src/rule-templates/CLASS_INTEGRATION_NOTES.md", "utf8")
const resourceRuntime = fs.readFileSync("src/lib/resourceRuntime.ts", "utf8")
const classRuntime = fs.readFileSync("src/lib/classResourceRuntime.ts", "utf8")
const legacyAdapter = fs.readFileSync("src/lib/legacyCharacterEngineAdapter.ts", "utf8")

const source: CharacterSource = {
  id: "template:class:druid:v3:source:wild-shape",
  name: "Дикая форма",
  sourceType: "class_template",
}

const resource: StoredResourceMechanic = {
  id: "wild-shape-resource",
  type: "resource",
  key: "wild_shape",
  label: "Дикая форма",
  max: 2,
  recharge: ["short_rest", "long_rest"],
}

const action: StoredActionMechanic = {
  id: "wild-shape-action",
  type: "action",
  key: "wild_shape",
  label: "Дикая форма",
  economy: "action",
  resourceCosts: [{ key: "wild_shape", amount: 1 }],
}

function input(): CharacterEngineInput {
  return {
    base: {
      id: "druid",
      name: "Друид",
      level: 5,
      abilities: { strength: 10, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 18, charisma: 8 },
      baseMaxHp: 34,
      baseSpeed: 30,
    },
    state: { currentHp: 34, tempHp: 0, resources: { wild_shape: { current: 2 } } },
    contributions: [
      contributionForStoredMechanic(resource, source),
      contributionForStoredMechanic(action, source),
    ],
  }
}

test("Druid Wild Shape resolves as resource accounting, not simulated transformation state", () => {
  const contract = resolveCharacterContract(input())
  const wildShape = contract.actions.find((entry) => entry.key === "wild_shape")
  assert.ok(wildShape)
  assert.equal(wildShape.available, true)
  assert.equal(wildShape.resourceCosts[0]!.stateKey, "wild_shape")
  assert.equal(wildShape.effects.length, 0)
  assert.match(wildShape.sources[0]!.contributionId, /:mechanic:wild-shape-action$/)
})

test("final Druid migration removes fake GM runtime flags and keeps real resource conversions", () => {
  assert.doesNotMatch(migration, /"enforcement":"gm"/)
  assert.doesNotMatch(migration, /wild_shape_empty_confirmed/)
  assert.doesNotMatch(migration, /wild_resurgence_slot_available/)
  assert.doesNotMatch(migration, /"key":"wild_shape_active","operation":"SET"/)
  assert.match(migration, /druid-wild-shape-end/)
  assert.match(migration, /druid-wild-companion-action/)
  assert.match(migration, /wild_resurgence_slot_exchange/)
  assert.match(migration, /"maximum":0/)
  assert.match(migration, /use_character_template_resource_action/)
  assert.match(migration, /spend_character_resources/)
  assert.match(migration, /class_spells_use_shared_slots/)
})

test("resource runtime treats spell slots like normal CE resources", () => {
  assert.doesNotMatch(resourceRuntime, /filter\(\(resource\) => !resource\.stateKey\.startsWith\("spell_slot_"\)\)/)
  assert.match(migration, /Spell slots and\n-- class pools are the same CE runtime primitive/)
  assert.doesNotMatch(migration, /v_state_key ~ '\^spell_slot_/)
  assert.match(legacyAdapter, /parserOwnedSlotLevels/)
  assert.match(legacyAdapter, /if \(!resources\[key\]\) resources\[key\] = \{ current: Math\.max\(0, max - used\) \}/)
  assert.match(classRuntime, /sync_character_resource_states/)
  assert.match(classRuntime, /spend_character_resources/)
})

test("class integration standard forbids fake GM confirmation state", () => {
  assert.match(notes, /CE is a calculator and resource ledger/)
  assert.match(notes, /Do \*\*not\*\* create fake parser state/)
  assert.match(notes, /scene\/fiction requirements are explained, not faked as parser state/)
})
