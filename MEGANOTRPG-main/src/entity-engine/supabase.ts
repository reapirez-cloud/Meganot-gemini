import type { SupabaseClient } from "@supabase/supabase-js"
import { EngineCommandError } from "../engine-contracts/index.ts"
import type { CharacterEntity, EntityMutation, ShapoklyakCommand, ShapoklyakStorage } from "./types.ts"

const fields = "id,campaign_id,assigned_user_id,name,character_class,level,bio,avatar_url,character_type,visibility,visibility_mode,life_state,died_at,created_by,created_at,updated_at"
const narrativeFields = "race,background,alignment,proficiencies,languages,senses,personality_traits,ideals,bonds,flaws,backstory,notes"

function fail(error: { message: string } | null, fallback: string): never {
  throw new EngineCommandError("entity.persistence", error?.message || fallback)
}

function spellPayload(input: Extract<ShapoklyakCommand, { kind: "entity.create_spell" }>["input"]) {
  return {
    name: input.name.trim(),
    spell_level: input.spell_level,
    school: input.school.trim(),
    casting_time: input.casting_time.trim(),
    spell_range: input.spell_range.trim(),
    duration: input.duration.trim(),
    components: input.components.trim(),
    concentration: input.concentration,
    ritual: input.ritual,
    prepared: input.prepared,
    cast_mode: input.cast_mode,
    slot_level: input.slot_level,
    description: input.description.trim(),
    source: input.source.trim(),
  }
}

export class SupabaseShapoklyakStorage implements ShapoklyakStorage {
  private readonly client: SupabaseClient

  constructor(client: SupabaseClient) { this.client = client }

  async listCampaignEntities(campaignId: string): Promise<CharacterEntity[]> {
    const { data, error } = await this.client.from("characters").select(fields).eq("campaign_id", campaignId).order("created_at", { ascending: true })
    if (error) fail(error, "Could not load characters")
    return (data || []) as CharacterEntity[]
  }

  async getEntity(characterId: string): Promise<CharacterEntity | null> {
    const { data, error } = await this.client.from("characters").select(fields).eq("id", characterId).maybeSingle()
    if (error) fail(error, "Could not load character")
    return data as CharacterEntity | null
  }

