import { resolveCharacterInput } from "./resolver.ts"
import { CHARACTER_ENGINE_VERSION } from "./version.ts"
import type {
  CharacterEngineInput,
  GrantPayload,
  GrantTarget,
  ResolvedAction,
  ResolvedCharacter,
  ResolvedGrant,
  ResolvedResource,
  ResolvedSpell,
  ResolvedSourceRef,
} from "./types.ts"

export const RESOLVED_CHARACTER_CONTRACT_VERSION = 1 as const

export type ResolvedCapabilitySectionKey =
  | "resistances"
  | "immunities"
  | "languages"
  | "proficiencies"
  | "senses"
  | "features"
  | "traits"

export type ResolvedDynamicSectionKey =
  | ResolvedCapabilitySectionKey
  | "resources"
  | "actions"
  | "spells"

export interface ResolvedCapabilities {
  resistances: ResolvedGrant[]
  immunities: ResolvedGrant[]
  languages: ResolvedGrant[]
  proficiencies: ResolvedGrant[]
  senses: ResolvedGrant[]
  features: ResolvedGrant[]
  traits: ResolvedGrant[]
}

/**
 * Explicit machine-readable rule carried by a resolved feature grant.
 * `structured` means the source declares a semantic `mechanic.kind` contract.
 * `summary` is the legacy catalog shape (dice/range/recharge hints only) and is
 * intentionally distinguishable so consumers/audits never mistake it for a
 * fully integrated rule.
 */
export interface ResolvedMechanicalRule {
  key: string
  variantKey: string
  label?: string
  description?: string
  mechanic: GrantPayload
  integration: "structured" | "summary"
  sources: ResolvedSourceRef[]
}

/**
 * Stable renderer-facing contract for Character Engine v1.
 *
 * The fixed character skeleton is inherited from ResolvedCharacter. Dynamic
 * content is represented only by resolved entries; renderers must not invent
 * placeholders for empty sections. Use resolvedDynamicSections() when a view
 * wants the engine to decide which optional sections actually exist.
 *
 * `grants` remains available for provenance/advanced consumers. Ordinary sheets
 * should consume `capabilities`, `rules`, `resources`, `actions` and `spells`
 * instead of re-filtering raw grants themselves.
 */
export interface ResolvedCharacterContract extends ResolvedCharacter {
  /** Semver of the standalone mechanics engine that produced this result. */
  engineVersion: typeof CHARACTER_ENGINE_VERSION
  contractVersion: typeof RESOLVED_CHARACTER_CONTRACT_VERSION
  capabilities: ResolvedCapabilities
  /** Machine-readable passive/triggered rules. Never infer these from prose. */
  rules: ResolvedMechanicalRule[]
}

const CAPABILITY_TARGET_TO_SECTION: Partial<Record<GrantTarget, ResolvedCapabilitySectionKey>> = {
  resistance: "resistances",
  immunity: "immunities",
  language: "languages",
  proficiency: "proficiencies",
  sense: "senses",
  feature: "features",
  trait: "traits",
}

const SECTION_TO_TARGET: Record<ResolvedCapabilitySectionKey, GrantTarget> = {
  resistances: "resistance",
  immunities: "immunity",
  languages: "language",
  proficiencies: "proficiency",
  senses: "sense",
  features: "feature",
  traits: "trait",
}

function compareGrant(left: ResolvedGrant, right: ResolvedGrant): number {
  return left.key.localeCompare(right.key) || left.variantKey.localeCompare(right.variantKey)
}

function asPayloadRecord(payload: GrantPayload | undefined): Record<string, GrantPayload> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null
  return payload as Record<string, GrantPayload>
}

function payloadString(payload: Record<string, GrantPayload>, key: string): string | undefined {
  const value = payload[key]
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function mechanicIntegration(mechanic: GrantPayload): ResolvedMechanicalRule["integration"] {
  const object = asPayloadRecord(mechanic)
  return object && typeof object.kind === "string" && object.kind.trim() ? "structured" : "summary"
}

/**
 * Extracts explicit mechanical rule payloads from resolved features. The engine
 * keeps legacy summary metadata visible, but labels it `summary` so it cannot be
 * confused with a semantic rule contract.
 */
export function resolveMechanicalRules(grants: ResolvedGrant[]): ResolvedMechanicalRule[] {
  return grants
    .filter((grant) => grant.target === "feature" || grant.target === "trait")
    .flatMap((grant) => {
      const payload = asPayloadRecord(grant.payload)
      if (!payload || payload.mechanic === undefined || payload.mechanic === null) return []
      return [{
        key: grant.key,
        variantKey: grant.variantKey,
        ...(payloadString(payload, "label") ? { label: payloadString(payload, "label") } : {}),
        ...(payloadString(payload, "description") ? { description: payloadString(payload, "description") } : {}),
        mechanic: payload.mechanic,
        integration: mechanicIntegration(payload.mechanic),
        sources: grant.sources,
      } satisfies ResolvedMechanicalRule]
    })
    .sort((left, right) => left.key.localeCompare(right.key) || left.variantKey.localeCompare(right.variantKey))
}

export function resolveCapabilities(grants: ResolvedGrant[]): ResolvedCapabilities {
  const capabilities: ResolvedCapabilities = {
    resistances: [],
    immunities: [],
    languages: [],
    proficiencies: [],
    senses: [],
    features: [],
    traits: [],
  }

  for (const grant of grants) {
    const section = CAPABILITY_TARGET_TO_SECTION[grant.target]
    if (section) capabilities[section].push(grant)
  }

  for (const section of Object.keys(capabilities) as ResolvedCapabilitySectionKey[]) {
    capabilities[section] = capabilities[section].slice().sort(compareGrant)
  }

  return capabilities
}

function assertUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new ResolvedCharacterContractError(`${label} must contain unique identities`)
  }
}

