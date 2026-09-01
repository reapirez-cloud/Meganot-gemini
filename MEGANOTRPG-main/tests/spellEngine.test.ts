import assert from "node:assert/strict"
import test from "node:test"

import {
  CharacterEngineInputError,
  SpellConflictError,
  applySpellResourceOption,
  resolveCharacter,
  setSpellAccessPrepared,
  spellMethodSaveDcTarget,
  spellPreparedFactKey,
  type BaseCharacter,
  type CharacterContribution,
  type CharacterState,
} from "../src/character-engine/index.ts"

const base: BaseCharacter = {
  id: "spell-test",
  name: "Spell Test",
  level: 4,
  abilities: {
    strength: 8,
    dexterity: 10,
    constitution: 12,
    intelligence: 14,
    wisdom: 18,
    charisma: 16,
  },
  baseMaxHp: 24,
  baseSpeed: 30,
}

const source = (id: string, name: string, sourceType?: string) => ({
  id,
  name,
  ...(sourceType ? { sourceType } : {}),
})

const blessIdentity = {
  name: "Bless",
  level: 1,
  school: "enchantment",
}

const slot1: CharacterContribution = {
  id: "slot-1-resource",
  kind: "grant",
  operation: "GRANT",
  target: "resource",
  key: "spell-slot-1",
  payload: { max: 4, recharge: { triggers: ["long_rest"], restore: "full" } },
  source: source("cleric-slots", "Ячейки клирика", "class"),
}

const slot2: CharacterContribution = {
  id: "slot-2-resource",
  kind: "grant",
  operation: "GRANT",
  target: "resource",
  key: "spell-slot-2",
  payload: { max: 3, recharge: { triggers: ["long_rest"], restore: "full" } },
  source: source("cleric-slots", "Ячейки клирика", "class"),
}

const clericBless: CharacterContribution = {
  id: "cleric-bless",
  kind: "grant",
  operation: "GRANT",
  target: "spell",
  key: "bless",
  variantKey: "cleric",
  payload: {
    spell: blessIdentity,
    preparation: { mode: "prepared" },
    methods: [
      {
        key: "slots",
        kind: "spell_slots",
        ability: "wisdom",
        resourceOptions: [
          {
            key: "slot-1",
            castLevel: 1,
            costs: [{ key: "spell-slot-1", amount: 1 }],
          },
          {
            key: "slot-2",
            castLevel: 2,
            costs: [{ key: "spell-slot-2", amount: 1 }],
          },
        ],
      },
    ],
  },
  source: source("cleric", "Клирик", "class"),
}

const domainBless: CharacterContribution = {
  id: "domain-bless",
  kind: "grant",
  operation: "GRANT",
  target: "spell",
  key: "bless",
  variantKey: "life-domain",
  payload: {
    spell: blessIdentity,
    preparation: { mode: "always_prepared" },
    methods: [
      {
        key: "slots",
        kind: "spell_slots",
        ability: "wisdom",
        resourceOptions: [
          {
            key: "slot-1",
            castLevel: 1,
            costs: [{ key: "spell-slot-1", amount: 1 }],
          },
          {
            key: "slot-2",
            castLevel: 2,
            costs: [{ key: "spell-slot-2", amount: 1 }],
          },
        ],
      },
    ],
  },
  source: source("life-domain", "Домен Жизни", "subclass"),
}

test("no spell access grants means no spell cards", () => {
  const resolved = resolveCharacter(base, { currentHp: 24, tempHp: 0 }, [])
  assert.deepEqual(resolved.spells, [])
})

test("one spell identity becomes one card with separate concrete access sources", () => {
  const resolved = resolveCharacter(
    base,
    {
      currentHp: 24,
      tempHp: 0,
      resources: {
        "spell-slot-1": { current: 4 },
        "spell-slot-2": { current: 3 },
      },
    },
    [slot1, slot2, clericBless, domainBless],
  )

  assert.equal(resolved.spells.length, 1)
  const bless = resolved.spells[0]!
  assert.equal(bless.key, "bless")
  assert.equal(bless.identity.name, "Bless")
  assert.equal(bless.accesses.length, 2)

  const cleric = bless.accesses.find((access) => access.key === "cleric")!
  const domain = bless.accesses.find((access) => access.key === "life-domain")!
  assert.equal(cleric.sources[0]?.source.name, "Клирик")
  assert.equal(domain.sources[0]?.source.name, "Домен Жизни")
  assert.equal(cleric.sources[0]?.source.sourceType, "class")
  assert.equal(domain.sources[0]?.source.sourceType, "subclass")
  assert.equal(cleric.prepared, false)
  assert.equal(cleric.available, false)
  assert.equal(domain.prepared, true)
  assert.equal(domain.available, true)
  assert.equal(domain.methods[0]?.attackBonus?.value, 6)
  assert.equal(domain.methods[0]?.saveDc?.value, 14)
})

