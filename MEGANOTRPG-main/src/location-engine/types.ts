import type { EngineCommandContext } from "../engine-contracts/index.ts"
import type { VisibilityMode } from "../types/world.ts"
import type {
  CharacterWorldState,
  DayPeriod,
  LocationSummary,
  SceneWorldState,
} from "../world-state/types.ts"

export type SceneParticipant = { room_id: string; character_id: string }

export type LarisaSnapshot = {
  characterStates: CharacterWorldState[]
  locations: LocationSummary[]
  scenes: SceneWorldState[]
  sceneParticipants: SceneParticipant[]
}

export type LocationCreateInput = {
  parentLocationId: string | null
  name: string
  summary: string
  description: string
  imageUrl: string | null
  visibilityMode: VisibilityMode
}

export type LocationUpdateInput = Omit<LocationCreateInput, "parentLocationId">

export type LarisaCommand =
  | { kind: "world.discover_location"; context: EngineCommandContext; characterId: string; locationId: string; discovered: boolean }
  | { kind: "world.set_character_position"; context: EngineCommandContext; characterId: string; locationId: string | null; campaignDay: number; dayPeriod: DayPeriod }
  | { kind: "world.set_scene_position"; context: EngineCommandContext; roomId: string; locationId: string | null; campaignDay: number; dayPeriod: DayPeriod }
  | { kind: "world.set_scene_participants"; context: EngineCommandContext; roomId: string; characterIds: string[] }
  | { kind: "world.sync_scene_participants"; context: EngineCommandContext; roomId: string; syncLocation: boolean; syncTime: boolean }
  | { kind: "world.location_create"; context: EngineCommandContext; input: LocationCreateInput }
  | { kind: "world.location_update"; context: EngineCommandContext; locationId: string; input: LocationUpdateInput }
  | { kind: "world.location_set_visibility"; context: EngineCommandContext; locationId: string; visibilityMode: VisibilityMode }
  | { kind: "world.location_set_archived"; context: EngineCommandContext; locationId: string; archived: boolean }
  | { kind: "world.location_delete"; context: EngineCommandContext; locationId: string }
  | { kind: "world.location_publish_event"; context: EngineCommandContext; locationId: string; event: "opened" | "updated" | "destroyed" }
  | { kind: "world.location_section_create"; context: EngineCommandContext; locationId: string; title: string; body: string }
  | { kind: "world.location_section_update"; context: EngineCommandContext; sectionId: string; title: string; body: string }
  | { kind: "world.location_section_delete"; context: EngineCommandContext; sectionId: string }
  | { kind: "world.location_link_create"; context: EngineCommandContext; sectionId: string; targetLocationId: string; label: string; visibilityMode: VisibilityMode }
  | { kind: "world.location_link_update"; context: EngineCommandContext; linkId: string; targetLocationId: string; label: string; visibilityMode?: VisibilityMode }
  | { kind: "world.location_link_delete"; context: EngineCommandContext; linkId: string }
  | { kind: "world.npc_habitat_set"; context: EngineCommandContext; npcCharacterId: string; locationId: string; attached: boolean }

export type WorldMutation = {
  kind: LarisaCommand["kind"]
  characterIds: string[]
  locationIds: string[]
  sceneIds: string[]
  details: Record<string, unknown>
}

export interface LarisaStorage {
  loadCampaignSnapshot(campaignId: string): Promise<LarisaSnapshot>
  execute(command: LarisaCommand): Promise<WorldMutation>
}
