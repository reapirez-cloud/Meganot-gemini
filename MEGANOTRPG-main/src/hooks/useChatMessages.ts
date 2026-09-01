import { useCallback, useEffect, useState } from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"
import { supabase } from "../lib/supabase.ts"
import { deleteCampaignMediaObject } from "../lib/mediaUpload.ts"
import { genaSession } from "../game-engine/runtime.ts"
import type { ChatEventKind, ChatEventPayload, ChatMessage } from "../types/chat.ts"
import type { ResourceCostInput } from "../types/characterResources.ts"

type RealtimeState = "connecting" | "live" | "offline"
type Result = { ok: boolean; error?: string }
export type ChatRollRequest = {
  characterId: string | null
  label: string
  kind: string
  modifier?: number
  rollD20?: boolean
  diceCount?: number
  diceSides?: number
  diceModifier?: number
  resourceCosts?: ResourceCostInput[]
}
export type ChatTemplateActionRequest = {
  characterId: string
  mechanicId: string
  optionKey?: string
  label: string
  payload?: ChatEventPayload
}
export type ChatTemplateRollRequest = ChatTemplateActionRequest & {
  kind: string
  modifier?: number
  rollD20?: boolean
  diceCount?: number
  diceSides?: number
  diceModifier?: number
}
export type ChatTemplateSpellRequest = {
  characterId: string
  mechanicId: string
  methodKey: string
  optionKey?: string
  label: string
  payload?: ChatEventPayload
}
export type ChatInventoryUseRequest = Omit<ChatRollRequest, "characterId"> & {
  characterId: string
  itemId: string
  itemAmount?: number
  payload?: ChatEventPayload
}

// GENA gateway owns send_chat_roll_v3, send_chat_template_roll_v1,
// send_chat_template_action_v1 and send_chat_template_spell_v1. Keeping the
// names here makes the migration boundary discoverable without letting this UI
// hook become the RPC owner again.

const fields = "id, room_id, user_id, client_id, character_id, author_name, author_avatar_url, body, created_at, edited_at, attachment_url, attachment_kind, event_kind, event_payload"
const PAGE_SIZE = 50

