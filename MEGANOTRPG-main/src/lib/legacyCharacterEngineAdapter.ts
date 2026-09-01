import {
  abilityModifier,
  proficiencyBonusForLevel,
  resolveCharacterContract,
  type AbilityKey,
  type CharacterContribution,
  type CharacterEngineInput,
  type CharacterSource,
  type NumericContribution,
  type ProficiencyRank,
  type ResolvedCharacterContract,
  type ResourceState,
  type SkillKey,
  type SpellCastingMethodDefinition,
  type SpellResourceOption,
} from "../character-engine/index.ts"
import type { Character } from "../context/CharacterContext.tsx"
import {
  featureMechanicContributions,
} from "./characterMechanics.ts"
import { registeredCharacterResourceState } from "./resourceRuntime.ts"
import {
  characterSourceSuppressionContributions,
  sourceSuppressionContributions,
} from "./suppressionRuntime.ts"
import { characterTemplateContributions } from "../rule-templates/registry.ts"
import { resolveTemplateBundles } from "../rule-templates/resolver.ts"
import type { CharacterTemplateBundle } from "../rule-templates/types.ts"
import type { CharacterFeature, CharacterSheet, CharacterSpell } from "../types/characterSheet.ts"

// Integration boundary: keep this adapter aligned with docs/CHARACTER_ENGINE_CONTRACT.md
// and src/rule-templates/CLASS_INTEGRATION_NOTES.md. CE itself stays persistence/UI agnostic.
export interface LegacyCharacterEngineView { input: CharacterEngineInput; contract: ResolvedCharacterContract; spellcastingAbility?: AbilityKey }

export type CharacterEngineIntegrationSnapshot = {
  /** Cheburashka contract: CE sees projections, never the backpack. */
  inventoryContributions?: CharacterContribution[]
  resourceStates?: Record<string, ResourceState>
  templateBundles?: CharacterTemplateBundle[]
  suppressedSourceIds?: Iterable<string>
  /** Current physical Wizard-book membership, resolved by the application read adapter. */
  wizardSpellbookCatalogIds?: Iterable<string>
}

const ABILITY_ALIASES: Record<string, AbilityKey> = {
  strength: "strength", str: "strength", сила: "strength", сил: "strength",
  dexterity: "dexterity", dex: "dexterity", ловкость: "dexterity", лов: "dexterity",
  constitution: "constitution", con: "constitution", телосложение: "constitution", тел: "constitution",
  intelligence: "intelligence", int: "intelligence", интеллект: "intelligence", инт: "intelligence",
  wisdom: "wisdom", wis: "wisdom", мудрость: "wisdom", мдр: "wisdom",
  charisma: "charisma", cha: "charisma", харизма: "charisma", хар: "charisma",
}
function normalize(value: string): string { return value.trim().toLocaleLowerCase("ru-RU").replace(/[._-]+/g, " ").replace(/\s+/g, " ") }
export function parseLegacySpellcastingAbility(value: string | null | undefined): AbilityKey | undefined { return value ? ABILITY_ALIASES[normalize(value)] : undefined }
function legacySource(id: string, name: string, sourceType = "legacy"): CharacterSource { return { id, name, sourceType, visibility: "campaign" } }
function setNumber(id: string, target: NumericContribution["target"], value: number, source: CharacterSource): NumericContribution { return { id, kind: "numeric", target, operation: "SET", value, source, priority: -100 } }
function splitReferenceText(value: string): string[] { return value.split(/[\n;,]+/).map((entry) => entry.trim()).filter(Boolean) }
function addTextGrants(contributions: CharacterContribution[], target: "language" | "proficiency" | "sense", text: string, source: CharacterSource): void { splitReferenceText(text).forEach((label, index) => contributions.push({ id: `${source.id}:${target}:${index}`, kind: "grant", operation: "GRANT", target, key: label, ...(target === "proficiency" ? { payload: { rank: 1 } } : {}), source })) }
function skillRanks(value: CharacterSheet["skill_proficiencies"]): Partial<Record<SkillKey, ProficiencyRank>> { return Object.fromEntries(Object.entries(value || {}).map(([key, rank]) => [key, Math.max(0, Math.min(2, Number(rank))) as ProficiencyRank])) as Partial<Record<SkillKey, ProficiencyRank>> }
function savingThrowRanks(value: string[]): Partial<Record<AbilityKey, ProficiencyRank>> { const result: Partial<Record<AbilityKey, ProficiencyRank>> = {}; for (const raw of value || []) { const ability = ABILITY_ALIASES[normalize(raw)]; if (ability) result[ability] = 1 } return result }
function legacySpellKey(spell: CharacterSpell): string { const clean = spell.name.trim().toLocaleLowerCase("ru-RU").replace(/[^a-zа-яё0-9]+/giu, "-").replace(/^-|-$/g, ""); return clean ? `spell:${clean}` : `spell:${spell.id}` }
function configuredSlotLevels(sheet: CharacterSheet, spells: CharacterSpell[]): number[] { const levels = new Set<number>(); for (let level = 1; level <= 9; level += 1) if (Number(sheet.spell_slots?.[String(level)]?.max || 0) > 0) levels.add(level); for (const spell of spells) if (spell.spell_level > 0 && spell.cast_mode !== "cantrip") levels.add(spell.spell_level); return [...levels].sort((a, b) => a - b) }
function slotResourceKey(level: number): string { return `spell_slot_${level}` }
function slotOptions(spellLevel: number, slotLevels: number[]): SpellResourceOption[] { return slotLevels.filter((level) => level >= spellLevel).map((level) => ({ key: `slot-${level}`, castLevel: level, costs: [{ key: slotResourceKey(level), amount: 1 }] })) }
function wizardSignatureResourceKey(spell: CharacterSpell): string { return `wizard_signature_${spell.id}` }

