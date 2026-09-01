import type { SupabaseClient } from "@supabase/supabase-js"
import {
  createEngineCommandId,
  EngineCommandError,
  type CharacterResolutionRequester,
} from "../engine-contracts/index.ts"
import type { ChatEventKind, ChatEventPayload } from "../types/chat.ts"
import type { ResourceCostInput } from "../types/characterResources.ts"

export type GenaChatRollCommand = {
  roomId: string
  characterId: string | null
  label: string
  kind: string
  modifier?: number
  rollD20?: boolean
  diceCount?: number
  diceSides?: number
  diceModifier?: number
  resourceCosts?: ResourceCostInput[]
}

export type GenaTemplateActionCommand = {
  roomId: string
  characterId: string
  mechanicId: string
  optionKey?: string
  label: string
  payload?: ChatEventPayload
  /** Stable retry key for one declared gameplay intention. */
  commandId?: string
}

export type GenaTemplateRollCommand = GenaTemplateActionCommand & {
  kind: string
  modifier?: number
  rollD20?: boolean
  diceCount?: number
  diceSides?: number
  diceModifier?: number
}

export type GenaTemplateSpellCommand = {
  roomId: string
  characterId: string
  mechanicId: string
  methodKey: string
  optionKey?: string
  label: string
  payload?: ChatEventPayload
  /** Stable retry key for one declared gameplay intention. */
  commandId?: string
}

export type GenaInventoryUseCommand = GenaChatRollCommand & {
  characterId: string
  itemId: string
  itemAmount?: number
  payload?: ChatEventPayload
  /** Stable retry key for the one player intention. */
  commandId?: string
}

export type GenaRecoveryTrigger = "short_rest" | "long_rest" | "dawn"
export type GenaCharacterRecoveryCommand = {
  characterId: string
  trigger: GenaRecoveryTrigger
  /** Stable correlation key for runtime invalidation and future durable audit. */
  commandId?: string
}

function resultId(data: unknown, error: { message: string } | null): number {
  if (error) throw new EngineCommandError("gena.persistence", error.message)
  const id = Number(data)
  if (!Number.isSafeInteger(id) || id < 1) throw new EngineCommandError("gena.invalid_result", "GENA did not return a valid event id")
  return id
}

/**
 * Server gameplay gateway.
 *
 * Server RPCs own transaction boundaries. The gateway is GENA's normal
 * gameplay path: the UI never decides validation, roll or resource spending.
 */
export class SupabaseGenaSessionGateway {
  private readonly client: SupabaseClient
  private readonly resolutionRequester?: CharacterResolutionRequester

  constructor(client: SupabaseClient, resolutionRequester?: CharacterResolutionRequester) {
    this.client = client
    this.resolutionRequester = resolutionRequester
  }

  private async invalidate(characterId: string | null, reason: string, commandId = createEngineCommandId()) {
    if (!characterId) return
    await this.resolutionRequester?.requestCharacterResolution({
      characterId,
      source: "gena",
      reason,
      commandId,
    })
  }

  async recoverCharacter(command: GenaCharacterRecoveryCommand): Promise<void> {
    const commandId = command.commandId ?? createEngineCommandId()
    const result = command.trigger === "short_rest"
      ? await this.client.rpc("grant_character_short_rest", { p_character_id: command.characterId })
      : command.trigger === "long_rest"
        ? await this.client.rpc("grant_character_long_rest", { p_character_id: command.characterId })
        : await this.client.rpc("recover_character_resources", {
            p_character_id: command.characterId,
            p_trigger: "dawn",
          })

    if (result.error) throw new EngineCommandError("gena.recovery", result.error.message)
    await this.invalidate(command.characterId, `character.recovery.${command.trigger}`, commandId)
  }

  async sendRoll(command: GenaChatRollCommand): Promise<number> {
    const { data, error } = await this.client.rpc("send_chat_roll_v3", {
      p_room_id: command.roomId,
      p_character_id: command.characterId,
      p_label: command.label,
      p_kind: command.kind,
      p_modifier: command.modifier ?? 0,
      p_roll_d20: command.rollD20 ?? true,
      p_dice_count: command.diceCount ?? 0,
      p_dice_sides: command.diceSides ?? 0,
      p_dice_modifier: command.diceModifier ?? 0,
      p_resource_costs: command.resourceCosts ?? [],
    })
    const id = resultId(data, error)
    if (command.resourceCosts?.length) await this.invalidate(command.characterId, "chat.roll.resource_spend")
    return id
  }

