import assert from "node:assert/strict"
import test from "node:test"

import {
  FormulaConflictError,
  actionAttackBonusTarget,
  applyCharacterEvent,
  createTemporaryEffectController,
  explainCharacter,
  resolveCharacterContract,
  resolvedDynamicSections,
  spellMethodSaveDcTarget,
  spellPreparedFactKey,
  type BaseCharacter,
  type CharacterContribution,
  type CharacterEngineInput,
  type CharacterSource,
  type CharacterState,
  type FormulaExpression,
  type ResolvedCharacterContract,
} from "../src/character-engine/index.ts"

const ref = (key: string): FormulaExpression => ({ kind: "reference", key })
const literal = (value: number): FormulaExpression => ({ kind: "literal", value })
const add = (...terms: FormulaExpression[]): FormulaExpression => ({ kind: "add", terms })

const source = (
  id: string,
  name: string,
  sourceType?: string,
  parentSourceId?: string,
): CharacterSource => ({
  id,
  name,
  ...(sourceType ? { sourceType } : {}),
  ...(parentSourceId ? { parentSourceId } : {}),
})

const williamBase: BaseCharacter = {
  id: "william-nightmare",
  name: "Вильям Кидд",
  level: 4,
  abilities: {
    strength: 8,
    dexterity: 8,
    constitution: 7,
    intelligence: 10,
    wisdom: 18,
    charisma: 19,
  },
  baseMaxHp: 19,
  baseSpeed: 30,
}

const cleric = source("cleric", "Клирик", "class")
const domain = source("life-domain", "Домен Жизни", "subclass", cleric.id)
const frogSchool = source("frog-school", "Школа жабьей магии", "custom")
const healer = source("field-healer", "Полевой лекарь", "feature")
const armor = source("strange-armor", "Странный доспех", "item")
const ring = source("protection-ring", "Кольцо защиты", "item")
const race = source("human", "Человек", "race")
const background = source("wanderer", "Странник", "background")
const mace = source("mace", "Булава", "item")
const enchantment = source("mace-enchantment", "Зачарование булавы", "item", mace.id)
const gmOverride = source("gm-override", "Решение мастера", "gm_effect")
const limp = source("gm-limp", "Хромота", "gm_effect")
const brooch = source("cursed-brooch", "Проклятая брошь", "item")
const broochCurse = source("brooch-curse", "Яд броши", "item_feature", brooch.id)
const antimagic = source("antimagic-zone", "Антимагия", "gm_effect")

function initialWilliamState(): CharacterState {
  return {
    currentHp: 19,
    tempHp: 0,
    resources: {
      "spell-slot-1": { current: 2 },
      "spell-slot-2": { current: 0 },
    },
    facts: {
      "equipment.protection-ring.equipped": true,
      "status.antimagic": false,
      [spellPreparedFactKey("command", "cleric")]: true,
    },
  }
}

