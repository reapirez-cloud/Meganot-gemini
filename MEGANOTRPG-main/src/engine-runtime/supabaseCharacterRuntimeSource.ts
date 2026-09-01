import { cheburashka } from "../inventory-engine/runtime.ts"
import { supabase } from "../lib/supabase.ts"
import type {
  CharacterRuntimeCatalogData,
  CharacterRuntimeCatalogQuery,
  CharacterRuntimeCoreData,
  CharacterRuntimeDataSource,
  CharacterSpellCatalogLink,
  SpellCatalogRoutingRow,
} from "./characterRuntimeResolver.ts"
import type {
  CharacterPreparationRecord,
  CharacterPreparationSession,
} from "../lib/characterPreparation.ts"
import type { CharacterFeature, CharacterSheet } from "../types/characterSheet.ts"

type WizardBookInventoryRow = {
  id: string
  definition_id: string | null
  item_state: unknown
}

type WizardBookDefinitionRow = {
  id: string
  kind: string | null
  slug: string | null
}

type WizardSpellbookEntryRow = {
  spell_catalog_id: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

/**
 * Read-only equivalent of private.is_wizard_spellbook_item for the CE source adapter.
 * Inventory quantity/category are filtered in SQL; the remaining identity check is
 * either the durable item_state marker or the canonical reference-definition slug.
 */
function wizardSpellbookItemIds(
  inventoryRows: WizardBookInventoryRow[],
  definitionRows: WizardBookDefinitionRow[],
): string[] {
  const canonicalDefinitions = new Set(
    definitionRows
      .filter((row) => row.kind === "item" && row.slug === "wizard-spellbook")
      .map((row) => row.id),
  )

  return inventoryRows
    .filter((row) => {
      const state = asRecord(row.item_state)
      return state?.class_item === "wizard_spellbook" || (
        typeof row.definition_id === "string" && canonicalDefinitions.has(row.definition_id)
      )
    })
    .map((row) => row.id)
}

/** Production read adapter. It translates persistence into resolver inputs only. */
export class SupabaseCharacterRuntimeDataSource implements CharacterRuntimeDataSource {
  async loadCore(characterId: string): Promise<CharacterRuntimeCoreData> {
    const [
      sheetResult,
      inventoryProjection,
      spellsResult,
      featuresResult,
      preparationResult,
      preparationRecordsResult,
      wizardBookInventoryResult,
    ] = await Promise.all([
      supabase.from("character_sheets").select("*").eq("character_id", characterId).maybeSingle(),
      cheburashka.mechanicalProjection(characterId),
      supabase.from("character_spells").select("*").eq("character_id", characterId).order("spell_level", { ascending: true }),
      supabase.from("character_features").select("*").eq("character_id", characterId).order("sort_order", { ascending: true }),
      supabase.from("character_preparation_sessions").select("*").eq("character_id", characterId).maybeSingle(),
      supabase.from("character_preparation_records").select("*").eq("character_id", characterId).order("generation", { ascending: false }).limit(100),
      supabase
        .from("character_inventory_items")
        .select("id,definition_id,item_state")
        .eq("character_id", characterId)
        .eq("category", "book")
        .gt("quantity", 0),
    ])

    const firstError =
      sheetResult.error ||
      spellsResult.error ||
      featuresResult.error ||
      preparationResult.error ||
      preparationRecordsResult.error ||
      wizardBookInventoryResult.error
    if (firstError) throw new Error(firstError.message)

    const wizardBookInventory = (wizardBookInventoryResult.data || []) as WizardBookInventoryRow[]
    const definitionIds = [...new Set(
      wizardBookInventory
        .map((row) => row.definition_id)
        .filter((id): id is string => typeof id === "string" && Boolean(id)),
    )]

    let wizardBookDefinitions: WizardBookDefinitionRow[] = []
    if (definitionIds.length) {
      const definitionResult = await supabase
        .from("reference_definitions")
        .select("id,kind,slug")
        .in("id", definitionIds)
      if (definitionResult.error) throw new Error(definitionResult.error.message)
      wizardBookDefinitions = (definitionResult.data || []) as WizardBookDefinitionRow[]
    }

    const wizardBookIds = wizardSpellbookItemIds(wizardBookInventory, wizardBookDefinitions)
    let wizardSpellbookCatalogIds: string[] = []
    if (wizardBookIds.length) {
      const entryResult = await supabase
        .from("wizard_spellbook_entries")
        .select("spell_catalog_id")
        .in("spellbook_item_id", wizardBookIds)
      if (entryResult.error) throw new Error(entryResult.error.message)
      wizardSpellbookCatalogIds = [...new Set(
        ((entryResult.data || []) as WizardSpellbookEntryRow[])
          .map((entry) => entry.spell_catalog_id)
          .filter(Boolean),
      )]
    }

    return {
      sheet: sheetResult.data as CharacterSheet | null,
      inventoryProjection,
      spells: (spellsResult.data || []) as CharacterSpellCatalogLink[],
      features: (featuresResult.data || []) as CharacterFeature[],
      preparationSession: preparationResult.data as CharacterPreparationSession | null,
      preparationRecords: (preparationRecordsResult.data || []) as CharacterPreparationRecord[],
      wizardSpellbookCatalogIds,
    }
  }

  async loadCatalog(query: CharacterRuntimeCatalogQuery): Promise<CharacterRuntimeCatalogData> {
    const rows: SpellCatalogRoutingRow[] = []
    const warnings: string[] = []

    if (query.catalogIds.length) {
      const result = await supabase
        .from("spell_catalog")
        .select("id, slug, damage, roll_recipe")
        .in("id", query.catalogIds)
      if (result.error) warnings.push(result.error.message)
      else rows.push(...((result.data || []) as SpellCatalogRoutingRow[]))
    }

    if (query.catalogSlugs.length) {
      const result = await supabase
        .from("spell_catalog")
        .select("id, slug, damage, roll_recipe")
        .in("slug", query.catalogSlugs)
      if (result.error) warnings.push(result.error.message)
      else rows.push(...((result.data || []) as SpellCatalogRoutingRow[]))
    }

    const uniqueRows = new Map<string, SpellCatalogRoutingRow>()
    for (const row of rows) uniqueRows.set(row.id, row)
    return { rows: [...uniqueRows.values()], warnings: [...new Set(warnings)] }
  }
}

export const supabaseCharacterRuntimeDataSource = new SupabaseCharacterRuntimeDataSource()
