import { EngineCommandError } from "../engine-contracts/index.ts"
import type {
  ChasovoyCreateInput,
  ChasovoyDefinition,
  ChasovoyDefinitionFilter,
  ChasovoyDefinitionRef,
  ChasovoyMutationContext,
  ChasovoyRevisionInput,
  ChasovoyStorage,
} from "./types.ts"

function copy<T>(value: T): T { return structuredClone(value) }

type StoredDefinition = {
  identity: Omit<ChasovoyDefinition, "revision" | "name" | "summary" | "rulesText" | "mechanics" | "data" | "updatedAt">
  revisions: Array<Pick<ChasovoyDefinition, "revision" | "name" | "summary" | "rulesText" | "mechanics" | "data" | "updatedAt">>
}

function current(stored: StoredDefinition, revision?: number | null): ChasovoyDefinition | null {
  const row = revision == null
    ? stored.revisions[stored.revisions.length - 1]
    : stored.revisions.find((entry) => entry.revision === revision)
  return row ? copy({ ...stored.identity, ...row }) : null
}

function canonicalKey(input: Pick<ChasovoyDefinition, "kind" | "scope" | "campaignId" | "slug">) {
  return `${input.scope}:${input.campaignId || "global"}:${input.kind}:${input.slug}`
}

export class MemoryChasovoyStorage implements ChasovoyStorage {
  private readonly definitions = new Map<string, StoredDefinition>()

  constructor(initial: readonly ChasovoyDefinition[] = []) {
    for (const definition of initial) {
      const existing = this.definitions.get(definition.id)
      if (existing) {
        existing.revisions.push(copy({
          revision: definition.revision,
          name: definition.name,
          summary: definition.summary,
          rulesText: definition.rulesText,
          mechanics: definition.mechanics,
          data: definition.data,
          updatedAt: definition.updatedAt,
        }))
        existing.revisions.sort((a, b) => a.revision - b.revision)
      } else {
        this.definitions.set(definition.id, {
          identity: copy({
            id: definition.id,
            kind: definition.kind,
            scope: definition.scope,
            campaignId: definition.campaignId,
            slug: definition.slug,
            visibility: definition.visibility,
            status: definition.status,
            sourceKind: definition.sourceKind,
            sourceLabel: definition.sourceLabel,
            externalId: definition.externalId,
            createdBy: definition.createdBy,
            createdAt: definition.createdAt,
          }),
          revisions: [copy({
            revision: definition.revision,
            name: definition.name,
            summary: definition.summary,
            rulesText: definition.rulesText,
            mechanics: definition.mechanics,
            data: definition.data,
            updatedAt: definition.updatedAt,
          })],
        })
      }
    }
  }

  async getDefinition(ref: ChasovoyDefinitionRef) {
    const stored = this.definitions.get(ref.id)
    return stored ? current(stored, ref.revision) : null
  }

  async getBySlug(input: Pick<ChasovoyDefinition, "kind" | "scope" | "campaignId" | "slug">) {
    const key = canonicalKey(input)
    for (const stored of this.definitions.values()) {
      if (canonicalKey(stored.identity) === key) return current(stored)
    }
    return null
  }

  async listDefinitions(filter: ChasovoyDefinitionFilter = {}) {
    const search = filter.search?.trim().toLocaleLowerCase("ru-RU") || ""
    const rows = [...this.definitions.values()].map((stored) => current(stored)).filter((row): row is ChasovoyDefinition => Boolean(row))
    return rows.filter((row) => {
      if (filter.kind && row.kind !== filter.kind) return false
      if (filter.scope && row.scope !== filter.scope) return false
      if (filter.campaignId !== undefined && row.campaignId !== filter.campaignId) return false
      if (filter.status && row.status !== filter.status) return false
      if (filter.visibility && row.visibility !== filter.visibility) return false
      return !search || `${row.name} ${row.slug} ${row.summary}`.toLocaleLowerCase("ru-RU").includes(search)
    }).sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, "ru"))
  }

  async createDefinition(input: ChasovoyCreateInput, context: ChasovoyMutationContext) {
    const id = globalThis.crypto?.randomUUID?.() || `definition-${Math.random().toString(36).slice(2)}`
    const definition: ChasovoyDefinition = {
      id,
      kind: input.kind,
      scope: input.scope,
      campaignId: input.scope === "campaign" ? input.campaignId || null : null,
      slug: input.slug,
      visibility: input.visibility ?? "campaign",
      status: input.status ?? "active",
      sourceKind: input.sourceKind ?? (input.scope === "system" ? "system" : "custom"),
      sourceLabel: input.sourceLabel ?? null,
      externalId: input.externalId ?? null,
      revision: 1,
      name: input.name,
      summary: input.summary ?? "",
      rulesText: input.rulesText ?? "",
      mechanics: copy(input.mechanics ?? []),
      data: copy(input.data ?? {}),
      createdBy: context.requestedBy || null,
      createdAt: context.occurredAt,
      updatedAt: context.occurredAt,
    }
    if (await this.getBySlug(definition)) throw new EngineCommandError("definition.duplicate", "Canonical definition already exists")
    this.definitions.set(id, {
      identity: copy({
        id: definition.id,
        kind: definition.kind,
        scope: definition.scope,
        campaignId: definition.campaignId,
        slug: definition.slug,
        visibility: definition.visibility,
        status: definition.status,
        sourceKind: definition.sourceKind,
        sourceLabel: definition.sourceLabel,
        externalId: definition.externalId,
        createdBy: definition.createdBy,
        createdAt: definition.createdAt,
      }),
      revisions: [copy({ revision: 1, name: definition.name, summary: definition.summary, rulesText: definition.rulesText, mechanics: definition.mechanics, data: definition.data, updatedAt: definition.updatedAt })],
    })
    return copy(definition)
  }

  async reviseDefinition(definitionId: string, input: ChasovoyRevisionInput, context: ChasovoyMutationContext) {
    const stored = this.definitions.get(definitionId)
    if (!stored) throw new EngineCommandError("definition.not_found", "Definition was not found")
    const previous = current(stored)!
    stored.revisions.push({
      revision: previous.revision + 1,
      name: input.name,
      summary: input.summary ?? "",
      rulesText: input.rulesText ?? "",
      mechanics: copy(input.mechanics ?? []),
      data: copy(input.data ?? {}),
      updatedAt: context.occurredAt,
    })
    return current(stored)!
  }

  async archiveDefinition(definitionId: string, context: ChasovoyMutationContext) {
    const stored = this.definitions.get(definitionId)
    if (!stored) throw new EngineCommandError("definition.not_found", "Definition was not found")
    stored.identity.status = "archived"
    const latest = stored.revisions[stored.revisions.length - 1]
    if (latest) latest.updatedAt = context.occurredAt
    return current(stored)!
  }
}