test("mutable preparation lives in State and is changed immutably", () => {
  const state: CharacterState = {
    currentHp: 24,
    tempHp: 0,
    resources: { "spell-slot-1": { current: 1 } },
  }
  const prepared = setSpellAccessPrepared(state, "bless", "cleric", true)

  assert.equal(state.facts, undefined)
  assert.equal(prepared.facts?.[spellPreparedFactKey("bless", "cleric")], true)

  const access = resolveCharacter(base, prepared, [slot1, clericBless]).spells[0]!.accesses[0]!
  assert.equal(access.prepared, true)
  assert.equal(access.available, true)
})

test("a casting method may ignore preparation independently, enabling ritual-like access", () => {
  const ritualSpell: CharacterContribution = {
    id: "ritual-access",
    kind: "grant",
    operation: "GRANT",
    target: "spell",
    key: "detect-magic",
    variantKey: "wizard-book",
    payload: {
      spell: { name: "Detect Magic", level: 1, school: "divination", ritual: true },
      preparation: { mode: "prepared" },
      methods: [
        { key: "slots", kind: "spell_slots", ability: "intelligence" },
        {
          key: "ritual",
          kind: "ritual",
          ability: "intelligence",
          requiresPrepared: false,
        },
      ],
    },
    source: source("wizard-book", "Книга заклинаний", "class"),
  }

  const access = resolveCharacter(base, { currentHp: 24, tempHp: 0 }, [ritualSpell]).spells[0]!
    .accesses[0]!
  assert.equal(access.prepared, false)
  assert.equal(access.methods.find((method) => method.key === "slots")?.available, false)
  assert.equal(access.methods.find((method) => method.key === "ritual")?.available, true)
  assert.equal(access.available, true)
})

test("different accesses can use normal slots, item charges, or free casting without duplicating spell", () => {
  const amuletResource: CharacterContribution = {
    id: "amulet-use-resource",
    kind: "grant",
    operation: "GRANT",
    target: "resource",
    key: "amulet-use",
    payload: { max: 1, recharge: { triggers: ["long_rest"], restore: "full" } },
    source: source("amulet", "Амулет Митры", "item"),
  }
  const amuletBless: CharacterContribution = {
    id: "amulet-bless",
    kind: "grant",
    operation: "GRANT",
    target: "spell",
    key: "bless",
    variantKey: "amulet",
    payload: {
      spell: blessIdentity,
      preparation: { mode: "not_required" },
      methods: [
        {
          key: "amulet-use",
          kind: "item_charge",
          saveDc: { kind: "literal", value: 15 },
          resourceOptions: [
            {
              key: "charge",
              castLevel: 1,
              costs: [{ key: "amulet-use", amount: 1 }],
            },
          ],
        },
      ],
    },
    source: source("amulet", "Амулет Митры", "item"),
  }
  const boonBless: CharacterContribution = {
    id: "boon-bless",
    kind: "grant",
    operation: "GRANT",
    target: "spell",
    key: "bless",
    variantKey: "boon",
    payload: {
      spell: blessIdentity,
      preparation: { mode: "not_required" },
      methods: [{ key: "free", kind: "free", ability: "charisma" }],
    },
    source: source("boon", "Благословение мастера", "boon"),
  }

  const resolved = resolveCharacter(
    base,
    {
      currentHp: 24,
      tempHp: 0,
      resources: {
        "spell-slot-1": { current: 1 },
        "amulet-use": { current: 1 },
      },
    },
    [slot1, clericBless, amuletResource, amuletBless, boonBless],
  )

  const bless = resolved.spells[0]!
  assert.equal(bless.accesses.length, 3)
  assert.equal(bless.accesses.find((access) => access.key === "amulet")?.methods[0]?.saveDc?.value, 15)
  assert.equal(bless.accesses.find((access) => access.key === "boon")?.methods[0]?.attackBonus?.value, 5)
  assert.equal(bless.accesses.find((access) => access.key === "boon")?.methods[0]?.resourceOptions.length, 0)
})

test("resource options expose alternative cast levels and spending one is atomic", () => {
  const state: CharacterState = {
    currentHp: 24,
    tempHp: 0,
    resources: {
      "spell-slot-1": { current: 0 },
      "spell-slot-2": { current: 2 },
    },
  }
  const prepared = setSpellAccessPrepared(state, "bless", "cleric", true)
  const method = resolveCharacter(base, prepared, [slot1, slot2, clericBless]).spells[0]!.accesses[0]!
    .methods[0]!

  assert.equal(method.resourceOptions[0]?.available, false)
  assert.equal(method.resourceOptions[1]?.available, true)
  assert.equal(method.available, true)

  const option = method.resourceOptions[1]!
  const spent = applySpellResourceOption(prepared, option)
  assert.equal(spent.resources?.["spell-slot-2"]?.current, 1)
  assert.equal(prepared.resources?.["spell-slot-2"]?.current, 2)
})

