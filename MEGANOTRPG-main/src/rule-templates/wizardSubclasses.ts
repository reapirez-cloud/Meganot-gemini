import type { RuleTemplate, RuleTemplateLevel } from "./types.ts"

/**
 * Wizard subclass Wave 0 contract.
 *
 * This is catalog/compatibility metadata, not a second subclass runtime. Actual
 * mechanics continue to flow through RuleTemplate -> resolver -> Character
 * Engine. Subclass rows are installed only when their content package is ready.
 */
export const WIZARD_SUBCLASS_PARENT_CATALOG_KEY = "class:wizard" as const
export const WIZARD_SUBCLASS_UNLOCK_LEVEL = 3 as const
export const WIZARD_SUBCLASS_FEATURE_LEVELS = [3, 6, 10, 14] as const

export type WizardSubclassFeatureLevel = (typeof WIZARD_SUBCLASS_FEATURE_LEVELS)[number]
export type WizardSubclassSource = "phb-2024" | "legacy-school" | "tasha" | "xanathar" | "wildemount"

export type WizardSubclassDefinition = {
  catalogKey: `subclass:wizard:${string}`
  slug: string
  name: string
  englishName: string
  source: WizardSubclassSource
  sourceLabel: string
  rulesRevision: string
  visualKey: `wizard-subclass:${string}`
  unlockLevel: typeof WIZARD_SUBCLASS_UNLOCK_LEVEL
  featureLevels: readonly WizardSubclassFeatureLevel[]
}

const levels = WIZARD_SUBCLASS_FEATURE_LEVELS

/**
 * Supported Wizard subclass identities. The four PHB 2024 subclasses replace
 * their 2014 namesakes; the remaining older subclasses use the 2024 Wizard
 * compatibility schedule, moving their former level-2 entry feature to level 3.
 */
export const WIZARD_SUBCLASSES = [
  {
    catalogKey: "subclass:wizard:evoker",
    slug: "wizard-evoker",
    name: "Эвокер",
    englishName: "Evoker",
    source: "phb-2024",
    sourceLabel: "Player's Handbook 2024",
    rulesRevision: "phb-2024",
    visualKey: "wizard-subclass:evoker",
    unlockLevel: 3,
    featureLevels: levels,
  },
  {
    catalogKey: "subclass:wizard:diviner",
    slug: "wizard-diviner",
    name: "Прорицатель",
    englishName: "Diviner",
    source: "phb-2024",
    sourceLabel: "Player's Handbook 2024",
    rulesRevision: "phb-2024",
    visualKey: "wizard-subclass:diviner",
    unlockLevel: 3,
    featureLevels: levels,
  },
  {
    catalogKey: "subclass:wizard:illusionist",
    slug: "wizard-illusionist",
    name: "Иллюзионист",
    englishName: "Illusionist",
    source: "phb-2024",
    sourceLabel: "Player's Handbook 2024",
    rulesRevision: "phb-2024",
    visualKey: "wizard-subclass:illusionist",
    unlockLevel: 3,
    featureLevels: levels,
  },
  {
    catalogKey: "subclass:wizard:abjurer",
    slug: "wizard-abjurer",
    name: "Абжурер",
    englishName: "Abjurer",
    source: "phb-2024",
    sourceLabel: "Player's Handbook 2024",
    rulesRevision: "phb-2024",
    visualKey: "wizard-subclass:abjurer",
    unlockLevel: 3,
    featureLevels: levels,
  },
  {
    catalogKey: "subclass:wizard:enchantment",
    slug: "wizard-enchantment",
    name: "Школа очарования",
    englishName: "School of Enchantment",
    source: "legacy-school",
    sourceLabel: "Player's Handbook 2014",
    rulesRevision: "2014-compatible-on-wizard-2024",
    visualKey: "wizard-subclass:enchantment",
    unlockLevel: 3,
    featureLevels: levels,
  },
  {
    catalogKey: "subclass:wizard:conjuration",
    slug: "wizard-conjuration",
    name: "Школа воплощения",
    englishName: "School of Conjuration",
    source: "legacy-school",
    sourceLabel: "Player's Handbook 2014",
    rulesRevision: "2014-compatible-on-wizard-2024",
    visualKey: "wizard-subclass:conjuration",
    unlockLevel: 3,
    featureLevels: levels,
  },
  {
    catalogKey: "subclass:wizard:necromancy",
    slug: "wizard-necromancy",
    name: "Школа некромантии",
    englishName: "School of Necromancy",
    source: "legacy-school",
    sourceLabel: "Player's Handbook 2014",
    rulesRevision: "2014-compatible-on-wizard-2024",
    visualKey: "wizard-subclass:necromancy",
    unlockLevel: 3,
    featureLevels: levels,
  },
  {
    catalogKey: "subclass:wizard:transmutation",
    slug: "wizard-transmutation",
    name: "Школа преобразования",
    englishName: "School of Transmutation",
    source: "legacy-school",
    sourceLabel: "Player's Handbook 2014",
    rulesRevision: "2014-compatible-on-wizard-2024",
    visualKey: "wizard-subclass:transmutation",
    unlockLevel: 3,
    featureLevels: levels,
  },
  {
    catalogKey: "subclass:wizard:war-magic",
    slug: "wizard-war-magic",
    name: "Военная магия",
    englishName: "War Magic",
    source: "xanathar",
    sourceLabel: "Xanathar's Guide to Everything",
    rulesRevision: "2014-compatible-on-wizard-2024",
    visualKey: "wizard-subclass:war-magic",
    unlockLevel: 3,
    featureLevels: levels,
  },
  {
    catalogKey: "subclass:wizard:bladesinging",
    slug: "wizard-bladesinging",
    name: "Песнь клинка",
    englishName: "Bladesinging",
    source: "tasha",
    sourceLabel: "Tasha's Cauldron of Everything",
    rulesRevision: "tasha-compatible-on-wizard-2024",
    visualKey: "wizard-subclass:bladesinging",
    unlockLevel: 3,
    featureLevels: levels,
  },
  {
    catalogKey: "subclass:wizard:order-of-scribes",
    slug: "wizard-order-of-scribes",
    name: "Орден писцов",
    englishName: "Order of Scribes",
    source: "tasha",
    sourceLabel: "Tasha's Cauldron of Everything",
    rulesRevision: "tasha-compatible-on-wizard-2024",
    visualKey: "wizard-subclass:order-of-scribes",
    unlockLevel: 3,
    featureLevels: levels,
  },
  {
    catalogKey: "subclass:wizard:graviturgy",
    slug: "wizard-graviturgy",
    name: "Гравитургия",
    englishName: "Graviturgy Magic",
    source: "wildemount",
    sourceLabel: "Explorer's Guide to Wildemount",
    rulesRevision: "wildemount-compatible-on-wizard-2024",
    visualKey: "wizard-subclass:graviturgy",
    unlockLevel: 3,
    featureLevels: levels,
  },
  {
    catalogKey: "subclass:wizard:chronurgy",
    slug: "wizard-chronurgy",
    name: "Хронургия",
    englishName: "Chronurgy Magic",
    source: "wildemount",
    sourceLabel: "Explorer's Guide to Wildemount",
    rulesRevision: "wildemount-compatible-on-wizard-2024",
    visualKey: "wizard-subclass:chronurgy",
    unlockLevel: 3,
    featureLevels: levels,
  },
] as const satisfies readonly WizardSubclassDefinition[]

