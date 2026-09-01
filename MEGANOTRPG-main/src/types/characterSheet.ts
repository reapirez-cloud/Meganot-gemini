import type { StoredMechanics } from "./characterMechanics"

export type SkillRank = 0 | 1 | 2
export type InventoryCategory = "equipment" | "consumable" | "tool" | "book" | "trinket" | "quest" | "material" | "currency" | "container" | "other"
export type EquipmentSlot = "main_hand" | "off_hand" | "two_hands" | "head" | "neck" | "shoulders" | "chest" | "hands" | "wrists" | "waist" | "legs" | "feet" | "back" | "ring_left" | "ring_right" | "ammo" | "other"
export type ItemUsageMode = "none" | "quantity" | "charges"
export type SpellSlotState = { max: number; used: number }

export type CharacterSheet = {
  character_id: string; race: string; background: string; alignment: string; experience: number
  strength: number; dexterity: number; constitution: number; intelligence: number; wisdom: number; charisma: number
  armor_class: number; initiative_bonus: number; speed: number; proficiency_bonus: number
  max_hp: number; current_hp: number; temp_hp: number; hit_dice: string
  death_save_successes: number; death_save_failures: number; passive_perception: number
  saving_throw_proficiencies: string[]; skill_proficiencies: Record<string, SkillRank>
  proficiencies: string; languages: string; senses: string
  personality_traits: string; ideals: string; bonds: string; flaws: string; backstory: string; notes: string
  spellcasting_enabled: boolean; spell_change_unlocked: boolean; spellcasting_ability: string | null
  spell_save_dc: number | null; spell_attack_bonus: number | null; spell_slots: Record<string, SpellSlotState>
  created_at: string; updated_at: string
}

export type InventoryItem = {
  id: string; character_id: string; name: string; quantity: number; weight: number | null; equipped: boolean
  category: InventoryCategory; equipment_slot: EquipmentSlot | null; image_url: string | null; description: string
  /** Stable Chasovoy definition identity when this is an issued catalog item. */
  definition_id?: string | null; definition_revision?: number | null
  mechanics?: StoredMechanics
  /** Cheburashka-owned persistent use state. Older rows are normalized by its adapter. */
  usage_mode?: ItemUsageMode; charges_current?: number | null; charges_max?: number | null
  item_state?: Record<string, unknown>; version?: number
  sort_order: number; created_at: string; updated_at: string
}

export type CharacterSpell = {
  id: string; character_id: string
  /** Canonical spell_catalog identity. Database migration makes this non-null; optionality only keeps pre-migration preview fixtures compatible. */
  catalog_spell_id?: string | null
  name: string; spell_level: number; school: string; casting_time: string
  spell_range: string; duration: string; components: string; concentration: boolean; ritual: boolean; prepared: boolean
  cast_mode: "cantrip" | "slot"; slot_level: number | null; description: string; source: string
  /** Wizard 2024 durable selections. Missing values mean false for pre-migration fixtures. */
  wizard_spell_mastery?: boolean; wizard_signature_spell?: boolean
  sort_order: number; created_at: string; updated_at: string
}
export type CharacterSpellOption = CharacterSpell & { granted_by: string | null }

export type CharacterFeature = {
  id: string; character_id: string; kind: "feat" | "class_feature" | "racial_trait" | "feature" | "other"
  name: string; description: string; mechanics?: StoredMechanics; sort_order: number; created_at: string; updated_at: string
}

export type DiaryPost = { id: string; character_id: string; created_by: string; body: string; title: string; media_url: string | null; created_at: string; updated_at: string }
export type DiaryComment = { id: string; post_id: string; created_by: string; body: string; created_at: string }
export type CharacterArt = { id: string; campaign_id: string; uploaded_by: string | null; character_id: string | null; title: string; caption: string; image_url: string; created_at: string; updated_at: string }

export type InventoryInput = {
  name: string; quantity: number; weight: number | null; equipped: boolean; category: InventoryCategory
  equipment_slot: EquipmentSlot | null; image_url: string | null; description: string
  /** Keep the issued instance linked to the exact Chasovoy definition revision. */
  definition_id?: string | null; definition_revision?: number | null
  mechanics?: StoredMechanics
  usage_mode?: ItemUsageMode; charges_current?: number | null; charges_max?: number | null
  item_state?: Record<string, unknown>
}
export type SpellInput = {
  name: string; spell_level: number; school: string; casting_time: string; spell_range: string; duration: string
  components: string; concentration: boolean; ritual: boolean; prepared: boolean; cast_mode: "cantrip" | "slot"
  slot_level: number | null; description: string; source: string
}
export type FeatureInput = { kind: CharacterFeature["kind"]; name: string; description: string; mechanics?: StoredMechanics }
