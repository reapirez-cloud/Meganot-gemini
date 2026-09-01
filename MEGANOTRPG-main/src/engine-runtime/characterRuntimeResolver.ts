import type {
  AbilityKey,
  CharacterEngineInput,
  ResourceState,
  ResolvedCharacterContract,
} from "../character-engine/index.ts"
import type { Character } from "../context/CharacterContext.tsx"
import type { InventoryMechanicalProjection } from "../inventory-engine/index.ts"
import {
  buildCharacterPreparationModel,
  type CharacterPreparationModel,
  type CharacterPreparationRecord,
  type CharacterPreparationSession,
} from "../lib/characterPreparation.ts"
import { resolveLegacyCharacterEngineView } from "../lib/legacyCharacterEngineAdapter.ts"
import { resourceSyncInputs } from "../lib/resourceRuntime.ts"
import type { CharacterTemplateBundle } from "../rule-templates/types.ts"
import type { CharacterFeature, CharacterSheet, CharacterSpell } from "../types/characterSheet.ts"
import type { ResourceSyncInput } from "../types/characterResources.ts"

export type CharacterSpellCatalogLink = CharacterSpell & { catalog_spell_id?: string | null }
export type SpellCatalogRoutingRow = {
  id: string
  slug: string
  damage: string | null
  roll_recipe: unknown
}

export type CharacterRuntimeCoreData = {
  sheet: CharacterSheet | null
  inventoryProjection: InventoryMechanicalProjection
  spells: CharacterSpellCatalogLink[]
  features: CharacterFeature[]
  preparationSession: CharacterPreparationSession | null
  preparationRecords: CharacterPreparationRecord[]
  /** Current catalog identities available from physical Wizard spellbooks in inventory. */
  wizardSpellbookCatalogIds: string[]
}

export type CharacterRuntimeCatalogQuery = {
  catalogIds: string[]
  catalogSlugs: string[]
}

export type CharacterRuntimeCatalogData = {
  rows: SpellCatalogRoutingRow[]
  warnings: string[]
}

export interface CharacterRuntimeDataSource {
  loadCore(characterId: string): Promise<CharacterRuntimeCoreData>
  loadCatalog(query: CharacterRuntimeCatalogQuery): Promise<CharacterRuntimeCatalogData>
}

export type CharacterRuntimeResolveInput = {
  character: Pick<Character, "id" | "campaign_id" | "name" | "level">
  templateBundles: CharacterTemplateBundle[]
  resourceState: Record<string, ResourceState>
  suppressedSourceIds: Iterable<string>
}

/**
 * The single resolved representation consumed by every gameplay surface.
 * `input` is exposed only for CE explanation APIs; consumers must never resolve
 * a second contract from it.
 */
export type CharacterRuntimeSnapshot = {
  characterId: string
  campaignId: string
  resolvedAt: string
  input: CharacterEngineInput
  contract: ResolvedCharacterContract
  spellcastingAbility?: AbilityKey
  preparation: CharacterPreparationModel
  resourceSyncInputs: ResourceSyncInput[]
  warnings: string[]
}

export type CharacterRuntimeResolveErrorCode =
  | "timeout"
  | "read_failed"
  | "missing_sheet"
  | "resolve_failed"

export class CharacterRuntimeResolveError extends Error {
  readonly code: CharacterRuntimeResolveErrorCode

  constructor(code: CharacterRuntimeResolveErrorCode, message: string) {
    super(message)
    this.name = "CharacterRuntimeResolveError"
    this.code = code
  }
}

export const DEFAULT_CHARACTER_RUNTIME_TIMEOUT_MS = 12_000

type RoutedSpellIdentity = { dealsDamage?: boolean }

function reasonMessage(reason: unknown, fallback: string) {
  return reason instanceof Error && reason.message ? reason.message : fallback
}

/** Only Roll Engine effect semantics decide whether a spell belongs to Attack. */
function rollRecipeDealsDamage(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(rollRecipeDealsDamage)
  if (!value || typeof value !== "object") return false
  const record = value as Record<string, unknown>
  if (record.kind === "damage") return true
  return Object.values(record).some(rollRecipeDealsDamage)
}

function catalogDealsDamage(row: Pick<SpellCatalogRoutingRow, "roll_recipe"> | undefined): boolean {
  return Boolean(row && rollRecipeDealsDamage(row.roll_recipe))
}

function catalogSlugFromResolvedKey(key: string): string | null {
  if (!key.startsWith("spell:")) return null
  const slug = key.slice("spell:".length).trim()
  return slug && /^[a-z0-9-]+$/i.test(slug) ? slug : null
}

function withCatalogDamageRouting(
  contract: ResolvedCharacterContract,
  characterSpells: CharacterSpellCatalogLink[],
  catalogRows: SpellCatalogRoutingRow[],
): ResolvedCharacterContract {
  const catalogById = new Map(catalogRows.map((row) => [row.id, row]))
  const catalogBySlug = new Map(catalogRows.map((row) => [row.slug, row]))
  const damageSpellKeys = new Set<string>()

  for (const characterSpell of characterSpells) {
    if (!characterSpell.catalog_spell_id || !catalogDealsDamage(catalogById.get(characterSpell.catalog_spell_id))) continue
    const accessKey = `legacy-${characterSpell.id}`
    const resolved = contract.spells.find((spell) => spell.accesses.some((access) => access.key === accessKey))
    if (resolved) damageSpellKeys.add(resolved.key)
  }

  for (const spell of contract.spells) {
    const slug = catalogSlugFromResolvedKey(spell.key)
    if (slug && catalogDealsDamage(catalogBySlug.get(slug))) damageSpellKeys.add(spell.key)
  }

  return {
    ...contract,
    spells: contract.spells.map((spell) => ({
      ...spell,
      identity: {
        ...spell.identity,
        dealsDamage: damageSpellKeys.has(spell.key),
      } as typeof spell.identity & RoutedSpellIdentity,
    })),
  }
}

