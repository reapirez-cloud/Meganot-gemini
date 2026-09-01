import {
  EngineCommandError,
  type EngineCommandResult,
  type EngineEvent,
  type EngineEventPublisher,
} from "../engine-contracts/index.ts"
import type { LarisaCommand, LarisaSnapshot, LarisaStorage, WorldMutation } from "./types.ts"

const DAY_PERIODS = new Set(["dawn", "morning", "day", "late_day", "evening", "night", "deep_night"])

export class LarisaEngine {
  private readonly storage: LarisaStorage
  private readonly eventPublisher?: EngineEventPublisher

  constructor(
    storage: LarisaStorage,
    eventPublisher?: EngineEventPublisher,
  ) {
    this.storage = storage
    this.eventPublisher = eventPublisher
  }

  loadCampaignSnapshot(campaignId: string): Promise<LarisaSnapshot> {
    if (!campaignId) throw new EngineCommandError("world.campaign_required", "Campaign id is required")
    return this.storage.loadCampaignSnapshot(campaignId)
  }

  async execute(command: LarisaCommand): Promise<EngineCommandResult<WorldMutation>> {
    if (command.context.authority !== "gm" && command.context.authority !== "system") {
      throw new EngineCommandError("world.gm_required", `${command.kind} requires GM authority`)
    }
    if (command.kind === "world.set_character_position" || command.kind === "world.set_scene_position") {
      if (!Number.isInteger(command.campaignDay) || command.campaignDay < 1) {
        throw new EngineCommandError("world.invalid_day", "Campaign day must be an integer >= 1")
      }
      if (!DAY_PERIODS.has(command.dayPeriod)) {
        throw new EngineCommandError("world.invalid_period", "Unsupported campaign day period")
      }
    }

    const mutation = await this.storage.execute(command)
    const aggregateType = mutation.sceneIds.length ? "scene" as const : "location" as const
    const aggregateId = mutation.sceneIds[0] || mutation.locationIds[0] || mutation.characterIds[0] || command.context.campaignId
    const event: EngineEvent = {
      commandId: command.context.commandId,
      engine: "larisa",
      kind: mutation.kind,
      campaignId: command.context.campaignId,
      aggregateType,
      aggregateId,
      occurredAt: command.context.occurredAt,
      visibility: command.context.authority === "gm" ? "gm" : "actor",
      actorCharacterId: command.context.actorCharacterId,
      payload: mutation.details,
    }
    await this.eventPublisher?.publishEngineEvents([event])
    return {
      value: mutation,
      events: [event],
      effects: {
        characterIds: mutation.characterIds,
        itemIds: [],
        locationIds: mutation.locationIds,
        sceneIds: mutation.sceneIds,
        // Larisa time/position is descriptive and does not alter CE by itself.
        resolveCharacterIds: [],
      },
    }
  }
}