  async sendEvent(command: {
    roomId: string
    characterId: string | null
    eventKind: Exclude<ChatEventKind, "roll">
    label: string
    payload?: ChatEventPayload
    resourceCosts?: ResourceCostInput[]
  }): Promise<number> {
    const { data, error } = await this.client.rpc("send_chat_event_v3", {
      p_room_id: command.roomId,
      p_character_id: command.characterId,
      p_event_kind: command.eventKind,
      p_label: command.label,
      p_payload: command.payload ?? {},
      p_resource_costs: command.resourceCosts ?? [],
    })
    const id = resultId(data, error)
    if (command.resourceCosts?.length) await this.invalidate(command.characterId, "chat.event.resource_spend")
    return id
  }

  async sendTemplateRoll(command: GenaTemplateRollCommand): Promise<number> {
    const commandId = command.commandId ?? createEngineCommandId()
    const { data, error } = await this.client.rpc("send_chat_template_roll_v2", {
      p_room_id: command.roomId,
      p_character_id: command.characterId,
      p_mechanic_id: command.mechanicId,
      p_option_key: command.optionKey ?? null,
      p_label: command.label,
      p_kind: command.kind,
      p_modifier: command.modifier ?? 0,
      p_roll_d20: command.rollD20 ?? false,
      p_dice_count: command.diceCount ?? 0,
      p_dice_sides: command.diceSides ?? 0,
      p_dice_modifier: command.diceModifier ?? 0,
      p_command_id: commandId,
    })
    const id = resultId(data, error)
    await this.invalidate(command.characterId, "template.roll", commandId)
    return id
  }

  async sendTemplateAction(command: GenaTemplateActionCommand): Promise<number> {
    const commandId = command.commandId ?? createEngineCommandId()
    const { data, error } = await this.client.rpc("send_chat_template_action_v2", {
      p_room_id: command.roomId,
      p_character_id: command.characterId,
      p_mechanic_id: command.mechanicId,
      p_option_key: command.optionKey ?? null,
      p_label: command.label,
      p_payload: command.payload ?? {},
      p_command_id: commandId,
    })
    const id = resultId(data, error)
    await this.invalidate(command.characterId, "template.action", commandId)
    return id
  }

  async sendTemplateSpell(command: GenaTemplateSpellCommand): Promise<number> {
    const commandId = command.commandId ?? createEngineCommandId()
    const { data, error } = await this.client.rpc("send_chat_template_spell_v2", {
      p_room_id: command.roomId,
      p_character_id: command.characterId,
      p_mechanic_id: command.mechanicId,
      p_method_key: command.methodKey,
      p_option_key: command.optionKey ?? null,
      p_label: command.label,
      p_payload: command.payload ?? {},
      p_command_id: commandId,
    })
    const id = resultId(data, error)
    await this.invalidate(command.characterId, "template.spell", commandId)
    return id
  }

  async useInventoryItem(command: GenaInventoryUseCommand): Promise<number> {
    const rolls = Boolean(command.rollD20) || Number(command.diceCount || 0) > 0
    const rpc = rolls ? "send_chat_inventory_roll_v1" : "send_chat_inventory_event_v1"
    const commandId = command.commandId ?? createEngineCommandId()
    const args = rolls ? {
      p_room_id: command.roomId,
      p_character_id: command.characterId,
      p_item_id: command.itemId,
      p_item_amount: command.itemAmount ?? 1,
      p_label: command.label,
      p_kind: command.kind,
      p_modifier: command.modifier ?? 0,
      p_roll_d20: command.rollD20 ?? false,
      p_dice_count: command.diceCount ?? 0,
      p_dice_sides: command.diceSides ?? 0,
      p_dice_modifier: command.diceModifier ?? 0,
      p_resource_costs: command.resourceCosts ?? [],
      p_command_id: commandId,
    } : {
      p_room_id: command.roomId,
      p_character_id: command.characterId,
      p_item_id: command.itemId,
      p_item_amount: command.itemAmount ?? 1,
      p_label: command.label,
      p_payload: command.payload ?? {},
      p_resource_costs: command.resourceCosts ?? [],
      p_command_id: commandId,
    }
    const { data, error } = await this.client.rpc(rpc, args)
    const id = resultId(data, error)
    await this.invalidate(command.characterId, "inventory.use", commandId)
    return id
  }
}
