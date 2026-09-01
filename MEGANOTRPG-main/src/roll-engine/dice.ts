import type {
  DiceDefinition,
  DiceRoller,
  DiceRollResult,
  RollContext,
  RollValueExpression,
  RollValueReference,
} from "./types.ts"

export class RollDiceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RollDiceError"
  }
}

/**
 * Default runtime roller. Uses Web Crypto with rejection sampling so every face
 * has equal probability. Tests can inject a deterministic DiceRoller instead.
 */
export const defaultDiceRoller: DiceRoller = (sides) => {
  if (!Number.isInteger(sides) || sides < 2) {
    throw new RollDiceError("dice sides must be an integer >= 2")
  }

  const cryptoApi = globalThis.crypto
  if (!cryptoApi?.getRandomValues) {
    return Math.floor(Math.random() * sides) + 1
  }

  const range = 0x1_0000_0000
  const limit = Math.floor(range / sides) * sides
  const buffer = new Uint32Array(1)
  let value = 0
  do {
    cryptoApi.getRandomValues(buffer)
    value = buffer[0]!
  } while (value >= limit)

  return (value % sides) + 1
}

export function validateDice(dice: DiceDefinition): void {
  if (!Number.isInteger(dice.count) || dice.count < 0) {
    throw new RollDiceError("dice count must be an integer >= 0")
  }
  if (!Number.isInteger(dice.sides) || dice.sides < 2) {
    throw new RollDiceError("dice sides must be an integer >= 2")
  }
}

function referenceValue(key: RollValueReference, context: RollContext): number {
  let value: number | undefined
  if (key === "casting_ability_modifier") value = context.castingAbilityModifier
  else if (key === "attack_bonus") value = context.attackBonus
  else if (key === "save_dc") value = context.saveDc
  else if (key === "character_level") value = context.characterLevel
  else if (key === "cast_level") value = context.castLevel
  else if (key === "spell_level") value = context.spellLevel
  else if (key.startsWith("class_level.")) value = context.classLevels?.[key.slice("class_level.".length)]
  else if (key.startsWith("value.")) value = context.values?.[key.slice("value.".length)]

  if (value === undefined || !Number.isFinite(value)) {
    throw new RollDiceError(`missing or non-finite roll context reference: ${key}`)
  }
  return value
}

export function evaluateRollValue(expression: RollValueExpression, context: RollContext): number {
  if (expression.kind === "literal") {
    if (!Number.isFinite(expression.value)) throw new RollDiceError("literal value must be finite")
    return expression.value
  }
  if (expression.kind === "reference") return referenceValue(expression.key, context)
  if (expression.kind === "add") {
    if (expression.terms.length === 0) throw new RollDiceError("add expression must not be empty")
    return expression.terms.reduce((sum, term) => sum + evaluateRollValue(term, context), 0)
  }
  if (expression.kind === "subtract") {
    return evaluateRollValue(expression.left, context) - evaluateRollValue(expression.right, context)
  }
  if (expression.factors.length === 0) throw new RollDiceError("multiply expression must not be empty")
  return expression.factors.reduce((product, factor) => product * evaluateRollValue(factor, context), 1)
}

export function rollDice(
  dice: DiceDefinition,
  modifier: number,
  roller: DiceRoller = defaultDiceRoller,
): DiceRollResult {
  validateDice(dice)
  if (!Number.isFinite(modifier)) throw new RollDiceError("dice modifier must be finite")

  const rolls: number[] = []
  for (let index = 0; index < dice.count; index += 1) {
    const rolled = roller(dice.sides)
    if (!Number.isInteger(rolled) || rolled < 1 || rolled > dice.sides) {
      throw new RollDiceError(`dice roller returned invalid d${dice.sides} result: ${rolled}`)
    }
    rolls.push(rolled)
  }
  const diceTotal = rolls.reduce((sum, value) => sum + value, 0)
  return { dice, rolls, diceTotal, modifier, total: diceTotal + modifier }
}
