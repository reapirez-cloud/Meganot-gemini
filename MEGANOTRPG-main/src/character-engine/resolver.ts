import { resolveActions } from "./actions.ts"
import { evaluateCondition } from "./conditions.ts"
import { resolveNumericConflicts } from "./conflicts.ts"
import { validateCharacterEngineInput } from "./core.ts"
import { evaluateFormula, selectFormula, type FormulaContext } from "./formulas.ts"
import {
  resolveGrantResolution,
  resolveProficiencyRank,
  savingThrowProficiencyKey,
  skillProficiencyKey,
} from "./grants.ts"
import { abilityModifier, proficiencyBonusForLevel } from "./numeric.ts"
import { resolveResources } from "./resources.ts"
import { resolveSpells } from "./spells.ts"
import { applySuppressions } from "./suppressions.ts"
import { resolveValues } from "./values.ts"
import {
  ABILITY_KEYS,
  PASSIVE_KEYS,
  SKILL_KEYS,
  type AbilityKey,
  type BaseCharacter,
  type CharacterContribution,
  type CharacterEngineInput,
  type CharacterState,
  type FormulaContribution,
  type FormulaExpression,
  type NumericContribution,
  type NumericTarget,
  type PassiveKey,
  type ResolvedAbility,
  type ResolvedCharacter,
  type ResolvedNumber,
  type ResolvedSavingThrow,
  type ResolvedSkill,
  type SkillKey,
} from "./types.ts"

const SKILL_ABILITIES: Record<SkillKey, AbilityKey> = {
  acrobatics: "dexterity",
  animal_handling: "wisdom",
  arcana: "intelligence",
  athletics: "strength",
  deception: "charisma",
  history: "intelligence",
  insight: "wisdom",
  intimidation: "charisma",
  investigation: "intelligence",
  medicine: "wisdom",
  nature: "intelligence",
  perception: "wisdom",
  performance: "charisma",
  persuasion: "charisma",
  religion: "intelligence",
  sleight_of_hand: "dexterity",
  stealth: "dexterity",
  survival: "wisdom",
}

const PASSIVE_SKILLS: Record<PassiveKey, SkillKey> = {
  perception: "perception",
  investigation: "investigation",
  insight: "insight",
}

function resolveNumber(
  target: NumericTarget,
  baseValue: number,
  contributions: CharacterContribution[],
  state: CharacterState,
  maxHpForConditions: number,
): ResolvedNumber {
  const relevant = contributions.filter(
    (contribution): contribution is NumericContribution =>
      contribution.kind === "numeric" &&
      contribution.target === target &&
      evaluateCondition(contribution.condition, { state, maxHp: maxHpForConditions }),
  )
  const resolution = resolveNumericConflicts(baseValue, relevant)
  return {
    value: resolution.value,
    baseValue,
    sources: resolution.contributions.map((contribution) => ({
      contributionId: contribution.id,
      source: contribution.source,
    })),
  }
}

const DEFAULT_AC_FORMULA: FormulaExpression = {
  kind: "add",
  terms: [
    { kind: "literal", value: 10 },
    { kind: "reference", key: "abilities.dexterity.modifier" },
  ],
}

