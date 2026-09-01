import { applyResourceRecovery } from "./resources.ts"
import type {
  CharacterSource,
  CharacterState,
  ResolvedResource,
  SuppressionContribution,
} from "./types.ts"

export type TemporaryEffectEvent = "short_rest" | "long_rest" | "dawn"

export interface TemporaryEffectLifetime {
  event: TemporaryEffectEvent
  createdAtSequence: number
  expiresAtSequence: number
  durationEvents: number
}

export class TemporaryEffectEngineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TemporaryEffectEngineError"
  }
}

export function eventSequenceFactKey(event: TemporaryEffectEvent): string {
  switch (event) {
    case "short_rest":
      return "rest.short.sequence"
    case "long_rest":
      return "rest.long.sequence"
    case "dawn":
      return "time.dawn.sequence"
  }
}

/** Missing counters are treated as zero so old CharacterState objects remain valid. */
export function eventSequence(state: CharacterState, event: TemporaryEffectEvent): number {
  const key = eventSequenceFactKey(event)
  const value = state.facts?.[key]
  if (value === undefined) return 0
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new TemporaryEffectEngineError(`${key} must be an integer >= 0`)
  }
  return value as number
}

/**
 * Captures an absolute expiration boundary from the current State.
 * Example: long_rest sequence 7 + duration 3 => expires at sequence 10.
 */
export function createTemporaryEffectLifetime(
  state: CharacterState,
  event: TemporaryEffectEvent,
  durationEvents = 1,
): TemporaryEffectLifetime {
  if (!Number.isInteger(durationEvents) || durationEvents < 1) {
    throw new TemporaryEffectEngineError("temporary effect durationEvents must be an integer >= 1")
  }

  const createdAtSequence = eventSequence(state, event)
  return {
    event,
    createdAtSequence,
    expiresAtSequence: createdAtSequence + durationEvents,
    durationEvents,
  }
}

export function remainingTemporaryEffectEvents(
  state: CharacterState,
  lifetime: TemporaryEffectLifetime,
): number {
  return Math.max(0, lifetime.expiresAtSequence - eventSequence(state, lifetime.event))
}

export function isTemporaryEffectExpired(
  state: CharacterState,
  lifetime: TemporaryEffectLifetime,
): boolean {
  return remainingTemporaryEffectEvents(state, lifetime) === 0
}

export interface TemporaryEffectSuppressionOptions {
  id: string
  effectSource: CharacterSource
  state: CharacterState
  event: TemporaryEffectEvent
  durationEvents?: number
  includeDescendants?: boolean
}

export interface TemporaryEffectController {
  lifetime: TemporaryEffectLifetime
  suppression: SuppressionContribution
}

/**
 * Creates one universal suppression control for every contribution emitted by a
 * temporary effect source. The source itself stays immutable; expiration is
 * determined solely from the event counter in CharacterState.
 */
export function createTemporaryEffectController(
  options: TemporaryEffectSuppressionOptions,
): TemporaryEffectController {
  if (!options.id.trim()) {
    throw new TemporaryEffectEngineError("temporary effect controller id must not be empty")
  }
  if (!options.effectSource.id.trim()) {
    throw new TemporaryEffectEngineError("temporary effect source id must not be empty")
  }

  const lifetime = createTemporaryEffectLifetime(
    options.state,
    options.event,
    options.durationEvents ?? 1,
  )
  const factKey = eventSequenceFactKey(lifetime.event)

  return {
    lifetime,
    suppression: {
      id: options.id,
      kind: "suppression",
      operation: "SUPPRESS",
      selector: {
        kind: "source",
        sourceId: options.effectSource.id,
        includeDescendants: options.includeDescendants ?? true,
      },
      source: options.effectSource,
      condition: {
        kind: "state",
        key: factKey,
        operator: "GTE",
        value: lifetime.expiresAtSequence,
      },
    },
  }
}

/**
 * Applies one deterministic world event. Resource recovery and lifetime
 * progression happen in the same immutable State transition.
 */
export function applyCharacterEvent(
  state: CharacterState,
  resources: ResolvedResource[],
  event: TemporaryEffectEvent,
): CharacterState {
  const recovered = applyResourceRecovery(state, resources, event)
  const key = eventSequenceFactKey(event)
  const nextSequence = eventSequence(state, event) + 1

  return {
    ...recovered,
    facts: {
      ...(recovered.facts ?? {}),
      [key]: nextSequence,
    },
  }
}
