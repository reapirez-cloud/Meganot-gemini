// INTERNAL AI/DEV CONTRACT: before changing template/choice semantics, read ./AGENTS.md.
// Do not add source-specific choice runtimes for feats/classes; extend the generic CE contract first.
import type { StoredMechanics } from "../types/characterMechanics.ts"

export type RuleTemplateKind = "race" | "subrace" | "class" | "subclass"
export type RuleChoiceTarget = "language" | "proficiency" | "sense" | "trait" | "spell"
export type RuleTemplateSourceKind = "official" | "third_party" | "custom"
export type RuleChoiceSelectionMode = "manager" | "player_once"
export type RuleChoiceRefreshPolicy = "long_rest"

export type RuleChoiceRequirement = {
  /** Another persistent choice in the same assignment. */
  key: string
  /** This choice is active only while the parent choice contains this option. */
  option: string
}

export type RuleChoiceDefinition = {
  key: string
  label: string
  target: RuleChoiceTarget
  options: string[]
  options_query?: string
  count?: number
  /** The number of persistent selections allowed once source.level reaches each threshold. */
  count_by_level?: Record<string, number>
  /** Minimum source.level for an option to be selectable/emitted. */
  option_unlock_level?: Record<string, number>
  /** Human labels for mechanically stable option keys such as skill:nature. */
  option_labels?: Record<string, string>
  /** Optional dependency on another persistent choice in this template assignment. */
  requires_choice?: RuleChoiceRequirement
  /**
   * Who resolves this choice. Existing definitions default to manager.
   * player_once choices are offered to the assigned player and become append-only
   * after confirmation; a later count increase may request only the new slots.
   */
  selection_mode?: RuleChoiceSelectionMode
  /**
   * Explicit exception to player_once immutability. A long_rest choice may be
   * fully replaced only while the server-authoritative post-rest preparation
   * session is open. Ordinary player chat closes that session.
   */
  refresh?: RuleChoiceRefreshPolicy
  /** Extra CE mechanics applied only when this option is selected. */
  option_mechanics?: Record<string, StoredMechanics>
  /**
   * Mechanics unlocked later by the same persistent choice. This avoids asking
   * for the same land/style/pact choice again every time it gains a new tier.
   */
  option_mechanics_by_level?: Record<string, Record<string, StoredMechanics>>
}

export type RuleTemplate = {
  id: string
  campaign_id: string
  kind: RuleTemplateKind
  slug: string
  name: string
  description: string
  version: number
  mechanics: StoredMechanics
  choices: RuleChoiceDefinition[]
  parent_template_id?: string | null
  unlock_level?: number | null
  /** Stable identity across catalog revisions, e.g. class:druid. */
  catalog_key?: string | null
  /** Revision is pinned by assignment because assignments point at a concrete template id. */
  catalog_revision?: string | null
  source_kind?: RuleTemplateSourceKind | null
  source_label?: string | null
  is_builtin?: boolean
  /** Short rules-first explanation, deliberately separate from authored prose. */
  mechanical_summary?: string
  /** Original narrator prose. Never used by Character Engine. */
  author_description?: string
  author_comment?: string
  /** Structured catalog metadata: edition policy, spellcasting profile, feature overrides, etc. */
  rules_meta?: Record<string, unknown>
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export type RuleTemplateLevel = {
  id: string
  template_id: string
  level: number
  mechanics: StoredMechanics
  choices: RuleChoiceDefinition[]
}

export type CharacterTemplateAssignment = {
  id: string
  character_id: string
  template_id: string
  template_level: number | null
  selected_choices: Record<string, string | string[]>
  assigned_at: string
  updated_at: string
}

export type CharacterTemplateBundle = {
  assignment: CharacterTemplateAssignment
  template: RuleTemplate
  levels: RuleTemplateLevel[]
}
