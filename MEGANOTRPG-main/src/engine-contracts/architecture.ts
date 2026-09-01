import type { CommandAuthority, EngineName } from "./types.ts"

export type EnginePersistenceMode = "none" | "session" | "canonical"
export type EngineRole = "calculator" | "gameplay-control" | "gm-control" | "randomness" | "domain-owner"
export type EngineSignal = "engine-event" | "character-resolution" | "definition-invalidation"

export type EngineArchitectureEntry = {
  name: EngineName
  role: EngineRole
  persistence: EnginePersistenceMode
  /** Human-auditable list of facts this engine is allowed to persist. */
  stores: readonly string[]
  /** Public responsibilities/capabilities, not UI labels. */
  capabilities: readonly string[]
  /** Authorities accepted by the control/command surface. Empty means no command authority model. */
  acceptsAuthority: readonly CommandAuthority[]
  /** Explicit named engines this engine/control plane may command directly. */
  commands: readonly EngineName[]
  /** Infrastructure signals this engine is allowed to publish. */
  publishes: readonly EngineSignal[]
}

/**
 * Executable architecture contract for the named engines.
 *
 * This does not route commands. It makes ownership and allowed direct arrows
 * inspectable by tests and tooling so docs and runtime cannot drift silently.
 */
export const ENGINE_ARCHITECTURE = {
  ce: {
    name: "ce",
    role: "calculator",
    persistence: "none",
    stores: [],
    capabilities: [
      "resolve explicit character snapshot",
      "calculate derived mechanics",
      "explain resolved sources and suppressions",
    ],
    acceptsAuthority: [],
    commands: [],
    publishes: [],
  },
  gena: {
    name: "gena",
    role: "gameplay-control",
    persistence: "session",
    stores: [
      "gameplay declarations/history",
      "command correlation and idempotent receipts",
    ],
    capabilities: [
      "orchestrate normal player gameplay",
      "request authoritative rolls",
      "route item use and transfer to inventory owner",
      "route gameplay resource recovery/spend to character storage boundary",
      "correlate chat/template actions with one commandId",
    ],
    acceptsAuthority: ["player", "system"],
    commands: ["tobik", "cheburashka", "shapoklyak"],
    publishes: ["engine-event", "character-resolution"],
  },
  oracle: {
    name: "oracle",
    role: "gm-control",
    persistence: "none",
    stores: [],
    capabilities: [
      "translate explicit GM intent into owner commands",
      "preserve commandId and authority context",
      "address character, inventory, world and definition owners explicitly",
    ],
    acceptsAuthority: ["gm", "system"],
    commands: ["shapoklyak", "cheburashka", "larisa", "chasovoy"],
    publishes: [],
  },
  tobik: {
    name: "tobik",
    role: "randomness",
    persistence: "none",
    stores: [],
    capabilities: [
      "plan authoritative dice sequences",
      "resolve requested randomness",
      "return structured roll results",
    ],
    acceptsAuthority: [],
    commands: [],
    publishes: [],
  },
  cheburashka: {
    name: "cheburashka",
    role: "domain-owner",
    persistence: "canonical",
    stores: [
      "inventory instances and holders",
      "quantities and stacks",
      "equipment and slots",
      "charges and per-instance runtime state",
      "transfers and consumption state",
    ],
    capabilities: [
      "create/update/remove inventory instances",
      "equip and unequip instances",
      "consume quantities or charges",
      "transfer instances between characters",
      "project only active mechanical contributions for character resolution",
    ],
    acceptsAuthority: ["player", "gm", "system"],
    commands: [],
    publishes: ["engine-event", "character-resolution"],
  },
  shapoklyak: {
    name: "shapoklyak",
    role: "domain-owner",
    persistence: "canonical",
    stores: [
      "PC/NPC identity, assignment and lifecycle",
      "character visibility and discovery state",
      "base sheet facts and explicit HP",
      "character spells, features and preparation",
      "template assignments and source suppressions",
      "persistent character resources",
    ],
    capabilities: [
      "create/update/delete character entities",
      "manage assignment, avatar, visibility and life state",
      "set canonical HP and character sheet facts",
      "manage spells, features, preparation and choices",
      "synchronize and recover persistent character resources",
      "assign/remove reusable templates and suppress sources",
    ],
    acceptsAuthority: ["player", "gm", "system"],
    commands: [],
    publishes: ["engine-event", "character-resolution"],
  },
  larisa: {
    name: "larisa",
    role: "domain-owner",
    persistence: "canonical",
    stores: [
      "world/location hierarchy and topology",
      "location sections and links",
      "discovery and visibility",
      "character and scene placement",
      "scene participants",
      "descriptive campaign chronology",
      "NPC habitats",
    ],
    capabilities: [
      "create/update/archive/delete locations",
      "manage sections and map/topology links",
      "manage discovery and visibility",
      "place characters and scenes in world/time",
      "synchronize scene participants",
      "attach NPC habitats and descriptive location events",
    ],
    acceptsAuthority: ["gm", "system"],
    commands: [],
    publishes: ["engine-event"],
  },
  chasovoy: {
    name: "chasovoy",
    role: "domain-owner",
    persistence: "canonical",
    stores: [
      "reusable definition identities",
      "definition revisions and status",
      "class/subclass/race/spell/item/feat/condition/reference definitions",
    ],
    capabilities: [
      "create canonical reusable definitions",
      "revise definitions without changing canonical identity",
      "archive reusable definitions",
      "serve definitions by id, revision, slug and filters",
    ],
    acceptsAuthority: ["gm", "system"],
    commands: [],
    publishes: ["engine-event", "definition-invalidation"],
  },
} as const satisfies Record<EngineName, EngineArchitectureEntry>