export function withCharacterRuntimeDeadline<T>(
  task: Promise<T>,
  timeoutMs: number,
  characterId: string,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return task

  return new Promise<T>((resolve, reject) => {
    let settled = false
    const timer = globalThis.setTimeout(() => {
      if (settled) return
      settled = true
      reject(new CharacterRuntimeResolveError(
        "timeout",
        `Персонаж ${characterId} не ответил за ${Math.ceil(timeoutMs / 1000)} сек. Обновите данные или повторите попытку.`,
      ))
    }, timeoutMs)

    task.then(
      (value) => {
        if (settled) return
        settled = true
        globalThis.clearTimeout(timer)
        resolve(value)
      },
      (reason) => {
        if (settled) return
        settled = true
        globalThis.clearTimeout(timer)
        reject(reason)
      },
    )
  })
}

/**
 * Read-only application resolver for one character snapshot.
 *
 * It owns no canonical state and performs no gameplay mutation. The resolver
 * reads current owner projections, assembles CE input through the transitional
 * legacy adapter, and returns one immutable view for Chat/Sheet/Revolver.
 */
export class CharacterRuntimeResolver {
  private readonly source: CharacterRuntimeDataSource
  private readonly timeoutMs: number

  constructor(
    source: CharacterRuntimeDataSource,
    options: { timeoutMs?: number } = {},
  ) {
    this.source = source
    this.timeoutMs = options.timeoutMs ?? DEFAULT_CHARACTER_RUNTIME_TIMEOUT_MS
  }

  resolve(input: CharacterRuntimeResolveInput): Promise<CharacterRuntimeSnapshot> {
    return withCharacterRuntimeDeadline(
      this.resolveFresh(input),
      this.timeoutMs,
      input.character.id,
    ).catch((reason) => {
      if (reason instanceof CharacterRuntimeResolveError) throw reason
      throw new CharacterRuntimeResolveError(
        "resolve_failed",
        reasonMessage(reason, "Не удалось собрать актуальное состояние персонажа."),
      )
    })
  }

  private async resolveFresh(input: CharacterRuntimeResolveInput): Promise<CharacterRuntimeSnapshot> {
    let core: CharacterRuntimeCoreData
    try {
      core = await this.source.loadCore(input.character.id)
    } catch (reason) {
      throw new CharacterRuntimeResolveError(
        "read_failed",
        reasonMessage(reason, "Не удалось получить данные персонажа от владельцев состояния."),
      )
    }

    if (!core.sheet) {
      throw new CharacterRuntimeResolveError(
        "missing_sheet",
        "У персонажа нет базового листа. Character Engine не может собрать состояние без canonical base.",
      )
    }

    const preparation = buildCharacterPreparationModel(
      input.templateBundles,
      Math.max(1, input.character.level || 1),
      core.preparationSession,
      core.preparationRecords,
    )
    const effectiveSuppressions = new Set([
      ...input.suppressedSourceIds,
      ...preparation.suppressedSourceIds,
    ])

    let resolvedView
    try {
      resolvedView = resolveLegacyCharacterEngineView({
        character: input.character,
        sheet: core.sheet,
        inventoryContributions: core.inventoryProjection.contributions,
        spells: core.spells,
        features: core.features,
        resourceStates: input.resourceState,
        templateBundles: input.templateBundles,
        suppressedSourceIds: effectiveSuppressions,
        wizardSpellbookCatalogIds: core.wizardSpellbookCatalogIds,
      })
    } catch (reason) {
      throw new CharacterRuntimeResolveError(
        "resolve_failed",
        reasonMessage(reason, "Character Engine не смог вычислить персонажа."),
      )
    }

    const catalogIds: string[] = [...new Set(
      core.spells
        .map((spell) => spell.catalog_spell_id)
        .filter((id): id is string => Boolean(id)),
    )] as string[]
    const catalogSlugs: string[] = [...new Set(
      resolvedView.contract.spells
        .map((spell) => catalogSlugFromResolvedKey(spell.key))
        .filter((slug): slug is string => Boolean(slug)),
    )] as string[]

    let catalog: CharacterRuntimeCatalogData = { rows: [], warnings: [] }
    try {
      catalog = await this.source.loadCatalog({ catalogIds, catalogSlugs })
    } catch (reason) {
      catalog = {
        rows: [],
        warnings: [reasonMessage(reason, "Не удалось получить маршрутизацию каталога заклинаний.")],
      }
    }

    const routedContract = withCatalogDamageRouting(resolvedView.contract, core.spells, catalog.rows)

    return {
      characterId: input.character.id,
      campaignId: input.character.campaign_id,
      resolvedAt: new Date().toISOString(),
      input: resolvedView.input,
      contract: routedContract,
      ...(resolvedView.spellcastingAbility ? { spellcastingAbility: resolvedView.spellcastingAbility } : {}),
      preparation,
      resourceSyncInputs: resourceSyncInputs(routedContract),
      warnings: catalog.warnings,
    }
  }
}
