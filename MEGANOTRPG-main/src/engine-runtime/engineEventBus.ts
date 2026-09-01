import type { EngineEvent, EngineEventPublisher, EngineName } from "../engine-contracts/index.ts"

export type EngineEventListener = (event: EngineEvent) => void

/**
 * Ephemeral process-local signal bus for named-engine events.
 *
 * This is not canonical history and is not a transaction log. Domain engines
 * remain the owners of their state; durable history stays in the server/DB
 * paths that already own it. The bus only lets runtime consumers observe the
 * same engine events without making engines import one another or using UI as
 * a message bus.
 */
export class EngineEventBus implements EngineEventPublisher {
  private readonly listeners = new Set<EngineEventListener>()
  private readonly engineListeners = new Map<EngineName, Set<EngineEventListener>>()
  private readonly campaignListeners = new Map<string, Set<EngineEventListener>>()

  publishEngineEvents(events: readonly EngineEvent[]): void {
    for (const source of events) {
      const event = structuredClone(source)
      for (const listener of this.listeners) listener(event)
      for (const listener of this.engineListeners.get(event.engine) ?? []) listener(event)
      for (const listener of this.campaignListeners.get(event.campaignId) ?? []) listener(event)
    }
  }

  subscribe(listener: EngineEventListener): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  subscribeEngine(engine: EngineName, listener: EngineEventListener): () => void {
    return subscribeMapped(this.engineListeners, engine, listener)
  }

  subscribeCampaign(campaignId: string, listener: EngineEventListener): () => void {
    if (!campaignId) throw new Error("Campaign id is required for engine-event subscription")
    return subscribeMapped(this.campaignListeners, campaignId, listener)
  }
}

function subscribeMapped<TKey>(
  map: Map<TKey, Set<EngineEventListener>>,
  key: TKey,
  listener: EngineEventListener,
): () => void {
  const current = map.get(key) ?? new Set<EngineEventListener>()
  current.add(listener)
  map.set(key, current)
  return () => {
    current.delete(listener)
    if (current.size === 0) map.delete(key)
  }
}

export const engineEventBus = new EngineEventBus()
