import {
  EngineCommandError,
  type CharacterResolutionRequester,
  type EngineCommandResult,
  type EngineEvent,
  type EngineEventPublisher,
} from "../engine-contracts/index.ts"
import type { CharacterEntity, EntityMutation, ShapoklyakCommand, ShapoklyakStorage } from "./types.ts"

export type ShapoklyakDependencies = {
  eventPublisher?: EngineEventPublisher
  resolutionRequester?: CharacterResolutionRequester
}

const PLAYER_NARRATIVE_FIELDS = new Set([
  "race",
  "background",
  "alignment",
  "proficiencies",
  "languages",
  "senses",
  "personality_traits",
  "ideals",
  "bonds",
  "flaws",
  "backstory",
  "notes",
])

function isGmAuthority(command: ShapoklyakCommand) {
  return command.context.authority === "gm" || command.context.authority === "system"
}

function requireGm(command: ShapoklyakCommand, message = "Only GM authority can establish canonical character state") {
  if (!isGmAuthority(command)) throw new EngineCommandError("entity.gm_required", message)
}

function characterIdForOwnership(command: ShapoklyakCommand): string | null {
  if ("characterId" in command && typeof command.characterId === "string") return command.characterId
  return null
}

export class ShapoklyakEngine {
  private readonly storage: ShapoklyakStorage
  private readonly dependencies: ShapoklyakDependencies

  constructor(
    storage: ShapoklyakStorage,
    dependencies: ShapoklyakDependencies = {},
  ) {
    this.storage = storage
    this.dependencies = dependencies
  }

  listCampaignEntities(campaignId: string): Promise<CharacterEntity[]> {
    if (!campaignId) throw new EngineCommandError("entity.campaign_required", "Campaign id is required")
    return this.storage.listCampaignEntities(campaignId)
  }

  getEntity(characterId: string): Promise<CharacterEntity | null> {
    if (!characterId) throw new EngineCommandError("entity.character_required", "Character id is required")
    return this.storage.getEntity(characterId)
  }

  private async assertPlayerOwnsCharacter(command: ShapoklyakCommand, characterId: string) {
    const entity = await this.storage.getEntity(characterId)
    if (!entity || entity.campaign_id !== command.context.campaignId) {
      throw new EngineCommandError("entity.not_found", "Character was not found in this campaign")
    }
    if (entity.assigned_user_id !== command.context.requestedBy || entity.character_type !== "pc") {
      throw new EngineCommandError("entity.player_forbidden", "Player authority is limited to the assigned player character")
    }
  }

  private async assertAuthority(command: ShapoklyakCommand) {
    const gmOnly = new Set<ShapoklyakCommand["kind"]>([
      "entity.create",
      "entity.update",
      "entity.delete",
      "entity.set_life_state",
      "entity.set_visibility",
      "entity.reveal_npc",
      "entity.set_hp",
      "entity.set_spellcasting_enabled",
      "entity.create_spell",
      "entity.update_spell",
      "entity.create_spell_option",
      "entity.update_spell_option",
      "entity.delete_spell_option",
      "entity.create_feature",
      "entity.update_feature",
      "entity.delete_feature",
      "entity.recover_resources",
      "entity.assign_template",
      "entity.remove_template_assignment",
      "entity.set_source_suppressed",
    ])

    if (gmOnly.has(command.kind)) {
      requireGm(command)
      return
    }

    if (command.context.authority !== "player") return

    if (command.kind === "entity.set_active") {
      if (command.userId !== command.context.requestedBy) {
        throw new EngineCommandError("entity.player_forbidden", "Player can only choose their own active character")
      }
      if (command.characterId) await this.assertPlayerOwnsCharacter(command, command.characterId)
      return
    }

    const characterId = characterIdForOwnership(command)
    if (!characterId) {
      throw new EngineCommandError("entity.player_forbidden", "This player command requires an owned character")
    }
    await this.assertPlayerOwnsCharacter(command, characterId)

    if (command.kind === "entity.update_sheet") {
      const forbidden = Object.keys(command.input).filter((key) => !PLAYER_NARRATIVE_FIELDS.has(key))
      if (forbidden.length) {
        throw new EngineCommandError(
          "entity.player_sheet_forbidden",
          `Player cannot edit mechanical sheet fields: ${forbidden.join(", ")}`,
        )
      }
    }
  }

  async execute(command: ShapoklyakCommand): Promise<EngineCommandResult<EntityMutation>> {
    await this.assertAuthority(command)

    if (command.kind === "entity.set_hp") {
      for (const [label, value] of Object.entries({ currentHp: command.currentHp, maxHp: command.maxHp, tempHp: command.tempHp })) {
        if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
          throw new EngineCommandError("entity.invalid_hp", `${label} must be an integer >= 0`)
        }
      }
    }

    if (command.kind === "entity.assign_template" || command.kind === "entity.remove_template_assignment") {
      if (command.kind === "entity.assign_template") {
        if (!command.input.templateId) throw new EngineCommandError("entity.template_required", "Template id is required")
        if (command.input.templateLevel !== null && (!Number.isInteger(command.input.templateLevel) || command.input.templateLevel < 1 || command.input.templateLevel > 30)) {
          throw new EngineCommandError("entity.invalid_template_level", "Template level must be null or an integer from 1 to 30")
        }
      } else if (!command.assignmentId) {
        throw new EngineCommandError("entity.assignment_required", "Template assignment id is required")
      }
    }

    if (command.kind === "entity.set_source_suppressed") {
      const sourceId = command.sourceId.trim()
      if (!sourceId || sourceId.length > 512) {
        throw new EngineCommandError("entity.invalid_source_id", "Source id must contain between 1 and 512 characters")
      }
    }

    if (command.kind === "entity.recover_resources" && !["short_rest", "long_rest", "dawn"].includes(command.trigger)) {
      throw new EngineCommandError("entity.invalid_recovery", "Unsupported recovery trigger")
    }

    const mutation = await this.storage.execute(command)
    const aggregateId = mutation.characterIds[0] || command.context.campaignId
    const event: EngineEvent = {
      commandId: command.context.commandId,
      engine: "shapoklyak",
      kind: mutation.kind,
      campaignId: command.context.campaignId,
      aggregateType: "character",
      aggregateId,
      occurredAt: command.context.occurredAt,
      visibility: command.context.authority === "gm" ? "gm" : "actor",
      actorCharacterId: command.context.actorCharacterId,
      payload: {
        characterIds: mutation.characterIds,
        before: mutation.before ?? null,
        after: mutation.after ?? null,
        ...mutation.details,
      },
    }
    await this.dependencies.eventPublisher?.publishEngineEvents([event])

    if (mutation.requiresResolution) {
      for (const characterId of mutation.characterIds) {
        await this.dependencies.resolutionRequester?.requestCharacterResolution({
          characterId,
          source: "shapoklyak",
          reason: mutation.kind,
          commandId: command.context.commandId,
        })
      }
    }

    return {
      value: mutation,
      events: [event],
      effects: {
        characterIds: mutation.characterIds,
        itemIds: [],
        locationIds: [],
        sceneIds: [],
        resolveCharacterIds: mutation.requiresResolution ? mutation.characterIds : [],
      },
    }
  }
}
