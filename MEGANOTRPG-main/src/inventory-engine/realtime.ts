import type { SupabaseClient } from "@supabase/supabase-js"
import type { CharacterResolutionRequester } from "../engine-contracts/index.ts"

let subscriptionSequence = 0

/**
 * Cheburashka-owned persistence bridge for mutations committed by composite
 * server commands (for example Gena's atomic grenade + chat RPC). The bridge
 * emits only a resolution request; consumers still fetch a fresh projection.
 */
export function subscribeCheburashkaCharacterChanges(
  client: SupabaseClient,
  resolutionRequester: CharacterResolutionRequester,
  characterId: string,
): () => void {
  subscriptionSequence += 1
  const channel = client
    .channel(`cheburashka-resolution:${characterId}:${subscriptionSequence}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "character_inventory_items", filter: `character_id=eq.${characterId}` },
      (payload) => {
        const current = payload.new as Record<string, unknown>
        const previous = payload.old as Record<string, unknown>
        const itemId = String(current.id || previous.id || "unknown")
        const version = String(current.version || previous.version || "0")
        resolutionRequester.requestCharacterResolution({
          characterId,
          source: "cheburashka",
          reason: `inventory.${payload.eventType.toLocaleLowerCase("en-US")}`,
          commandId: `inventory-realtime:${itemId}:${version}`,
        })
      },
    )
    .subscribe()

  return () => { void client.removeChannel(channel) }
}