function williamContributions(state: CharacterState): CharacterContribution[] {
  const limpController = createTemporaryEffectController({
    id: "limp-expiration",
    effectSource: limp,
    state,
    event: "long_rest",
    durationEvents: 3,
  })

  return [
    {
      id: "frog-int",
      kind: "numeric",
      target: "abilities.intelligence",
      operation: "ADD",
      value: 1,
      source: frogSchool,
    },
    {
      id: "frog-wis",
      kind: "numeric",
      target: "abilities.wisdom",
      operation: "SUBTRACT",
      value: 1,
      source: frogSchool,
    },
    {
      id: "frog-talk",
      kind: "grant",
      operation: "GRANT",
      target: "feature",
      key: "talk-to-frog",
      payload: { label: "Разговор с жабой" },
      source: frogSchool,
    },
    {
      id: "frogs-love-you",
      kind: "grant",
      operation: "GRANT",
      target: "trait",
      key: "frogs-love-you",
      source: frogSchool,
    },
    {
      id: "medicine-expertise",
      kind: "grant",
      operation: "GRANT",
      target: "proficiency",
      key: "skill:medicine",
      payload: { rank: 2 },
      source: healer,
    },
    {
      id: "armor-ac",
      kind: "formula",
      target: "combat.ac",
      operation: "SET_FORMULA",
      formula: add(literal(12), ref("abilities.dexterity.modifier")),
      source: armor,
      priority: 10,
    },
    {
      id: "ring-ac",
      kind: "numeric",
      target: "combat.ac",
      operation: "ADD",
      value: 1,
      source: ring,
      condition: {
        kind: "state",
        key: "equipment.protection-ring.equipped",
        operator: "EQUALS",
        value: true,
      },
    },
    {
      id: "race-fire-resistance",
      kind: "grant",
      operation: "GRANT",
      target: "resistance",
      key: "fire",
      source: race,
    },
    {
      id: "ring-fire-resistance",
      kind: "grant",
      operation: "GRANT",
      target: "resistance",
      key: "fire",
      source: ring,
      condition: {
        kind: "state",
        key: "equipment.protection-ring.equipped",
        operator: "EQUALS",
        value: true,
      },
    },
    {
      id: "race-common",
      kind: "grant",
      operation: "GRANT",
      target: "language",
      key: "common",
      source: race,
    },
    {
      id: "background-common",
      kind: "grant",
      operation: "GRANT",
      target: "language",
      key: "common",
      source: background,
    },
    {
      id: "old-divine-symbol",
      kind: "grant",
      operation: "GRANT",
      target: "feature",
      key: "divine-symbol",
      payload: { label: "Старый символ" },
      source: cleric,
      priority: 0,
    },
    {
      id: "gm-divine-symbol",
      kind: "grant",
      operation: "REPLACE",
      target: "feature",
      key: "divine-symbol",
      payload: { label: "Новый символ" },
      source: gmOverride,
      priority: 10,
    },
    {
      id: "slot-1-resource",
      kind: "grant",
      operation: "GRANT",
      target: "resource",
      key: "spell-slot-1",
      payload: {
        max: 4,
        recharge: { triggers: ["long_rest"], restore: "full" },
        label: "Ячейки 1 уровня",
      },
      source: cleric,
    },
    {
      id: "slot-2-resource",
      kind: "grant",
      operation: "GRANT",
      target: "resource",
      key: "spell-slot-2",
      payload: {
        max: 3,
        recharge: { triggers: ["long_rest"], restore: "full" },
        label: "Ячейки 2 уровня",
      },
      source: cleric,
    },
    {
      id: "mace-action",
      kind: "grant",
      operation: "GRANT",
      target: "action",
      key: "mace",
      payload: {
        label: "Булава",
        economy: "action",
        range: { kind: "melee", reach: 5, unit: "ft" },
        attack: {
          bonus: add(ref("abilities.strength.modifier"), ref("core.proficiencyBonus")),
          target: "armor_class",
        },
        damage: [
          {
            key: "bludgeoning",
            type: "bludgeoning",
            dice: { count: 1, sides: 6 },
            modifier: ref("abilities.strength.modifier"),
          },
        ],
      },
      source: mace,
    },
    {
      id: "mace-plus-one",
      kind: "numeric",
      target: actionAttackBonusTarget("mace"),
      operation: "ADD",
      value: 1,
      source: enchantment,
    },
    {
      id: "command-cleric",
      kind: "grant",
      operation: "GRANT",
      target: "spell",
      key: "command",
      variantKey: "cleric",
      payload: {
        spell: { name: "Command", level: 1, school: "enchantment" },
        preparation: { mode: "prepared", defaultPrepared: false },
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
      source: cleric,
    },
    {
      id: "command-domain",
      kind: "grant",
      operation: "GRANT",
      target: "spell",
      key: "command",
      variantKey: "domain",
      payload: {
        spell: { name: "Command", level: 1, school: "enchantment" },
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
      source: domain,
    },
    {
      id: "limp-speed",
      kind: "numeric",
      target: "combat.speed",
      operation: "SUBTRACT",
      value: 10,
      source: limp,
    },
    {
      id: "limp-feature",
      kind: "grant",
      operation: "GRANT",
      target: "feature",
      key: "limping",
      source: limp,
    },
    limpController.suppression,
    {
      id: "brooch-charisma",
      kind: "numeric",
      target: "abilities.charisma",
      operation: "ADD",
      value: 2,
      source: brooch,
    },
    {
      id: "brooch-poison-immunity",
      kind: "grant",
      operation: "GRANT",
      target: "immunity",
      key: "poison",
      source: broochCurse,
    },
    {
      id: "antimagic-brooch-suppression",
      kind: "suppression",
      operation: "SUPPRESS",
      selector: { kind: "source", sourceId: brooch.id },
      source: antimagic,
      condition: {
        kind: "state",
        key: "status.antimagic",
        operator: "EQUALS",
        value: true,
      },
    },
  ]
}

function williamInput(
  state = initialWilliamState(),
  contributions = williamContributions(state),
): CharacterEngineInput {
  return { base: williamBase, state, contributions }
}

function resolveWilliam(state = initialWilliamState()): ResolvedCharacterContract {
  return resolveCharacterContract(williamInput(state))
}

function findCommandSaveDc(contract: ResolvedCharacterContract, accessKey: string): number {
  const spell = contract.spells.find((candidate) => candidate.key === "command")
  const access = spell?.accesses.find((candidate) => candidate.key === accessKey)
  const method = access?.methods.find((candidate) => candidate.key === "slots")
  assert.ok(method?.saveDc)
  return method.saveDc.value
}

test("William nightmare stack resolves all layers together without manual rollback", () => {
  const state = initialWilliamState()
  const contributions = williamContributions(state)
  const data = williamInput(state, contributions)
  const snapshot = JSON.stringify(data)
  const contract = resolveCharacterContract(data)

  assert.equal(contract.abilities.intelligence.value, 11)
  assert.equal(contract.abilities.wisdom.value, 17)
  assert.equal(contract.abilities.charisma.value, 21)
  assert.equal(contract.skills.medicine.proficiencyRank, 2)
  assert.equal(contract.skills.medicine.bonus.value, 7)
  assert.equal(contract.combat.ac.value, 12)
  assert.equal(contract.combat.speed.value, 20)

  const fire = contract.capabilities.resistances.find((grant) => grant.key === "fire")
  assert.ok(fire)
  assert.equal(fire.sources.length, 2)

  const common = contract.capabilities.languages.find((grant) => grant.key === "common")
  assert.ok(common)
  assert.equal(common.sources.length, 2)

  const divineSymbol = contract.capabilities.features.find((grant) => grant.key === "divine-symbol")
  assert.ok(divineSymbol)
  assert.deepEqual(divineSymbol.payload, { label: "Новый символ" })
  assert.deepEqual(divineSymbol.sources.map((entry) => entry.source.name), ["Решение мастера"])

  const action = contract.actions.find((candidate) => candidate.stateKey === "mace")
  assert.ok(action?.attack)
  assert.equal(action.attack.bonus.value, 2)
  assert.equal(action.damage[0]?.modifier.value, -1)

  assert.equal(contract.spells.length, 1)
  assert.equal(contract.spells[0]?.accesses.length, 2)
  assert.equal(findCommandSaveDc(contract, "cleric"), 13)
  assert.equal(findCommandSaveDc(contract, "domain"), 13)
  assert.equal(contract.spells[0]?.available, true)

  assert.deepEqual(
    contract.resources.map((resource) => [resource.stateKey, resource.current, resource.max.value]),
    [
      ["spell-slot-1", 2, 4],
      ["spell-slot-2", 0, 3],
    ],
  )

  const sections = resolvedDynamicSections(contract)
  for (const section of [
    "resistances",
    "immunities",
    "languages",
    "proficiencies",
    "features",
    "traits",
    "resources",
    "actions",
    "spells",
  ] as const) {
    assert.equal(sections.includes(section), true, `missing dynamic section ${section}`)
  }

  const wisdomExplanation = explainCharacter(data, {
    kind: "number",
    target: "abilities.wisdom",
  })
  assert.equal(wisdomExplanation.value, 17)
  assert.match(wisdomExplanation.summary, /Разговор|жаб|frog|Школа/i)

  assert.equal(JSON.stringify(data), snapshot, "resolution must not mutate nightmare input")
})

test("removing the frog source fully recomputes downstream values", () => {
  const state = initialWilliamState()
  const contributions = williamContributions(state)
  const withoutFrog = contributions.filter((contribution) => contribution.source.id !== frogSchool.id)
  const contract = resolveCharacterContract(williamInput(state, withoutFrog))

  assert.equal(contract.abilities.intelligence.value, 10)
  assert.equal(contract.abilities.wisdom.value, 18)
  assert.equal(contract.skills.medicine.bonus.value, 8)
  assert.equal(findCommandSaveDc(contract, "cleric"), 14)
  assert.equal(contract.capabilities.features.some((grant) => grant.key === "talk-to-frog"), false)
  assert.equal(contract.capabilities.traits.some((grant) => grant.key === "frogs-love-you"), false)
})

test("three long rests expire GM limp and recover resources through state transitions", () => {
  const initial = initialWilliamState()
  const contributions = williamContributions(initial)
  let state = initial

  for (let rest = 0; rest < 3; rest += 1) {
    const before = resolveCharacterContract(williamInput(state, contributions))
    state = applyCharacterEvent(state, before.resources, "long_rest")
    if (rest < 2) {
      const during = resolveCharacterContract(williamInput(state, contributions))
      assert.equal(during.combat.speed.value, 20)
    }
  }

  const after = resolveCharacterContract(williamInput(state, contributions))
  assert.equal(after.combat.speed.value, 30)
  assert.equal(after.capabilities.features.some((grant) => grant.key === "limping"), false)
  assert.deepEqual(
    after.resources.map((resource) => [resource.stateKey, resource.current]),
    [
      ["spell-slot-1", 4],
      ["spell-slot-2", 3],
    ],
  )
  assert.equal(initial.resources?.["spell-slot-1"]?.current, 2)
  assert.equal(initial.facts?.["rest.long.sequence"], undefined)
})

test("source-wide suppression removes an item and descendant mechanics together", () => {
  const normal = resolveWilliam()
  assert.equal(normal.abilities.charisma.value, 21)
  assert.equal(normal.capabilities.immunities.some((grant) => grant.key === "poison"), true)

  const suppressedState = initialWilliamState()
  suppressedState.facts = { ...(suppressedState.facts ?? {}), "status.antimagic": true }
  const suppressed = resolveCharacterContract(williamInput(suppressedState))

  assert.equal(suppressed.abilities.charisma.value, 19)
  assert.equal(suppressed.capabilities.immunities.some((grant) => grant.key === "poison"), false)
})

test("equipped conditions change resolved mechanics without deleting their sources", () => {
  const equipped = resolveWilliam()
  assert.equal(equipped.combat.ac.value, 12)
  assert.equal(equipped.capabilities.resistances.find((grant) => grant.key === "fire")?.sources.length, 2)

  const unequippedState = initialWilliamState()
  unequippedState.facts = {
    ...(unequippedState.facts ?? {}),
    "equipment.protection-ring.equipped": false,
  }
  const unequipped = resolveCharacterContract(williamInput(unequippedState))

  assert.equal(unequipped.combat.ac.value, 11)
  assert.equal(unequipped.capabilities.resistances.find((grant) => grant.key === "fire")?.sources.length, 1)
})

test("nightmare resolution and explanations are deterministic under contribution shuffle", () => {
  const state = initialWilliamState()
  const contributions = williamContributions(state)
  const variants = [
    contributions,
    contributions.slice().reverse(),
    [...contributions.slice(7), ...contributions.slice(0, 7)],
    contributions.slice().sort((left, right) => right.id.localeCompare(left.id)),
  ]

  const contracts = variants.map((items) => resolveCharacterContract(williamInput(state, items)))
  const canonical = JSON.stringify(contracts[0])
  for (const contract of contracts.slice(1)) {
    assert.equal(JSON.stringify(contract), canonical)
  }

  const explanations = variants.map((items) =>
    explainCharacter(williamInput(state, items), {
      kind: "number",
      target: spellMethodSaveDcTarget("command", "cleric", "slots"),
    }),
  )
  const canonicalExplanation = JSON.stringify(explanations[0])
  for (const explanation of explanations.slice(1)) {
    assert.equal(JSON.stringify(explanation), canonicalExplanation)
  }
})

test("equal-priority contradictory formula replacements fail regardless of input order", () => {
  const left: CharacterContribution = {
    id: "armor-left",
    kind: "formula",
    target: "combat.ac",
    operation: "SET_FORMULA",
    formula: literal(15),
    source: source("armor-left-source", "Левая броня"),
    priority: 10,
  }
  const right: CharacterContribution = {
    id: "armor-right",
    kind: "formula",
    target: "combat.ac",
    operation: "SET_FORMULA",
    formula: literal(17),
    source: source("armor-right-source", "Правая броня"),
    priority: 10,
  }
  const state = initialWilliamState()

  assert.throws(
    () => resolveCharacterContract(williamInput(state, [left, right])),
    FormulaConflictError,
  )
  assert.throws(
    () => resolveCharacterContract(williamInput(state, [right, left])),
    FormulaConflictError,
  )
})

const vitaBase: BaseCharacter = {
  id: "vita-nightmare",
  name: "Vita Morr",
  level: 4,
  abilities: {
    strength: 4,
    dexterity: 10,
    constitution: 12,
    intelligence: 10,
    wisdom: 20,
    charisma: 8,
  },
  baseMaxHp: 27,
  baseSpeed: 30,
  skillProficiencies: {
    perception: 1,
    medicine: 2,
  },
}

test("Vita Morr fixture recomputes stale AC and initiative from current DEX", () => {
  const observant = source("observant", "Наблюдательность", "feature")
  const data: CharacterEngineInput = {
    base: vitaBase,
    state: { currentHp: 27, tempHp: 0 },
    contributions: [
      {
        id: "observant-passive",
        kind: "numeric",
        target: "passives.perception",
        operation: "ADD",
        value: 5,
        source: observant,
      },
    ],
  }

  const contract = resolveCharacterContract(data)

  assert.equal(contract.combat.ac.value, 10, "DEX 10 must produce default AC 10, not stale AC 9")
  assert.equal(contract.combat.initiative.value, 0, "DEX 10 must produce initiative 0, not stale -1")
  assert.equal(contract.skills.perception.bonus.value, 7)
  assert.equal(contract.passives.perception.value, 22)
  assert.equal(contract.skills.medicine.proficiencyRank, 2)
  assert.equal(contract.skills.medicine.bonus.value, 9)
  assert.deepEqual(resolvedDynamicSections(contract), [])
})
