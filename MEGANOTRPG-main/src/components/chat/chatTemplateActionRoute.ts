import type {
  CharacterSource,
  ResolvedAction,
  ResolvedSpellAccess,
} from "../../character-engine/index.ts"
import type { ResolvedSourceRef } from "../../character-engine/types.ts"

const TEMPLATE_SOURCE_TYPES = new Set(["class_template", "subclass_template"])
const MECHANIC_MARKER = ":mechanic:"

function isTemplateSource(source: CharacterSource | undefined) {
  if (!source) return false
  return TEMPLATE_SOURCE_TYPES.has(source.sourceType || "")
    || source.id.startsWith("template:class:")
    || source.id.startsWith("template:subclass:")
}

function mechanicIdFromTemplateRefs(refs: ResolvedSourceRef[]): string | null {
  for (const ref of refs) {
    if (!isTemplateSource(ref.source)) continue
    const markerIndex = ref.contributionId.lastIndexOf(MECHANIC_MARKER)
    if (markerIndex < 0) continue
    const mechanicId = ref.contributionId.slice(markerIndex + MECHANIC_MARKER.length).trim()
    if (mechanicId) return mechanicId
  }
  return null
}

/**
 * Returns the authored rule-template mechanic id that the server runtime expects.
 * The id comes from CE provenance; labels and display keys are never used as guesses.
 */
export function templateMechanicIdForChatAction(action: ResolvedAction): string | null {
  return mechanicIdFromTemplateRefs(action.sources)
}

/** Same provenance rule for one concrete resolved spell access. */
export function templateMechanicIdForSpellAccess(access: ResolvedSpellAccess): string | null {
  return mechanicIdFromTemplateRefs(access.sources)
}

/**
 * Template runtime requires an option key only for alternative resource costs.
 * undefined = no option needed; string = one unambiguous available option;
 * null = UI must ask the player instead of silently choosing between alternatives.
 */
export function templatePaymentOptionKeyForChatAction(action: ResolvedAction): string | null | undefined {
  if (!action.costOptions.length) return undefined
  const available = action.costOptions.filter((option) => option.available)
  if (available.length === 1) return available[0]!.key
  return null
}
