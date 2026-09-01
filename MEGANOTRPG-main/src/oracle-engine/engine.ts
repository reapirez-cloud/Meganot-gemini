import { EngineCommandError, type EngineCommandContext } from "../engine-contracts/index.ts"
import type { ShapoklyakEngine } from "../entity-engine/index.ts"
import type { CheburashkaEngine } from "../inventory-engine/index.ts"
import type { LarisaEngine } from "../location-engine/index.ts"
import type { ChasovoyEngine } from "../reference-engine/index.ts"
import type {
  OracleCharacterCommands,
  OracleDefinitionCommands,
  OracleInventoryCommands,
  OracleWorldCommands,
} from "./types.ts"

export type OracleDependencies = {
  shapoklyak: Pick<ShapoklyakEngine, "execute">
  cheburashka: Pick<CheburashkaEngine, "execute">
  larisa: Pick<LarisaEngine, "execute">
  chasovoy: Pick<ChasovoyEngine, "execute">
}

function assertOracleAuthority(context: EngineCommandContext): void {
  if (context.authority !== "gm" && context.authority !== "system") {
    throw new EngineCommandError("oracle.gm_required", "Oracle only accepts GM or system authority")
  }
}

/** Oracle is the GM's hands. It stores nothing and never routes through Gena. */
export class OracleEngine {
  readonly characters: OracleCharacterCommands
  readonly inventory: OracleInventoryCommands
  readonly world: OracleWorldCommands
  readonly definitions: OracleDefinitionCommands

