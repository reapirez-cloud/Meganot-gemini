import type { EngineCommandContext } from "../engine-contracts/index.ts"

export type ChasovoyDefinitionKind =
  | "class"
  | "subclass"
  | "race"
  | "subrace"
  | "spell"
  | "item"
  | "feat"
  | "feature"
  | "condition"
  | "background"
  | "species"
  | "reference"

export type ChasovoyDefinitionScope = "system" | "campaign"
export type ChasovoyDefinitionVisibility = "campaign" | "gm"
export type ChasovoyDefinitionStatus = "draft" | "active" | "archived"
export type ChasovoySourceKind = "system" | "srd" | "official" | "third_party" | "custom" | "legacy"

export type ChasovoyJson = null | boolean | number | string | ChasovoyJson[] | { [key: string]: ChasovoyJson }

export type ChasovoyDefinition = {
  id: string
  kind: ChasovoyDefinitionKind
  scope: ChasovoyDefinitionScope
  campaignId: string | null
  slug: string
  visibility: ChasovoyDefinitionVisibility
  status: ChasovoyDefinitionStatus
  sourceKind: ChasovoySourceKind
  sourceLabel: string | null
  externalId: string | null
  revision: number
  name: string
  summary: string
  rulesText: string
  mechanics: ChasovoyJson
  data: Record<string, ChasovoyJson>
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export type ChasovoyDefinitionRef = {
  id: string
  revision?: number | null
}

export type ChasovoyDefinitionFilter = {
  kind?: ChasovoyDefinitionKind
  scope?: ChasovoyDefinitionScope
  campaignId?: string | null
  status?: ChasovoyDefinitionStatus
  visibility?: ChasovoyDefinitionVisibility
  search?: string
}

export type ChasovoyCreateInput = {
  kind: ChasovoyDefinitionKind
  scope: ChasovoyDefinitionScope
  campaignId?: string | null
  slug: string
  visibility?: ChasovoyDefinitionVisibility
  status?: Exclude<ChasovoyDefinitionStatus, "archived">
  sourceKind?: ChasovoySourceKind
  sourceLabel?: string | null
  externalId?: string | null
  name: string
  summary?: string
  rulesText?: string
  mechanics?: ChasovoyJson
  data?: Record<string, ChasovoyJson>
}

export type ChasovoyRevisionInput = {
  name: string
  summary?: string
  rulesText?: string
  mechanics?: ChasovoyJson
  data?: Record<string, ChasovoyJson>
}

export type ChasovoyCommand =
  | { kind: "definition.create"; context: EngineCommandContext; input: ChasovoyCreateInput }
  | { kind: "definition.revise"; context: EngineCommandContext; definitionId: string; input: ChasovoyRevisionInput }
  | { kind: "definition.archive"; context: EngineCommandContext; definitionId: string }

export type ChasovoyMutation = {
  kind: ChasovoyCommand["kind"]
  definitionId: string
  before: ChasovoyDefinition | null
  after: ChasovoyDefinition
}

export type ChasovoyMutationContext = Pick<EngineCommandContext, "requestedBy" | "occurredAt">

export interface ChasovoyStorage {
  getDefinition(ref: ChasovoyDefinitionRef): Promise<ChasovoyDefinition | null>
  getBySlug(input: Pick<ChasovoyDefinition, "kind" | "scope" | "campaignId" | "slug">): Promise<ChasovoyDefinition | null>
  listDefinitions(filter?: ChasovoyDefinitionFilter): Promise<ChasovoyDefinition[]>
  createDefinition(input: ChasovoyCreateInput, context: ChasovoyMutationContext): Promise<ChasovoyDefinition>
  reviseDefinition(definitionId: string, input: ChasovoyRevisionInput, context: ChasovoyMutationContext): Promise<ChasovoyDefinition>
  archiveDefinition(definitionId: string, context: ChasovoyMutationContext): Promise<ChasovoyDefinition>
}
