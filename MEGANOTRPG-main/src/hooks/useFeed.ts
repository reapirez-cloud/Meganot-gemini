import { useCallback, useEffect, useState } from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"

import { supabase } from "../lib/supabase"
import {
  deleteCampaignMediaObject,
  deleteCampaignMediaObjects,
} from "../lib/mediaUpload"
import {
  compareFeedOrder,
  feedCursorFilter,
  type FeedCursor,
} from "../lib/feedPagination"
import type { FeedItem } from "../types/feed"

const PAGE_SIZE = 12
const feedFields = `
  id, campaign_id, source_type, source_id, created_by, character_id,
  title, body, media_url, published_at, updated_at,
  reactions:feed_reactions(id, feed_item_id, user_id, character_id, emoji, created_at),
  comments:feed_comments(id, feed_item_id, user_id, character_id, body, created_at, updated_at)
`

type Result = { ok: boolean; error?: string }

export function useFeed(campaignId: string) {
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPage = useCallback(
    async (before?: FeedCursor) => {
      let query = supabase
        .from("feed_items")
        .select(feedFields)
        .eq("campaign_id", campaignId)
        .order("published_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(PAGE_SIZE + 1)

      if (before) query = query.or(feedCursorFilter(before))
      return query
    },
    [campaignId],
  )

  const fetchItem = useCallback(async (feedItemId: string) => {
    const { data, error: fetchError } = await supabase
      .from("feed_items")
      .select(feedFields)
      .eq("campaign_id", campaignId)
      .eq("id", feedItemId)
      .maybeSingle()

    if (fetchError) {
      setError(fetchError.message)
      return null
    }

    return (data || null) as FeedItem | null
  }, [campaignId])

  const refreshItem = useCallback(async (feedItemId: string, addIfMissing = false) => {
    const fresh = await fetchItem(feedItemId)
    if (!fresh) return

    setItems((current) => {
      const exists = current.some((item) => item.id === feedItemId)
      if (!exists && !addIfMissing) return current
      const next = exists
        ? current.map((item) => (item.id === feedItemId ? fresh : item))
        : [fresh, ...current]
      return next.sort(compareFeedOrder)
    })
  }, [fetchItem])

  const load = useCallback(async () => {
    if (!campaignId) return
    setLoading(true)
    setError(null)
    const { data, error: loadError } = await fetchPage()
    if (loadError) {
      setError(loadError.message)
      setLoading(false)
      return
    }
    const rows = (data || []) as FeedItem[]
    setHasMore(rows.length > PAGE_SIZE)
    setItems(rows.slice(0, PAGE_SIZE))
    setLoading(false)
  }, [campaignId, fetchPage])

  const refreshHead = useCallback(async () => {
    if (!campaignId) return
    const { data, error: loadError } = await fetchPage()
    if (loadError) {
      setError(loadError.message)
      return
    }

    const head = ((data || []) as FeedItem[]).slice(0, PAGE_SIZE)
    setItems((current) => {
      const byId = new Map(current.map((item) => [item.id, item]))
      for (const item of head) byId.set(item.id, item)
      return [...byId.values()].sort(compareFeedOrder)
    })
  }, [campaignId, fetchPage])

  const loadMore = useCallback(async () => {
    const last = items[items.length - 1]
    if (!last || loadingMore || !hasMore) return

    setLoadingMore(true)
    const { data, error: loadError } = await fetchPage({
      published_at: last.published_at,
      id: last.id,
    })
    setLoadingMore(false)

    if (loadError) {
      setError(loadError.message)
      return
    }

    const rows = (data || []) as FeedItem[]
    setHasMore(rows.length > PAGE_SIZE)
    const page = rows.slice(0, PAGE_SIZE)
    setItems((current) => {
      const known = new Set(current.map((item) => item.id))
      return [...current, ...page.filter((item) => !known.has(item.id))]
    })
  }, [fetchPage, hasMore, items, loadingMore])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) void load() })
    if (!campaignId) return () => { cancelled = true }

    let channel: RealtimeChannel | null = supabase
      .channel(`campaign-feed-${campaignId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "feed_items", filter: `campaign_id=eq.${campaignId}` },
        (payload) => {
          const next = payload.new as Partial<FeedItem>
          const previous = payload.old as Partial<FeedItem>
          const id = next.id || previous.id
          if (!id) return

          if (payload.eventType === "DELETE") {
            setItems((current) => current.filter((item) => item.id !== id))
            return
          }

          void refreshItem(id, payload.eventType === "INSERT")
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "feed_reactions", filter: `campaign_id=eq.${campaignId}` },
        (payload) => {
          const row = (payload.new && Object.keys(payload.new).length > 0
            ? payload.new
            : payload.old) as { feed_item_id?: string }
          if (row.feed_item_id) void refreshItem(row.feed_item_id)
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "feed_comments", filter: `campaign_id=eq.${campaignId}` },
        (payload) => {
          const row = (payload.new && Object.keys(payload.new).length > 0
            ? payload.new
            : payload.old) as { feed_item_id?: string }
          if (row.feed_item_id) void refreshItem(row.feed_item_id)
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      if (channel) {
        void supabase.removeChannel(channel)
        channel = null
      }
    }
  }, [campaignId, load, refreshItem])

  const createMoment = useCallback(
    async (body: string, mediaUrl: string | null): Promise<Result> => {
      const { error: createError } = await supabase.rpc("create_campaign_moment", {
        p_campaign_id: campaignId,
        p_body: body,
        p_media_url: mediaUrl,
      })
      if (createError) {
        if (mediaUrl) void deleteCampaignMediaObject(mediaUrl)
        return { ok: false, error: createError.message }
      }
      await refreshHead()
      return { ok: true }
    },
    [campaignId, refreshHead],
  )

  const toggleReaction = useCallback(
    async (feedItemId: string): Promise<Result> => {
      const { error: reactionError } = await supabase.rpc(
        "toggle_feed_reaction",
        { p_feed_item_id: feedItemId, p_emoji: "♥" },
      )
      if (reactionError) return { ok: false, error: reactionError.message }
      await refreshItem(feedItemId)
      return { ok: true }
    },
    [refreshItem],
  )

  const addComment = useCallback(
    async (feedItemId: string, body: string): Promise<Result> => {
      const { error: commentError } = await supabase.rpc("add_feed_comment", {
        p_feed_item_id: feedItemId,
        p_body: body,
      })
      if (commentError) return { ok: false, error: commentError.message }
      await refreshItem(feedItemId)
      return { ok: true }
    },
    [refreshItem],
  )

  const deleteComment = useCallback(
    async (commentId: string): Promise<Result> => {
      const target = items.find((item) => item.comments.some((comment) => comment.id === commentId))
      const { error: deleteError } = await supabase.rpc("delete_feed_comment", {
        p_comment_id: commentId,
      })
      if (deleteError) return { ok: false, error: deleteError.message }
      if (target) await refreshItem(target.id)
      return { ok: true }
    },
    [items, refreshItem],
  )

  const deleteItem = useCallback(
    async (feedItemId: string): Promise<Result> => {
      const target = items.find((item) => item.id === feedItemId)
      const mediaPaths: Array<string | null | undefined> = target?.media_url
        ? [target.media_url]
        : []

      if (target?.source_type === "art" && target.source_id) {
        const { data: pageRows, error: pageError } = await supabase
          .from("campaign_art_pages")
          .select("image_url")
          .eq("art_item_id", target.source_id)

        if (pageError) {
          console.warn("Could not collect comic media before deletion:", pageError.message)
        } else {
          mediaPaths.push(...(pageRows || []).map((page) => page.image_url as string | null))
        }
      }

      const { error: deleteError } = await supabase.rpc("delete_feed_item", {
        p_feed_item_id: feedItemId,
      })
      if (deleteError) return { ok: false, error: deleteError.message }

      setItems((current) => current.filter((item) => item.id !== feedItemId))
      void deleteCampaignMediaObjects(mediaPaths)
      return { ok: true }
    },
    [items],
  )

  return {
    items,
    loading,
    loadingMore,
    hasMore,
    error,
    refresh: load,
    loadMore,
    createMoment,
    toggleReaction,
    addComment,
    deleteComment,
    deleteItem,
  }
}