  async execute(command: ShapoklyakCommand): Promise<EntityMutation> {
    if (command.kind === "entity.create") {
      const { data, error } = await this.client.rpc("create_campaign_character", {
        p_campaign_id: command.context.campaignId,
        p_name: command.input.name.trim(),
        p_character_class: command.input.character_class.trim() || "Персонаж",
        p_level: command.input.level,
        p_bio: command.input.bio.trim(),
        p_avatar_url: command.input.avatar_url?.trim() || null,
        p_assigned_user_id: command.input.assigned_user_id,
        p_character_type: command.input.character_type,
        p_visibility: command.input.visibility,
      })
      if (error) fail(error, "Could not create character")
      const after = await this.getEntity(String(data))
      return { kind: command.kind, characterIds: [String(data)], before: null, after, requiresResolution: true }
    }

    if (command.kind === "entity.set_active") {
      const { error } = await this.client.rpc("set_campaign_active_character", { p_campaign_id: command.context.campaignId, p_user_id: command.userId, p_character_id: command.characterId })
      if (error) fail(error, "Could not set active character")
      return { kind: command.kind, characterIds: command.characterId ? [command.characterId] : [], details: { userId: command.userId, activeCharacterId: command.characterId }, requiresResolution: false }
    }

    if (command.kind === "entity.reveal_npc") {
      const { error } = await this.client.rpc("set_world_discovery", { p_character_id: command.viewerCharacterId, p_entity_type: "npc", p_entity_id: command.npcCharacterId, p_discovered: command.discovered })
      if (error) fail(error, "Could not update NPC discovery")
      return { kind: command.kind, characterIds: [command.viewerCharacterId, command.npcCharacterId], details: { discovered: command.discovered }, requiresResolution: false }
    }

    const before = await this.getEntity(command.characterId)
    if (!before) throw new EngineCommandError("entity.not_found", "Character was not found")

    if (command.kind === "entity.update") {
      const { error } = await this.client.rpc("update_campaign_character", {
        p_character_id: command.characterId,
        p_name: command.input.name.trim(),
        p_character_class: command.input.character_class.trim() || "Персонаж",
        p_level: command.input.level,
        p_bio: command.input.bio.trim(),
        p_avatar_url: command.input.avatar_url?.trim() || null,
        p_assigned_user_id: command.input.assigned_user_id,
        p_character_type: command.input.character_type,
        p_visibility: command.input.visibility,
      })
      if (error) fail(error, "Could not update character")
      return { kind: command.kind, characterIds: [command.characterId], before, after: await this.getEntity(command.characterId), requiresResolution: true }
    }

    if (command.kind === "entity.delete") {
      const { error } = await this.client.rpc("delete_campaign_character", { p_character_id: command.characterId })
      if (error) fail(error, "Could not delete character")
      return { kind: command.kind, characterIds: [command.characterId], before, after: null, requiresResolution: true }
    }

    if (command.kind === "entity.set_avatar") {
      const { error } = await this.client.rpc("set_my_character_avatar", {
        p_character_id: command.characterId,
        p_avatar_url: command.avatarUrl?.trim() || null,
      })
      if (error) fail(error, "Could not change character avatar")
      return { kind: command.kind, characterIds: [command.characterId], before, after: await this.getEntity(command.characterId), requiresResolution: false }
    }

    if (command.kind === "entity.set_life_state") {
      const { error } = await this.client.rpc("set_character_life_state", { p_character_id: command.characterId, p_life_state: command.lifeState })
      if (error) fail(error, "Could not change character life state")
      return { kind: command.kind, characterIds: [command.characterId], before, after: await this.getEntity(command.characterId), requiresResolution: true }
    }

    if (command.kind === "entity.set_visibility") {
      const { error } = await this.client.rpc("set_character_visibility_mode", { p_character_id: command.characterId, p_visibility_mode: command.visibilityMode })
      if (error) fail(error, "Could not change character visibility")
      return { kind: command.kind, characterIds: [command.characterId], before, after: await this.getEntity(command.characterId), requiresResolution: false }
    }

    if (command.kind === "entity.update_sheet") {
      if (command.context.authority === "player") {
        const { data: current, error: readError } = await this.client
          .from("character_sheets")
          .select(narrativeFields)
          .eq("character_id", command.characterId)
          .maybeSingle()
        if (readError || !current) fail(readError, "Could not load character narrative")
        const next = { ...current, ...command.input } as Record<string, unknown>
        const { error } = await this.client.rpc("update_character_narrative", {
          p_character_id: command.characterId,
          p_race: String(next.race ?? ""),
          p_background: String(next.background ?? ""),
          p_alignment: String(next.alignment ?? ""),
          p_proficiencies: String(next.proficiencies ?? ""),
          p_languages: String(next.languages ?? ""),
          p_senses: String(next.senses ?? ""),
          p_personality_traits: String(next.personality_traits ?? ""),
          p_ideals: String(next.ideals ?? ""),
          p_bonds: String(next.bonds ?? ""),
          p_flaws: String(next.flaws ?? ""),
          p_backstory: String(next.backstory ?? ""),
          p_notes: String(next.notes ?? ""),
        })
        if (error) fail(error, "Could not update character narrative")
      } else {
        const { error } = await this.client
          .from("character_sheets")
          .update({ ...command.input, updated_at: new Date().toISOString() })
          .eq("character_id", command.characterId)
        if (error) fail(error, "Could not update character sheet")
      }
      return { kind: command.kind, characterIds: [command.characterId], before, after: before, details: { fields: Object.keys(command.input) }, requiresResolution: true }
    }

    if (command.kind === "entity.set_spellcasting_enabled") {
      const { error } = await this.client.rpc("set_character_spellcasting_enabled", { p_character_id: command.characterId, p_enabled: command.enabled })
      if (error) fail(error, "Could not change spellcasting access")
      return { kind: command.kind, characterIds: [command.characterId], before, after: before, details: { enabled: command.enabled }, requiresResolution: true }
    }

    if (command.kind === "entity.create_spell") {
      const { data, error } = await this.client.from("character_spells").insert({ character_id: command.characterId, ...spellPayload(command.input) }).select("id").single()
      if (error || !data) fail(error, "Could not create character spell")
      return { kind: command.kind, characterIds: [command.characterId], before, after: before, details: { spellId: data.id }, requiresResolution: true }
    }

    if (command.kind === "entity.update_spell") {
      const { error } = await this.client.from("character_spells").update({ ...spellPayload(command.input), updated_at: new Date().toISOString() }).eq("id", command.spellId).eq("character_id", command.characterId)
      if (error) fail(error, "Could not update character spell")
      return { kind: command.kind, characterIds: [command.characterId], before, after: before, details: { spellId: command.spellId }, requiresResolution: true }
    }

    if (command.kind === "entity.delete_spell") {
      const { error } = await this.client.rpc("forget_character_spell", { p_spell_id: command.spellId })
      if (error) fail(error, "Could not forget character spell")
      return { kind: command.kind, characterIds: [command.characterId], before, after: before, details: { spellId: command.spellId }, requiresResolution: true }
    }

    if (command.kind === "entity.create_spell_option") {
      const { data, error } = await this.client.from("character_spell_options").insert({ character_id: command.characterId, granted_by: command.context.requestedBy, ...spellPayload(command.input) }).select("id").single()
      if (error || !data) fail(error, "Could not create spell option")
      return { kind: command.kind, characterIds: [command.characterId], before, after: before, details: { optionId: data.id }, requiresResolution: true }
    }

    if (command.kind === "entity.update_spell_option") {
      const { error } = await this.client.from("character_spell_options").update({ ...spellPayload(command.input), updated_at: new Date().toISOString() }).eq("id", command.optionId).eq("character_id", command.characterId)
      if (error) fail(error, "Could not update spell option")
      return { kind: command.kind, characterIds: [command.characterId], before, after: before, details: { optionId: command.optionId }, requiresResolution: true }
    }

    if (command.kind === "entity.delete_spell_option") {
      const { error } = await this.client.from("character_spell_options").delete().eq("id", command.optionId).eq("character_id", command.characterId)
      if (error) fail(error, "Could not delete spell option")
      return { kind: command.kind, characterIds: [command.characterId], before, after: before, details: { optionId: command.optionId }, requiresResolution: true }
    }

    if (command.kind === "entity.learn_spell") {
      const { data, error } = await this.client.rpc("learn_character_spell", { p_option_id: command.optionId })
      if (error) fail(error, "Could not learn character spell")
      return { kind: command.kind, characterIds: [command.characterId], before, after: before, details: { optionId: command.optionId, spellId: data ? String(data) : null }, requiresResolution: true }
    }

    if (command.kind === "entity.set_spell_prepared") {
      const { error } = await this.client.rpc("set_character_spell_prepared", { p_spell_id: command.spellId, p_prepared: command.prepared })
      if (error) fail(error, "Could not change prepared spell")
      return { kind: command.kind, characterIds: [command.characterId], before, after: before, details: { spellId: command.spellId, prepared: command.prepared }, requiresResolution: true }
    }

    if (command.kind === "entity.create_feature") {
      const { data, error } = await this.client.from("character_features").insert({ character_id: command.characterId, ...command.input, mechanics: command.input.mechanics || [] }).select("id").single()
      if (error || !data) fail(error, "Could not create character feature")
      return { kind: command.kind, characterIds: [command.characterId], before, after: before, details: { featureId: data.id }, requiresResolution: true }
    }

    if (command.kind === "entity.update_feature") {
      const { error } = await this.client.from("character_features").update({ ...command.input, mechanics: command.input.mechanics || [], updated_at: new Date().toISOString() }).eq("id", command.featureId).eq("character_id", command.characterId)
      if (error) fail(error, "Could not update character feature")
      return { kind: command.kind, characterIds: [command.characterId], before, after: before, details: { featureId: command.featureId }, requiresResolution: true }
    }

    if (command.kind === "entity.delete_feature") {
      const { error } = await this.client.from("character_features").delete().eq("id", command.featureId).eq("character_id", command.characterId)
      if (error) fail(error, "Could not delete character feature")
      return { kind: command.kind, characterIds: [command.characterId], before, after: before, details: { featureId: command.featureId }, requiresResolution: true }
    }

    if (command.kind === "entity.sync_resources") {
      const { error } = await this.client.rpc("sync_character_resource_states", { p_character_id: command.characterId, p_resources: command.resources })
      if (error) fail(error, "Could not synchronize character resources")
      return { kind: command.kind, characterIds: [command.characterId], before, after: before, details: { count: command.resources.length }, requiresResolution: true }
    }

    if (command.kind === "entity.recover_resources") {
      if (command.trigger === "long_rest") {
        const { error } = await this.client.rpc("grant_character_long_rest", { p_character_id: command.characterId })
        if (error) fail(error, "Could not grant long rest")
      } else if (command.trigger === "short_rest") {
        const { error } = await this.client.rpc("grant_character_short_rest", { p_character_id: command.characterId })
        if (error) fail(error, "Could not grant short rest")
      } else {
        const { error } = await this.client.rpc("recover_character_resources", { p_character_id: command.characterId, p_trigger: command.trigger })
        if (error) fail(error, "Could not recover character resources")
      }
      return { kind: command.kind, characterIds: [command.characterId], before, after: before, details: { trigger: command.trigger }, requiresResolution: true }
    }

    if (command.kind === "entity.assign_template") {
      const { data, error } = await this.client.rpc("set_character_template_assignment_owner_v1", {
        p_character_id: command.characterId,
        p_template_id: command.input.templateId,
        p_template_level: command.input.templateLevel,
        p_selected_choices: command.input.selectedChoices,
      })
      if (error) fail(error, "Could not assign character template")
      return {
        kind: command.kind,
        characterIds: [command.characterId],
        before,
        after: await this.getEntity(command.characterId),
        details: { assignmentId: String(data), templateId: command.input.templateId, templateLevel: command.input.templateLevel },
        requiresResolution: true,
      }
    }

    if (command.kind === "entity.remove_template_assignment") {
      const { error } = await this.client.rpc("remove_character_template_assignment_owner_v1", {
        p_character_id: command.characterId,
        p_assignment_id: command.assignmentId,
      })
      if (error) fail(error, "Could not remove character template assignment")
      return {
        kind: command.kind,
        characterIds: [command.characterId],
        before,
        after: await this.getEntity(command.characterId),
        details: { assignmentId: command.assignmentId },
        requiresResolution: true,
      }
    }

    if (command.kind === "entity.set_source_suppressed") {
      const { error } = await this.client.rpc("set_character_source_suppressed", {
        p_character_id: command.characterId,
        p_source_id: command.sourceId,
        p_suppressed: command.suppressed,
      })
      if (error) fail(error, "Could not change character source suppression")
      return {
        kind: command.kind,
        characterIds: [command.characterId],
        before,
        after: before,
        details: { sourceId: command.sourceId, suppressed: command.suppressed },
        requiresResolution: true,
      }
    }

    if (command.kind === "entity.set_hp") {
      const { error } = await this.client.rpc("set_character_hp_v1", {
        p_character_id: command.characterId,
        p_current_hp: command.currentHp,
        p_max_hp: command.maxHp ?? null,
        p_temp_hp: command.tempHp ?? null,
        p_command_id: command.context.commandId,
      })
      if (error) fail(error, "Could not set character HP")
      return { kind: command.kind, characterIds: [command.characterId], before, after: before, details: { currentHp: command.currentHp, maxHp: command.maxHp, tempHp: command.tempHp }, requiresResolution: true }
    }

    throw new EngineCommandError("entity.unsupported_command", "Unsupported Shapoklyak command")
  }
}