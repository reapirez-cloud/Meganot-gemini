export type DayPeriod = "dawn" | "morning" | "day" | "late_day" | "evening" | "night" | "deep_night"

export type WorldPosition = {
  location_id: string | null
  campaign_day: number
  day_period: DayPeriod
}

export type CharacterWorldState = WorldPosition & {
  character_id: string
  campaign_id: string
  updated_at: string
  updated_by?: string | null
}

export type SceneWorldState = WorldPosition & {
  room_id: string
  title: string
  scene_state: "active" | "closed"
  room_state: "open" | "gm_only" | "closed"
}

export type LocationSummary = {
  id: string
  name: string
  parent_location_id: string | null
  image_url: string | null
  visibility_mode: "always" | "discover" | "private"
  lifecycle_state: "active" | "archived"
}

export type PresenceCharacter = {
  id: string
  name: string
  avatar_url: string | null
  character_type: "pc" | "npc"
  life_state: "alive" | "dead"
  state: CharacterWorldState
}
