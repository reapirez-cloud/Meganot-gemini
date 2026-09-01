import {
  EMPTY_ENGINE_EFFECTS,
  EngineCommandError,
  type EngineCommandResult,
  type EngineEvent,
  type EngineEventPublisher,
} from "../engine-contracts/index.ts"
import type {
  ChasovoyCommand,
  ChasovoyCreateInput,
  ChasovoyDefinition,
  ChasovoyDefinitionFilter,
  ChasovoyDefinitionRef,
  ChasovoyMutation,
  ChasovoyStorage,
} from "./types.ts"

export type ChasovoyDependencies = { eventPublisher?: EngineEventPublisher }

export function normalizeDefinitionSlug(value: string) {
  return value.trim().toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "")
}

function assertWriteAuthority(command: ChasovoyCommand) {
  if (command.context.authority !== "gm" && command.context.authority !== "system") {
    throw new EngineCommandError("definition.gm_required", "Reference definitions can only be authored by GM or system authority")
  }
}

function normalizeCreate(input: ChasovoyCreateInput, campaignId: string, authority: ChasovoyCommand["context"]["authority"]): ChasovoyCreateInput {
  const slug = normalizeDefinitionSlug(input.slug || input.name)
  const name = input.name.trim()
  if (!slug) throw new EngineCommandError("definition.slug_required", "Definition slug is required")
  if (!name) throw new EngineCommandError("definition.name_required", "Definition name is required")
  if (input.scope === "system" && authority !== "system") {
    throw new EngineCommandError("definition.system_authority_required", "Only system authority can create global definitions")
  }
  if (input.scope === "campaign" && (input.campaignId || campaignId) !== campaignId) {
    throw new EngineCommandError("definition.campaign_mismatch", "Definition belongs to another campaign")
  }
  return {
    ...input,
    slug,
    name,
    campaignId: input.scope === "campaign" ? campaignId : null,
    visibility: input.visibility ?? "campaign",
    status: input.status ?? "active",
    sourceKind: input.sourceKind ?? (input.scope === "system" ? "system" : "custom"),
    sourceLabel: input.sourceLabel?.trim() || null,
    externalId: input.externalId?.trim() || null,
    summary: input.summary?.trim() || "",
    rulesText: input.rulesText?.trim() || "",
    mechanics: input.mechanics ?? [],
    data: input.data ?? {},
  }
}

function eventFor(command: ChasovoyCommand, mutation: ChasovoyMutation): EngineEvent {
  return {
    commandId: command.context.commandId,
    engine: "chasovoy",
    kind: mutation.kind,
    campaignId: command.context.campaignId,
    aggregateType: "definition",
    aggregateId: mutation.definitionId,
    occurredAt: command.context.occurredAt,
    visibility: mutation.after.visibility === "gm" ? "gm" : "campaign",
    actorCharacterId: command.context.actorCharacterId,
    payload: {
      definitionId: mutation.definitionId,
      definitionKind: mutation.after.kind,
      scope: mutation.after.scope,
      revision: mutation.after.revision,
      status: mutation.after.status,
    },
  }
}

export class ChasovoyEngine {
  private readonly storage: ChasovoyStorage
  private readonly dependencies: ChasovoyDependencies

  constructor(storage: ChasovoyStorage, dependencies: ChasovoyDependencies = {}) {
    this.storage = storage
    this.dependencies = dependencies
  }

  getDefinition(ref: ChasovoyDefinitionRef) {
    if (!ref.id) throw new EngineCommandError("definition.id_required", "Definition id is required")
    return this.storage.getDefinition(ref)
  }

  getBySlug(input: Pick<ChasovoyDefinition, "kind" | "scope" | "campaignId" | "slug">) {
    return this.storage.getBySlug({ ...input, slug: normalizeDefinitionSlug(input.slug) })
  }

  listDefinitions(filter: ChasovoyDefinitionFilter = {}) {
    return this.storage.listDefinitions(filter)
  }

  async execute(command: ChasovoyCommand): Promise<EngineCommandResult<ChasovoyMutation>> {
    assertWriteAuthority(command)
    let before: ChasovoyDefinition | null = null
    let after: ChasovoyDefinition

    if (command.kind === "definition.create") {
      const input = normalizeCreate(command.input, command.context.campaignId, command.context.authority)
      const duplicate = await this.storage.getBySlug({
        kind: input.kind,
        scope: input.scope,
        campaignId: input.campaignId ?? null,
        slug: input.slug,
      })
      if (duplicate) {
        throw new EngineCommandError("definition.duplicate", `Definition already exists: ${input.kind}:${input.slug}`)
      }
      after = await this.storage.createDefinition(input, command.context)
    } else {
      before = await this.storage.getDefinition({ id: command.definitionId })
      if (!before) throw new EngineCommandError("definition.not_found", "Definition was not found")
      if (before.scope === "system" && command.context.authority !== "system") {
        throw new EngineCommandError("definition.system_authority_required", "Only system authority can mutate global definitions")
      }
      if (before.scope === "campaign" && before.campaignId !== command.context.campaignId) {
        throw new EngineCommandError("definition.campaign_mismatch", "Definition belongs to another campaign")
      }
      if (command.kind === "definition.revise") {
        if (!command.input.name.trim()) throw new EngineCommandError("definition.name_required", "Definition name is required")
        after = await this.storage.reviseDefinition(command.definitionId, {
          ...command.input,
          name: command.input.name.trim(),
          summary: command.input.summary?.trim() || "",
          rulesText: command.input.rulesText?.trim() || "",
          mechanics: command.input.mechanics ?? [],
          data: command.input.data ?? {},
        }, command.context)
      } else {
        after = await this.storage.archiveDefinition(command.definitionId, command.context)
      }
    }

    const mutation: ChasovoyMutation = { kind: command.kind, definitionId: after.id, before, after }
    const event = eventFor(command, mutation)
    await this.dependencies.eventPublisher?.publishEngineEvents([event])

    // Chasovoy deliberately does not know which characters reference a definition.
    // Consumers invalidate affected runtime snapshots after resolving references.
    return { value: mutation, events: [event], effects: EMPTY_ENGINE_EFFECTS }
  }
}