  constructor(dependencies: OracleDependencies) {
    const direct = <T>(context: EngineCommandContext, action: () => T): T => {
      assertOracleAuthority(context)
      return action()
    }

    this.characters = {
      create: (context, input) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.create", context, input })),
      update: (context, characterId, input) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.update", context, characterId, input })),
      delete: (context, characterId) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.delete", context, characterId })),
      setActive: (context, userId, characterId) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.set_active", context, userId, characterId })),
      setAvatar: (context, characterId, avatarUrl) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.set_avatar", context, characterId, avatarUrl })),
      setLifeState: (context, characterId, lifeState) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.set_life_state", context, characterId, lifeState })),
      setVisibility: (context, characterId, visibilityMode) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.set_visibility", context, characterId, visibilityMode })),
      revealNpc: (context, viewerCharacterId, npcCharacterId, discovered = true) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.reveal_npc", context, viewerCharacterId, npcCharacterId, discovered })),
      setHp: (context, characterId, currentHp, options = {}) => direct(context, () => dependencies.shapoklyak.execute({
        kind: "entity.set_hp", context, characterId, currentHp,
        ...(options.maxHp !== undefined ? { maxHp: options.maxHp } : {}),
        ...(options.tempHp !== undefined ? { tempHp: options.tempHp } : {}),
      })),
      updateSheet: (context, characterId, input) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.update_sheet", context, characterId, input })),
      setSpellcastingEnabled: (context, characterId, enabled) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.set_spellcasting_enabled", context, characterId, enabled })),
      createSpell: (context, characterId, input) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.create_spell", context, characterId, input })),
      updateSpell: (context, characterId, spellId, input) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.update_spell", context, characterId, spellId, input })),
      deleteSpell: (context, characterId, spellId) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.delete_spell", context, characterId, spellId })),
      createSpellOption: (context, characterId, input) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.create_spell_option", context, characterId, input })),
      updateSpellOption: (context, characterId, optionId, input) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.update_spell_option", context, characterId, optionId, input })),
      deleteSpellOption: (context, characterId, optionId) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.delete_spell_option", context, characterId, optionId })),
      learnSpell: (context, characterId, optionId) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.learn_spell", context, characterId, optionId })),
      setSpellPrepared: (context, characterId, spellId, prepared) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.set_spell_prepared", context, characterId, spellId, prepared })),
      createFeature: (context, characterId, input) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.create_feature", context, characterId, input })),
      updateFeature: (context, characterId, featureId, input) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.update_feature", context, characterId, featureId, input })),
      deleteFeature: (context, characterId, featureId) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.delete_feature", context, characterId, featureId })),
      syncResources: (context, characterId, resources) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.sync_resources", context, characterId, resources })),
      recover: (context, characterId, trigger) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.recover_resources", context, characterId, trigger })),
      assignTemplate: (context, characterId, input) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.assign_template", context, characterId, input })),
      removeTemplateAssignment: (context, characterId, assignmentId) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.remove_template_assignment", context, characterId, assignmentId })),
      setSourceSuppressed: (context, characterId, sourceId, suppressed) => direct(context, () => dependencies.shapoklyak.execute({ kind: "entity.set_source_suppressed", context, characterId, sourceId, suppressed })),
    }

    this.inventory = {
      create: (context, characterId, input) => direct(context, () => dependencies.cheburashka.execute({ kind: "inventory.create", context, characterId, input })),
      update: (context, characterId, itemId, input) => direct(context, () => dependencies.cheburashka.execute({ kind: "inventory.update", context, characterId, itemId, input })),
      remove: (context, characterId, itemId) => direct(context, () => dependencies.cheburashka.execute({ kind: "inventory.remove", context, characterId, itemId })),
      setEquipped: (context, characterId, itemId, equipped, equipmentSlot = null) => direct(context, () => dependencies.cheburashka.execute({ kind: "inventory.set_equipped", context, characterId, itemId, equipped, equipmentSlot })),
      consume: (context, characterId, itemId, amount = 1) => direct(context, () => dependencies.cheburashka.execute({ kind: "inventory.consume", context, characterId, itemId, amount })),
      transfer: (context, fromCharacterId, toCharacterId, itemId, amount) => direct(context, () => dependencies.cheburashka.execute({ kind: "inventory.transfer", context, fromCharacterId, toCharacterId, itemId, amount })),
    }

    this.world = {
      discoverLocation: (context, characterId, locationId, discovered = true) => direct(context, () => dependencies.larisa.execute({ kind: "world.discover_location", context, characterId, locationId, discovered })),
      moveCharacter: (context, characterId, locationId, campaignDay, dayPeriod) => direct(context, () => dependencies.larisa.execute({ kind: "world.set_character_position", context, characterId, locationId, campaignDay, dayPeriod })),
      setScenePosition: (context, roomId, locationId, campaignDay, dayPeriod) => direct(context, () => dependencies.larisa.execute({ kind: "world.set_scene_position", context, roomId, locationId, campaignDay, dayPeriod })),
      setSceneParticipants: (context, roomId, characterIds) => direct(context, () => dependencies.larisa.execute({ kind: "world.set_scene_participants", context, roomId, characterIds })),
      syncSceneParticipants: (context, roomId, options) => direct(context, () => dependencies.larisa.execute({ kind: "world.sync_scene_participants", context, roomId, syncLocation: options.syncLocation, syncTime: options.syncTime })),
      createLocation: (context, input) => direct(context, () => dependencies.larisa.execute({ kind: "world.location_create", context, input })),
      updateLocation: (context, locationId, input) => direct(context, () => dependencies.larisa.execute({ kind: "world.location_update", context, locationId, input })),
      setLocationVisibility: (context, locationId, visibilityMode) => direct(context, () => dependencies.larisa.execute({ kind: "world.location_set_visibility", context, locationId, visibilityMode })),
      setLocationArchived: (context, locationId, archived) => direct(context, () => dependencies.larisa.execute({ kind: "world.location_set_archived", context, locationId, archived })),
      deleteLocation: (context, locationId) => direct(context, () => dependencies.larisa.execute({ kind: "world.location_delete", context, locationId })),
      publishLocationEvent: (context, locationId, event) => direct(context, () => dependencies.larisa.execute({ kind: "world.location_publish_event", context, locationId, event })),
      createLocationSection: (context, locationId, title, body) => direct(context, () => dependencies.larisa.execute({ kind: "world.location_section_create", context, locationId, title, body })),
      updateLocationSection: (context, sectionId, title, body) => direct(context, () => dependencies.larisa.execute({ kind: "world.location_section_update", context, sectionId, title, body })),
      deleteLocationSection: (context, sectionId) => direct(context, () => dependencies.larisa.execute({ kind: "world.location_section_delete", context, sectionId })),
      createLocationLink: (context, sectionId, targetLocationId, label, visibilityMode) => direct(context, () => dependencies.larisa.execute({ kind: "world.location_link_create", context, sectionId, targetLocationId, label, visibilityMode })),
      updateLocationLink: (context, linkId, targetLocationId, label, visibilityMode) => direct(context, () => dependencies.larisa.execute({ kind: "world.location_link_update", context, linkId, targetLocationId, label, ...(visibilityMode !== undefined ? { visibilityMode } : {}) })),
      deleteLocationLink: (context, linkId) => direct(context, () => dependencies.larisa.execute({ kind: "world.location_link_delete", context, linkId })),
      setNpcHabitat: (context, npcCharacterId, locationId, attached) => direct(context, () => dependencies.larisa.execute({ kind: "world.npc_habitat_set", context, npcCharacterId, locationId, attached })),
    }

    this.definitions = {
      create: (context, input) => direct(context, () => dependencies.chasovoy.execute({ kind: "definition.create", context, input })),
      revise: (context, definitionId, input) => direct(context, () => dependencies.chasovoy.execute({ kind: "definition.revise", context, definitionId, input })),
      archive: (context, definitionId) => direct(context, () => dependencies.chasovoy.execute({ kind: "definition.archive", context, definitionId })),
    }
  }
}
