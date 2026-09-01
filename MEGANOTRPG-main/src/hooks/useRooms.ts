import { useCallback, useEffect, useState } from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"
import { useCharacters } from "../context/CharacterContext"
import { deleteCampaignMediaObjects } from "../lib/mediaUpload"
import { supabase } from "../lib/supabase"
import type { ChatRoom, RoomState, RoomType } from "../types/chat"
import type { DayPeriod } from "../world-state/types"

type Result = { ok: boolean; error?: string; id?: string }

type RoomRpcRow = {
  id: string
  slug: string
  title: string
  category: string
  room_type: string
  room_position: number
  avatar_url: string | null
  character_id: string | null
  character_life_state: string | null
  open_to_campaign: boolean
  is_read_only: boolean
  room_state: string
  campaign_can_write: boolean
  location_id: string | null
  campaign_day: number
  day_period: string
  scene_state: string
  is_own_character_room: boolean
  preview: string
  last_message_at: string | null
  last_message_id: number | null
  unread_count: number
}

function formatTime(value?: string | null) {
  if (!value) return ""
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(value))
}

function normalizeRoomType(value: string, category: string): RoomType {
  if (value === "character" || value === "scene" || value === "flood") return value
  return category === "flood" ? "flood" : "scene"
}

function normalizeRoomState(value: string): RoomState {
  return value === "gm_only" || value === "closed" ? value : "open"
}

function normalizePeriod(value: string): DayPeriod {
  if (["dawn", "morning", "day", "late_day", "evening", "night", "deep_night"].includes(value)) return value as DayPeriod
  return "day"
}

