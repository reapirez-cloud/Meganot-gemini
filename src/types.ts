import type { AbilityKey, SkillKey } from "@meganotrpg/character-engine/types.ts"

export type ActiveTab =
  | "sheet"
  | "roller"
  | "actions"
  | "voss"
  | "spells"
  | "engines"
  | "tests"
  | "patch"

export interface RollLogEntry {
  id: string
  timestamp: string
  title: string
  formula: string
  rollMode: "normal" | "advantage" | "disadvantage"
  diceResults: number[]
  droppedDice?: number[]
  keptDice?: number[]
  modifier: number
  total: number
  isCriticalSuccess?: boolean
  isCriticalFumble?: boolean
  detail?: string
  source?: string
}

export interface SpellItem {
  id: string
  slug: string
  nameRu: string
  nameEn: string
  level: number
  school: string
  castingTime: string
  range: string
  components: string
  duration: string
  concentration: boolean
  ritual: boolean
  description: string
  upcast?: string
  vossComment?: string
}

export interface EngineCardInfo {
  code: string
  name: string
  title: string
  ownerRole: string
  responsibility: string
  contractBoundary: string
  status: "active" | "production" | "enforced"
  color: string
}
