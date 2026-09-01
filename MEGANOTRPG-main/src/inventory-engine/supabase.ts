import type { SupabaseClient } from "@supabase/supabase-js"
import { EngineCommandError } from "../engine-contracts/index.ts"
import type { InventoryInput, InventoryItem, ItemUsageMode } from "../types/characterSheet.ts"
import type { CheburashkaCommand, CheburashkaStorage, InventoryMutation } from "./types.ts"

type JsonRecord = Record<string, unknown>

function fail(error: { message: string } | null, fallback: string): never {
  throw new EngineCommandError("inventory.persistence", error?.message || fallback)
}

function usageMode(input: InventoryInput): ItemUsageMode {
  return input.usage_mode ?? (input.category === "consumable" ? "quantity" : "none")
}

function normalizeItem(value: unknown): InventoryItem {
  const row = value as InventoryItem
  const mode = row.usage_mode ?? (row.category === "consumable" ? "quantity" : "none")
  return {
    ...row,
    definition_id: row.definition_id ?? null,
    definition_revision: row.definition_revision ?? null,
    usage_mode: mode,
    charges_current: row.charges_current ?? null,
    charges_max: row.charges_max ?? null,
    item_state: row.item_state && typeof row.item_state === "object" ? row.item_state : {},
    version: Number(row.version ?? 0),
  }
}

function persistencePayload(input: InventoryInput): JsonRecord {
  const mode = usageMode(input)
  const max = mode === "charges" ? Math.max(1, Number(input.charges_max ?? 1)) : null
  const current = mode === "charges" ? Math.max(0, Math.min(max!, Number(input.charges_current ?? max))) : null
  return {
    name: input.name.trim(),
    quantity: input.quantity,
    weight: input.weight,
    equipped: input.category === "equipment" ? input.equipped : false,
    category: input.category,
    equipment_slot: input.category === "equipment" ? input.equipment_slot : null,
    image_url: input.image_url?.trim() || null,
    description: input.description.trim(),
    definition_id: input.definition_id ?? null,
    definition_revision: input.definition_revision ?? null,
    mechanics: input.mechanics ?? [],
    usage_mode: mode,
    charges_current: current,
    charges_max: max,
    item_state: input.item_state ?? {},
  }
}

function mutationFromRpc(kind: CheburashkaCommand["kind"], data: unknown): InventoryMutation {
  const result = (data || {}) as JsonRecord
  const before = result.before ? normalizeItem(result.before) : null
  const after = result.after ? normalizeItem(result.after) : null
  const destinationItem = result.destinationItem ? normalizeItem(result.destinationItem) : null
  const affected = Array.isArray(result.affectedCharacterIds)
    ? result.affectedCharacterIds.map(String)
    : [before?.character_id, after?.character_id, destinationItem?.character_id].filter((id): id is string => Boolean(id))
  return {
    kind,
    itemId: String(result.itemId || before?.id || after?.id || destinationItem?.id || ""),
    affectedCharacterIds: [...new Set(affected)],
    before,
    after,
    ...(destinationItem ? { destinationItem } : {}),
  }
}

export class SupabaseCheburashkaStorage implements CheburashkaStorage {
  private readonly client: SupabaseClient

  constructor(client: SupabaseClient) { this.client = client }

  async listCharacterItems(characterId: string): Promise<InventoryItem[]> {
    const { data, error } = await this.client
      .from("character_inventory_items")
      .select("*")
      .eq("character_id", characterId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
    if (error) fail(error, "Could not load inventory")
    return (data || []).map(normalizeItem)
  }

  async getItem(itemId: string): Promise<InventoryItem | null> {
    const { data, error } = await this.client
      .from("character_inventory_items")
      .select("*")
      .eq("id", itemId)
      .maybeSingle()
    if (error) fail(error, "Could not load inventory item")
    return data ? normalizeItem(data) : null
  }

  async execute(command: CheburashkaCommand): Promise<InventoryMutation> {
    if (command.kind === "inventory.create") {
      const { data, error } = await this.client
        .from("character_inventory_items")
        .insert({ character_id: command.characterId, ...persistencePayload(command.input) })
        .select("*")
        .single()
      if (error || !data) fail(error, "Could not create inventory item")
      const after = normalizeItem(data)
      return { kind: command.kind, itemId: after.id, affectedCharacterIds: [command.characterId], before: null, after }
    }

    if (command.kind === "inventory.update") {
      const before = await this.getItem(command.itemId)
      const { data, error } = await this.client
        .from("character_inventory_items")
        .update({ ...persistencePayload(command.input), updated_at: new Date().toISOString() })
        .eq("id", command.itemId)
        .eq("character_id", command.characterId)
        .select("*")
        .single()
      if (error || !data) fail(error, "Could not update inventory item")
      return { kind: command.kind, itemId: command.itemId, affectedCharacterIds: [command.characterId], before, after: normalizeItem(data) }
    }

    if (command.kind === "inventory.remove") {
      const before = await this.getItem(command.itemId)
      if (!before || before.character_id !== command.characterId) {
        throw new EngineCommandError("inventory.not_found", "Inventory item was not found for this character")
      }
      const { error } = await this.client
        .from("character_inventory_items")
        .delete()
        .eq("id", command.itemId)
        .eq("character_id", command.characterId)
      if (error) fail(error, "Could not delete inventory item")
      return { kind: command.kind, itemId: command.itemId, affectedCharacterIds: [command.characterId], before, after: null }
    }

    if (command.kind === "inventory.set_equipped") {
      const before = await this.getItem(command.itemId)
      const { error } = await this.client.rpc("set_character_inventory_equipped", {
        p_item_id: command.itemId,
        p_equipped: command.equipped,
        p_equipment_slot: command.equipmentSlot,
      })
      if (error) fail(error, "Could not change equipment")
      const after = await this.getItem(command.itemId)
      return { kind: command.kind, itemId: command.itemId, affectedCharacterIds: [command.characterId], before, after }
    }

    if (command.kind === "inventory.consume") {
      const { data, error } = await this.client.rpc("consume_inventory_item_v1", {
        p_character_id: command.characterId,
        p_item_id: command.itemId,
        p_amount: command.amount,
        p_command_id: command.context.commandId,
      })
      if (error) fail(error, "Could not consume inventory item")
      return mutationFromRpc(command.kind, data)
    }

    const { data, error } = await this.client.rpc("transfer_inventory_item_v1", {
      p_from_character_id: command.fromCharacterId,
      p_to_character_id: command.toCharacterId,
      p_item_id: command.itemId,
      p_amount: command.amount,
      p_command_id: command.context.commandId,
    })
    if (error) fail(error, "Could not transfer inventory item")
    return mutationFromRpc(command.kind, data)
  }
}