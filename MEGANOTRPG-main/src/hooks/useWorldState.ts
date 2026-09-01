import { useCallback, useEffect, useMemo, useState } from "react"
import { useAuth } from "../context/AuthContext"
import { useCharacters } from "../context/CharacterContext"
import { createEngineCommandContext } from "../engine-contracts/index.ts"
import { larisa } from "../location-engine/runtime.ts"
import { supabase } from "../lib/supabase"
import { oracle } from "../oracle-engine/runtime.ts"
import { resolveNearbyCharacters, resolveOtherTimeCharacters, resolveScenesAtPosition } from "../world-state/resolver.ts"
import type { CharacterWorldState, DayPeriod, LocationSummary, SceneWorldState } from "../world-state/types.ts"

export function useWorldState(subjectCharacterId?: string | null) {
  const { user } = useAuth()
  const { campaignId, activeCharacter, characters, canManage } = useCharacters()
  const subjectId = subjectCharacterId ?? activeCharacter?.id ?? null
  const [states, setStates] = useState<CharacterWorldState[]>([])
  const [locations, setLocations] = useState<LocationSummary[]>([])
  const [scenes, setScenes] = useState<SceneWorldState[]>([])
  const [sceneParticipants, setSceneParticipants] = useState<Array<{ room_id: string; character_id: string }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!campaignId) return
    setLoading(true)
    try {
      const snapshot = await larisa.loadCampaignSnapshot(campaignId)
      setError(null)
      setStates(snapshot.characterStates)
      setLocations(snapshot.locations)
      setScenes(snapshot.scenes)
      setSceneParticipants(snapshot.sceneParticipants)
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось загрузить состояние мира.") }
    setLoading(false)
  }, [campaignId])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) void load() })
    return () => { cancelled = true }
  }, [load])

  useEffect(() => {
    if (!campaignId) return
    const channel = supabase.channel(`world-state:${campaignId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_world_state", filter: `campaign_id=eq.${campaignId}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "locations", filter: `campaign_id=eq.${campaignId}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_rooms", filter: `campaign_id=eq.${campaignId}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "character_npc_discoveries" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "character_location_discoveries" }, () => void load())
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [campaignId, load])

  const currentState = useMemo(() => states.find((state) => state.character_id === subjectId) || null, [states, subjectId])
  const currentLocation = useMemo(() => locations.find((location) => location.id === currentState?.location_id) || null, [locations, currentState])
  const presenceCharacters = useMemo(() => characters.map((character) => ({
    id: character.id,
    name: character.name,
    avatar_url: character.avatar_url,
    character_type: character.character_type,
    life_state: "alive" as const,
  })), [characters])
  const nearby = useMemo(() => subjectId ? resolveNearbyCharacters(subjectId, states, presenceCharacters) : [], [presenceCharacters, states, subjectId])
  const otherTimes = useMemo(() => subjectId ? resolveOtherTimeCharacters(subjectId, states, presenceCharacters) : [], [presenceCharacters, states, subjectId])
  const activeScenes = useMemo(() => resolveScenesAtPosition(currentState, scenes), [currentState, scenes])
  const gmContext = useCallback((roomId?: string) => createEngineCommandContext({
    campaignId,
    requestedBy: user.id,
    authority: "gm",
    ...(roomId ? { roomId } : {}),
  }), [campaignId, user.id])

  const setCharacterPosition = useCallback(async (characterId: string, locationId: string | null, campaignDay: number, dayPeriod: DayPeriod) => {
    if (!canManage) return { ok: false, error: "Только ГМ может менять позицию." }
    try {
      await oracle.world.moveCharacter(gmContext(), characterId, locationId, campaignDay, dayPeriod)
    } catch (reason) { return { ok: false, error: reason instanceof Error ? reason.message : "Не удалось переместить персонажа." } }
    await load(); return { ok: true }
  }, [canManage, gmContext, load])

  const setScenePosition = useCallback(async (roomId: string, locationId: string | null, campaignDay: number, dayPeriod: DayPeriod) => {
    if (!canManage) return { ok: false, error: "Только ГМ может менять позицию сцены." }
    try {
      await oracle.world.setScenePosition(gmContext(roomId), roomId, locationId, campaignDay, dayPeriod)
    } catch (reason) { return { ok: false, error: reason instanceof Error ? reason.message : "Не удалось изменить сцену." } }
    await load(); return { ok: true }
  }, [canManage, gmContext, load])

  const setParticipants = useCallback(async (roomId: string, characterIds: string[]) => {
    if (!canManage) return { ok: false, error: "Только ГМ может менять участников сцены." }
    try {
      await oracle.world.setSceneParticipants(gmContext(roomId), roomId, characterIds)
    } catch (reason) { return { ok: false, error: reason instanceof Error ? reason.message : "Не удалось изменить участников сцены." } }
    await load(); return { ok: true }
  }, [canManage, gmContext, load])

  const syncScene = useCallback(async (roomId: string, syncLocation = true, syncTime = true) => {
    if (!canManage) return { ok: false, error: "Только ГМ может синхронизировать сцену.", count: 0 }
    let count = 0
    try {
      const result = await oracle.world.syncSceneParticipants(gmContext(roomId), roomId, { syncLocation, syncTime })
      count = Number(result.value.details.count || 0)
    } catch (reason) { return { ok: false, error: reason instanceof Error ? reason.message : "Не удалось синхронизировать сцену.", count: 0 } }
    await load(); return { ok: true, count }
  }, [canManage, gmContext, load])

  return { loading, error, states, locations, scenes, sceneParticipants, currentState, currentLocation, nearby, otherTimes, activeScenes, refresh: load, setCharacterPosition, setScenePosition, setParticipants, syncScene }
}
