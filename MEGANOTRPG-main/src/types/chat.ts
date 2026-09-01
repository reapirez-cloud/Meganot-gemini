export type RoomCategory = "game" | "flood"
export type RoomType = "character" | "scene" | "flood"
export type RoomState = "open" | "gm_only" | "closed"
export type SceneState = "active" | "closed"

export type ChatRoom = {
  id: string
  slug: string
  title: string
  category: RoomCategory
  room_type: RoomType
  position: number
  avatar_url: string | null
  character_id: string | null
  character_life_state: "alive" | "dead" | null
  open_to_campaign: boolean
  is_read_only: boolean
  room_state: RoomState
  campaign_can_write: boolean
  location_id: string | null
  campaign_day: number
  day_period: "dawn" | "morning" | "day" | "late_day" | "evening" | "night" | "deep_night"
  scene_state: SceneState
  is_own_character_room: boolean
  preview: string
  time: string
  last_message_id: number | null
  unread_count: number
}

export type ChatRoomMember = {
  room_id: string
  user_id: string
  can_read: boolean
  can_write: boolean
  created_at?: string
  updated_at?: string
}

export type ChatEventKind = "roll" | "action" | "spell"
export type ChatEventPayload = Record<string, unknown>

export type ChatMessage = {
  id: number
  room_id: string
  user_id: string | null
  client_id: string
  character_id: string | null
  author_name: string
  author_avatar_url: string | null
  body: string
  created_at: string
  edited_at: string | null
  attachment_url: string | null
  attachment_kind: "image" | null
  event_kind: ChatEventKind | null
  event_payload: ChatEventPayload | null
}