export function resolveCharacter(
  base: BaseCharacter,
  state: CharacterState,
  contributions: CharacterContribution[] = [],
): ResolvedCharacter {
  validateCharacterEngineInput({ base, state, contributions })

  // Universal source/contribution suppression happens before every mechanical
  // resolver so one control can consistently disable numeric, formula, grant,
  // resource, action and spell effects.
  const suppressionResolution = applySuppressions(contributions, state)
  const activeContributions = suppressionResolution.contributions

  const maxHp = resolveNumber(
    "combat.maxHp",
    base.baseMaxHp,
    activeContributions,
    state,
    base.baseMaxHp,
  )
  const proficiencyBonus = resolveNumber(
    "core.proficiencyBonus",
    proficiencyBonusForLevel(base.level),
    activeContributions,
    state,
    maxHp.value,
  )

  const abilities = Object.fromEntries(
    ABILITY_KEYS.map((ability) => {
      const resolved = resolveNumber(
        `abilities.${ability}`,
        base.abilities[ability],
        activeContributions,
        state,
        maxHp.value,
      )
      const result: ResolvedAbility = { ...resolved, modifier: abilityModifier(resolved.value) }
      return [ability, result]
    }),
  ) as Record<AbilityKey, ResolvedAbility>

  const grantResolution = resolveGrantResolution(activeContributions, state, maxHp.value)
  const grants = grantResolution.grants

  const skills = Object.fromEntries(
    SKILL_KEYS.map((skill) => {
      const ability = SKILL_ABILITIES[skill]
      const proficiency = resolveProficiencyRank(
        base.skillProficiencies?.[skill],
        grantResolution,
        skillProficiencyKey(skill),
      )
      const result: ResolvedSkill = {
        key: skill,
        ability,
        proficiencyRank: proficiency.rank,
        proficiencySources: proficiency.sources,
        bonus: resolveNumber(
          `skills.${skill}.bonus`,
          abilities[ability].modifier + proficiencyBonus.value * proficiency.rank,
          activeContributions,
          state,
          maxHp.value,
        ),
      }
      return [skill, result]
    }),
  ) as Record<SkillKey, ResolvedSkill>

  const savingThrows = Object.fromEntries(
    ABILITY_KEYS.map((ability) => {
      const proficiency = resolveProficiencyRank(
        base.savingThrowProficiencies?.[ability],
        grantResolution,
        savingThrowProficiencyKey(ability),
      )
      const result: ResolvedSavingThrow = {
        ability,
        proficiencyRank: proficiency.rank,
        proficiencySources: proficiency.sources,
        bonus: resolveNumber(
          `savingThrows.${ability}.bonus`,
          abilities[ability].modifier + proficiencyBonus.value * proficiency.rank,
          activeContributions,
          state,
          maxHp.value,
        ),
      }
      return [ability, result]
    }),
  ) as Record<AbilityKey, ResolvedSavingThrow>

  const formulaContext: FormulaContext = {
    "core.level": base.level,
    "core.proficiencyBonus": proficiencyBonus.value,
  }
  for (const ability of ABILITY_KEYS) {
    formulaContext[`abilities.${ability}.score`] = abilities[ability].value
    formulaContext[`abilities.${ability}.modifier`] = abilities[ability].modifier
  }

  // Named scalar values are intentionally ruleset-agnostic. A parser can publish
  // anything from a scaling die size to a cyberware rating and actions/resources
  // may consume it through FormulaExpression references.
  const values = resolveValues(
    grants,
    activeContributions,
    state,
    maxHp.value,
    formulaContext,
  )
  for (const value of values) {
    formulaContext[`values.${value.stateKey}`] = value.value.value
  }

  const resources = resolveResources(
    grants,
    activeContributions,
    state,
    maxHp.value,
    formulaContext,
  )
  for (const resource of resources) {
    formulaContext[`resources.${resource.stateKey}.current`] = resource.current
    formulaContext[`resources.${resource.stateKey}.max`] = resource.max.value
  }

  const actions = resolveActions(
    grants,
    activeContributions,
    resources,
    state,
    maxHp.value,
    formulaContext,
  )

  const spells = resolveSpells(
    grants,
    activeContributions,
    resources,
    state,
    maxHp.value,
    formulaContext,
  )

  const acFormulaContributions = activeContributions.filter(
    (contribution): contribution is FormulaContribution =>
      contribution.kind === "formula" &&
      contribution.target === "combat.ac" &&
      evaluateCondition(contribution.condition, { state, maxHp: maxHp.value }),
  )
  const acSelection = selectFormula("combat.ac", DEFAULT_AC_FORMULA, acFormulaContributions)
  const acFormulaValue = evaluateFormula(acSelection.formula, formulaContext)
  const acNumeric = resolveNumber(
    "combat.ac",
    acFormulaValue,
    activeContributions,
    state,
    maxHp.value,
  )
  const ac = {
    ...acNumeric,
    formula: acSelection.formula,
    formulaSources: acSelection.sources,
  }

  const speed = resolveNumber(
    "combat.speed",
    base.baseSpeed,
    activeContributions,
    state,
    maxHp.value,
  )
  const initiative = resolveNumber(
    "combat.initiative",
    abilities.dexterity.modifier,
    activeContributions,
    state,
    maxHp.value,
  )
  const passives = Object.fromEntries(
    PASSIVE_KEYS.map((passive) => {
      const skill = PASSIVE_SKILLS[passive]
      return [
        passive,
        resolveNumber(
          `passives.${passive}`,
          10 + skills[skill].bonus.value,
          activeContributions,
          state,
          maxHp.value,
        ),
      ]
    }),
  ) as Record<PassiveKey, ResolvedNumber>

  const spellcastingByAbility = Object.fromEntries(
    ABILITY_KEYS.map((ability) => {
      const attackBonus = abilities[ability].modifier + proficiencyBonus.value
      return [ability, { attackBonus, saveDc: 8 + attackBonus }]
    }),
  ) as ResolvedCharacter["spellcasting"]["byAbility"]

  return {
    id: base.id,
    name: base.name,
    level: base.level,
    proficiencyBonus,
    abilities,
    skills,
    savingThrows,
    combat: {
      ac,
      maxHp,
      currentHp: state.currentHp,
      tempHp: state.tempHp,
      speed,
      initiative,
    },
    passives,
    spellcasting: { byAbility: spellcastingByAbility },
    values,
    resources,
    actions,
    spells,
    grants,
  }
}

export function resolveCharacterInput(input: CharacterEngineInput): ResolvedCharacter {
  return resolveCharacter(input.base, input.state, input.contributions)
}
