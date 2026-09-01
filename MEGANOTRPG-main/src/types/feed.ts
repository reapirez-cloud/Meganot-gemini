export type FeedSource = "diary" | "art" | "achievement" | "update" | "moment"

export type FeedReaction = {
  id: string
  feed_item_id: string
  user_id: string
  character_id: string | null
  emoji: string
  created_at: string
}

export type FeedComment = {
  id: string
  feed_item_id: string
  user_id: string
  character_id: string | null
  body: string
  created_at: string
  updated_at: string
}

export type FeedItem = {
  id: string
  campaign_id: string
  source_type: FeedSource
  source_id: string | null
  created_by: string | null
  character_id: string | null
  title: string
  body: string
  media_url: string | null
  published_at: string
  updated_at: string
  reactions: FeedReaction[]
  comments: FeedComment[]
}

export type AppNotification = {
  id: string
  campaign_id: string
  recipient_user_id: string
  actor_user_id: string | null
  actor_character_id: string | null
  feed_item_id: string | null
  kind: "reaction" | "comment" | "achievement"
  body: string
  created_at: string
  read_at: string | null
}
