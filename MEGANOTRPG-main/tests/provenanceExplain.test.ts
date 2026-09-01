import assert from "node:assert/strict"
import test from "node:test"

import {
  actionAttackBonusTarget,
  explainCharacter,
  resourceMaxTarget,
  spellMethodSaveDcTarget,
  type BaseCharacter,
  type CharacterContribution,
  type CharacterEngineInput,
  type ExplanationNode,
  type FormulaExpression,
} from "../src/character-engine/index.ts"

const base: BaseCharacter = {
  id: "explain-test",
  name: "Explain Test",
  level: 5,
  abilities: {
    strength: 10,
    dexterity: 14,
    constitution: 12,
    intelligence: 10,
    wisdom: 18,
    charisma: 10,
  },
  baseMaxHp: 32,
  baseSpeed: 30,
}

const source = (id: string, name: string, parentSourceId?: string) => ({
  id,
  name,
  ...(parentSourceId ? { parentSourceId } : {}),
})

const ref = (key: string): FormulaExpression => ({ kind: "reference", key })
const add = (...terms: FormulaExpression[]): FormulaExpression => ({ kind: "add", terms })

function input(contributions: CharacterContribution[] = []): CharacterEngineInput {
  return {
    base,
    state: { currentHp: 32, tempHp: 0 },
    contributions,
  }
}

function walk(node: ExplanationNode): ExplanationNode[] {
  return [node, ...(node.children ?? []).flatMap(walk)]
}

test("direct numeric provenance explains base, operation, operand and source", () => {
  const frog: CharacterContribution = {
    id: "frog-wisdom",
    kind: "numeric",
    target: "abilities.wisdom",
    operation: "SUBTRACT",
    value: 1,
    source: source("frog-talk", "Разговор с жабой"),
  }

  const explanation = explainCharacter(input([frog]), {
    kind: "number",
    target: "abilities.wisdom",
  })

  assert.equal(explanation.value, 17)
  assert.match(explanation.summary, /SUBTRACT 1@Разговор с жабой/)
  const nodes = walk(explanation.tree)
  assert.equal(nodes.some((node) => node.key === "base.abilities.wisdom" && node.value === 18), true)
  assert.equal(
    nodes.some(
      (node) =>
        node.operation === "SUBTRACT" &&
        node.operand === 1 &&
        node.source?.name === "Разговор с жабой",
    ),
    true,
  )
})

test("skill explanation traces ability, proficiency bonus and expertise source", () => {
  const contributions: CharacterContribution[] = [
    {
      id: "wisdom-lesson",
      kind: "numeric",
      target: "abilities.wisdom",
      operation: "ADD",
      value: 1,
      source: source("lesson", "Урок мудрости"),
    },
    {
      id: "medicine-expertise",
      kind: "grant",
      operation: "GRANT",
      target: "proficiency",
      key: "skill:medicine",
      payload: { rank: 2 },
      source: source("healer", "Полевой лекарь"),
    },
  ]

  const explanation = explainCharacter(input(contributions), {
    kind: "number",
    target: "skills.medicine.bonus",
  })
  const nodes = walk(explanation.tree)

  assert.equal(explanation.value, 10)
  assert.equal(nodes.some((node) => node.key === "abilities.wisdom.modifier"), true)
  assert.equal(nodes.some((node) => node.key === "core.proficiencyBonus" && node.value === 3), true)
  assert.equal(
    nodes.some((node) => node.source?.name === "Полевой лекарь" && node.operation === "GRANT"),
    true,
  )
  assert.equal(nodes.some((node) => node.source?.name === "Урок мудрости"), true)
})

test("AC explanation keeps formula source and later numeric modifier separate", () => {
  const contributions: CharacterContribution[] = [
    {
      id: "armor-formula",
      kind: "formula",
      target: "combat.ac",
      operation: "SET_FORMULA",
      formula: { kind: "literal", value: 15 },
      source: source("armor", "Доспех"),
    },
    {
      id: "ring-ac",
      kind: "numeric",
      target: "combat.ac",
      operation: "ADD",
      value: 1,
      source: source("ring", "Кольцо защиты"),
    },
  ]

  const explanation = explainCharacter(input(contributions), {
    kind: "number",
    target: "combat.ac",
  })
  const nodes = walk(explanation.tree)

  assert.equal(explanation.value, 16)
  assert.equal(nodes.some((node) => node.source?.name === "Доспех" && node.operation === "SET_FORMULA"), true)
  assert.equal(nodes.some((node) => node.source?.name === "Кольцо защиты" && node.operand === 1), true)
})

test("action attack explanation traces action formula and enchantment", () => {
  const contributions: CharacterContribution[] = [
    {
      id: "dagger-action",
      kind: "grant",
      operation: "GRANT",
      target: "action",
      key: "dagger",
      payload: {
        economy: "action",
        attack: {
          bonus: add(ref("abilities.dexterity.modifier"), ref("core.proficiencyBonus")),
        },
        damage: [{ key: "piercing", type: "piercing", dice: { count: 1, sides: 4 } }],
      },
      source: source("dagger", "Кинжал"),
    },
    {
      id: "dagger-plus-one",
      kind: "numeric",
      target: actionAttackBonusTarget("dagger"),
      operation: "ADD",
      value: 1,
      source: source("enchantment", "Зачарование +1"),
    },
  ]

  const explanation = explainCharacter(input(contributions), {
    kind: "number",
    target: actionAttackBonusTarget("dagger"),
  })
  const nodes = walk(explanation.tree)

  assert.equal(explanation.value, 6)
  assert.equal(nodes.some((node) => node.source?.name === "Кинжал" && node.operation === "GRANT"), true)
  assert.equal(nodes.some((node) => node.key === "abilities.dexterity.modifier" && node.value === 2), true)
  assert.equal(nodes.some((node) => node.source?.name === "Зачарование +1" && node.operand === 1), true)
})

