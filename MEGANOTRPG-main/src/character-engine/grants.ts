import { evaluateCondition } from "./conditions.ts"
import type {
  AbilityKey,
  CharacterContribution,
  CharacterState,
  GrantContribution,
  GrantPayload,
  GrantTarget,
  ProficiencyRank,
  ResolvedGrant,
  ResolvedSourceRef,
  SenseGrantPayload,
  SkillKey,
} from "./types.ts"

export class GrantEngineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "GrantEngineError"
  }
}

export class GrantConflictError extends GrantEngineError {
  constructor(message: string) {
    super(message)
    this.name = "GrantConflictError"
  }
}

function payloadObject(value: GrantPayload): Record<string, GrantPayload> {
  return value as unknown as Record<string, GrantPayload>
}

function canonicalPayload(value: GrantPayload | undefined): string {
  if (value === undefined) return "undefined"
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalPayload).join(",")}]`

  const object = payloadObject(value)
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalPayload(object[key])}`)
    .join(",")}}`
}

function proficiencyRankFromPayload(payload: GrantPayload | undefined): 1 | 2 {
  if (payload === undefined) return 1
  if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
    const rank = payloadObject(payload).rank
    if (rank === 1 || rank === 2) return rank
  }
  throw new GrantEngineError("proficiency grant payload must be { rank: 1 | 2 }")
}

function sensePayload(payload: GrantPayload | undefined): SenseGrantPayload {
  if (payload === undefined) return {}
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new GrantEngineError("sense grant payload must be an object")
  }

  const object = payloadObject(payload)
  const range = object.range
  const unit = object.unit
  if (range !== undefined && (typeof range !== "number" || !Number.isFinite(range) || range < 0)) {
    throw new GrantEngineError("sense range must be a finite number >= 0")
  }
  if (unit !== undefined && typeof unit !== "string") {
    throw new GrantEngineError("sense unit must be a string")
  }
  return {
    ...(range === undefined ? {} : { range: range as number }),
    ...(unit === undefined ? {} : { unit: unit as string }),
  }
}

function mergePayload(
  target: GrantTarget,
  current: GrantPayload | undefined,
  incoming: GrantPayload | undefined,
  identity: string,
): GrantPayload | undefined {
  if (target === "proficiency") {
    const rank = Math.max(
      proficiencyRankFromPayload(current),
      proficiencyRankFromPayload(incoming),
    ) as 1 | 2
    return { rank }
  }

  if (target === "sense") {
    const left = sensePayload(current)
    const right = sensePayload(incoming)
    if (left.unit && right.unit && left.unit !== right.unit) {
      throw new GrantConflictError(`conflicting sense units for ${identity}`)
    }
    const ranges = [left.range, right.range].filter((value): value is number => value !== undefined)
    return {
      ...(ranges.length === 0 ? {} : { range: Math.max(...ranges) }),
      ...(left.unit ?? right.unit ? { unit: left.unit ?? right.unit } : {}),
    }
  }

  if (canonicalPayload(current) !== canonicalPayload(incoming)) {
    throw new GrantConflictError(
      `conflicting payloads for ${identity}; use a distinct variantKey for mechanically different grants`,
    )
  }
  return current
}

function normalizedPayload(contribution: GrantContribution): GrantPayload | undefined {
  if (contribution.target === "proficiency") {
    return { rank: proficiencyRankFromPayload(contribution.payload) }
  }
  if (contribution.target === "sense") {
    return sensePayload(contribution.payload) as GrantPayload
  }
  return contribution.payload
}

export function grantIdentity(target: GrantTarget, key: string, variantKey = "default"): string {
  return `${target}:${key}:${variantKey}`
}

export function skillProficiencyKey(skill: SkillKey): string {
  return `skill:${skill}`
}

export function savingThrowProficiencyKey(ability: AbilityKey): string {
  return `savingThrow:${ability}`
}

export type GrantIdentityMode = "merge" | "replace" | "suppress"

export interface GrantResolution {
  grants: ResolvedGrant[]
  modes: Map<string, GrantIdentityMode>
}

function mergeContributionsIntoGrant(
  current: ResolvedGrant | undefined,
  target: GrantTarget,
  key: string,
  variantKey: string,
  contributions: GrantContribution[],
): ResolvedGrant {
  const identity = grantIdentity(target, key, variantKey)
  let payload = current?.payload
  const sources = current?.sources.slice() ?? []

  for (const contribution of contributions.slice().sort((a, b) => a.id.localeCompare(b.id))) {
    const incoming = normalizedPayload(contribution)
    if (sources.length === 0 && payload === undefined) {
      payload = incoming
    } else {
      payload = mergePayload(target, payload, incoming, identity)
    }
    sources.push({ contributionId: contribution.id, source: contribution.source })
  }

  return {
    target,
    key,
    variantKey,
    ...(payload === undefined ? {} : { payload }),
    sources,
  }
}

/**
 * Resolves set-like facts by identity and priority.
 *
 * Per priority tier:
 * - GRANT merges with the existing identity.
 * - SUPPRESS clears the identity.
 * - REPLACE discards lower-priority identity state and installs a new one.
 *
 * Mixing GRANT/SUPPRESS/REPLACE at the same priority is ambiguous and rejected.
 * A higher-priority GRANT may restore an identity suppressed at a lower priority.
 */
export function resolveGrantResolution(
  contributions: CharacterContribution[],
  state: CharacterState,
  maxHp: number,
): GrantResolution {
  const active = contributions.filter(
    (contribution): contribution is GrantContribution =>
      contribution.kind === "grant" &&
      evaluateCondition(contribution.condition, { state, maxHp }),
  )

  const byIdentity = new Map<string, GrantContribution[]>()
  for (const contribution of active) {
    const identity = grantIdentity(
      contribution.target,
      contribution.key,
      contribution.variantKey ?? "default",
    )
    const list = byIdentity.get(identity) ?? []
    list.push(contribution)
    byIdentity.set(identity, list)
  }

  const grants: ResolvedGrant[] = []
  const modes = new Map<string, GrantIdentityMode>()

  for (const [identity, group] of byIdentity) {
    const sample = group[0]!
    const target = sample.target
    const key = sample.key
    const variantKey = sample.variantKey ?? "default"
    const priorities = [...new Set(group.map((item) => item.priority ?? 0))].sort((a, b) => a - b)

    let current: ResolvedGrant | undefined
    let mode: GrantIdentityMode = "merge"

    for (const priority of priorities) {
      const tier = group.filter((item) => (item.priority ?? 0) === priority)
      const operations = new Set(tier.map((item) => item.operation))
      if (operations.size > 1) {
        throw new GrantConflictError(
          `conflicting grant operations for ${identity} at priority ${priority}`,
        )
      }

      const operation = tier[0]!.operation
      if (operation === "SUPPRESS") {
        current = undefined
        mode = "suppress"
        continue
      }

      if (operation === "REPLACE") {
        current = mergeContributionsIntoGrant(undefined, target, key, variantKey, tier)
        mode = "replace"
        continue
      }

      current = mergeContributionsIntoGrant(current, target, key, variantKey, tier)
      if (mode === "suppress") {
        // A stronger re-grant restores the identity and its normal Base participation.
        mode = "merge"
      }
    }

    modes.set(identity, mode)
    if (current) grants.push(current)
  }

  grants.sort(
    (left, right) =>
      left.target.localeCompare(right.target) ||
      left.key.localeCompare(right.key) ||
      left.variantKey.localeCompare(right.variantKey),
  )

  return { grants, modes }
}

export function resolveGrants(
  contributions: CharacterContribution[],
  state: CharacterState,
  maxHp: number,
): ResolvedGrant[] {
  return resolveGrantResolution(contributions, state, maxHp).grants
}

export interface ResolvedProficiencyRank {
  rank: ProficiencyRank
  sources: ResolvedSourceRef[]
}

export function resolveProficiencyRank(
  baseRank: ProficiencyRank | undefined,
  resolution: GrantResolution,
  key: string,
): ResolvedProficiencyRank {
  const identity = grantIdentity("proficiency", key)
  const mode = resolution.modes.get(identity) ?? "merge"
  if (mode === "suppress") return { rank: 0, sources: [] }

  const matching = resolution.grants.filter(
    (grant) => grant.target === "proficiency" && grant.key === key && grant.variantKey === "default",
  )
  const grantRank = matching.reduce<ProficiencyRank>(
    (rank, grant) => Math.max(rank, proficiencyRankFromPayload(grant.payload)) as ProficiencyRank,
    0,
  )
  const sources = matching.flatMap((grant) => grant.sources)

  if (mode === "replace") return { rank: grantRank, sources }
  return { rank: Math.max(baseRank ?? 0, grantRank) as ProficiencyRank, sources }
}
