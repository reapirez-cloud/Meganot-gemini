import type { SupabaseClient } from "@supabase/supabase-js"
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

type Row = Record<string, unknown>

function fail(error: { message: string } | null, fallback: string): never {
  throw new EngineCommandError("definition.persistence", error?.message || fallback)
}

function identity(row: Row) {
  return {
    id: String(row.id),
    kind: row.kind as ChasovoyDefinition["kind"],
    scope: row.scope as ChasovoyDefinition["scope"],
    campaignId: row.campaign_id ? String(row.campaign_id) : null,
    slug: String(row.slug),
    visibility: row.visibility as ChasovoyDefinition["visibility"],
    status: row.status as ChasovoyDefinition["status"],
    sourceKind: row.source_kind as ChasovoyDefinition["sourceKind"],
    sourceLabel: row.source_label ? String(row.source_label) : null,
    externalId: row.external_id ? String(row.external_id) : null,
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: String(row.created_at),
  }
}

function merge(row: Row, revision: Row): ChasovoyDefinition {
  return {
    ...identity(row),
    revision: Number(revision.revision),
    name: String(revision.name),
    summary: String(revision.summary || ""),
    rulesText: String(revision.rules_text || ""),
    mechanics: (revision.mechanics ?? []) as ChasovoyDefinition["mechanics"],
    data: (revision.data ?? {}) as ChasovoyDefinition["data"],
    updatedAt: String(revision.created_at || row.updated_at || row.created_at),
  }
}

export class SupabaseChasovoyStorage implements ChasovoyStorage {
  private readonly client: SupabaseClient

  constructor(client: SupabaseClient) {
    this.client = client
  }

  private async hydrate(row: Row, revision?: number | null): Promise<ChasovoyDefinition | null> {
    const target = revision ?? Number(row.current_revision || 1)
    const { data, error } = await this.client.from("reference_definition_revisions")
      .select("*").eq("definition_id", String(row.id)).eq("revision", target).maybeSingle()
    if (error) fail(error, "Could not load definition revision")
    return data ? merge(row, data as Row) : null
  }

  async getDefinition(ref: ChasovoyDefinitionRef) {
    const { data, error } = await this.client.from("reference_definitions").select("*").eq("id", ref.id).maybeSingle()
    if (error) fail(error, "Could not load definition")
    return data ? this.hydrate(data as Row, ref.revision) : null
  }

  async getBySlug(input: Pick<ChasovoyDefinition, "kind" | "scope" | "campaignId" | "slug">) {
    let query = this.client.from("reference_definitions").select("*").eq("kind", input.kind).eq("scope", input.scope).eq("slug", input.slug)
    query = input.scope === "campaign" ? query.eq("campaign_id", input.campaignId) : query.is("campaign_id", null)
    const { data, error } = await query.maybeSingle()
    if (error) fail(error, "Could not load definition")
    return data ? this.hydrate(data as Row) : null
  }

  async listDefinitions(filter: ChasovoyDefinitionFilter = {}) {
    let query = this.client.from("reference_definitions").select("*")
    if (filter.kind) query = query.eq("kind", filter.kind)
    if (filter.scope) query = query.eq("scope", filter.scope)
    if (filter.campaignId !== undefined) query = filter.campaignId === null ? query.is("campaign_id", null) : query.eq("campaign_id", filter.campaignId)
    if (filter.status) query = query.eq("status", filter.status)
    if (filter.visibility) query = query.eq("visibility", filter.visibility)
    if (filter.search?.trim()) query = query.or(`slug.ilike.%${filter.search.trim()}%`)
    const { data, error } = await query.order("kind").order("slug")
    if (error) fail(error, "Could not list definitions")
    return Promise.all((data || []).map((row) => this.hydrate(row as Row))).then((rows) => rows.filter((row): row is ChasovoyDefinition => Boolean(row)))
  }

  async createDefinition(input: ChasovoyCreateInput, _context: ChasovoyMutationContext) {
    const { data, error } = await this.client.rpc("create_reference_definition_v1", {
      p_campaign_id: input.scope === "campaign" ? input.campaignId : null,
      p_kind: input.kind,
      p_slug: input.slug,
      p_visibility: input.visibility ?? "campaign",
      p_status: input.status ?? "active",
      p_source_kind: input.sourceKind ?? (input.scope === "system" ? "system" : "custom"),
      p_source_label: input.sourceLabel ?? null,
      p_external_id: input.externalId ?? null,
      p_name: input.name,
      p_summary: input.summary ?? "",
      p_rules_text: input.rulesText ?? "",
      p_mechanics: input.mechanics ?? [],
      p_data: input.data ?? {},
    })
    if (error || !data) fail(error, "Could not create definition")
    const result = await this.getDefinition({ id: String(data) })
    if (!result) fail(null, "Created definition could not be loaded")
    return result
  }

  async reviseDefinition(definitionId: string, input: ChasovoyRevisionInput, _context: ChasovoyMutationContext) {
    const { error } = await this.client.rpc("revise_reference_definition_v1", {
      p_definition_id: definitionId,
      p_name: input.name,
      p_summary: input.summary ?? "",
      p_rules_text: input.rulesText ?? "",
      p_mechanics: input.mechanics ?? [],
      p_data: input.data ?? {},
    })
    if (error) fail(error, "Could not revise definition")
    const result = await this.getDefinition({ id: definitionId })
    if (!result) fail(null, "Revised definition could not be loaded")
    return result
  }

  async archiveDefinition(definitionId: string, _context: ChasovoyMutationContext) {
    const { error } = await this.client.rpc("archive_reference_definition_v1", { p_definition_id: definitionId })
    if (error) fail(error, "Could not archive definition")
    const result = await this.getDefinition({ id: definitionId })
    if (!result) fail(null, "Archived definition could not be loaded")
    return result
  }
}
