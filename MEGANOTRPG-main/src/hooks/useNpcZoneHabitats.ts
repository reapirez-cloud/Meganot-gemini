import { useCallback, useEffect, useMemo, useState } from "react"
import { useAuth } from "../context/AuthContext"
import { useCharacters } from "../context/CharacterContext"
import { createEngineCommandContext } from "../engine-contracts/index.ts"
import type { NpcHabitatZone } from "../lib/npcZoneHabitats"
import { supabase } from "../lib/supabase"
import { oracle } from "../oracle-engine/runtime.ts"

export type NpcZoneHabitat = {
  location_id: string
  npc_character_id: string
  campaign_id: string
  created_at: string
}

export function useNpcZoneHabitats() {
  const { user } = useAuth()
  const { campaignId, canManage } = useCharacters()
  const [links, setLinks] = useState<NpcZoneHabitat[]>([])
  const [zones, setZones] = useState<NpcHabitatZone[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [savingKey, setSavingKey] = useState("")

  const load = useCallback(async () => {
    if (!campaignId) return
    setLoading(true)
    const [linkResult, zoneResult] = await Promise.all([
      supabase
        .from("location_npc_habitats")
        .select("location_id,npc_character_id,campaign_id,created_at")
        .eq("campaign_id", campaignId),
      supabase
        .from("locations")
        .select("id,name,parent_location_id,lifecycle_state,sort_order")
        .eq("campaign_id", campaignId)
        .order("sort_order", { ascending: true }),
    ])
    const firstError = linkResult.error || zoneResult.error
    if (firstError) setError(firstError.message)
    else {
      setError("")
      setLinks((linkResult.data || []) as NpcZoneHabitat[])
      setZones((zoneResult.data || []) as NpcHabitatZone[])
    }
    setLoading(false)
  }, [campaignId])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) void load() })
    return () => { cancelled = true }
  }, [load])

  useEffect(() => {
    if (!campaignId) return
    const channel = supabase
      .channel(`npc-zone-habitats:${campaignId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "location_npc_habitats", filter: `campaign_id=eq.${campaignId}` }, () => void load())
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [campaignId, load])

  const activeZones = useMemo(
    () => zones.filter((zone) => zone.lifecycle_state === "active"),
    [zones],
  )

  const linkSet = useMemo(
    () => new Set(links.map((link) => `${link.npc_character_id}:${link.location_id}`)),
    [links],
  )

  const isAttached = useCallback(
    (npcCharacterId: string, locationId: string) => linkSet.has(`${npcCharacterId}:${locationId}`),
    [linkSet],
  )

  const zonesForNpc = useCallback(
    (npcCharacterId: string) => links.filter((link) => link.npc_character_id === npcCharacterId).map((link) => link.location_id),
    [links],
  )

  const npcIdsForZone = useCallback(
    (locationId: string) => links.filter((link) => link.location_id === locationId).map((link) => link.npc_character_id),
    [links],
  )

  const setAttached = useCallback(async (npcCharacterId: string, locationId: string, attached: boolean) => {
    if (!canManage) return { ok: false, error: "Только ГМ может менять зоны присутствия NPC." }
    const key = `${npcCharacterId}:${locationId}`
    setSavingKey(key)
    setError("")
    try {
      await oracle.world.setNpcHabitat(
        createEngineCommandContext({ campaignId, requestedBy: user.id, authority: "gm", actorCharacterId: npcCharacterId }),
        npcCharacterId,
        locationId,
        attached,
      )
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Не удалось изменить зону присутствия NPC."
      setSavingKey("")
      setError(message)
      return { ok: false, error: message }
    }
    setSavingKey("")
    await load()
    return { ok: true }
  }, [campaignId, canManage, load, user.id])

  return {
    links,
    zones,
    activeZones,
    loading,
    error,
    savingKey,
    refresh: load,
    isAttached,
    zonesForNpc,
    npcIdsForZone,
    setAttached,
  }
}
