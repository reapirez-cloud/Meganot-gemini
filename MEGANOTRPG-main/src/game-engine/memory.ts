import type { EngineEvent, EngineEventPublisher } from "../engine-contracts/index.ts"

export class MemoryEngineEventPublisher implements EngineEventPublisher {
  readonly events: EngineEvent[] = []

  publishEngineEvents(events: readonly EngineEvent[]): void {
    this.events.push(...structuredClone(events))
  }
}

