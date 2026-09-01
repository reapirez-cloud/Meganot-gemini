import type {
  CharacterSource,
  ResolvedAction,
  ResolvedCharacterContract,
  ResolvedGrant,
  ResolvedResource,
  ResolvedSpell,
  ResolvedSpellAccess,
} from "../character-engine/index.ts"
import type { ResolvedMechanicalRule } from "../character-engine/contract.ts"
import type { CharacterClassPackage } from "./classPackages.ts"

export type TemplateSourceRef = {
  kind: "class" | "subclass"
  templateId: string
}

/**
 * Stable machine type for entries shown on the Class tab.
 * Do not derive this from a translated label: future sorting/filtering depends
 * on CE output, so renaming a feature must never change its category.
 */
export type ClassMechanicEntryType =
  | "special_action"
  | "class_spell"
  | "resource"
  | "passive_rule"
  | "reference_rule"
  | "proficiency"
  | "resistance"
  | "immunity"
  | "sense"
  | "language"

export type ClassMechanicIntegration = "runtime" | "structured" | "summary" | "display"

export type PresentedClassMechanicEntry = {
  id: string
  type: ClassMechanicEntryType
  sourceKind: TemplateSourceRef["kind"]
  templateId: string
  label: string
  integration: ClassMechanicIntegration
}

export type PresentedClassSpell = {
  spell: ResolvedSpell
  access: ResolvedSpellAccess
}

export type PresentedTemplateMechanics = {
  templateId: string
  kind: "class" | "subclass"
  name: string
  level: number
  features: ResolvedGrant[]
  proficiencies: ResolvedGrant[]
  resistances: ResolvedGrant[]
  immunities: ResolvedGrant[]
  senses: ResolvedGrant[]
  languages: ResolvedGrant[]
  rules: ResolvedMechanicalRule[]
  resources: ResolvedResource[]
  actions: ResolvedAction[]
  spells: PresentedClassSpell[]
  /** Unified machine-readable index used by future sorting/filtering. */
  entries: PresentedClassMechanicEntry[]
}

export type PresentedClassPackage = {
  classMechanics: PresentedTemplateMechanics
  subclassMechanics?: PresentedTemplateMechanics
}

type SourceCarrier = { source: CharacterSource }

const abilityLabels: Record<string, string> = {
  strength: "Сила",
  dexterity: "Ловкость",
  constitution: "Телосложение",
  intelligence: "Интеллект",
  wisdom: "Мудрость",
  charisma: "Харизма",
}

const skillLabels: Record<string, string> = {
  acrobatics: "Акробатика",
  animal_handling: "Уход за животными",
  arcana: "Магия",
  athletics: "Атлетика",
  deception: "Обман",
  history: "История",
  insight: "Проницательность",
  intimidation: "Запугивание",
  investigation: "Расследование",
  medicine: "Медицина",
  nature: "Природа",
  perception: "Восприятие",
  performance: "Выступление",
  persuasion: "Убеждение",
  religion: "Религия",
  sleight_of_hand: "Ловкость рук",
  stealth: "Скрытность",
  survival: "Выживание",
}

const capabilityLabels: Record<string, string> = {
  "armor:light": "Лёгкая броня",
  "armor:medium": "Средняя броня",
  "armor:heavy": "Тяжёлая броня",
  "armor:shield": "Щиты",
  "weapon:simple": "Простое оружие",
  "weapon:martial": "Воинское оружие",
  fire: "Огонь",
  cold: "Холод",
  lightning: "Молния",
  thunder: "Гром",
  acid: "Кислота",
  poison: "Яд",
  psychic: "Психический урон",
  necrotic: "Некротический урон",
  radiant: "Излучение",
  force: "Силовой урон",
  bludgeoning: "Дробящий урон",
  piercing: "Колющий урон",
  slashing: "Рубящий урон",
  darkvision: "Тёмное зрение",
  blindsight: "Слепое зрение",
  tremorsense: "Чувство вибрации",
  truesight: "Истинное зрение",
  common: "Общий",
  draconic: "Драконий",
  dwarvish: "Дварфский",
  elvish: "Эльфийский",
  giant: "Великаний",
  gnomish: "Гномий",
  goblin: "Гоблинский",
  halfling: "Полуросликов",
  infernal: "Инфернальный",
  orc: "Орочий",
}

/** Renderer/read-model parsing only. CE never branches on this provenance. */
export function templateRefFromSource(source: CharacterSource): TemplateSourceRef | null {
  const match = source.id.match(/^template:(class|subclass):([^:]+):v\d+/)
  if (!match) return null
  return { kind: match[1] as TemplateSourceRef["kind"], templateId: match[2]! }
}

function matchesTemplate(sources: SourceCarrier[], kind: TemplateSourceRef["kind"], templateId: string): boolean {
  return sources.some((entry) => {
    const ref = templateRefFromSource(entry.source)
    return ref?.kind === kind && ref.templateId === templateId
  })
}

function payloadRecord(grant: ResolvedGrant): Record<string, unknown> | null {
  return grant.payload && typeof grant.payload === "object" && !Array.isArray(grant.payload)
    ? grant.payload as Record<string, unknown>
    : null
}

function titleCaseKey(value: string): string {
  const clean = value.replace(/[_-]+/g, " ").trim()
  return clean ? clean.charAt(0).toLocaleUpperCase("ru-RU") + clean.slice(1) : value
}

