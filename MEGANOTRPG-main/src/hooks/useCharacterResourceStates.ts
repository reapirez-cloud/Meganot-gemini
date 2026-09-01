import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"
import { useAuth } from "../context/AuthContext.tsx"
import { useCharacters } from "../context/CharacterContext.tsx"
import { createEngineCommandContext } from "../engine-contracts/index.ts"
import { shapoklyak } from "../entity-engine/runtime.ts"
import { clearCharacterResourceState, registerCharacterResourceState } from "../lib/resourceRuntime.ts"
import { supabase } from "../lib/supabase.ts"
import { oracle } from "../oracle-engine/runtime.ts"
import type { CharacterResourceStateRow, ResourceSyncInput } from "../types/characterResources.ts"

export function useCharacterResourceStates(characterId: string | null) {
  const { user } = useAuth()
  const { campaignId, canManage } = useCharacters()
  const [rows, setRows] = useState<CharacterResourceStateRow[]>([])
  const [loading, setLoading] = useState(Boolean(characterId))
  const [error, setError] = useState("")
  const [revision, setRevision] = useState(0)
  const loadTokenRef = useRef(0)
  const activeLoadRef = useRef<{ characterId: string; promise: Promise<void> } | null>(null)

  const load = useCallback(async () => {
    if (!characterId) {
      loadTokenRef.current += 1
      activeLoadRef.current = null
      setRows([]); setLoading(false); setError("")
      return
    }

    const active = activeLoadRef.current
    if (active?.characterId === characterId) return active.promise

    const token = ++loadTokenRef.current
    setLoading(true); setError("")
    const promise = (async () => {
      const { data, error: queryError } = await supabase.from("character_resource_states").select("character_id,state_key,current,max_snapshot,label,recharge,updated_by,created_at,updated_at").eq("character_id", characterId).order("state_key")
      if (token !== loadTokenRef.current) return
      if (queryError) { setError(queryError.message); setLoading(false); return }
      setRows((data || []) as CharacterResourceStateRow[]); setLoading(false)
    })()
    activeLoadRef.current = { characterId, promise }
    try {
      await promise
    } finally {
      if (activeLoadRef.current?.promise === promise) activeLoadRef.current = null
    }
  }, [characterId])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) void load() })
    if (!characterId) return () => { cancelled = true }
    let channel: RealtimeChannel | null = supabase.channel(`character-resources-${characterId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_resource_states", filter: `character_id=eq.${characterId}` }, () => void load())
      .subscribe()
    return () => {
      cancelled = true
      loadTokenRef.current += 1
      activeLoadRef.current = null
      if (channel) { void supabase.removeChannel(channel); channel = null }
      clearCharacterResourceState(characterId)
    }
  }, [characterId, load])

  const state = useMemo(() => Object.fromEntries(rows.map((row) => [row.state_key, { current: row.current }])), [rows])
  useEffect(() => {
    if (!characterId) return
    registerCharacterResourceState(characterId, state)
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) setRevision((value) => value + 1) })
    return () => { cancelled = true }
  }, [characterId, state])

  const sync = useCallback(async (resources: ResourceSyncInput[]) => {
    if (!characterId || !resources.length) return { ok: true as const }
    const context = createEngineCommandContext({
      campaignId,
      requestedBy: user.id,
      authority: canManage ? "gm" : "player",
      actorCharacterId: characterId,
    })
    try {
      if (canManage) await oracle.characters.syncResources(context, characterId, resources)
      else await shapoklyak.execute({ kind: "entity.sync_resources", context, characterId, resources })
      // Same-client reads do not wait on Realtime. load() is coalesced, so a
      // simultaneous Realtime hint reuses this request instead of doubling it.
      await load()
      return { ok: true as const }
    } catch (reason) {
      return { ok: false as const, error: reason instanceof Error ? reason.message : "Не удалось синхронизировать persistent-ресурсы." }
    }
  }, [campaignId, canManage, characterId, load, user.id])

  return { rows, state, loading, error, revision, reload: load, sync }
}
