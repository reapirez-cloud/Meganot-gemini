import { useCallback, useEffect, useState } from "react"

import { useAuth } from "../context/AuthContext"
import { useCharacters } from "../context/CharacterContext"
import { createEngineCommandContext } from "../engine-contracts/index.ts"
import { supabase } from "../lib/supabase"
import { oracle } from "../oracle-engine/runtime.ts"
import type {
  AchievementEntry,
  CampaignUpdate,
  LocationEntry,
  LocationLink,
  LocationSection,
  VisibilityMode,
  WorldArticle,
  WorldSection,
} from "../types/world"

type Result = { ok: boolean; error?: string }
type WorldTable = "world_sections" | "world_articles" | "locations" | "location_sections" | "location_links" | "achievements" | "campaign_updates"

function makeSlug(title: string) {
  const base = title.toLowerCase().trim().replace(/[^a-zа-яё0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 40)
  return `${base || "section"}-${Date.now().toString(36)}`
}

function errorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback
}

export function useWorldContent() {
  const { user } = useAuth()
  const { campaignId, canManage } = useCharacters()
  const [sections, setSections] = useState<WorldSection[]>([])
  const [articles, setArticles] = useState<WorldArticle[]>([])
  const [locations, setLocations] = useState<LocationEntry[]>([])
  const [locationSections, setLocationSections] = useState<LocationSection[]>([])
  const [locationLinks, setLocationLinks] = useState<LocationLink[]>([])
  const [achievements, setAchievements] = useState<AchievementEntry[]>([])
  const [updates, setUpdates] = useState<CampaignUpdate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!campaignId) return
    setLoading(true); setError(null)
    const [sectionResult, articleResult, locationResult, achievementResult, updateResult] = await Promise.all([
      supabase.from("world_sections").select("id,campaign_id,slug,title,description,sort_order").eq("campaign_id", campaignId).order("sort_order", { ascending: true }),
      supabase.from("world_articles").select("id,campaign_id,section_id,title,summary,body,sort_order").eq("campaign_id", campaignId).order("sort_order", { ascending: true }),
      supabase.from("locations").select("id,campaign_id,parent_location_id,name,summary,description,image_url,sort_order,visibility_mode,lifecycle_state,created_by,archived_at,created_at,updated_at").eq("campaign_id", campaignId).order("sort_order", { ascending: true }),
      supabase.from("achievements").select("id,campaign_id,character_id,title,description,icon,awarded_at").eq("campaign_id", campaignId).order("awarded_at", { ascending: false }),
      supabase.from("campaign_updates").select("id,campaign_id,kind,title,body,published_at").eq("campaign_id", campaignId).order("published_at", { ascending: false }).limit(20),
    ])
    const firstError = sectionResult.error || articleResult.error || locationResult.error || achievementResult.error || updateResult.error
    if (firstError) { setError(firstError.message); setLoading(false); return }

    const nextLocations = (locationResult.data || []) as LocationEntry[]
    const locationIds = nextLocations.map((location) => location.id)
    let nextLocationSections: LocationSection[] = []
    let nextLocationLinks: LocationLink[] = []
    if (locationIds.length) {
      const sectionRows = await supabase.from("location_sections").select("id,location_id,title,body,sort_order").in("location_id", locationIds).order("sort_order", { ascending: true })
      if (sectionRows.error) { setError(sectionRows.error.message); setLoading(false); return }
      nextLocationSections = (sectionRows.data || []) as LocationSection[]
      const sectionIds = nextLocationSections.map((section) => section.id)
      if (sectionIds.length) {
        const linkRows = await supabase.from("location_links").select("id,section_id,target_location_id,label,sort_order,visibility_mode,created_by").in("section_id", sectionIds).order("sort_order", { ascending: true })
        if (linkRows.error) { setError(linkRows.error.message); setLoading(false); return }
        nextLocationLinks = (linkRows.data || []) as LocationLink[]
      }
    }
    setSections((sectionResult.data || []) as WorldSection[])
    setArticles((articleResult.data || []) as WorldArticle[])
    setLocations(nextLocations)
    setLocationSections(nextLocationSections)
    setLocationLinks(nextLocationLinks)
    setAchievements((achievementResult.data || []) as AchievementEntry[])
    setUpdates((updateResult.data || []) as CampaignUpdate[])
    setLoading(false)
  }, [campaignId])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) void load() })
    return () => { cancelled = true }
  }, [load])
  useEffect(() => {
    if (!campaignId) return
    let timer: number | null = null
    const refresh = () => { if (timer !== null) window.clearTimeout(timer); timer = window.setTimeout(() => void load(), 120) }
    const channel = supabase.channel(`world-content:${campaignId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "locations", filter: `campaign_id=eq.${campaignId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "location_sections" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "location_links" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_location_discoveries" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_location_link_discoveries" }, refresh)
      .subscribe()
    return () => { if (timer !== null) window.clearTimeout(timer); void supabase.removeChannel(channel) }
  }, [campaignId, load])

  const gmContext = useCallback(() => createEngineCommandContext({ campaignId, requestedBy: user.id, authority: "gm" }), [campaignId, user.id])
  const rejectTopologyWrite = useCallback((): Result | null => canManage ? null : { ok: false, error: "Только ГМ может менять структуру мира." }, [canManage])

  const createWorldSection = useCallback(async (title: string, description: string): Promise<Result> => {
    const { error } = await supabase.from("world_sections").insert({ campaign_id: campaignId, slug: makeSlug(title), title: title.trim(), description: description.trim() })
    if (error) return { ok: false, error: error.message }; await load(); return { ok: true }
  }, [campaignId, load])

  const updateWorldSection = useCallback(async (sectionId: string, title: string, description: string): Promise<Result> => {
    const { error } = await supabase.from("world_sections").update({ title: title.trim(), description: description.trim(), updated_at: new Date().toISOString() }).eq("id", sectionId)
    if (error) return { ok: false, error: error.message }; await load(); return { ok: true }
  }, [load])

  const createWorldArticle = useCallback(async (sectionId: string, title: string, summary: string, body: string): Promise<Result> => {
    const { error } = await supabase.from("world_articles").insert({ campaign_id: campaignId, section_id: sectionId, title: title.trim(), summary: summary.trim(), body: body.trim() })
    if (error) return { ok: false, error: error.message }; await load(); return { ok: true }
  }, [campaignId, load])

  const updateWorldArticle = useCallback(async (articleId: string, title: string, summary: string, body: string): Promise<Result> => {
    const { error } = await supabase.from("world_articles").update({ title: title.trim(), summary: summary.trim(), body: body.trim(), updated_at: new Date().toISOString() }).eq("id", articleId)
    if (error) return { ok: false, error: error.message }; await load(); return { ok: true }
  }, [load])

  const createLocation = useCallback(async (input: { parent_location_id: string | null; name: string; summary: string; description: string; image_url: string | null; visibility_mode?: VisibilityMode }): Promise<Result> => {
    const rejected = rejectTopologyWrite(); if (rejected) return rejected
    try {
      await oracle.world.createLocation(gmContext(), {
        parentLocationId: input.parent_location_id,
        name: input.name.trim(),
        summary: input.summary.trim(),
        description: input.description.trim(),
        imageUrl: input.image_url?.trim() || null,
        visibilityMode: input.visibility_mode || "discover",
      })
    } catch (reason) { return { ok: false, error: errorMessage(reason, "Не удалось создать локацию.") } }
    await load(); return { ok: true }
  }, [gmContext, load, rejectTopologyWrite])

  const updateLocation = useCallback(async (locationId: string, input: { name: string; summary: string; description: string; image_url: string | null; visibility_mode?: VisibilityMode }): Promise<Result> => {
    const rejected = rejectTopologyWrite(); if (rejected) return rejected
    const current = locations.find((location) => location.id === locationId)
    try {
      await oracle.world.updateLocation(gmContext(), locationId, {
        name: input.name.trim(),
        summary: input.summary.trim(),
        description: input.description.trim(),
        imageUrl: input.image_url?.trim() || null,
        visibilityMode: input.visibility_mode || current?.visibility_mode || "discover",
      })
    } catch (reason) { return { ok: false, error: errorMessage(reason, "Не удалось обновить локацию.") } }
    await load(); return { ok: true }
  }, [gmContext, load, locations, rejectTopologyWrite])

  const setLocationVisibility = useCallback(async (locationId: string, visibilityMode: VisibilityMode): Promise<Result> => {
    const rejected = rejectTopologyWrite(); if (rejected) return rejected
    try { await oracle.world.setLocationVisibility(gmContext(), locationId, visibilityMode) }
    catch (reason) { return { ok: false, error: errorMessage(reason, "Не удалось изменить видимость локации.") } }
    await load(); return { ok: true }
  }, [gmContext, load, rejectTopologyWrite])

  const setLocationArchived = useCallback(async (locationId: string, archived: boolean): Promise<Result> => {
    const rejected = rejectTopologyWrite(); if (rejected) return rejected
    try { await oracle.world.setLocationArchived(gmContext(), locationId, archived) }
    catch (reason) { return { ok: false, error: errorMessage(reason, "Не удалось изменить состояние локации.") } }
    await load(); return { ok: true }
  }, [gmContext, load, rejectTopologyWrite])

  const publishLocationEvent = useCallback(async (locationId: string, event: "opened" | "updated" | "destroyed" = "updated"): Promise<Result> => {
    const rejected = rejectTopologyWrite(); if (rejected) return rejected
    try { await oracle.world.publishLocationEvent(gmContext(), locationId, event) }
    catch (reason) { return { ok: false, error: errorMessage(reason, "Не удалось опубликовать событие локации.") } }
    return { ok: true }
  }, [gmContext, rejectTopologyWrite])

  const createLocationSection = useCallback(async (locationId: string, title: string, body: string): Promise<Result> => {
    const rejected = rejectTopologyWrite(); if (rejected) return rejected
    try { await oracle.world.createLocationSection(gmContext(), locationId, title.trim(), body.trim()) }
    catch (reason) { return { ok: false, error: errorMessage(reason, "Не удалось создать секцию локации.") } }
    await load(); return { ok: true }
  }, [gmContext, load, rejectTopologyWrite])

  const updateLocationSection = useCallback(async (sectionId: string, title: string, body: string): Promise<Result> => {
    const rejected = rejectTopologyWrite(); if (rejected) return rejected
    try { await oracle.world.updateLocationSection(gmContext(), sectionId, title.trim(), body.trim()) }
    catch (reason) { return { ok: false, error: errorMessage(reason, "Не удалось обновить секцию локации.") } }
    await load(); return { ok: true }
  }, [gmContext, load, rejectTopologyWrite])

  const createLocationLink = useCallback(async (sectionId: string, targetLocationId: string, label: string, visibilityMode: VisibilityMode = "discover"): Promise<Result> => {
    const rejected = rejectTopologyWrite(); if (rejected) return rejected
    try { await oracle.world.createLocationLink(gmContext(), sectionId, targetLocationId, label.trim(), visibilityMode) }
    catch (reason) { return { ok: false, error: errorMessage(reason, "Не удалось создать связь локаций.") } }
    await load(); return { ok: true }
  }, [gmContext, load, rejectTopologyWrite])

  const updateLocationLink = useCallback(async (linkId: string, targetLocationId: string, label: string, visibilityMode?: VisibilityMode): Promise<Result> => {
    const rejected = rejectTopologyWrite(); if (rejected) return rejected
    try { await oracle.world.updateLocationLink(gmContext(), linkId, targetLocationId, label.trim(), visibilityMode) }
    catch (reason) { return { ok: false, error: errorMessage(reason, "Не удалось обновить связь локаций.") } }
    await load(); return { ok: true }
  }, [gmContext, load, rejectTopologyWrite])

  const createAchievement = useCallback(async (input: { character_id: string | null; title: string; description: string; icon: string }): Promise<Result> => {
    const { error } = await supabase.from("achievements").insert({ campaign_id: campaignId, character_id: input.character_id, title: input.title.trim(), description: input.description.trim(), icon: input.icon.trim() || "★" })
    if (error) return { ok: false, error: error.message }; await load(); return { ok: true }
  }, [campaignId, load])

  const updateAchievement = useCallback(async (achievementId: string, input: { character_id: string | null; title: string; description: string; icon: string }): Promise<Result> => {
    const { error } = await supabase.from("achievements").update({ character_id: input.character_id, title: input.title.trim(), description: input.description.trim(), icon: input.icon.trim() || "★" }).eq("id", achievementId)
    if (error) return { ok: false, error: error.message }; await load(); return { ok: true }
  }, [load])

  const createUpdate = useCallback(async (input: { kind: "change" | "announcement"; title: string; body: string }): Promise<Result> => {
    const { error } = await supabase.from("campaign_updates").insert({ campaign_id: campaignId, created_by: user.id, kind: input.kind, title: input.title.trim(), body: input.body.trim() })
    if (error) return { ok: false, error: error.message }; await load(); return { ok: true }
  }, [campaignId, load, user.id])

  const updateUpdate = useCallback(async (updateId: string, input: { kind: "change" | "announcement"; title: string; body: string }): Promise<Result> => {
    const { error } = await supabase.from("campaign_updates").update({ kind: input.kind, title: input.title.trim(), body: input.body.trim() }).eq("id", updateId)
    if (error) return { ok: false, error: error.message }; await load(); return { ok: true }
  }, [load])

  const deleteWorldItem = useCallback(async (table: WorldTable, id: string): Promise<Result> => {
    if (table === "locations" || table === "location_sections" || table === "location_links") {
      const rejected = rejectTopologyWrite(); if (rejected) return rejected
      try {
        if (table === "locations") await oracle.world.deleteLocation(gmContext(), id)
        else if (table === "location_sections") await oracle.world.deleteLocationSection(gmContext(), id)
        else await oracle.world.deleteLocationLink(gmContext(), id)
      } catch (reason) { return { ok: false, error: errorMessage(reason, "Не удалось удалить элемент мира.") } }
      await load(); return { ok: true }
    }
    const { error: deleteError } = await supabase.from(table).delete().eq("id", id)
    if (deleteError) return { ok: false, error: deleteError.message }; await load(); return { ok: true }
  }, [gmContext, load, rejectTopologyWrite])

  return { sections, articles, locations, locationSections, locationLinks, achievements, updates, loading, error, reload: load, createWorldSection, updateWorldSection, createWorldArticle, updateWorldArticle, createLocation, updateLocation, setLocationVisibility, setLocationArchived, publishLocationEvent, createLocationSection, updateLocationSection, createLocationLink, updateLocationLink, createAchievement, updateAchievement, createUpdate, updateUpdate, deleteWorldItem }
}
