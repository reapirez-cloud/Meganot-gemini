import { EngineCommandError } from "../engine-contracts/index.ts"
import type { CharacterWorldState, LocationSummary } from "../world-state/types.ts"
import type { LarisaCommand, LarisaSnapshot, LarisaStorage, SceneParticipant, WorldMutation } from "./types.ts"

function copy<T>(value: T): T { return structuredClone(value) }

export class MemoryLarisaStorage implements LarisaStorage {
  private snapshot: LarisaSnapshot
  private readonly discoveries = new Set<string>()
  private readonly sectionLocations = new Map<string, string>()
  private readonly linkSections = new Map<string, { sectionId: string; targetLocationId: string }>()
  private readonly npcHabitats = new Set<string>()

  constructor(initial: LarisaSnapshot = { characterStates: [], locations: [], scenes: [], sceneParticipants: [] }) {
    this.snapshot = copy(initial)
  }

  async loadCampaignSnapshot(): Promise<LarisaSnapshot> { return copy(this.snapshot) }

  async execute(command: LarisaCommand): Promise<WorldMutation> {
    if (command.kind === "world.discover_location") {
      const key = `${command.characterId}:${command.locationId}`
      if (command.discovered) this.discoveries.add(key); else this.discoveries.delete(key)
      return { kind: command.kind, characterIds: [command.characterId], locationIds: [command.locationId], sceneIds: [], details: { discovered: command.discovered } }
    }

    if (command.kind === "world.set_character_position") {
      if (command.locationId && !this.snapshot.locations.some((location) => location.id === command.locationId)) throw new EngineCommandError("world.location_not_found", "Location was not found")
      const next: CharacterWorldState = {
        character_id: command.characterId,
        campaign_id: command.context.campaignId,
        location_id: command.locationId,
        campaign_day: command.campaignDay,
        day_period: command.dayPeriod,
        updated_at: command.context.occurredAt,
        updated_by: command.context.requestedBy,
      }
      this.snapshot.characterStates = [...this.snapshot.characterStates.filter((state) => state.character_id !== command.characterId), next]
      return { kind: command.kind, characterIds: [command.characterId], locationIds: command.locationId ? [command.locationId] : [], sceneIds: [], details: { position: next } }
    }

    if (command.kind === "world.set_scene_position") {
      const scene = this.snapshot.scenes.find((item) => item.room_id === command.roomId)
      if (!scene) throw new EngineCommandError("world.scene_not_found", "Scene was not found")
      Object.assign(scene, { location_id: command.locationId, campaign_day: command.campaignDay, day_period: command.dayPeriod })
      return { kind: command.kind, characterIds: [], locationIds: command.locationId ? [command.locationId] : [], sceneIds: [command.roomId], details: { position: copy(scene) } }
    }

    if (command.kind === "world.set_scene_participants") {
      const participants: SceneParticipant[] = command.characterIds.map((characterId) => ({ room_id: command.roomId, character_id: characterId }))
      this.snapshot.sceneParticipants = [...this.snapshot.sceneParticipants.filter((item) => item.room_id !== command.roomId), ...participants]
      return { kind: command.kind, characterIds: command.characterIds, locationIds: [], sceneIds: [command.roomId], details: { characterIds: command.characterIds } }
    }

    if (command.kind === "world.sync_scene_participants") {
      const scene = this.snapshot.scenes.find((item) => item.room_id === command.roomId)
      if (!scene) throw new EngineCommandError("world.scene_not_found", "Scene was not found")
      const ids = this.snapshot.sceneParticipants.filter((item) => item.room_id === command.roomId).map((item) => item.character_id)
      for (const characterId of ids) {
        const current = this.snapshot.characterStates.find((state) => state.character_id === characterId)
        const next: CharacterWorldState = {
          character_id: characterId,
          campaign_id: command.context.campaignId,
          location_id: command.syncLocation ? scene.location_id : current?.location_id ?? null,
          campaign_day: command.syncTime ? scene.campaign_day : current?.campaign_day ?? 1,
          day_period: command.syncTime ? scene.day_period : current?.day_period ?? "day",
          updated_at: command.context.occurredAt,
          updated_by: command.context.requestedBy,
        }
        this.snapshot.characterStates = [...this.snapshot.characterStates.filter((state) => state.character_id !== characterId), next]
      }
      return { kind: command.kind, characterIds: ids, locationIds: scene.location_id ? [scene.location_id] : [], sceneIds: [command.roomId], details: { count: ids.length, syncLocation: command.syncLocation, syncTime: command.syncTime } }
    }

    if (command.kind === "world.location_create") {
      const locationId = `location-${command.context.commandId}`
      const location: LocationSummary = {
        id: locationId,
        name: command.input.name,
        parent_location_id: command.input.parentLocationId,
        image_url: command.input.imageUrl,
        visibility_mode: command.input.visibilityMode,
        lifecycle_state: "active",
      }
      this.snapshot.locations = [...this.snapshot.locations, location]
      return { kind: command.kind, characterIds: [], locationIds: [locationId], sceneIds: [], details: { locationId } }
    }

    if (command.kind === "world.location_update") {
      const location = this.snapshot.locations.find((item) => item.id === command.locationId)
      if (!location) throw new EngineCommandError("world.location_not_found", "Location was not found")
      Object.assign(location, { name: command.input.name, image_url: command.input.imageUrl, visibility_mode: command.input.visibilityMode })
      return { kind: command.kind, characterIds: [], locationIds: [command.locationId], sceneIds: [], details: { locationId: command.locationId } }
    }

    if (command.kind === "world.location_set_visibility") {
      const location = this.snapshot.locations.find((item) => item.id === command.locationId)
      if (!location) throw new EngineCommandError("world.location_not_found", "Location was not found")
      location.visibility_mode = command.visibilityMode
      return { kind: command.kind, characterIds: [], locationIds: [command.locationId], sceneIds: [], details: { visibilityMode: command.visibilityMode } }
    }

    if (command.kind === "world.location_set_archived") {
      const location = this.snapshot.locations.find((item) => item.id === command.locationId)
      if (!location) throw new EngineCommandError("world.location_not_found", "Location was not found")
      location.lifecycle_state = command.archived ? "archived" : "active"
      return { kind: command.kind, characterIds: [], locationIds: [command.locationId], sceneIds: [], details: { archived: command.archived } }
    }

    if (command.kind === "world.location_delete") {
      if (!this.snapshot.locations.some((item) => item.id === command.locationId)) throw new EngineCommandError("world.location_not_found", "Location was not found")
      this.snapshot.locations = this.snapshot.locations.filter((item) => item.id !== command.locationId)
      return { kind: command.kind, characterIds: [], locationIds: [command.locationId], sceneIds: [], details: {} }
    }

    if (command.kind === "world.location_publish_event") {
      return { kind: command.kind, characterIds: [], locationIds: [command.locationId], sceneIds: [], details: { event: command.event } }
    }

    if (command.kind === "world.location_section_create") {
      const sectionId = `section-${command.context.commandId}`
      this.sectionLocations.set(sectionId, command.locationId)
      return { kind: command.kind, characterIds: [], locationIds: [command.locationId], sceneIds: [], details: { sectionId } }
    }

    if (command.kind === "world.location_section_update") {
      const locationId = this.sectionLocations.get(command.sectionId)
      if (!locationId) throw new EngineCommandError("world.section_not_found", "Location section was not found")
      return { kind: command.kind, characterIds: [], locationIds: [locationId], sceneIds: [], details: { sectionId: command.sectionId } }
    }

    if (command.kind === "world.location_section_delete") {
      const locationId = this.sectionLocations.get(command.sectionId)
      if (!locationId) throw new EngineCommandError("world.section_not_found", "Location section was not found")
      this.sectionLocations.delete(command.sectionId)
      return { kind: command.kind, characterIds: [], locationIds: [locationId], sceneIds: [], details: { sectionId: command.sectionId } }
    }

    if (command.kind === "world.location_link_create") {
      const locationId = this.sectionLocations.get(command.sectionId)
      if (!locationId) throw new EngineCommandError("world.section_not_found", "Location section was not found")
      const linkId = `link-${command.context.commandId}`
      this.linkSections.set(linkId, { sectionId: command.sectionId, targetLocationId: command.targetLocationId })
      return { kind: command.kind, characterIds: [], locationIds: [locationId, command.targetLocationId], sceneIds: [], details: { linkId } }
    }

    if (command.kind === "world.location_link_update") {
      const link = this.linkSections.get(command.linkId)
      if (!link) throw new EngineCommandError("world.link_not_found", "Location link was not found")
      const locationId = this.sectionLocations.get(link.sectionId)
      if (!locationId) throw new EngineCommandError("world.section_not_found", "Location section was not found")
      this.linkSections.set(command.linkId, { ...link, targetLocationId: command.targetLocationId })
      return { kind: command.kind, characterIds: [], locationIds: [locationId, command.targetLocationId], sceneIds: [], details: { linkId: command.linkId } }
    }

    if (command.kind === "world.location_link_delete") {
      const link = this.linkSections.get(command.linkId)
      if (!link) throw new EngineCommandError("world.link_not_found", "Location link was not found")
      const locationId = this.sectionLocations.get(link.sectionId)
      this.linkSections.delete(command.linkId)
      return { kind: command.kind, characterIds: [], locationIds: [locationId || "", link.targetLocationId].filter(Boolean), sceneIds: [], details: { linkId: command.linkId } }
    }

    if (command.kind === "world.npc_habitat_set") {
      const key = `${command.npcCharacterId}:${command.locationId}`
      if (command.attached) this.npcHabitats.add(key); else this.npcHabitats.delete(key)
      return { kind: command.kind, characterIds: [command.npcCharacterId], locationIds: [command.locationId], sceneIds: [], details: { attached: command.attached } }
    }

    throw new EngineCommandError("world.unsupported_command", `Unsupported Larisa command: ${command satisfies never}`)
  }
}
