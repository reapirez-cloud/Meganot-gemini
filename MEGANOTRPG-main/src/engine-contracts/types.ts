/**
 * Shared transport types for the named MEGANOTRPG engines.
 *
 * Keep this module free of React, Supabase and browser storage. Engine-to-engine
 * communication is expressed through these contracts; UI components are never
 * used as a message bus.
 */

export type EngineName =
  | "ce"
  | "gena"
  | "oracle"
  | "tobik"
  | "cheburashka"
  | "shapoklyak"
  | "larisa"
  | "chasovoy"

export type CommandAuthority = "player" | "gm" | "system"
export type EngineEventVisibility = "campaign" | "actor" | "gm"

export type EngineCommandContext = {
  /** Stable idempotency/correlation key. One user intention keeps one id. */
  commandId: string
  campaignId: string
  requestedBy: string
  authority: CommandAuthority
  occurredAt: string
  actorCharacterId?: string | null
  roomId?: string | null
}

export type EngineEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> = {
  commandId: string
  engine: EngineName
  kind: string
  campaignId: string
  aggregateType: "session" | "character" | "inventory" | "item" | "location" | "scene" | "roll" | "definition"
  aggregateId: string
  occurredAt: string
  visibility: EngineEventVisibility
  actorCharacterId?: string | null
  payload: TPayload
}

export type EngineEffects = {
  characterIds: string[]
  itemIds: string[]
  locationIds: string[]
  sceneIds: string[]
  /** A fresh snapshot must be assembled and passed to the pure CE. */
  resolveCharacterIds: string[]
}

export type EngineCommandResult<T> = {
  value: T
  events: EngineEvent[]
  effects: EngineEffects
}

/**
 * Engines/control planes allowed to request a fresh character read model.
 * CE cannot invalidate itself, Oracle delegates invalidation to the owner, and
 * Tobik never mutates character state merely because dice were rolled.
 */
export type CharacterResolutionSource = Exclude<EngineName, "ce" | "oracle" | "tobik">

export type CharacterResolutionRequest = {
  characterId: string
  source: CharacterResolutionSource
  reason: string
  commandId: string
}

/**
 * A domain engine calls this after its canonical state changes. The receiver
 * assembles fresh projections and invokes CE; it must not cache canonical state
 * inside CE.
 */
export interface CharacterResolutionRequester {
  requestCharacterResolution(request: CharacterResolutionRequest): void | Promise<void>
}

export interface EngineEventPublisher {
  publishEngineEvents(events: readonly EngineEvent[]): void | Promise<void>
}

export const EMPTY_ENGINE_EFFECTS: EngineEffects = {
  characterIds: [],
  itemIds: [],
  locationIds: [],
  sceneIds: [],
  resolveCharacterIds: [],
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

export function mergeEngineEffects(...effects: readonly EngineEffects[]): EngineEffects {
  return {
    characterIds: unique(effects.flatMap((value) => value.characterIds)),
    itemIds: unique(effects.flatMap((value) => value.itemIds)),
    locationIds: unique(effects.flatMap((value) => value.locationIds)),
    sceneIds: unique(effects.flatMap((value) => value.sceneIds)),
    resolveCharacterIds: unique(effects.flatMap((value) => value.resolveCharacterIds)),
  }
}

export function createEngineCommandId(): string {
  const fallbackUuid = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16)
    return (token === "x" ? random : (random & 0x3) | 0x8).toString(16)
  })
  return globalThis.crypto?.randomUUID?.() || fallbackUuid()
}

export function createEngineCommandContext(input: Omit<EngineCommandContext, "commandId" | "occurredAt"> & {
  commandId?: string
  occurredAt?: string
}): EngineCommandContext {
  const commandId = input.commandId || createEngineCommandId()
  return {
    ...input,
    commandId,
    occurredAt: input.occurredAt || new Date().toISOString(),
  }
}

export class EngineCommandError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = "EngineCommandError"
    this.code = code
  }
}
