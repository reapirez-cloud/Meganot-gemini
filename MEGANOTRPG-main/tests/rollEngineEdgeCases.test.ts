import assert from "node:assert/strict"
import { readdir, readFile } from "node:fs/promises"
import test from "node:test"

import {
  RollEngineError,
  executeRollRecipe,
  validateRollRecipe,
  type RollRecipe,
} from "../src/roll-engine/index.ts"

const controlSpell: RollRecipe = {
  key: "control-spell",
  name: "Control Spell",
  sourceKind: "spell",
  interaction: "roll",
  spellLevel: 2,
  sequences: [
    {
      key: "save",
      resolution: {
        kind: "save",
        ability: "wisdom",
        dc: { kind: "reference", key: "save_dc" },
        onSuccess: "none",
      },
      effects: [],
    },
  ],
}

test("combat/control spell may require only a save and no damage dice", () => {
  const result = executeRollRecipe(controlSpell, {
    characterLevel: 5,
    spellLevel: 2,
    castLevel: 2,
    saveDc: 15,
  })
  assert.equal(result.kind, "roll")
  if (result.kind !== "roll") return
  assert.deepEqual(result.sequences[0]!.instances[0], {
    index: 0,
    resolution: { kind: "save", ability: "wisdom", dc: 15, onSuccess: "none" },
    effects: [],
  })
})

test("empty no-op sequence is rejected instead of pretending to be a roll", () => {
  const recipe: RollRecipe = {
    key: "nothing",
    name: "Nothing",
    interaction: "roll",
    sequences: [{ key: "nothing", resolution: { kind: "none" }, effects: [] }],
  }
  assert.throws(() => validateRollRecipe(recipe), RollEngineError)
})

test("sourceKind is grouping metadata and does not select Roll Engine behavior", () => {
  const base: RollRecipe = {
    key: "generic",
    name: "Generic",
    interaction: "roll",
    sequences: [
      {
        key: "damage",
        resolution: { kind: "automatic" },
        effects: [{ key: "damage", kind: "damage", dice: { count: 1, sides: 6 } }],
      },
    ],
  }
  const roller = () => 4
  const spell = executeRollRecipe({ ...base, sourceKind: "spell" }, { characterLevel: 1 }, roller)
  const weapon = executeRollRecipe({ ...base, sourceKind: "weapon" }, { characterLevel: 1 }, roller)
  const frog = executeRollRecipe({ ...base, sourceKind: "frog_magic" }, { characterLevel: 1 }, roller)
  assert.deepEqual(spell, weapon)
  assert.deepEqual(spell, frog)
})

test("Roll Engine modules stay outside React/Supabase/UI infrastructure", async () => {
  const directory = new URL("../src/roll-engine/", import.meta.url)
  const filenames = (await readdir(directory)).filter((filename) => filename.endsWith(".ts"))
  const forbidden = [/["']react["'/]/, /["']react-dom["'/]/, /["']@supabase\//, /["']vite["'/]/]
  const violations: string[] = []

  for (const filename of filenames) {
    const source = await readFile(new URL(filename, directory), "utf8")
    for (const pattern of forbidden) {
      if (pattern.test(source)) violations.push(filename)
    }
  }
  assert.deepEqual(violations, [])
})
