import { useCallback, useEffect, useState } from "react"
import { createEngineCommandContext } from "../engine-contracts/index.ts"
import { shapoklyak } from "../entity-engine/runtime.ts"
import { cheburashka } from "../inventory-engine/runtime.ts"
import { oracle } from "../oracle-engine/runtime.ts"
import { supabase } from "../lib/supabase"
import { deleteCampaignMediaObject } from "../lib/mediaUpload"
import { useAuth } from "../context/AuthContext"
import { useCharacters } from "../context/CharacterContext"
import type {
  CharacterFeature,
  CharacterArt,
  CharacterSheet,
  CharacterSpell,
  CharacterSpellOption,
  DiaryComment,
  DiaryPost,
  FeatureInput,
  InventoryInput,
  InventoryItem,
  SpellInput,
} from "../types/characterSheet"

type Result = { ok: boolean; error?: string }
const sortInventory = (items: InventoryItem[]) => [...items].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
const sortSpells = <T extends CharacterSpell>(items: T[]) => [...items].sort((a, b) => a.spell_level - b.spell_level || a.sort_order - b.sort_order || a.name.localeCompare(b.name, "ru"))
const sortFeatures = (items: CharacterFeature[]) => [...items].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))

function failure(reason: unknown, fallback: string): Result {
  return { ok: false, error: reason instanceof Error ? reason.message : fallback }
}

async function loadInventory(characterId: string): Promise<{ data: InventoryItem[]; error: { message: string } | null }> {
  try {
    return { data: await cheburashka.listCharacterItems(characterId), error: null }
  } catch (reason) {
    return { data: [], error: { message: reason instanceof Error ? reason.message : "Не удалось загрузить инвентарь." } }
  }
}

