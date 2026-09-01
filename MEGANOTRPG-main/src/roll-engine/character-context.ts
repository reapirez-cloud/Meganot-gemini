import type {
  ResolvedCharacterContract,
  ResolvedSpellResourceOption,
} from "../character-engine/index.ts"
import type { RollContext } from "./types.ts"

export class RollContextError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RollContextError"
  }
}

export interface SpellRollContextSelection {
  spellKey: string
  accessKey: string
  methodKey: string
  /** Required when the casting method has resource options. */
  resourceOptionKey?: string
  /** Supplied by a future class adapter; Character Engine v1 intentionally stores only total level. */
  classLevels?: Record<string, number>
  values?: Record<string, number>
}

export interface PreparedSpellRollContext {
  context: RollContext
  resourceOption?: ResolvedSpellResourceOption
}

/**
 * Converts one already-resolved spell casting path into Roll Engine context.
 * It performs no character math and never spends resources.
 */
export function createSpellRollContext(
  character: ResolvedCharacterContract,
  selection: SpellRollContextSelection,
): PreparedSpellRollContext {
  const spell = character.spells.find((candidate) => candidate.key === selection.spellKey)
  if (!spell) throw new RollContextError(`resolved spell not found: ${selection.spellKey}`)

  const access = spell.accesses.find((candidate) => candidate.key === selection.accessKey)
  if (!access) {
    throw new RollContextError(
      `resolved spell access not found: ${selection.spellKey}/${selection.accessKey}`,
    )
  }
  if (!access.available) {
    throw new RollContextError(`spell access is unavailable: ${selection.spellKey}/${selection.accessKey}`)
  }

  const method = access.methods.find((candidate) => candidate.key === selection.methodKey)
  if (!method) {
    throw new RollContextError(
      `resolved spell method not found: ${selection.spellKey}/${selection.accessKey}/${selection.methodKey}`,
    )
  }
  if (!method.available) {
    throw new RollContextError(
      `spell method is unavailable: ${selection.spellKey}/${selection.accessKey}/${selection.methodKey}`,
    )
  }

  let resourceOption: ResolvedSpellResourceOption | undefined
  if (method.resourceOptions.length > 0) {
    if (!selection.resourceOptionKey) {
      throw new RollContextError("resourceOptionKey is required for a resource-backed spell cast")
    }
    resourceOption = method.resourceOptions.find(
      (candidate) => candidate.key === selection.resourceOptionKey,
    )
    if (!resourceOption) {
      throw new RollContextError(`spell resource option not found: ${selection.resourceOptionKey}`)
    }
    if (!resourceOption.available) {
      throw new RollContextError(`spell resource option is unavailable: ${selection.resourceOptionKey}`)
    }
  } else if (selection.resourceOptionKey) {
    throw new RollContextError("resourceOptionKey was provided for a cost-free casting method")
  }

  const castingAbilityModifier = method.ability
    ? character.abilities[method.ability].modifier
    : undefined

  return {
    context: {
      characterLevel: character.level,
      spellLevel: spell.identity.level,
      castLevel: resourceOption?.castLevel ?? spell.identity.level,
      ...(selection.classLevels ? { classLevels: selection.classLevels } : {}),
      ...(castingAbilityModifier !== undefined ? { castingAbilityModifier } : {}),
      ...(method.attackBonus ? { attackBonus: method.attackBonus.value } : {}),
      ...(method.saveDc ? { saveDc: method.saveDc.value } : {}),
      ...(selection.values ? { values: selection.values } : {}),
    },
    ...(resourceOption ? { resourceOption } : {}),
  }
}