function resourceIdentity(resource: ResolvedResource): string {
  return resource.stateKey
}

function actionIdentity(action: ResolvedAction): string {
  return action.stateKey
}

function spellIdentity(spell: ResolvedSpell): string {
  return spell.key
}

export class ResolvedCharacterContractError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ResolvedCharacterContractError"
  }
}

/**
 * Checks renderer-facing invariants without recalculating game mechanics.
 * This is intentionally a contract validator, not a second resolver.
 */
export function validateResolvedCharacterContract(contract: ResolvedCharacterContract): void {
  if (contract.engineVersion !== CHARACTER_ENGINE_VERSION) {
    throw new ResolvedCharacterContractError(
      `unsupported character engine version: ${String(contract.engineVersion)}`,
    )
  }
  if (contract.contractVersion !== RESOLVED_CHARACTER_CONTRACT_VERSION) {
    throw new ResolvedCharacterContractError(
      `unsupported resolved character contract version: ${String(contract.contractVersion)}`,
    )
  }

  if (!contract.id.trim()) throw new ResolvedCharacterContractError("character id must not be empty")
  if (!contract.name.trim()) throw new ResolvedCharacterContractError("character name must not be empty")
  if (!Number.isInteger(contract.level) || contract.level < 1) {
    throw new ResolvedCharacterContractError("character level must be an integer >= 1")
  }

  assertUnique(contract.resources.map(resourceIdentity), "resources")
  assertUnique(contract.actions.map(actionIdentity), "actions")
  assertUnique(contract.spells.map(spellIdentity), "spells")
  assertUnique(contract.rules.map((rule) => `${rule.key}:${rule.variantKey}`), "rules")

  for (const spell of contract.spells) {
    if (spell.accesses.length === 0) {
      throw new ResolvedCharacterContractError(`spell ${spell.key} must contain at least one access`)
    }
    assertUnique(spell.accesses.map((access) => access.key), `spell ${spell.key} accesses`)
    for (const access of spell.accesses) {
      if (access.methods.length === 0) {
        throw new ResolvedCharacterContractError(
          `spell ${spell.key} access ${access.key} must contain at least one method`,
        )
      }
      assertUnique(
        access.methods.map((method) => method.key),
        `spell ${spell.key} access ${access.key} methods`,
      )
    }
  }

  for (const section of Object.keys(contract.capabilities) as ResolvedCapabilitySectionKey[]) {
    const expectedTarget = SECTION_TO_TARGET[section]
    const entries = contract.capabilities[section]
    for (const entry of entries) {
      if (entry.target !== expectedTarget) {
        throw new ResolvedCharacterContractError(
          `${section} contains grant target ${entry.target}; expected ${expectedTarget}`,
        )
      }
    }
    assertUnique(
      entries.map((entry) => `${entry.key}:${entry.variantKey}`),
      `capabilities.${section}`,
    )
  }
}

/** Resolves and validates the canonical output consumed by future adapters/UI. */
export function resolveCharacterContract(input: CharacterEngineInput): ResolvedCharacterContract {
  const resolved = resolveCharacterInput(input)
  const contract: ResolvedCharacterContract = {
    ...resolved,
    engineVersion: CHARACTER_ENGINE_VERSION,
    contractVersion: RESOLVED_CHARACTER_CONTRACT_VERSION,
    capabilities: resolveCapabilities(resolved.grants),
    rules: resolveMechanicalRules(resolved.grants),
  }
  validateResolvedCharacterContract(contract)
  return contract
}

/**
 * Returns only optional sections that contain resolved content.
 * No `showX` flags are stored in character data and no empty placeholder section
 * is created. The renderer can iterate this list directly.
 */
export function resolvedDynamicSections(
  contract: ResolvedCharacterContract,
): ResolvedDynamicSectionKey[] {
  const sections: ResolvedDynamicSectionKey[] = []

  const capabilityOrder: ResolvedCapabilitySectionKey[] = [
    "resistances",
    "immunities",
    "languages",
    "proficiencies",
    "senses",
    "features",
    "traits",
  ]
  for (const section of capabilityOrder) {
    if (contract.capabilities[section].length > 0) sections.push(section)
  }

  if (contract.resources.length > 0) sections.push("resources")
  if (contract.actions.length > 0) sections.push("actions")
  if (contract.spells.length > 0) sections.push("spells")

  return sections
}

export function hasResolvedDynamicSection(
  contract: ResolvedCharacterContract,
  section: ResolvedDynamicSectionKey,
): boolean {
  return resolvedDynamicSections(contract).includes(section)
}