test("spell method attack/DC can be modified through normal numeric contributions", () => {
  const dcBonus: CharacterContribution = {
    id: "bless-dc-bonus",
    kind: "numeric",
    target: spellMethodSaveDcTarget("bless", "life-domain", "slots"),
    operation: "ADD",
    value: 2,
    source: source("holy-focus", "Священный фокус", "item"),
  }
  const access = resolveCharacter(
    base,
    { currentHp: 24, tempHp: 0, resources: { "spell-slot-1": { current: 1 } } },
    [slot1, domainBless, dcBonus],
  ).spells[0]!.accesses[0]!

  assert.equal(access.methods[0]?.saveDc?.value, 16)
  assert.equal(access.methods[0]?.saveDc?.sources[0]?.source.name, "Священный фокус")
})

test("source suppression removes only its access and removes the card after the final access disappears", () => {
  const suppressDomain: CharacterContribution = {
    id: "suppress-domain",
    kind: "suppression",
    operation: "SUPPRESS",
    selector: { kind: "source", sourceId: "life-domain" },
    source: source("gm", "GM effect"),
  }
  const suppressCleric: CharacterContribution = {
    id: "suppress-cleric",
    kind: "suppression",
    operation: "SUPPRESS",
    selector: { kind: "source", sourceId: "cleric" },
    source: source("gm-2", "GM effect 2"),
  }

  const oneLeft = resolveCharacter(base, { currentHp: 24, tempHp: 0 }, [
    clericBless,
    domainBless,
    suppressDomain,
  ])
  assert.equal(oneLeft.spells.length, 1)
  assert.deepEqual(oneLeft.spells[0]!.accesses.map((access) => access.key), ["cleric"])

  const noneLeft = resolveCharacter(base, { currentHp: 24, tempHp: 0 }, [
    clericBless,
    domainBless,
    suppressDomain,
    suppressCleric,
  ])
  assert.deepEqual(noneLeft.spells, [])
})

test("REPLACE changes one access mechanic without creating a second spell card", () => {
  const replacement: CharacterContribution = {
    id: "replace-cleric-bless",
    kind: "grant",
    operation: "REPLACE",
    target: "spell",
    key: "bless",
    variantKey: "cleric",
    priority: 10,
    payload: {
      spell: blessIdentity,
      preparation: { mode: "not_required" },
      methods: [
        {
          key: "miracle",
          kind: "free",
          saveDc: { kind: "literal", value: 17 },
        },
      ],
    },
    source: source("miracle", "Чудо", "effect"),
  }

  const spell = resolveCharacter(base, { currentHp: 24, tempHp: 0 }, [clericBless, replacement])
    .spells[0]!
  assert.equal(spell.accesses.length, 1)
  assert.equal(spell.accesses[0]?.preparationMode, "not_required")
  assert.equal(spell.accesses[0]?.methods[0]?.key, "miracle")
  assert.equal(spell.accesses[0]?.sources[0]?.source.name, "Чудо")
})

test("different identity metadata for the same spell key is an explicit conflict", () => {
  const broken: CharacterContribution = {
    id: "broken-bless",
    kind: "grant",
    operation: "GRANT",
    target: "spell",
    key: "bless",
    variantKey: "broken",
    payload: {
      spell: { name: "Bless", level: 2, school: "enchantment" },
      preparation: { mode: "not_required" },
      methods: [{ key: "free", kind: "free" }],
    },
    source: source("broken", "Broken source"),
  }

  assert.throws(
    () => resolveCharacter(base, { currentHp: 24, tempHp: 0 }, [domainBless, broken]),
    SpellConflictError,
  )
})

test("invalid spell access mechanics are rejected at the Character Core boundary", () => {
  const invalid: CharacterContribution = {
    id: "invalid-spell",
    kind: "grant",
    operation: "GRANT",
    target: "spell",
    key: "invalid",
    variantKey: "class",
    payload: {
      spell: { name: "Invalid", level: 3 },
      preparation: { mode: "prepared" },
      methods: [
        {
          key: "slots",
          kind: "spell_slots",
          resourceOptions: [
            {
              key: "bad-slot",
              castLevel: 2,
              costs: [{ key: "spell-slot-2", amount: 1 }],
            },
          ],
        },
      ],
    },
    source: source("invalid-source", "Invalid source"),
  }

  assert.throws(
    () => resolveCharacter(base, { currentHp: 24, tempHp: 0 }, [invalid]),
    CharacterEngineInputError,
  )
})
