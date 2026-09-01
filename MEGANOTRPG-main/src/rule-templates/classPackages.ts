import { registeredCharacterTemplateBundles } from "./registry.ts"

export type CharacterClassPackage = {
  classAssignmentId: string
  classTemplateId: string
  classCatalogKey?: string | null
  className: string
  level: number
  subclassTemplateId?: string
  subclassName?: string
  subclassUnlockLevel?: number
  subclassActive: boolean
}

/**
 * UI read-model only. Class and subclass remain separate CE source trees; this
 * function merely presents their parent/child relationship as one class package.
 */
export function registeredCharacterClassPackages(characterId: string): CharacterClassPackage[] {
  const bundles = registeredCharacterTemplateBundles(characterId)
  const classes = bundles
    .filter((bundle) => bundle.template.kind === "class")
    .sort((left, right) => left.assignment.assigned_at.localeCompare(right.assignment.assigned_at))
  const subclasses = bundles.filter((bundle) => bundle.template.kind === "subclass")

  return classes.map((classBundle) => {
    const level = Math.max(1, classBundle.assignment.template_level || 1)
    const subclassBundle = subclasses.find((bundle) => bundle.template.parent_template_id === classBundle.template.id)
    const subclassUnlockLevel = subclassBundle ? Math.max(1, subclassBundle.template.unlock_level || 1) : undefined
    return {
      classAssignmentId: classBundle.assignment.id,
      classTemplateId: classBundle.template.id,
      classCatalogKey: classBundle.template.catalog_key,
      className: classBundle.template.name,
      level,
      ...(subclassBundle ? {
        subclassTemplateId: subclassBundle.template.id,
        subclassName: subclassBundle.template.name,
        subclassUnlockLevel,
      } : {}),
      subclassActive: Boolean(subclassBundle && level >= (subclassUnlockLevel || 1)),
    }
  })
}