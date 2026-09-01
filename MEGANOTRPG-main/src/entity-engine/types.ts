import type { EngineCommandContext } from "../engine-contracts/index.ts"
import type { ResourceSyncInput } from "../types/characterResources.ts"
import type { CharacterSheet, FeatureInput, SpellInput } from "../types/characterSheet.ts"

export type EntityKind = "pc" | "npc"
export type EntityVisibility = "campaign" | "private"
export type EntityVisibilityMode = "always" | "discover" | "private"
export type EntityLifeState = "alive" | "dead"
export type EntityRecoveryTrigger = "short_rest" | "long_rest" | "dawn"

export type CharacterEntity = {
  id: string
  campaign_id: string
  assigned_user_id: string | null
  name: string
  character_class: string
  level: number
  bio: string
  avatar_url: string | null
  character_type: EntityKind
  visibility: EntityVisibility
  visibility_mode?: EntityVisibilityMode
  life_state?: EntityLifeState
  died_at?: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type CharacterEntityInput = {
  name: string
  character_class: string
  level: number
  bio: string
  avatar_url: string | null
  assigned_user_id: string | null
  character_type: EntityKind
  visibility: EntityVisibility
}

export type CharacterSheetPatch = Partial<Omit<CharacterSheet, "character_id" | "created_at" | "updated_at">>

/** Concrete assignment of a Chasovoy definition to one character. */
export type CharacterTemplateAssignmentInput = {
  templateId: string
  templateLevel: number | null
  selectedChoices: Record<string, unknown>
}

export type ShapoklyakCommand =
  | { kind: "entity.create"; context: EngineCommandContext; input: CharacterEntityInput }
  | { kind: "entity.update"; context: EngineCommandContext; characterId: string; input: CharacterEntityInput }
  | { kind: "entity.delete"; context: EngineCommandContext; characterId: string }
  | { kind: "entity.set_active"; context: EngineCommandContext; userId: string; characterId: string | null }
  | { kind: "entity.set_avatar"; context: EngineCommandContext; characterId: string; avatarUrl: string | null }
  | { kind: "entity.set_life_state"; context: EngineCommandContext; characterId: string; lifeState: EntityLifeState }
  | { kind: "entity.set_visibility"; context: EngineCommandContext; characterId: string; visibilityMode: EntityVisibilityMode }
  | { kind: "entity.reveal_npc"; context: EngineCommandContext; viewerCharacterId: string; npcCharacterId: string; discovered: boolean }
  | { kind: "entity.set_hp"; context: EngineCommandContext; characterId: string; currentHp: number; maxHp?: number; tempHp?: number }
  | { kind: "entity.update_sheet"; context: EngineCommandContext; characterId: string; input: CharacterSheetPatch }
  | { kind: "entity.set_spellcasting_enabled"; context: EngineCommandContext; characterId: string; enabled: boolean }
  | { kind: "entity.create_spell"; context: EngineCommandContext; characterId: string; input: SpellInput }
  | { kind: "entity.update_spell"; context: EngineCommandContext; characterId: string; spellId: string; input: SpellInput }
  | { kind: "entity.delete_spell"; context: EngineCommandContext; characterId: string; spellId: string }
  | { kind: "entity.create_spell_option"; context: EngineCommandContext; characterId: string; input: SpellInput }
  | { kind: "entity.update_spell_option"; context: EngineCommandContext; characterId: string; optionId: string; input: SpellInput }
  | { kind: "entity.delete_spell_option"; context: EngineCommandContext; characterId: string; optionId: string }
  | { kind: "entity.learn_spell"; context: EngineCommandContext; characterId: string; optionId: string }
  | { kind: "entity.set_spell_prepared"; context: EngineCommandContext; characterId: string; spellId: string; prepared: boolean }
  | { kind: "entity.create_feature"; context: EngineCommandContext; characterId: string; input: FeatureInput }
  | { kind: "entity.update_feature"; context: EngineCommandContext; characterId: string; featureId: string; input: FeatureInput }
  | { kind: "entity.delete_feature"; context: EngineCommandContext; characterId: string; featureId: string }
  | { kind: "entity.sync_resources"; context: EngineCommandContext; characterId: string; resources: ResourceSyncInput[] }
  | { kind: "entity.recover_resources"; context: EngineCommandContext; characterId: string; trigger: EntityRecoveryTrigger }
  | { kind: "entity.assign_template"; context: EngineCommandContext; characterId: string; input: CharacterTemplateAssignmentInput }
  | { kind: "entity.remove_template_assignment"; context: EngineCommandContext; characterId: string; assignmentId: string }
  | { kind: "entity.set_source_suppressed"; context: EngineCommandContext; characterId: string; sourceId: string; suppressed: boolean }

export type EntityMutation = {
  kind: ShapoklyakCommand["kind"]
  characterIds: string[]
  before?: CharacterEntity | null
  after?: CharacterEntity | null
  details?: Record<string, unknown>
  requiresResolution: boolean
}

export interface ShapoklyakStorage {
  listCampaignEntities(campaignId: string): Promise<CharacterEntity[]>
  getEntity(characterId: string): Promise<CharacterEntity | null>
  execute(command: ShapoklyakCommand): Promise<EntityMutation>
}