const supportedCatalogKeys = new Set<string>(WIZARD_SUBCLASSES.map((entry) => entry.catalogKey))
const supportedFeatureLevels = new Set<number>(WIZARD_SUBCLASS_FEATURE_LEVELS)

export type WizardSubclassPackageValidation = {
  template: Pick<RuleTemplate, "id" | "kind" | "catalog_key" | "parent_template_id" | "unlock_level">
  parent: Pick<RuleTemplate, "id" | "kind" | "catalog_key">
  levels: readonly Pick<RuleTemplateLevel, "level">[]
}

/**
 * Guard for future Wizard subclass packages. It checks only structural facts
 * owned by the template system; individual feature mechanics still receive
 * their own runtime/GM-boundary audit in each subclass wave.
 */
export function wizardSubclassPackageErrors(input: WizardSubclassPackageValidation): string[] {
  const errors: string[] = []

  if (input.template.kind !== "subclass") errors.push("template.kind must be subclass")
  if (!input.template.catalog_key || !supportedCatalogKeys.has(input.template.catalog_key)) {
    errors.push("catalog_key is not a supported Wizard subclass identity")
  }
  if (input.parent.kind !== "class" || input.parent.catalog_key !== WIZARD_SUBCLASS_PARENT_CATALOG_KEY) {
    errors.push(`parent must be ${WIZARD_SUBCLASS_PARENT_CATALOG_KEY}`)
  }
  if (input.template.parent_template_id !== input.parent.id) errors.push("parent_template_id must point at the Wizard template")
  if (input.template.unlock_level !== WIZARD_SUBCLASS_UNLOCK_LEVEL) {
    errors.push(`unlock_level must be ${WIZARD_SUBCLASS_UNLOCK_LEVEL}`)
  }

  const invalidLevels = input.levels.map((entry) => entry.level).filter((level) => !supportedFeatureLevels.has(level))
  if (invalidLevels.length > 0) errors.push(`unsupported Wizard subclass feature levels: ${[...new Set(invalidLevels)].join(", ")}`)

  return errors
}

export function assertWizardSubclassPackage(input: WizardSubclassPackageValidation): void {
  const errors = wizardSubclassPackageErrors(input)
  if (errors.length > 0) throw new Error(`Invalid Wizard subclass package: ${errors.join("; ")}`)
}