export function buildLegacyCharacterEngineInput(args: {
  character: Pick<Character, "id" | "name" | "level">
  sheet: CharacterSheet
  spells: CharacterSpell[]
  features: CharacterFeature[]
} & CharacterEngineIntegrationSnapshot): CharacterEngineInput {
  const { character, sheet, spells, features } = args
  const sheetSource = legacySource("legacy-sheet", "Базовый лист персонажа", "legacy_sheet")
  const contributions: CharacterContribution[] = []
  const standardProficiency = proficiencyBonusForLevel(character.level)
  if (sheet.proficiency_bonus !== standardProficiency) contributions.push(setNumber("legacy:proficiency-override", "core.proficiencyBonus", sheet.proficiency_bonus, sheetSource))
  contributions.push(setNumber("legacy:ac", "combat.ac", sheet.armor_class, sheetSource))
  const naturalInitiative = abilityModifier(sheet.dexterity)
  if (sheet.initiative_bonus !== naturalInitiative) contributions.push(setNumber("legacy:initiative-override", "combat.initiative", sheet.initiative_bonus, sheetSource))
  // passive_perception is a legacy cached/derived field. CE is the source of truth:
  // passive = 10 + resolved Perception skill bonus. Feats/items/effects modify
  // passives.perception or the skill through normal contributions instead of
  // freezing an old sheet number here.
  addTextGrants(contributions, "language", sheet.languages, sheetSource); addTextGrants(contributions, "proficiency", sheet.proficiencies, sheetSource); addTextGrants(contributions, "sense", sheet.senses, sheetSource)
  for (const feature of features) { const source = legacySource(`legacy-feature:${feature.id}`, feature.name, "legacy_feature"); contributions.push({ id: `legacy:feature:${feature.id}`, kind: "grant", operation: "GRANT", target: "feature", key: feature.id, payload: { label: feature.name, description: feature.description, kind: feature.kind, legacyFeatureId: feature.id }, source }) }

  // Prefer the integration snapshot loaded by the consumer. Registry fallback is
  // transitional only; it exists for old sheet callers while they are migrated.
  const templateContributions = args.templateBundles !== undefined
    ? resolveTemplateBundles(args.templateBundles, character.level).contributions
    : characterTemplateContributions(character.id, character.level)
  const inventoryContributions = args.inventoryContributions ?? []
  contributions.push(...featureMechanicContributions(features), ...inventoryContributions, ...templateContributions)
  const parserOwnedSlots = new Set(templateContributions
    .filter((entry) => entry.kind === "grant" && entry.target === "resource" && /^spell_slot_[1-9]$/.test(entry.key))
    .map((entry) => entry.kind === "grant" ? entry.key : ""))
  const parserOwnedSlotLevels = [...parserOwnedSlots]
    .map((key) => Number(key.match(/^spell_slot_([1-9])$/)?.[1] || 0))
    .filter((level) => level > 0)

  const resources: Record<string, ResourceState> = args.resourceStates !== undefined
    ? { ...args.resourceStates }
    : { ...registeredCharacterResourceState(character.id) }
  const slotLevels = [...new Set([...configuredSlotLevels(sheet, spells), ...parserOwnedSlotLevels])].sort((a, b) => a - b)
  for (const level of slotLevels) {
    const slot = sheet.spell_slots?.[String(level)]; const max = Math.max(0, Number(slot?.max || 0)); const used = Math.max(0, Number(slot?.used || 0)); const key = slotResourceKey(level)
    if (!parserOwnedSlots.has(key)) {
      // Legacy characters keep the old sheet as their slot definition/fallback.
      contributions.push({ id: `legacy:resource:${key}`, kind: "grant", operation: "GRANT", target: "resource", key, payload: { max, initial: "full", label: `Ячейки ${level} уровня`, recharge: { triggers: ["long_rest"], restore: "full" } }, source: sheetSource })
      // Once a generic runtime row exists it wins; otherwise seed from legacy used/max.
      if (!resources[key]) resources[key] = { current: Math.max(0, max - used) }
    }
    // Parser-owned slot capacity and initial value come entirely from CE. Never
    // overwrite their current value with stale character_sheets.spell_slots.
  }

  const spellcastingAbility = parseLegacySpellcastingAbility(sheet.spellcasting_ability)
  const wizardSpellbookCatalogIds = new Set(args.wizardSpellbookCatalogIds ?? [])
  if (sheet.spellcasting_enabled) for (const spell of spells) {
    const isCantrip = spell.spell_level === 0 || spell.cast_mode === "cantrip"
    const alwaysPrepared = Boolean(spell.wizard_spell_mastery || spell.wizard_signature_spell)
    const options = isCantrip ? [] : slotOptions(spell.spell_level, slotLevels)
    const source = legacySource(`legacy-spell-source:${spell.id}`, spell.source || spell.name, "legacy_spell")
    const methods: SpellCastingMethodDefinition[] = [{
      key: "legacy-cast",
      kind: "spellcasting",
      ...(spellcastingAbility ? { ability: spellcastingAbility } : {}),
      requiresPrepared: !isCantrip,
      ...(isCantrip ? {} : { resourceOptions: options }),
    }]

    // Ritual Adept is book access, not prepared-spell access. The physical-book
    // projection is loaded outside CE; losing the book therefore removes this
    // no-slot method on the next resolved snapshot without mutating spell rows.
    if (!isCantrip && spell.ritual && spell.catalog_spell_id && wizardSpellbookCatalogIds.has(spell.catalog_spell_id)) {
      methods.push({
        key: "wizard-ritual",
        kind: "ritual",
        ...(spellcastingAbility ? { ability: spellcastingAbility } : {}),
        requiresPrepared: false,
      })
    }

    if (spell.wizard_spell_mastery) {
      methods.push({
        key: "wizard-spell-mastery",
        kind: "spell_mastery",
        ...(spellcastingAbility ? { ability: spellcastingAbility } : {}),
        requiresPrepared: true,
      })
    }

    if (spell.wizard_signature_spell) {
      const resourceKey = wizardSignatureResourceKey(spell)
      contributions.push({
        id: `legacy:wizard-signature-resource:${spell.id}`,
        kind: "grant",
        operation: "GRANT",
        target: "resource",
        key: resourceKey,
        payload: {
          max: 1,
          initial: "full",
          label: `Фирменное заклинание: ${spell.name}`,
          recharge: { triggers: ["short_rest", "long_rest"], restore: "full" },
        },
        source,
      })
      methods.push({
        key: "wizard-signature-free",
        kind: "signature_spell",
        ...(spellcastingAbility ? { ability: spellcastingAbility } : {}),
        requiresPrepared: true,
        resourceOptions: [{ key: "signature-free", castLevel: spell.spell_level, costs: [{ key: resourceKey, amount: 1 }] }],
      })
    }

    contributions.push({
      id: `legacy:spell:${spell.id}`,
      kind: "grant",
      operation: "GRANT",
      target: "spell",
      key: legacySpellKey(spell),
      variantKey: `legacy-${spell.id}`,
      payload: {
        spell: { name: spell.name, level: spell.spell_level, ...(spell.school.trim() ? { school: spell.school.trim() } : {}), ritual: spell.ritual },
        preparation: isCantrip
          ? { mode: "not_required" }
          : alwaysPrepared
            ? { mode: "always_prepared" }
            : { mode: "prepared", defaultPrepared: spell.prepared },
        methods,
      },
      source,
    })
  }

  // GM OFF flags are controls, not mutations of class/item/feature data. Prefer
  // the caller's loaded snapshot so CE resolution cannot depend on registry order.
  contributions.push(...(
    args.suppressedSourceIds !== undefined
      ? sourceSuppressionContributions(character.id, args.suppressedSourceIds)
      : characterSourceSuppressionContributions(character.id)
  ))

  return { base: { id: character.id, name: character.name, level: character.level, abilities: { strength: sheet.strength, dexterity: sheet.dexterity, constitution: sheet.constitution, intelligence: sheet.intelligence, wisdom: sheet.wisdom, charisma: sheet.charisma }, baseMaxHp: sheet.max_hp, baseSpeed: sheet.speed, skillProficiencies: skillRanks(sheet.skill_proficiencies), savingThrowProficiencies: savingThrowRanks(sheet.saving_throw_proficiencies) }, state: { currentHp: sheet.current_hp, tempHp: sheet.temp_hp, resources }, contributions }
}

export function resolveLegacyCharacterEngineView(args: {
  character: Pick<Character, "id" | "name" | "level">
  sheet: CharacterSheet
  spells: CharacterSpell[]
  features: CharacterFeature[]
} & CharacterEngineIntegrationSnapshot): LegacyCharacterEngineView {
  const input = buildLegacyCharacterEngineInput(args); const spellcastingAbility = parseLegacySpellcastingAbility(args.sheet.spellcasting_ability)
  return { input, contract: resolveCharacterContract(input), ...(spellcastingAbility ? { spellcastingAbility } : {}) }
}