const CANONICAL_OWNERS: readonly EngineName[] = ["cheburashka", "shapoklyak", "larisa", "chasovoy"]
const STATELESS_ENGINES: readonly EngineName[] = ["ce", "oracle", "tobik"]

export function validateEngineArchitecture(): string[] {
  const errors: string[] = []
  const names = new Set<EngineName>(Object.keys(ENGINE_ARCHITECTURE) as EngineName[])

  for (const [name, entry] of Object.entries(ENGINE_ARCHITECTURE) as [EngineName, EngineArchitectureEntry][]) {
    if (entry.name !== name) errors.push(`${name}: descriptor name mismatch`)
    for (const target of entry.commands) {
      if (!names.has(target)) errors.push(`${name}: unknown command target ${target}`)
      if (target === name) errors.push(`${name}: engine cannot command itself`)
    }
  }

  for (const name of CANONICAL_OWNERS) {
    if (ENGINE_ARCHITECTURE[name].persistence !== "canonical") {
      errors.push(`${name}: canonical owner must use canonical persistence`)
    }
  }

  for (const name of STATELESS_ENGINES) {
    const entry = ENGINE_ARCHITECTURE[name]
    if (entry.persistence !== "none" || entry.stores.length > 0) {
      errors.push(`${name}: stateless engine must not own persistence`)
    }
  }

  if (ENGINE_ARCHITECTURE.ce.commands.length > 0 || ENGINE_ARCHITECTURE.ce.publishes.length > 0) {
    errors.push("ce: pure Character Engine must have no outbound arrows")
  }
  const oracleCommands: readonly EngineName[] = ENGINE_ARCHITECTURE.oracle.commands
  if (oracleCommands.includes("gena")) {
    errors.push("oracle: GM control plane must never call GENA")
  }
  if (ENGINE_ARCHITECTURE.oracle.publishes.length > 0) {
    errors.push("oracle: owner engines publish canonical events; Oracle must not duplicate them")
  }
  const tobikSignals: readonly EngineSignal[] = ENGINE_ARCHITECTURE.tobik.publishes
  if (tobikSignals.includes("character-resolution")) {
    errors.push("tobik: rolling dice must never invalidate character state by itself")
  }

  return errors
}

export function assertEngineArchitecture(): void {
  const errors = validateEngineArchitecture()
  if (errors.length > 0) throw new Error(`Invalid named-engine architecture:\n${errors.join("\n")}`)
}
