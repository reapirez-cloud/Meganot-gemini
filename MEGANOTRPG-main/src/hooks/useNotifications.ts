import { useCallback, useEffect, useRef, useState } from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"

import { supabase } from "../lib/supabase"
import type { AppNotification } from "../types/feed"

const fields =
  "id, campaign_id, recipient_user_id, actor_user_id, actor_character_id, feed_item_id, kind, body, created_at, read_at"

export function useNotifications(campaignId: string) {
  const [items, setItems] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const countRefreshTimerRef = useRef<number | null>(null)

  const refreshUnreadCount = useCallback(async () => {
    if (!campaignId) {
      setUnreadCount(0)
      return
    }

    const { count, error: countError } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .is("read_at", null)

    if (countError) {
      setError(countError.message)
      return
    }

    setUnreadCount(count || 0)
  }, [campaignId])

  const scheduleUnreadRefresh = useCallback(() => {
    if (countRefreshTimerRef.current !== null) {
      window.clearTimeout(countRefreshTimerRef.current)
    }
    countRefreshTimerRef.current = window.setTimeout(() => {
      countRefreshTimerRef.current = null
      void refreshUnreadCount()
    }, 160)
  }, [refreshUnreadCount])

  const load = useCallback(async () => {
    if (!campaignId) {
      setItems([])
      setUnreadCount(0)
      return
    }

    setLoading(true)
    const [itemsResult, countResult] = await Promise.all([
      supabase
        .from("notifications")
        .select(fields)
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false })
        .limit(40),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .is("read_at", null),
    ])
    setLoading(false)

    const loadError = itemsResult.error || countResult.error
    if (loadError) {
      setError(loadError.message)
      return
    }

    setError(null)
    setItems((itemsResult.data || []) as AppNotification[])
    setUnreadCount(countResult.count || 0)
  }, [campaignId])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) void load() })
    if (!campaignId) return () => { cancelled = true }

    let channel: RealtimeChannel | null = supabase
      .channel(`campaign-notifications-${campaignId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `campaign_id=eq.${campaignId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const incoming = payload.new as AppNotification
            setItems((current) =>
              [incoming, ...current.filter((item) => item.id !== incoming.id)]
                .sort((a, b) => b.created_at.localeCompare(a.created_at))
                .slice(0, 40),
            )
            if (!incoming.read_at) setUnreadCount((current) => current + 1)
            return
          }

          if (payload.eventType === "UPDATE") {
            const incoming = payload.new as AppNotification
            setItems((current) =>
              current.map((item) => item.id === incoming.id ? incoming : item),
            )
            scheduleUnreadRefresh()
            return
          }

          const removed = payload.old as Partial<AppNotification>
          if (!removed.id) return
          setItems((current) => current.filter((item) => item.id !== removed.id))
          scheduleUnreadRefresh()
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      if (countRefreshTimerRef.current !== null) {
        window.clearTimeout(countRefreshTimerRef.current)
        countRefreshTimerRef.current = null
      }
      if (channel) {
        void supabase.removeChannel(channel)
        channel = null
      }
    }
  }, [campaignId, load, scheduleUnreadRefresh])

  const markAllRead = useCallback(async () => {
    if (!campaignId) return
    const { error: markError } = await supabase.rpc("mark_notifications_read", {
      p_campaign_id: campaignId,
    })
    if (markError) {
      setError(markError.message)
      return
    }

    const now = new Date().toISOString()
    setUnreadCount(0)
    setItems((current) =>
      current.map((item) => ({ ...item, read_at: item.read_at || now })),
    )
  }, [campaignId])

  return { items, unreadCount, loading, error, refresh: load, markAllRead }
}