test("spell save DC explanation traces access source, ability and proficiency", () => {
  const spell: CharacterContribution = {
    id: "cleric-spell-access",
    kind: "grant",
    operation: "GRANT",
    target: "spell",
    key: "command",
    variantKey: "cleric",
    payload: {
      spell: { name: "Command", level: 1 },
      preparation: { mode: "always_prepared" },
      methods: [{ key: "slots", kind: "spell_slots", ability: "wisdom" }],
    },
    source: source("cleric", "Клирик"),
  }
  const blessing: CharacterContribution = {
    id: "spell-dc-blessing",
    kind: "numeric",
    target: spellMethodSaveDcTarget("command", "cleric", "slots"),
    operation: "ADD",
    value: 1,
    source: source("blessing", "Благословение DC"),
  }

  const explanation = explainCharacter(input([spell, blessing]), {
    kind: "number",
    target: spellMethodSaveDcTarget("command", "cleric", "slots"),
  })
  const nodes = walk(explanation.tree)

  assert.equal(explanation.value, 16)
  assert.equal(nodes.some((node) => node.source?.name === "Клирик" && node.operation === "GRANT"), true)
  assert.equal(nodes.some((node) => node.key === "abilities.wisdom.modifier" && node.value === 4), true)
  assert.equal(nodes.some((node) => node.key === "core.proficiencyBonus" && node.value === 3), true)
  assert.equal(nodes.some((node) => node.source?.name === "Благословение DC" && node.operand === 1), true)
})

test("resource explanation includes runtime current, resolved maximum and definition source", () => {
  const contributions: CharacterContribution[] = [
    {
      id: "focus-resource",
      kind: "grant",
      operation: "GRANT",
      target: "resource",
      key: "focus",
      payload: { max: ref("core.proficiencyBonus") },
      source: source("focus-feature", "Боевой фокус"),
    },
    {
      id: "focus-extra",
      kind: "numeric",
      target: resourceMaxTarget("focus"),
      operation: "ADD",
      value: 1,
      source: source("focus-feat", "Дополнительный фокус"),
    },
  ]
  const data = input(contributions)
  data.state.resources = { focus: { current: 2 } }

  const explanation = explainCharacter(data, { kind: "resource", stateKey: "focus" })
  const nodes = walk(explanation.tree)

  assert.equal(explanation.active, true)
  assert.equal(nodes.some((node) => node.key === "resources.focus.current" && node.value === 2), true)
  assert.equal(nodes.some((node) => node.key === resourceMaxTarget("focus") && node.value === 4), true)
  assert.equal(nodes.some((node) => node.source?.name === "Боевой фокус"), true)
  assert.equal(nodes.some((node) => node.source?.name === "Дополнительный фокус" && node.operand === 1), true)
})

test("inactive grant explanation shows universal suppression provenance", () => {
  const itemSource = source("fire-ring", "Огненное кольцо")
  const contributions: CharacterContribution[] = [
    {
      id: "ring-fire-resistance",
      kind: "grant",
      operation: "GRANT",
      target: "resistance",
      key: "fire",
      source: itemSource,
    },
    {
      id: "disable-ring",
      kind: "suppression",
      operation: "SUPPRESS",
      selector: { kind: "source", sourceId: itemSource.id },
      source: source("gm", "Эффект ГМа"),
    },
  ]

  const explanation = explainCharacter(input(contributions), {
    kind: "grant",
    target: "resistance",
    key: "fire",
  })
  const nodes = walk(explanation.tree)

  assert.equal(explanation.active, false)
  assert.equal(explanation.tree.status, "suppressed")
  assert.equal(nodes.some((node) => node.source?.name === "Огненное кольцо" && node.status === "suppressed"), true)
  assert.equal(nodes.some((node) => node.source?.name === "Эффект ГМа" && node.kind === "suppression"), true)
})

test("explanations are deterministic when contribution input order changes", () => {
  const contributions: CharacterContribution[] = [
    {
      id: "a",
      kind: "numeric",
      target: "abilities.strength",
      operation: "ADD",
      value: 2,
      source: source("a-source", "A"),
    },
    {
      id: "b",
      kind: "numeric",
      target: "abilities.strength",
      operation: "SUBTRACT",
      value: 1,
      source: source("b-source", "B"),
    },
  ]

  const left = explainCharacter(input(contributions), {
    kind: "number",
    target: "abilities.strength",
  })
  const right = explainCharacter(input([...contributions].reverse()), {
    kind: "number",
    target: "abilities.strength",
  })

  assert.deepEqual(left.tree, right.tree)
  assert.equal(left.summary, right.summary)
})