export function useCharacterSheet(characterId: string, campaignId: string) {
  const { user } = useAuth()
  const { canManage } = useCharacters()
  const [sheet, setSheet] = useState<CharacterSheet | null>(null)
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [spells, setSpells] = useState<CharacterSpell[]>([])
  const [spellOptions, setSpellOptions] = useState<CharacterSpellOption[]>([])
  const [features, setFeatures] = useState<CharacterFeature[]>([])
  const [posts, setPosts] = useState<DiaryPost[]>([])
  const [comments, setComments] = useState<DiaryComment[]>([])
  const [arts, setArts] = useState<CharacterArt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const gmContext = useCallback(() => createEngineCommandContext({
    campaignId,
    requestedBy: user.id,
    authority: "gm",
    actorCharacterId: characterId,
  }), [campaignId, characterId, user.id])
  const playerContext = useCallback(() => createEngineCommandContext({
    campaignId,
    requestedBy: user.id,
    authority: "player",
    actorCharacterId: characterId,
  }), [campaignId, characterId, user.id])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [sheetResult, inventoryResult, spellsResult, spellOptionsResult, featuresResult, postsResult, artsResult] = await Promise.all([
      supabase.from("character_sheets").select("*").eq("character_id", characterId).maybeSingle(),
      loadInventory(characterId),
      supabase.from("character_spells").select("*").eq("character_id", characterId).order("spell_level", { ascending: true }).order("sort_order", { ascending: true }).order("name", { ascending: true }),
      supabase.from("character_spell_options").select("*").eq("character_id", characterId).order("spell_level", { ascending: true }).order("sort_order", { ascending: true }).order("name", { ascending: true }),
      supabase.from("character_features").select("*").eq("character_id", characterId).order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
      supabase.from("character_diary_posts").select("*").eq("character_id", characterId).order("created_at", { ascending: false }),
      supabase.from("campaign_art_items").select("id, campaign_id, uploaded_by, character_id, title, caption, image_url, created_at, updated_at").eq("character_id", characterId).order("created_at", { ascending: false }),
    ])
    const firstError = sheetResult.error || inventoryResult.error || spellsResult.error || spellOptionsResult.error || featuresResult.error || postsResult.error || artsResult.error
    if (firstError) { setError(firstError.message); setLoading(false); return }
    const nextPosts = (postsResult.data || []) as DiaryPost[]
    let nextComments: DiaryComment[] = []
    if (nextPosts.length) {
      const { data: rows, error: commentsError } = await supabase.from("character_diary_comments").select("*").in("post_id", nextPosts.map((post) => post.id)).order("created_at", { ascending: true })
      if (commentsError) { setError(commentsError.message); setLoading(false); return }
      nextComments = (rows || []) as DiaryComment[]
    }
    setInventory((inventoryResult.data || []) as InventoryItem[])
    setSheet((sheetResult.data || null) as CharacterSheet | null)
    setSpells((spellsResult.data || []) as CharacterSpell[])
    setSpellOptions((spellOptionsResult.data || []) as CharacterSpellOption[])
    setFeatures((featuresResult.data || []) as CharacterFeature[])
    setPosts(nextPosts)
    setComments(nextComments)
    setArts((artsResult.data || []) as CharacterArt[])
    setLoading(false)
  }, [characterId])

  const reloadSheet = useCallback(async (): Promise<Result> => {
    const { data, error: readError } = await supabase.from("character_sheets").select("*").eq("character_id", characterId).maybeSingle()
    if (readError) return { ok: false, error: readError.message }
    setSheet((data || null) as CharacterSheet | null)
    return { ok: true }
  }, [characterId])

  const reloadInventory = useCallback(async (): Promise<Result> => {
    try {
      setInventory(await cheburashka.listCharacterItems(characterId))
      return { ok: true }
    } catch (reason) {
      return failure(reason, "Не удалось загрузить инвентарь.")
    }
  }, [characterId])

  const reloadSpellCollections = useCallback(async (): Promise<Result> => {
    const [a, b] = await Promise.all([
      supabase.from("character_spells").select("*").eq("character_id", characterId).order("spell_level", { ascending: true }).order("sort_order", { ascending: true }).order("name", { ascending: true }),
      supabase.from("character_spell_options").select("*").eq("character_id", characterId).order("spell_level", { ascending: true }).order("sort_order", { ascending: true }).order("name", { ascending: true }),
    ])
    const readError = a.error || b.error
    if (readError) return { ok: false, error: readError.message }
    setSpells((a.data || []) as CharacterSpell[])
    setSpellOptions((b.data || []) as CharacterSpellOption[])
    return { ok: true }
  }, [characterId])

  const reloadFeatures = useCallback(async (): Promise<Result> => {
    const { data, error: readError } = await supabase.from("character_features").select("*").eq("character_id", characterId).order("sort_order", { ascending: true }).order("created_at", { ascending: true })
    if (readError) return { ok: false, error: readError.message }
    setFeatures(sortFeatures((data || []) as CharacterFeature[]))
    return { ok: true }
  }, [characterId])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) void load() })
    return () => { cancelled = true }
  }, [load])

  const updateSheet = useCallback(async (input: Partial<CharacterSheet>): Promise<Result> => {
    const patch = { ...input }
    delete patch.character_id
    delete patch.created_at
    delete patch.updated_at
    try {
      if (canManage) await oracle.characters.updateSheet(gmContext(), characterId, patch)
      else await shapoklyak.execute({ kind: "entity.update_sheet", context: playerContext(), characterId, input: patch })
      return reloadSheet()
    } catch (reason) {
      return failure(reason, "Не удалось обновить лист персонажа.")
    }
  }, [canManage, characterId, gmContext, playerContext, reloadSheet])

  const addInventoryItem = useCallback(async (input: InventoryInput): Promise<Result> => {
    if (!canManage) return { ok: false, error: "Предметы создаёт ГМ или владелец." }
    try {
      const result = await oracle.inventory.create(gmContext(), characterId, input)
      const row = result.value.after
      if (row) setInventory((current) => sortInventory([...current, row]))
      return { ok: true }
    } catch (reason) { return failure(reason, "Не удалось создать предмет.") }
  }, [canManage, characterId, gmContext])

  const updateInventoryItem = useCallback(async (itemId: string, input: InventoryInput): Promise<Result> => {
    if (!canManage) return { ok: false, error: "Состав предмета изменяет ГМ или владелец." }
    try {
      const result = await oracle.inventory.update(gmContext(), characterId, itemId, input)
      const row = result.value.after
      if (row) setInventory((current) => sortInventory(current.map((item) => item.id === itemId ? row : item)))
      return { ok: true }
    } catch (reason) { return failure(reason, "Не удалось обновить предмет.") }
  }, [canManage, characterId, gmContext])

  const deleteInventoryItem = useCallback(async (itemId: string): Promise<Result> => {
    if (!canManage) return { ok: false, error: "Удалять предметы может ГМ или владелец." }
    try {
      await oracle.inventory.remove(gmContext(), characterId, itemId)
      setInventory((current) => current.filter((item) => item.id !== itemId))
      return { ok: true }
    } catch (reason) { return failure(reason, "Не удалось удалить предмет.") }
  }, [canManage, characterId, gmContext])

  const setInventoryEquipped = useCallback(async (itemId: string, equipped: boolean, equipmentSlot: InventoryItem["equipment_slot"]): Promise<Result> => {
    try {
      if (canManage) {
        await oracle.inventory.setEquipped(gmContext(), characterId, itemId, equipped, equipmentSlot)
      } else {
        await cheburashka.execute({
          kind: "inventory.set_equipped",
          context: playerContext(),
          characterId,
          itemId,
          equipped,
          equipmentSlot,
        })
      }
      return reloadInventory()
    } catch (reason) { return failure(reason, "Не удалось изменить экипировку.") }
  }, [canManage, characterId, gmContext, playerContext, reloadInventory])

  const setSpellcastingEnabled = useCallback(async (enabled: boolean): Promise<Result> => {
    if (!canManage) return { ok: false, error: "Доступ к магии изменяет ГМ или владелец." }
    try {
      await oracle.characters.setSpellcastingEnabled(gmContext(), characterId, enabled)
      return reloadSheet()
    } catch (reason) { return failure(reason, "Не удалось изменить доступ к магии.") }
  }, [canManage, characterId, gmContext, reloadSheet])

  const addSpell = useCallback(async (input: SpellInput): Promise<Result> => {
    if (!canManage) return { ok: false, error: "Заклинания напрямую добавляет ГМ или владелец." }
    try { await oracle.characters.createSpell(gmContext(), characterId, input); return reloadSpellCollections() }
    catch (reason) { return failure(reason, "Не удалось добавить заклинание.") }
  }, [canManage, characterId, gmContext, reloadSpellCollections])

  const updateSpell = useCallback(async (id: string, input: SpellInput): Promise<Result> => {
    if (!canManage) return { ok: false, error: "Заклинания напрямую изменяет ГМ или владелец." }
    try { await oracle.characters.updateSpell(gmContext(), characterId, id, input); return reloadSpellCollections() }
    catch (reason) { return failure(reason, "Не удалось обновить заклинание.") }
  }, [canManage, characterId, gmContext, reloadSpellCollections])

  const deleteSpell = useCallback(async (id: string): Promise<Result> => {
    try {
      if (canManage) await oracle.characters.deleteSpell(gmContext(), characterId, id)
      else await shapoklyak.execute({ kind: "entity.delete_spell", context: playerContext(), characterId, spellId: id })
      return reloadSpellCollections()
    } catch (reason) { return failure(reason, "Не удалось убрать заклинание.") }
  }, [canManage, characterId, gmContext, playerContext, reloadSpellCollections])

  const addSpellOption = useCallback(async (input: SpellInput): Promise<Result> => {
    if (!canManage) return { ok: false, error: "Варианты заклинаний задаёт ГМ или владелец." }
    try { await oracle.characters.createSpellOption(gmContext(), characterId, input); return reloadSpellCollections() }
    catch (reason) { return failure(reason, "Не удалось добавить вариант заклинания.") }
  }, [canManage, characterId, gmContext, reloadSpellCollections])

  const updateSpellOption = useCallback(async (id: string, input: SpellInput): Promise<Result> => {
    if (!canManage) return { ok: false, error: "Варианты заклинаний изменяет ГМ или владелец." }
    try { await oracle.characters.updateSpellOption(gmContext(), characterId, id, input); return reloadSpellCollections() }
    catch (reason) { return failure(reason, "Не удалось обновить вариант заклинания.") }
  }, [canManage, characterId, gmContext, reloadSpellCollections])

  const deleteSpellOption = useCallback(async (id: string): Promise<Result> => {
    if (!canManage) return { ok: false, error: "Варианты заклинаний удаляет ГМ или владелец." }
    try { await oracle.characters.deleteSpellOption(gmContext(), characterId, id); return reloadSpellCollections() }
    catch (reason) { return failure(reason, "Не удалось удалить вариант заклинания.") }
  }, [canManage, characterId, gmContext, reloadSpellCollections])

  const learnSpell = useCallback(async (id: string): Promise<Result> => {
    try {
      if (canManage) await oracle.characters.learnSpell(gmContext(), characterId, id)
      else await shapoklyak.execute({ kind: "entity.learn_spell", context: playerContext(), characterId, optionId: id })
      return reloadSpellCollections()
    } catch (reason) { return failure(reason, "Не удалось изучить заклинание.") }
  }, [canManage, characterId, gmContext, playerContext, reloadSpellCollections])

  const setSpellPrepared = useCallback(async (id: string, prepared: boolean): Promise<Result> => {
    try {
      if (canManage) await oracle.characters.setSpellPrepared(gmContext(), characterId, id, prepared)
      else await shapoklyak.execute({ kind: "entity.set_spell_prepared", context: playerContext(), characterId, spellId: id, prepared })
      setSpells((current) => current.map((spell) => spell.id === id ? { ...spell, prepared, updated_at: new Date().toISOString() } : spell))
      return { ok: true }
    } catch (reason) { return failure(reason, "Не удалось изменить подготовку заклинания.") }
  }, [canManage, characterId, gmContext, playerContext])

  const addFeature = useCallback(async (input: FeatureInput): Promise<Result> => {
    if (!canManage) return { ok: false, error: "Особые эффекты и фиты создаёт ГМ или владелец." }
    try { await oracle.characters.createFeature(gmContext(), characterId, input); return reloadFeatures() }
    catch (reason) { return failure(reason, "Не удалось добавить особенность.") }
  }, [canManage, characterId, gmContext, reloadFeatures])

  const updateFeature = useCallback(async (id: string, input: FeatureInput): Promise<Result> => {
    if (!canManage) return { ok: false, error: "Особые эффекты и фиты изменяет ГМ или владелец." }
    try { await oracle.characters.updateFeature(gmContext(), characterId, id, input); return reloadFeatures() }
    catch (reason) { return failure(reason, "Не удалось обновить особенность.") }
  }, [canManage, characterId, gmContext, reloadFeatures])

  const deleteFeature = useCallback(async (id: string): Promise<Result> => {
    if (!canManage) return { ok: false, error: "Особые эффекты и фиты удаляет ГМ или владелец." }
    try { await oracle.characters.deleteFeature(gmContext(), characterId, id); return reloadFeatures() }
    catch (reason) { return failure(reason, "Не удалось удалить особенность.") }
  }, [canManage, characterId, gmContext, reloadFeatures])

  // Diary and gallery are social/media records, not canonical game mechanics.
  const addDiaryPost = useCallback(async (body: string, mediaUrl: string | null = null): Promise<Result> => { const { data, error: e } = await supabase.from("character_diary_posts").insert({ character_id: characterId, created_by: user.id, body: body.trim(), media_url: mediaUrl }).select("*").single(); if (e) { if (mediaUrl) void deleteCampaignMediaObject(mediaUrl); return { ok: false, error: e.message } }; setPosts((c) => [data as DiaryPost, ...c]); return { ok: true } }, [characterId, user.id])
  const updateDiaryPost = useCallback(async (id: string, body: string): Promise<Result> => { const { data, error: e } = await supabase.from("character_diary_posts").update({ body: body.trim(), updated_at: new Date().toISOString() }).eq("id", id).eq("character_id", characterId).select("*").single(); if (e) return { ok: false, error: e.message }; setPosts((c) => c.map((x) => x.id === id ? data as DiaryPost : x)); return { ok: true } }, [characterId])
  const deleteDiaryPost = useCallback(async (id: string): Promise<Result> => { const target = posts.find((x) => x.id === id); const { error: e } = await supabase.from("character_diary_posts").delete().eq("id", id); if (e) return { ok: false, error: e.message }; setPosts((c) => c.filter((x) => x.id !== id)); setComments((c) => c.filter((x) => x.post_id !== id)); if (target?.media_url) void deleteCampaignMediaObject(target.media_url); return { ok: true } }, [posts])
  const addComment = useCallback(async (postId: string, body: string): Promise<Result> => { const { data, error: e } = await supabase.from("character_diary_comments").insert({ post_id: postId, created_by: user.id, body: body.trim() }).select("*").single(); if (e) return { ok: false, error: e.message }; setComments((c) => [...c, data as DiaryComment].sort((a, b) => a.created_at.localeCompare(b.created_at))); return { ok: true } }, [user.id])
  const deleteComment = useCallback(async (id: string): Promise<Result> => { const { error: e } = await supabase.from("character_diary_comments").delete().eq("id", id); if (e) return { ok: false, error: e.message }; setComments((c) => c.filter((x) => x.id !== id)); return { ok: true } }, [])
  const addArt = useCallback(async (title: string, imageUrl: string): Promise<Result> => { const { data, error: e } = await supabase.from("campaign_art_items").insert({ campaign_id: campaignId, uploaded_by: user.id, character_id: characterId, title: title.trim() || "Арт персонажа", image_url: imageUrl }).select("id, campaign_id, uploaded_by, character_id, title, caption, image_url, created_at, updated_at").single(); if (e) { void deleteCampaignMediaObject(imageUrl); return { ok: false, error: e.message } }; setArts((c) => [data as CharacterArt, ...c]); return { ok: true } }, [campaignId, characterId, user.id])
  const updateArt = useCallback(async (id: string, title: string, caption: string): Promise<Result> => { const { data, error: e } = await supabase.from("campaign_art_items").update({ title: title.trim() || "Арт персонажа", caption: caption.trim(), updated_at: new Date().toISOString() }).eq("id", id).eq("character_id", characterId).select("id, campaign_id, uploaded_by, character_id, title, caption, image_url, created_at, updated_at").single(); if (e) return { ok: false, error: e.message }; setArts((c) => c.map((x) => x.id === id ? data as CharacterArt : x)); return { ok: true } }, [characterId])
  const deleteArt = useCallback(async (id: string): Promise<Result> => { const target = arts.find((x) => x.id === id); const { error: e } = await supabase.from("campaign_art_items").delete().eq("id", id); if (e) return { ok: false, error: e.message }; setArts((c) => c.filter((x) => x.id !== id)); if (target?.image_url) void deleteCampaignMediaObject(target.image_url); return { ok: true } }, [arts])

  return {
    sheet, inventory, spells, spellOptions, features, posts, comments, arts,
    loading, error, reload: load, updateSheet,
    addInventoryItem, updateInventoryItem, deleteInventoryItem, setInventoryEquipped,
    setSpellcastingEnabled, addSpell, updateSpell, deleteSpell,
    addSpellOption, updateSpellOption, deleteSpellOption, learnSpell, setSpellPrepared,
    addFeature, updateFeature, deleteFeature,
    addDiaryPost, updateDiaryPost, deleteDiaryPost, addComment, deleteComment,
    addArt, updateArt, deleteArt,
  }
}