function structuredGrantLabel(grant: ResolvedGrant): string {
  const direct = capabilityLabels[grant.key]
  if (direct) return direct

  if (grant.key.startsWith("skill:")) {
    const key = grant.key.slice("skill:".length)
    return skillLabels[key] || titleCaseKey(key)
  }

  if (grant.key.startsWith("savingThrow:")) {
    const key = grant.key.slice("savingThrow:".length)
    return `Спасброски: ${abilityLabels[key] || titleCaseKey(key)}`
  }

  const [, tail] = grant.key.split(":", 2)
  return capabilityLabels[tail || ""] || titleCaseKey(tail || grant.key)
}

function grantLabel(grant: ResolvedGrant): string {
  const payload = payloadRecord(grant)
  return typeof payload?.label === "string" && payload.label.trim()
    ? payload.label.trim()
    : structuredGrantLabel(grant)
}

function resourceLabel(resource: ResolvedResource): string {
  return resource.sources[0]?.source.name || resource.key
}

function matchingRule(
  rules: ResolvedMechanicalRule[],
  grant: ResolvedGrant,
): ResolvedMechanicalRule | undefined {
  return rules.find((rule) => rule.key === grant.key && rule.variantKey === grant.variantKey)
}

function capabilityEntries(
  grants: ResolvedGrant[],
  type: Extract<ClassMechanicEntryType, "proficiency" | "resistance" | "immunity" | "sense" | "language">,
  kind: TemplateSourceRef["kind"],
  templateId: string,
): PresentedClassMechanicEntry[] {
  return grants.map((grant) => ({
    id: `${type}:${grant.key}:${grant.variantKey}`,
    type,
    sourceKind: kind,
    templateId,
    label: grantLabel(grant),
    integration: "structured",
  }))
}

function templateMechanics(
  contract: ResolvedCharacterContract,
  templateId: string,
  kind: TemplateSourceRef["kind"],
  name: string,
  level: number,
): PresentedTemplateMechanics {
  const features = [...contract.capabilities.features, ...contract.capabilities.traits]
    .filter((entry) => matchesTemplate(entry.sources, kind, templateId))
  const proficiencies = contract.capabilities.proficiencies
    .filter((entry) => matchesTemplate(entry.sources, kind, templateId))
  const resistances = contract.capabilities.resistances
    .filter((entry) => matchesTemplate(entry.sources, kind, templateId))
  const immunities = contract.capabilities.immunities
    .filter((entry) => matchesTemplate(entry.sources, kind, templateId))
  const senses = contract.capabilities.senses
    .filter((entry) => matchesTemplate(entry.sources, kind, templateId))
  const languages = contract.capabilities.languages
    .filter((entry) => matchesTemplate(entry.sources, kind, templateId))
  const rules = contract.rules.filter((entry) => matchesTemplate(entry.sources, kind, templateId))
  const resources = contract.resources.filter((entry) =>
    !/^spell_slot_\d+$/.test(entry.key) && matchesTemplate(entry.sources, kind, templateId),
  )
  const actions = contract.actions.filter((entry) => matchesTemplate(entry.sources, kind, templateId))
  const spells = contract.spells.flatMap((spell) =>
    spell.accesses
      .filter((access) => matchesTemplate(access.sources, kind, templateId))
      .map((access) => ({ spell, access })),
  )

  const entries: PresentedClassMechanicEntry[] = [
    ...resources.map((resource) => ({
      id: `resource:${resource.stateKey}`,
      type: "resource" as const,
      sourceKind: kind,
      templateId,
      label: resourceLabel(resource),
      integration: "runtime" as const,
    })),
    ...actions.map((action) => ({
      id: `action:${action.stateKey}`,
      type: "special_action" as const,
      sourceKind: kind,
      templateId,
      label: action.label || action.key,
      integration: "runtime" as const,
    })),
    ...spells.map(({ spell, access }) => ({
      id: `spell:${spell.key}:${access.key}`,
      type: "class_spell" as const,
      sourceKind: kind,
      templateId,
      label: spell.identity.name,
      integration: "runtime" as const,
    })),
    ...features.map<PresentedClassMechanicEntry>((feature) => {
      const rule = matchingRule(rules, feature)
      return {
        id: `feature:${feature.key}:${feature.variantKey}`,
        type: rule?.integration === "structured" ? "passive_rule" : "reference_rule",
        sourceKind: kind,
        templateId,
        label: grantLabel(feature),
        integration: rule?.integration ?? "display",
      }
    }),
    ...capabilityEntries(proficiencies, "proficiency", kind, templateId),
    ...capabilityEntries(resistances, "resistance", kind, templateId),
    ...capabilityEntries(immunities, "immunity", kind, templateId),
    ...capabilityEntries(senses, "sense", kind, templateId),
    ...capabilityEntries(languages, "language", kind, templateId),
  ]

  return {
    templateId,
    kind,
    name,
    level,
    features,
    proficiencies,
    resistances,
    immunities,
    senses,
    languages,
    rules,
    resources,
    actions,
    spells,
    entries,
  }
}

export function presentClassPackages(
  contract: ResolvedCharacterContract,
  packages: CharacterClassPackage[],
): PresentedClassPackage[] {
  return packages.map((entry) => ({
    classMechanics: templateMechanics(
      contract,
      entry.classTemplateId,
      "class",
      entry.className,
      entry.level,
    ),
    ...(entry.subclassTemplateId && entry.subclassName && entry.subclassActive
      ? {
          subclassMechanics: templateMechanics(
            contract,
            entry.subclassTemplateId,
            "subclass",
            entry.subclassName,
            entry.level,
          ),
        }
      : {}),
  }))
}
