import type { CharacterContribution, CharacterSource, SuppressionContribution } from "../character-engine/index.ts"

const registry = new Map<string, Set<string>>()

export function registerCharacterSourceSuppressions(characterId: string, sourceIds: Iterable<string>) {
  registry.set(characterId, new Set(sourceIds))
}

export function clearCharacterSourceSuppressions(characterId: string) {
  registry.delete(characterId)
}

export function registeredCharacterSourceSuppressions(characterId: string): ReadonlySet<string> {
  return registry.get(characterId) || new Set<string>()
}

function controlSource(characterId: string): CharacterSource {
  return {
    id: `gm:suppression:${characterId}`,
    name: "Отключено ведущим",
    sourceType: "gm_control",
    visibility: "campaign",
  }
}

/**
 * Converts an explicit persistent GM OFF snapshot into CE-native universal
 * suppressions. Application integrations should prefer this pure path so a CE
 * result never depends on some unrelated hook having populated the registry.
 */
export function sourceSuppressionContributions(
  characterId: string,
  sourceIds: Iterable<string>,
): CharacterContribution[] {
  const source = controlSource(characterId)
  return [...sourceIds]
    .sort()
    .map((sourceId): SuppressionContribution => ({
      id: `${source.id}:${sourceId}`,
      kind: "suppression",
      operation: "SUPPRESS",
      selector: { kind: "source", sourceId, includeDescendants: true },
      source,
    }))
}

/**
 * Legacy registry-backed bridge. New integrations should pass their loaded
 * suppression snapshot to sourceSuppressionContributions() explicitly.
 */
export function characterSourceSuppressionContributions(characterId: string): CharacterContribution[] {
  return sourceSuppressionContributions(characterId, registeredCharacterSourceSuppressions(characterId))
}
