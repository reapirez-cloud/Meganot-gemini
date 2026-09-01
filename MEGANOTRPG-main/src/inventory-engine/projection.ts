import { inventoryMechanicContributions } from "../lib/characterMechanics.ts"
import type { InventoryItem } from "../types/characterSheet.ts"
import type { InventoryMechanicalProjection } from "./types.ts"

/**
 * Cheburashka keeps the backpack; CE receives only this mechanical projection.
 * Plain beer bottles, rope and other non-mechanical items naturally emit no CE
 * contributions and never become part of CharacterEngineInput.
 */
export function createInventoryMechanicalProjection(
  characterId: string,
  items: readonly InventoryItem[],
): InventoryMechanicalProjection {
  const projectedItems = items.map((item) => {
    const mode = item.usage_mode ?? (item.category === "consumable" ? "quantity" : "none")
    const depleted = mode === "charges"
      ? (item.charges_current ?? item.charges_max ?? 0) <= 0
      : mode === "quantity" && item.quantity <= 0
    if (!depleted) return item
    // The empty item can keep passive equipment effects, but its use actions and
    // spells are no longer capabilities CE is obliged to expose.
    return {
      ...item,
      mechanics: (item.mechanics ?? []).filter((mechanic) => mechanic.type !== "action" && mechanic.type !== "spell"),
    }
  })
  const contributions = inventoryMechanicContributions(projectedItems)
  const activeItemIds = [...new Set(contributions.flatMap((entry) => {
    const id = inventoryItemIdFromSourceId(entry.source.id)
    return id ? [id] : []
  }))]
  const revision = items
    .map((item) => `${item.id}:${item.version ?? 0}:${item.quantity}:${item.charges_current ?? "-"}:${Number(item.equipped)}`)
    .sort()
    .join("|")
  return { characterId, revision, activeItemIds, contributions }
}

export function inventoryItemIdFromSourceId(sourceId: string): string | null {
  // Private curse contributions use item:<id>:curse but still belong to the
  // same Cheburashka aggregate. CE provenance must never create a second item.
  return sourceId.match(/^item:([^:]+)(?::|$)/)?.[1] ?? null
}
