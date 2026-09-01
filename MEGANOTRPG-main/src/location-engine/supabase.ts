import type { SupabaseClient } from "@supabase/supabase-js"
import { EngineCommandError } from "../engine-contracts/index.ts"
import type { CharacterWorldState, DayPeriod, LocationSummary, SceneWorldState } from "../world-state/types.ts"
import type { LarisaCommand, LarisaSnapshot, LarisaStorage, SceneParticipant, WorldMutation } from "./types.ts"

function fail(error: { message: string } | null, fallback: string): never {
  throw new EngineCommandError("world.persistence", error?.message || fallback)
}

export class SupabaseLarisaStorage implements LarisaStorage {
  private readonly client: SupabaseClient

  constructor(client: SupabaseClient) { this.client = client }

  async loadCampaignSnapshot(campaignId: string): Promise<LarisaSnapshot> {
    const [stateResult, locationResult, sceneResult, participantResult] = await Promise.all([
      this.client.from("character_world_state").select("character_id,campaign_id,location_id,campaign_day,day_period,updated_at,updated_by").eq("campaign_id", campaignId),
      this.client.from("locations").select("id,name,parent_location_id,image_url,visibility_mode,lifecycle_state").eq("campaign_id", campaignId).order("sort_order", { ascending: true }),
      this.client.from("chat_rooms").select("id,title,location_id,campaign_day,day_period,scene_state,room_state").eq("campaign_id", campaignId).eq("room_type", "scene"),
      this.client.from("scene_participants").select("room_id,character_id"),
    ])
    const error = stateResult.error || locationResult.error || sceneResult.error || participantResult.error
    if (error) fail(error, "Could not load world state")
    return {
      characterStates: (stateResult.data || []) as CharacterWorldState[],
      locations: (locationResult.data || []) as LocationSummary[],
      scenes: (sceneResult.data || []).map((room) => ({
        room_id: room.id,
        title: room.title,
        location_id: room.location_id,
        campaign_day: room.campaign_day,
        day_period: room.day_period as DayPeriod,
        scene_state: room.scene_state as "active" | "closed",
        room_state: room.room_state as "open" | "gm_only" | "closed",
      })) satisfies SceneWorldState[],
      sceneParticipants: (participantResult.data || []) as SceneParticipant[],
    }
  }

