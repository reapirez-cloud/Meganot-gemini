import { abilityModifier, proficiencyBonusForLevel } from "../character-engine/index.ts"
import type { CharacterSheet, SkillRank, SpellSlotState } from "../types/characterSheet"

export const CHARACTER_WIZARD_ABILITIES = [
  ["strength", "Сила", "СИЛ"],
  ["dexterity", "Ловкость", "ЛОВ"],
  ["constitution", "Телосложение", "ТЕЛ"],
  ["intelligence", "Интеллект", "ИНТ"],
  ["wisdom", "Мудрость", "МДР"],
  ["charisma", "Харизма", "ХАР"],
] as const

export const CHARACTER_WIZARD_SKILLS = [
  ["acrobatics", "Акробатика"],
  ["animal_handling", "Уход за животными"],
  ["arcana", "Магия"],
  ["athletics", "Атлетика"],
  ["deception", "Обман"],
  ["history", "История"],
  ["insight", "Проницательность"],
  ["intimidation", "Запугивание"],
  ["investigation", "Анализ"],
  ["medicine", "Медицина"],
  ["nature", "Природа"],
  ["perception", "Восприятие"],
  ["performance", "Выступление"],
  ["persuasion", "Убеждение"],
  ["religion", "Религия"],
  ["sleight_of_hand", "Ловкость рук"],
  ["stealth", "Скрытность"],
  ["survival", "Выживание"],
] as const

export type WizardAbilityKey = (typeof CHARACTER_WIZARD_ABILITIES)[number][0]
export type WizardSkillKey = (typeof CHARACTER_WIZARD_SKILLS)[number][0]

export type CharacterWizardSheet = Pick<CharacterSheet,
  | "race" | "background" | "alignment"
  | "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma"
  | "armor_class" | "initiative_bonus" | "speed" | "proficiency_bonus"
  | "max_hp" | "current_hp" | "temp_hp" | "passive_perception"
  | "saving_throw_proficiencies" | "skill_proficiencies"
  | "proficiencies" | "languages" | "senses"
  | "spellcasting_enabled" | "spellcasting_ability" | "spell_slots"
>

export const CHARACTER_WIZARD_SHEET_KEYS: Array<keyof CharacterWizardSheet> = [
  "race", "background", "alignment",
  "strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma",
  "armor_class", "initiative_bonus", "speed", "proficiency_bonus",
  "max_hp", "current_hp", "temp_hp", "passive_perception",
  "saving_throw_proficiencies", "skill_proficiencies",
  "proficiencies", "languages", "senses",
  "spellcasting_enabled", "spellcasting_ability", "spell_slots",
]

export function emptySpellSlots(): Record<string, SpellSlotState> {
  return Object.fromEntries(Array.from({ length: 9 }, (_, index) => [String(index + 1), { max: 0, used: 0 }]))
}

export function defaultCharacterWizardSheet(level = 1): CharacterWizardSheet {
  return {
    race: "",
    background: "",
    alignment: "",
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
    armor_class: 10,
    initiative_bonus: 0,
    speed: 30,
    proficiency_bonus: proficiencyBonusForLevel(level),
    max_hp: 1,
    current_hp: 1,
    temp_hp: 0,
    passive_perception: 10,
    saving_throw_proficiencies: [],
    skill_proficiencies: {},
    proficiencies: "",
    languages: "",
    senses: "",
    spellcasting_enabled: false,
    spellcasting_ability: null,
    spell_slots: emptySpellSlots(),
  }
}

export function wizardInitiative(sheet: Pick<CharacterWizardSheet, "dexterity">): number {
  return abilityModifier(sheet.dexterity)
}

export function wizardProficiency(level: number): number {
  return proficiencyBonusForLevel(level)
}

export function wizardPassivePerception(sheet: Pick<CharacterWizardSheet, "wisdom" | "skill_proficiencies" | "proficiency_bonus">): number {
  const rank = Number(sheet.skill_proficiencies?.perception || 0) as SkillRank
  return 10 + abilityModifier(sheet.wisdom) + sheet.proficiency_bonus * rank
}

export function sheetValueMatchesAuto(sheet: CharacterWizardSheet, level: number) {
  return {
    initiative: sheet.initiative_bonus === wizardInitiative(sheet),
    proficiency: sheet.proficiency_bonus === wizardProficiency(level),
    passivePerception: sheet.passive_perception === wizardPassivePerception(sheet),
  }
}

export function sanitizeCharacterWizardSheet(sheet: CharacterWizardSheet): CharacterWizardSheet {
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Number.isFinite(value) ? Math.round(value) : min))
  const slots = Object.fromEntries(Array.from({ length: 9 }, (_, index) => {
    const key = String(index + 1)
    const current = sheet.spell_slots?.[key]
    const max = clamp(Number(current?.max || 0), 0, 20)
    return [key, { max, used: Math.min(max, clamp(Number(current?.used || 0), 0, 20)) }]
  }))
  return {
    ...sheet,
    strength: clamp(sheet.strength, 1, 30),
    dexterity: clamp(sheet.dexterity, 1, 30),
    constitution: clamp(sheet.constitution, 1, 30),
    intelligence: clamp(sheet.intelligence, 1, 30),
    wisdom: clamp(sheet.wisdom, 1, 30),
    charisma: clamp(sheet.charisma, 1, 30),
    armor_class: clamp(sheet.armor_class, 0, 99),
    speed: clamp(sheet.speed, 0, 999),
    max_hp: clamp(sheet.max_hp, 0, 99999),
    current_hp: clamp(sheet.current_hp, 0, 99999),
    temp_hp: clamp(sheet.temp_hp, 0, 99999),
    spell_slots: slots,
  }
}

export function characterWizardPatch(sheet: CharacterWizardSheet, dirty: ReadonlySet<keyof CharacterWizardSheet>): Partial<CharacterSheet> {
  const clean = sanitizeCharacterWizardSheet(sheet)
  const patch: Partial<CharacterSheet> = {}
  for (const key of CHARACTER_WIZARD_SHEET_KEYS) {
    if (!dirty.has(key)) continue
    ;(patch as Record<string, unknown>)[key] = clean[key]
  }
  return patch
}
