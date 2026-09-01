import assert from "node:assert/strict"
import test from "node:test"

import {
  CatalogSpellRollError,
  catalogSpellToRollRecipe,
  isCatalogSpellRollReady,
  isCatalogSpellRollReviewed,
  type CatalogSpellRollSource,
} from "../src/lib/spellRollCatalog.ts"
import { executeRollRecipe, type DiceRoller } from "../src/roll-engine/index.ts"

const constantRoller = (value: number): DiceRoller => () => value

function spell(overrides: Partial<CatalogSpellRollSource> = {}): CatalogSpellRollSource {
  return {
    slug: "test-spell",
    name_en: "Test Spell",
    name_ru: "Тестовое заклинание",
    spell_level: 1,
    roll_mode: "unclassified",
    roll_recipe: null,
    ...overrides,
  }
}

test("unclassified catalog spell stays unavailable to Roll Engine", () => {
  const source = spell()
  assert.equal(isCatalogSpellRollReviewed(source), false)
  assert.equal(isCatalogSpellRollReady(source), false)
  assert.equal(catalogSpellToRollRecipe(source), null)
})

test("contextual catalog spell is reviewed but waits for external runtime context", () => {
  const source = spell({ slug: "true-strike", spell_level: 0, roll_mode: "contextual" })
  assert.equal(isCatalogSpellRollReviewed(source), true)
  assert.equal(isCatalogSpellRollReady(source), false)
  assert.equal(catalogSpellToRollRecipe(source), null)
})

test("link-only catalog spell becomes a clean link recipe without hidden dice", () => {
  const source = spell({
    slug: "detect-magic",
    name_en: "Detect Magic",
    name_ru: "Обнаружение магии",
    roll_mode: "link",
  })
  assert.equal(isCatalogSpellRollReviewed(source), true)
  assert.equal(isCatalogSpellRollReady(source), true)

  const recipe = catalogSpellToRollRecipe(source)
  assert.deepEqual(recipe, {
    key: "detect-magic",
    name: "Обнаружение магии",
    sourceKind: "spell",
    spellLevel: 1,
    interaction: "link",
  })
})

test("catalog mechanics assemble a full recipe and respect selected cast level", () => {
  const recipe = catalogSpellToRollRecipe(spell({
    slug: "fireball",
    name_en: "Fireball",
    name_ru: "Огненный шар",
    spell_level: 3,
    roll_mode: "roll",
    roll_recipe: {
      sequences: [{
        key: "blast",
        resolution: {
          kind: "save",
          ability: "dexterity",
          dc: { kind: "reference", key: "save_dc" },
          onSuccess: "half",
        },
        effects: [{
          key: "fire",
          kind: "damage",
          damageType: "fire",
          dice: { count: 8, sides: 6 },
          scaling: [{
            kind: "per_level",
            reference: { source: "cast_level" },
            above: 3,
            diceCountPerLevel: 1,
          }],
        }],
      }],
    },
  }))

  assert.ok(recipe)
  const result = executeRollRecipe(
    recipe,
    { characterLevel: 9, spellLevel: 3, castLevel: 5, saveDc: 16 },
    constantRoller(3),
  )
  assert.equal(result.kind, "roll")
  if (result.kind !== "roll") return
  const roll = result.sequences[0]!.instances[0]!.effects[0]!.roll
  assert.deepEqual(roll.dice, { count: 10, sides: 6 })
  assert.deepEqual(roll.rolls, Array(10).fill(3))
  assert.equal(roll.total, 30)
})

test("malformed hidden mechanics fail closed instead of guessing from description", () => {
  assert.throws(
    () => catalogSpellToRollRecipe(spell({ roll_mode: "roll", roll_recipe: { sequences: [] } })),
    CatalogSpellRollError,
  )
  assert.throws(
    () => catalogSpellToRollRecipe(spell({ roll_mode: "link", roll_recipe: { sequences: [] } })),
    CatalogSpellRollError,
  )
  assert.throws(
    () => catalogSpellToRollRecipe(spell({ roll_mode: "contextual", roll_recipe: { sequences: [] } })),
    CatalogSpellRollError,
  )
})