export function useRooms() {
  const { campaignId, campaignTitle } = useCharacters()
  const [rooms, setRooms] = useState<ChatRoom[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadRooms = useCallback(async (silent = false) => {
    if (!campaignId) { setRooms([]); setLoading(false); return }
    if (!silent) setLoading(true)
    setError(null)

    const { data, error: roomsError } = await supabase.rpc("get_campaign_chat_rooms", { p_campaign_id: campaignId })
    if (roomsError) { if (!silent) setLoading(false); setError(roomsError.message); return }

    const hydrated = ((data || []) as RoomRpcRow[]).map((room) => ({
      id: room.id,
      slug: room.slug,
      title: room.title,
      category: room.category === "flood" ? "flood" : "game",
      room_type: normalizeRoomType(room.room_type, room.category),
      position: room.room_position,
      avatar_url: room.avatar_url || null,
      character_id: room.character_id || null,
      character_life_state: room.character_life_state === "dead" ? "dead" : room.character_life_state === "alive" ? "alive" : null,
      open_to_campaign: Boolean(room.open_to_campaign),
      is_read_only: Boolean(room.is_read_only),
      room_state: normalizeRoomState(room.room_state),
      campaign_can_write: Boolean(room.campaign_can_write),
      location_id: room.location_id || null,
      campaign_day: Number(room.campaign_day || 1),
      day_period: normalizePeriod(room.day_period),
      scene_state: room.scene_state === "closed" ? "closed" : "active",
      is_own_character_room: Boolean(room.is_own_character_room),
      preview: room.preview,
      time: formatTime(room.last_message_at),
      last_message_id: room.last_message_id,
      unread_count: room.unread_count,
    })) satisfies ChatRoom[]

    setRooms(hydrated)
    setLoading(false)
  }, [campaignId])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) void loadRooms() })
    if (!campaignId) return () => { cancelled = true }
    let refreshTimer: number | null = null
    const refreshSoon = () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => void loadRooms(true), 120)
    }
    let channel: RealtimeChannel | null = supabase
      .channel(`campaign-rooms-${campaignId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_rooms", filter: `campaign_id=eq.${campaignId}` }, refreshSoon)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, refreshSoon)
      .on("postgres_changes", { event: "*", schema: "public", table: "characters", filter: `campaign_id=eq.${campaignId}` }, refreshSoon)
      .on("postgres_changes", { event: "*", schema: "public", table: "scene_participants" }, refreshSoon)
      .subscribe()
    return () => {
      cancelled = true
      if (refreshTimer !== null) window.clearTimeout(refreshTimer)
      if (channel) { void supabase.removeChannel(channel); channel = null }
    }
  }, [campaignId, loadRooms])

  const createSceneRoom = useCallback(async (title: string): Promise<Result> => {
    const cleaned = title.trim()
    if (!campaignId) return { ok: false, error: "Кампания ещё не загружена." }
    if (!cleaned) return { ok: false, error: "Укажи название сцены." }
    const { data, error: createError } = await supabase.rpc("create_campaign_chat_room", { p_campaign_id: campaignId, p_title: cleaned })
    if (createError || !data) return { ok: false, error: createError?.message || "Не удалось создать сцену." }
    await loadRooms(true)
    return { ok: true, id: String(data) }
  }, [campaignId, loadRooms])

  const renameRoom = useCallback(async (roomId: string, title: string): Promise<Result> => {
    const cleaned = title.trim()
    if (!cleaned) return { ok: false, error: "Название не может быть пустым." }
    const { error: updateError } = await supabase.from("chat_rooms").update({ title: cleaned }).eq("id", roomId)
    if (updateError) return { ok: false, error: updateError.message }
    await loadRooms(true); return { ok: true }
  }, [loadRooms])

  const setRoomAvatar = useCallback(async (roomId: string, avatarUrl: string | null): Promise<Result> => {
    const { error: updateError } = await supabase.from("chat_rooms").update({ avatar_url: avatarUrl }).eq("id", roomId)
    if (updateError) return { ok: false, error: updateError.message }
    await loadRooms(true); return { ok: true }
  }, [loadRooms])

  const setRoomState = useCallback(async (roomId: string, state: RoomState): Promise<Result> => {
    const { error: updateError } = await supabase.rpc("set_chat_room_state", { p_room_id: roomId, p_state: state })
    if (updateError) return { ok: false, error: updateError.message }
    await loadRooms(true); return { ok: true }
  }, [loadRooms])

  const setCampaignAccess = useCallback(async (roomId: string, canRead: boolean, canWrite: boolean): Promise<Result> => {
    const { error: updateError } = await supabase.rpc("set_chat_room_campaign_access", { p_room_id: roomId, p_can_read: canRead, p_can_write: canWrite })
    if (updateError) return { ok: false, error: updateError.message }
    await loadRooms(true); return { ok: true }
  }, [loadRooms])

  const deleteRoom = useCallback(async (roomId: string): Promise<Result> => {
    const room = rooms.find((item) => item.id === roomId)
    if (!room) return { ok: false, error: "Чат не найден." }
    if (room.room_type === "flood") return { ok: false, error: "Флуд удалить нельзя." }
    if (room.room_type === "character") return { ok: false, error: "Персональный чат удаляется только вместе с персонажем." }

    const { data: rows, error: attachmentsError } = await supabase.from("chat_messages").select("attachment_url").eq("room_id", roomId).not("attachment_url", "is", null)
    if (attachmentsError) return { ok: false, error: attachmentsError.message }
    const { error: deleteError } = await supabase.from("chat_rooms").delete().eq("id", roomId)
    if (deleteError) return { ok: false, error: deleteError.message }
    setRooms((current) => current.filter((item) => item.id !== roomId))
    void deleteCampaignMediaObjects((rows || []).map((row) => row.attachment_url as string | null))
    return { ok: true }
  }, [rooms])

  return {
    rooms, campaignId, campaignTitle, loading, error,
    reload: () => loadRooms(false),
    createSceneRoom, createGameRoom: createSceneRoom,
    renameRoom, setRoomAvatar, setRoomState, setCampaignAccess, deleteRoom,
  }
}