export function useChatMessages(roomId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [realtime, setRealtime] = useState<RealtimeState>("connecting")
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasOlder, setHasOlder] = useState(false)

  const markRead = useCallback(async (messageId?: number | null) => {
    await supabase.rpc("mark_chat_read", { p_room_id: roomId, p_message_id: messageId ?? null })
  }, [roomId])

  const append = useCallback((inserted: ChatMessage) => {
    setMessages((current) => current.some((message) => message.id === inserted.id) ? current : [...current, inserted])
    void markRead(inserted.id)
  }, [markRead])

  const loadMessages = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: requestError } = await supabase.from("chat_messages").select(fields).eq("room_id", roomId).order("id", { ascending: false }).limit(PAGE_SIZE + 1)
    if (requestError) {
      setError(requestError.message)
      setLoading(false)
      return
    }
    const rows = (data || []) as ChatMessage[]
    setHasOlder(rows.length > PAGE_SIZE)
    const visible = rows.slice(0, PAGE_SIZE).reverse()
    setMessages(visible)
    void markRead(visible[visible.length - 1]?.id)
    setLoading(false)
  }, [markRead, roomId])

  const loadOlder = useCallback(async () => {
    const oldestId = messages[0]?.id
    if (!oldestId || loadingOlder || !hasOlder) return 0
    setLoadingOlder(true)
    const { data, error: requestError } = await supabase.from("chat_messages").select(fields).eq("room_id", roomId).lt("id", oldestId).order("id", { ascending: false }).limit(PAGE_SIZE + 1)
    setLoadingOlder(false)
    if (requestError) {
      setError(requestError.message)
      return 0
    }
    const rows = (data || []) as ChatMessage[]
    const older = rows.slice(0, PAGE_SIZE).reverse()
    setHasOlder(rows.length > PAGE_SIZE)
    setMessages((current) => {
      const ids = new Set(current.map((message) => message.id))
      return [...older.filter((message) => !ids.has(message.id)), ...current]
    })
    return older.length
  }, [hasOlder, loadingOlder, messages, roomId])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) void loadMessages() })
    let channel: RealtimeChannel | null = supabase.channel(`chat-room-${roomId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `room_id=eq.${roomId}` }, (payload) => {
        const incoming = payload.new as ChatMessage
        setMessages((current) => current.some((message) => message.id === incoming.id) ? current : [...current, incoming])
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_messages", filter: `room_id=eq.${roomId}` }, (payload) => {
        const incoming = payload.new as ChatMessage
        setMessages((current) => current.map((message) => message.id === incoming.id ? incoming : message))
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "chat_messages" }, (payload) => {
        const removed = payload.old as Partial<ChatMessage>
        if (removed.id != null) setMessages((current) => current.filter((message) => message.id !== removed.id))
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtime("live")
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setRealtime("offline")
        else setRealtime("connecting")
      })
    return () => {
      cancelled = true
      if (channel) {
        void supabase.removeChannel(channel)
        channel = null
      }
    }
  }, [loadMessages, roomId])

  const fetchInserted = useCallback(async (id: number) => {
    const { data, error: requestError } = await supabase.from("chat_messages").select(fields).eq("id", id).eq("room_id", roomId).single()
    if (requestError) {
      setError(requestError.message)
      return false
    }
    append(data as ChatMessage)
    return true
  }, [append, roomId])

  const runGenaCommand = useCallback(async (execute: () => Promise<number>): Promise<boolean> => {
    if (sending) return false
    setSending(true)
    setError(null)
    try {
      const id = await execute()
      setSending(false)
      return fetchInserted(id)
    } catch (reason) {
      setSending(false)
      setError(reason instanceof Error ? reason.message : "Не удалось выполнить игровую команду.")
      return false
    }
  }, [fetchInserted, sending])

  const sendMessage = useCallback(async (text: string, attachmentUrl: string | null = null, characterId: string | null = null) => {
    const body = text.trim()
    if ((!body && !attachmentUrl) || sending) return false
    setSending(true)
    setError(null)
    const { data, error: requestError } = await supabase.from("chat_messages").insert({
      room_id: roomId,
      character_id: characterId,
      body,
      attachment_url: attachmentUrl,
      attachment_kind: attachmentUrl ? "image" : null,
    }).select(fields).single()
    setSending(false)
    if (requestError) {
      if (attachmentUrl) void deleteCampaignMediaObject(attachmentUrl)
      setError(requestError.message)
      return false
    }
    append(data as ChatMessage)
    return true
  }, [append, roomId, sending])

  const sendRoll = useCallback(async (request: ChatRollRequest) => {
    return runGenaCommand(() => genaSession.sendRoll({ roomId, ...request }))
  }, [roomId, runGenaCommand])

  const sendTemplateRoll = useCallback(async (request: ChatTemplateRollRequest) => {
    return runGenaCommand(() => genaSession.sendTemplateRoll({ roomId, ...request }))
  }, [roomId, runGenaCommand])

  const sendEvent = useCallback(async (
    characterId: string | null,
    eventKind: Exclude<ChatEventKind, "roll">,
    label: string,
    payload: ChatEventPayload = {},
    resourceCosts: ResourceCostInput[] = [],
  ): Promise<boolean> => {
    return runGenaCommand(() => genaSession.sendEvent({ roomId, characterId, eventKind, label, payload, resourceCosts }))
  }, [roomId, runGenaCommand])

  const sendTemplateAction = useCallback(async (request: ChatTemplateActionRequest): Promise<boolean> => {
    return runGenaCommand(() => genaSession.sendTemplateAction({ roomId, ...request }))
  }, [roomId, runGenaCommand])

  const sendTemplateSpell = useCallback(async (request: ChatTemplateSpellRequest): Promise<boolean> => {
    return runGenaCommand(() => genaSession.sendTemplateSpell({ roomId, ...request }))
  }, [roomId, runGenaCommand])

  const useInventoryItem = useCallback(async (request: ChatInventoryUseRequest): Promise<boolean> => {
    return runGenaCommand(() => genaSession.useInventoryItem({ roomId, ...request }))
  }, [roomId, runGenaCommand])

  const editMessage = useCallback(async (messageId: number, text: string): Promise<Result> => {
    const body = text.trim()
    if (!body) return { ok: false, error: "Сообщение не может быть пустым." }
    const { error: requestError } = await supabase.rpc("edit_chat_message", { p_message_id: messageId, p_body: body })
    if (requestError) return { ok: false, error: requestError.message }
    const edited_at = new Date().toISOString()
    setMessages((current) => current.map((message) => message.id === messageId ? { ...message, body, edited_at } : message))
    return { ok: true }
  }, [])

  const deleteMessage = useCallback(async (messageId: number): Promise<Result> => {
    const target = messages.find((message) => message.id === messageId)
    const { error: requestError } = await supabase.rpc("delete_chat_message", { p_message_id: messageId })
    if (requestError) return { ok: false, error: requestError.message }
    setMessages((current) => current.filter((message) => message.id !== messageId))
    if (target?.attachment_url) void deleteCampaignMediaObject(target.attachment_url)
    return { ok: true }
  }, [messages])

  return {
    messages,
    loading,
    sending,
    error,
    realtime,
    loadingOlder,
    hasOlder,
    loadOlder,
    markRead,
    sendMessage,
    sendRoll,
    sendTemplateRoll,
    sendEvent,
    sendTemplateAction,
    sendTemplateSpell,
    useInventoryItem,
    editMessage,
    deleteMessage,
  }
}
