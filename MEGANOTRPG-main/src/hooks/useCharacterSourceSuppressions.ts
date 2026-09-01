import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"
import { createEngineCommandContext } from "../engine-contracts/index.ts"
import { supabase } from "../lib/supabase.ts"
import { oracle } from "../oracle-engine/runtime.ts"
import type { CharacterSourceSuppressionRow } from "../types/characterSuppressions.ts"

let suppressionSubscriberSequence = 0

export function useCharacterSourceSuppressions(characterId: string | null) {
  const [rows, setRows] = useState<CharacterSourceSuppressionRow[]>([])
  const [loading, setLoading] = useState(Boolean(characterId))
  const [error, setError] = useState("")
  const [revision, setRevision] = useState(0)
  const subscriberIdRef = useRef(++suppressionSubscriberSequence)

  const load = useCallback(async () => {
    if (!characterId) { setRows([]); setLoading(false); setError(""); return }
    setLoading(true); setError("")
    const { data, error: queryError } = await supabase
      .from("character_source_suppressions")
      .select("character_id,source_id,disabled_by,created_at,updated_at")
      .eq("character_id", characterId)
      .order("source_id")
    if (queryError) { setError(queryError.message); setLoading(false); return }
    setRows((data || []) as CharacterSourceSuppressionRow[])
    setLoading(false)
  }, [characterId])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) void load() })
    if (!characterId) return () => { cancelled = true }
    const topic = `character-suppressions-${characterId}-${subscriberIdRef.current}`
    let channel: RealtimeChannel | null = supabase.channel(topic)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_source_suppressions", filter: `character_id=eq.${characterId}` }, () => void load())
      .subscribe()
    return () => {
      cancelled = true
      if (channel) { void supabase.removeChannel(channel); channel = null }
    }
  }, [characterId, load])

  const sourceIds = useMemo(() => new Set(rows.map((row) => row.source_id)), [rows])
  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) setRevision((value) => value + 1) })
    return () => { cancelled = true }
  }, [sourceIds])

  const setSuppressed = useCallback(async (sourceId: string, suppressed: boolean) => {
    if (!characterId || !sourceId.trim()) return { ok: false as const, error: "Источник не указан." }
    const [{ data: authData, error: authError }, { data: character, error: characterError }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("characters").select("campaign_id").eq("id", characterId).maybeSingle(),
    ])
    if (authError || !authData.user) return { ok: false as const, error: authError?.message || "Нужна авторизация." }
    if (characterError || !character?.campaign_id) return { ok: false as const, error: characterError?.message || "Кампания персонажа не найдена." }
    try {
      await oracle.characters.setSourceSuppressed(
        createEngineCommandContext({ campaignId: String(character.campaign_id), requestedBy: authData.user.id, authority: "gm", actorCharacterId: characterId }),
        characterId,
        sourceId,
        suppressed,
      )
    } catch (reason) {
      return { ok: false as const, error: reason instanceof Error ? reason.message : "Oracle не смог изменить источник персонажа." }
    }
    await load()
    return { ok: true as const }
  }, [characterId, load])

  return { rows, sourceIds, loading, error, revision, reload: load, setSuppressed }
}