  async execute(command: LarisaCommand): Promise<WorldMutation> {
    if (command.kind === "world.discover_location") {
      const { error } = await this.client.rpc("set_world_discovery", { p_character_id: command.characterId, p_entity_type: "location", p_entity_id: command.locationId, p_discovered: command.discovered })
      if (error) fail(error, "Could not update location discovery")
      return { kind: command.kind, characterIds: [command.characterId], locationIds: [command.locationId], sceneIds: [], details: { discovered: command.discovered } }
    }

    if (command.kind === "world.set_character_position") {
      const { error } = await this.client.rpc("set_character_world_position", { p_character_id: command.characterId, p_location_id: command.locationId, p_campaign_day: command.campaignDay, p_day_period: command.dayPeriod })
      if (error) fail(error, "Could not move character")
      return { kind: command.kind, characterIds: [command.characterId], locationIds: command.locationId ? [command.locationId] : [], sceneIds: [], details: { locationId: command.locationId, campaignDay: command.campaignDay, dayPeriod: command.dayPeriod } }
    }

    if (command.kind === "world.set_scene_position") {
      const { error } = await this.client.rpc("set_scene_position", { p_room_id: command.roomId, p_location_id: command.locationId, p_campaign_day: command.campaignDay, p_day_period: command.dayPeriod })
      if (error) fail(error, "Could not move scene")
      return { kind: command.kind, characterIds: [], locationIds: command.locationId ? [command.locationId] : [], sceneIds: [command.roomId], details: { locationId: command.locationId, campaignDay: command.campaignDay, dayPeriod: command.dayPeriod } }
    }

    if (command.kind === "world.set_scene_participants") {
      const { error } = await this.client.rpc("set_scene_participants", { p_room_id: command.roomId, p_character_ids: command.characterIds })
      if (error) fail(error, "Could not update scene participants")
      return { kind: command.kind, characterIds: command.characterIds, locationIds: [], sceneIds: [command.roomId], details: { characterIds: command.characterIds } }
    }

    if (command.kind === "world.sync_scene_participants") {
      const { data, error } = await this.client.rpc("sync_scene_participants", { p_room_id: command.roomId, p_sync_location: command.syncLocation, p_sync_time: command.syncTime })
      if (error) fail(error, "Could not synchronize scene participants")
      return { kind: command.kind, characterIds: [], locationIds: [], sceneIds: [command.roomId], details: { count: Number(data || 0), syncLocation: command.syncLocation, syncTime: command.syncTime } }
    }

    if (command.kind === "world.location_create") {
      const { data, error } = await this.client.from("locations").insert({
        campaign_id: command.context.campaignId,
        parent_location_id: command.input.parentLocationId,
        name: command.input.name.trim(),
        summary: command.input.summary.trim(),
        description: command.input.description.trim(),
        image_url: command.input.imageUrl?.trim() || null,
        visibility_mode: command.input.visibilityMode,
        created_by: command.context.requestedBy,
      }).select("id").single()
      if (error || !data) fail(error, "Could not create location")
      return { kind: command.kind, characterIds: [], locationIds: [data.id], sceneIds: [], details: { locationId: data.id } }
    }

    if (command.kind === "world.location_update") {
      const { error } = await this.client.from("locations").update({
        name: command.input.name.trim(),
        summary: command.input.summary.trim(),
        description: command.input.description.trim(),
        image_url: command.input.imageUrl?.trim() || null,
        visibility_mode: command.input.visibilityMode,
        updated_at: new Date().toISOString(),
      }).eq("id", command.locationId)
      if (error) fail(error, "Could not update location")
      return { kind: command.kind, characterIds: [], locationIds: [command.locationId], sceneIds: [], details: { locationId: command.locationId } }
    }

    if (command.kind === "world.location_set_visibility") {
      const { error } = await this.client.from("locations").update({ visibility_mode: command.visibilityMode, updated_at: new Date().toISOString() }).eq("id", command.locationId)
      if (error) fail(error, "Could not change location visibility")
      return { kind: command.kind, characterIds: [], locationIds: [command.locationId], sceneIds: [], details: { visibilityMode: command.visibilityMode } }
    }

    if (command.kind === "world.location_set_archived") {
      const { error } = await this.client.from("locations").update({
        lifecycle_state: command.archived ? "archived" : "active",
        archived_at: command.archived ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq("id", command.locationId)
      if (error) fail(error, "Could not change location lifecycle")
      return { kind: command.kind, characterIds: [], locationIds: [command.locationId], sceneIds: [], details: { archived: command.archived } }
    }

    if (command.kind === "world.location_delete") {
      const { error } = await this.client.from("locations").delete().eq("id", command.locationId)
      if (error) fail(error, "Could not delete location")
      return { kind: command.kind, characterIds: [], locationIds: [command.locationId], sceneIds: [], details: {} }
    }

    if (command.kind === "world.location_publish_event") {
      const { error } = await this.client.rpc("publish_location_chronicle_event", { p_location_id: command.locationId, p_event: command.event })
      if (error) fail(error, "Could not publish location chronicle event")
      return { kind: command.kind, characterIds: [], locationIds: [command.locationId], sceneIds: [], details: { event: command.event } }
    }

    if (command.kind === "world.location_section_create") {
      const { data, error } = await this.client.from("location_sections").insert({ location_id: command.locationId, title: command.title.trim(), body: command.body.trim() }).select("id").single()
      if (error || !data) fail(error, "Could not create location section")
      return { kind: command.kind, characterIds: [], locationIds: [command.locationId], sceneIds: [], details: { sectionId: data.id } }
    }

    if (command.kind === "world.location_section_update") {
      const { data: section, error: readError } = await this.client.from("location_sections").select("location_id").eq("id", command.sectionId).maybeSingle()
      if (readError || !section) fail(readError, "Could not load location section")
      const { error } = await this.client.from("location_sections").update({ title: command.title.trim(), body: command.body.trim() }).eq("id", command.sectionId)
      if (error) fail(error, "Could not update location section")
      return { kind: command.kind, characterIds: [], locationIds: [section.location_id], sceneIds: [], details: { sectionId: command.sectionId } }
    }

    if (command.kind === "world.location_section_delete") {
      const { data: section, error: readError } = await this.client.from("location_sections").select("location_id").eq("id", command.sectionId).maybeSingle()
      if (readError || !section) fail(readError, "Could not load location section")
      const { error } = await this.client.from("location_sections").delete().eq("id", command.sectionId)
      if (error) fail(error, "Could not delete location section")
      return { kind: command.kind, characterIds: [], locationIds: [section.location_id], sceneIds: [], details: { sectionId: command.sectionId } }
    }

    if (command.kind === "world.location_link_create") {
      const { data: section, error: readError } = await this.client.from("location_sections").select("location_id").eq("id", command.sectionId).maybeSingle()
      if (readError || !section) fail(readError, "Could not load link section")
      const { data, error } = await this.client.from("location_links").insert({
        section_id: command.sectionId,
        target_location_id: command.targetLocationId,
        label: command.label.trim(),
        visibility_mode: command.visibilityMode,
        created_by: command.context.requestedBy,
      }).select("id").single()
      if (error || !data) fail(error, "Could not create location link")
      return { kind: command.kind, characterIds: [], locationIds: [section.location_id, command.targetLocationId], sceneIds: [], details: { linkId: data.id } }
    }

    if (command.kind === "world.location_link_update") {
      const { data: link, error: readError } = await this.client.from("location_links").select("section_id,target_location_id").eq("id", command.linkId).maybeSingle()
      if (readError || !link) fail(readError, "Could not load location link")
      const { data: section, error: sectionError } = await this.client.from("location_sections").select("location_id").eq("id", link.section_id).maybeSingle()
      if (sectionError || !section) fail(sectionError, "Could not load link section")
      const payload: Record<string, unknown> = { target_location_id: command.targetLocationId, label: command.label.trim() }
      if (command.visibilityMode) payload.visibility_mode = command.visibilityMode
      const { error } = await this.client.from("location_links").update(payload).eq("id", command.linkId)
      if (error) fail(error, "Could not update location link")
      return { kind: command.kind, characterIds: [], locationIds: [section.location_id, command.targetLocationId], sceneIds: [], details: { linkId: command.linkId } }
    }

    if (command.kind === "world.location_link_delete") {
      const { data: link, error: readError } = await this.client.from("location_links").select("section_id,target_location_id").eq("id", command.linkId).maybeSingle()
      if (readError || !link) fail(readError, "Could not load location link")
      const { data: section, error: sectionError } = await this.client.from("location_sections").select("location_id").eq("id", link.section_id).maybeSingle()
      if (sectionError || !section) fail(sectionError, "Could not load link section")
      const { error } = await this.client.from("location_links").delete().eq("id", command.linkId)
      if (error) fail(error, "Could not delete location link")
      return { kind: command.kind, characterIds: [], locationIds: [section.location_id, link.target_location_id], sceneIds: [], details: { linkId: command.linkId } }
    }

    if (command.kind === "world.npc_habitat_set") {
      const { error } = await this.client.rpc("set_npc_zone_habitat", {
        p_npc_character_id: command.npcCharacterId,
        p_location_id: command.locationId,
        p_attached: command.attached,
      })
      if (error) fail(error, "Could not change NPC habitat")
      return { kind: command.kind, characterIds: [command.npcCharacterId], locationIds: [command.locationId], sceneIds: [], details: { attached: command.attached } }
    }

    throw new EngineCommandError("world.unsupported_command", "Unsupported Larisa command")
  }
}
