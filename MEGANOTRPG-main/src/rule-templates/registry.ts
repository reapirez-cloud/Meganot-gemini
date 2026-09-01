import type { CharacterContribution } from "../character-engine/index.ts"
import type { CharacterTemplateBundle } from "./types.ts"
import { resolveTemplateBundles, type TemplateSourceResolution } from "./resolver.ts"

const registry = new Map<string, CharacterTemplateBundle[]>()
const listeners = new Map<string, Set<(bundles: CharacterTemplateBundle[]) => void>>()

function notify(characterId: string) {
  const bundles = registry.get(characterId) || []
  for (const listener of listeners.get(characterId) || []) listener(bundles)
}

function stableJson(value: unknown): string {
  if (value === undefined) return "undefined"
  if (value === null) return "null"
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (typeof value === "object") {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`
  }
  return JSON.stringify(value) ?? String(value)
}

export function registerCharacterTemplateBundles(characterId: string, bundles: CharacterTemplateBundle[]) {
  const current = registry.get(characterId)
  if (current && stableJson(current) === stableJson(bundles)) return false
  registry.set(characterId, bundles)
  notify(characterId)
  return true
}

export function clearCharacterTemplateBundles(characterId: string) {
  registry.delete(characterId)
}

export function registeredCharacterTemplateBundles(characterId: string) {
  return registry.get(characterId) || []
}

export function subscribeCharacterTemplateBundles(
  characterId: string,
  listener: (bundles: CharacterTemplateBundle[]) => void,
) {
  const current = listeners.get(characterId) || new Set<(bundles: CharacterTemplateBundle[]) => void>()
  current.add(listener)
  listeners.set(characterId, current)
  return () => {
    current.delete(listener)
    if (!current.size) listeners.delete(characterId)
  }
}

/**
 * Full parser result for source-management UI and Character Engine input.
 * Consumers that only need mechanics should normally use
 * characterTemplateContributions().
 */
export function characterTemplateSourceResolution(
  characterId: string,
  characterLevel: number,
): TemplateSourceResolution {
  return resolveTemplateBundles(registeredCharacterTemplateBundles(characterId), characterLevel)
}

/**
 * CE-facing output. This is intentionally the only thing the generic adapter
 * needs from classes/races/subclasses: native CharacterContribution objects.
 */
export function characterTemplateContributions(
  characterId: string,
  characterLevel: number,
): CharacterContribution[] {
  return characterTemplateSourceResolution(characterId, characterLevel).contributions
}
