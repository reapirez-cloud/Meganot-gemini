import type { ResolvedResource } from "../../character-engine/index.ts"

export function spellSlotLevel(resource: ResolvedResource): number | null {
  const match = resource.key.match(/^spell_slot_(\d+)$/)
  return match ? Number(match[1]) : null
}

export function spellSlotResources(resources: ResolvedResource[]) {
  return resources
    .map((resource) => ({ resource, level: spellSlotLevel(resource) }))
    .filter((entry): entry is { resource: ResolvedResource; level: number } =>
      entry.level !== null && entry.resource.max.value > 0,
    )
    .sort((left, right) => left.level - right.level)
}
