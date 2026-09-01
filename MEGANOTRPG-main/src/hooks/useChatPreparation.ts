import { useCallback, useEffect, useMemo, useState } from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"
import type { Character } from "../context/CharacterContext.tsx"
import {
  buildCharacterPreparationModel,
  type CharacterPreparationRecord,
  type CharacterPreparationSession,
  type SpellPreparationTask,
} from "../lib/characterPreparation.ts"
import { supabase } from "../lib/supabase.ts"
import { loadWizardSpellbook, type WizardSpellbookState } from "../lib/wizardSpellbook.ts"
import {
  registeredCharacterTemplateBundles,
  subscribeCharacterTemplateBundles,
} from "../rule-templates/registry.ts"

export type ChatPreparationSpell = {
  id: string
  catalog_spell_id: string
  name: string
  spell_level: number
  prepared: boolean
  cast_mode: string
  wizard_spell_mastery: boolean
  wizard_signature_spell: boolean
}

const EMPTY_WIZARD_BOOK: WizardSpellbookState = { hasBook: false, wizardLevel: null, maxSpellLevel: null, books: [], spells: [] }

export function useChatPreparation(character: Character | null) {
  const characterId = character?.id || null
  const [bundleRevision, setBundleRevision] = useState(0)
  const [session, setSession] = useState<CharacterPreparationSession | null>(null)
  const [records, setRecords] = useState<CharacterPreparationRecord[]>([])
  const [spells, setSpells] = useState<ChatPreparationSpell[]>([])
  const [wizardSpellbook, setWizardSpellbook] = useState<WizardSpellbookState>(EMPTY_WIZARD_BOOK)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const refresh = useCallback(() => setRevision((value) => value + 1), [])

  useEffect(() => {
    if (!characterId) return
    return subscribeCharacterTemplateBundles(characterId, () => setBundleRevision((value) => value + 1))
  }, [characterId])

  useEffect(() => {
    if (!characterId) return
    let channel: RealtimeChannel | null = supabase.channel(`chat-preparation-${characterId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_preparation_sessions", filter: `character_id=eq.${characterId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_preparation_records", filter: `character_id=eq.${characterId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_spells", filter: `character_id=eq.${characterId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_inventory_items", filter: `character_id=eq.${characterId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "wizard_spellbook_entries" }, refresh)
      .subscribe()
    return () => { if (channel) { void supabase.removeChannel(channel); channel = null } }
  }, [characterId, refresh])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      if (!characterId) {
        setSession(null); setRecords([]); setSpells([]); setWizardSpellbook(EMPTY_WIZARD_BOOK); setError(""); setLoading(false); return
      }
      setLoading(true); setError("")
      void Promise.all([
        supabase.from("character_preparation_sessions").select("*").eq("character_id", characterId).maybeSingle(),
        supabase.from("character_preparation_records").select("*").eq("character_id", characterId).order("generation", { ascending: false }).limit(100),
        supabase.from("character_spells").select("id,catalog_spell_id,name,spell_level,prepared,cast_mode,wizard_spell_mastery,wizard_signature_spell").eq("character_id", characterId).gt("spell_level", 0).eq("cast_mode", "slot").order("spell_level", { ascending: true }).order("name", { ascending: true }),
        loadWizardSpellbook(characterId),
      ]).then(([sessionResult, recordsResult, spellsResult, spellbook]) => {
        if (cancelled) return
        const firstError = sessionResult.error || recordsResult.error || spellsResult.error
        if (firstError) setError(firstError.message)
        else {
          setSession(sessionResult.data as CharacterPreparationSession | null)
          setRecords((recordsResult.data || []) as CharacterPreparationRecord[])
          setSpells((spellsResult.data || []) as ChatPreparationSpell[])
          setWizardSpellbook(spellbook)
        }
        setLoading(false)
      }).catch((reason: unknown) => {
        if (cancelled) return
        setWizardSpellbook(EMPTY_WIZARD_BOOK)
        setError(reason instanceof Error ? reason.message : "Не удалось проверить книгу заклинаний.")
        setLoading(false)
      })
    })
    return () => { cancelled = true }
  }, [characterId, revision])

  const model = useMemo(() => buildCharacterPreparationModel(
    characterId ? registeredCharacterTemplateBundles(characterId) : [],
    Math.max(1, character?.level || 1),
    session,
    records,
  ), [bundleRevision, character?.level, characterId, records, session])

  const wizardTask = model.tasks.find((task): task is SpellPreparationTask => task.kind === "spells" && task.classKey === "wizard") || null
  const preparationSpells = useMemo(() => {
    if (!wizardTask) return spells
    if (!wizardSpellbook.hasBook) return []
    const allowed = new Set(wizardSpellbook.spells.map((spell) => spell.spellCatalogId))
    const maxLevel = wizardSpellbook.maxSpellLevel ?? 0
    return spells.filter((spell) =>
      allowed.has(spell.catalog_spell_id)
      && spell.spell_level <= maxLevel
      && !spell.wizard_spell_mastery
      && !spell.wizard_signature_spell,
    )
  }, [spells, wizardSpellbook, wizardTask])

  const wizardBookError = wizardTask && !wizardSpellbook.hasBook
    ? "Книга заклинаний Волшебника не найдена в инвентаре. Текущая подготовка сохраняется, но изменить её до появления книги нельзя."
    : wizardTask?.required !== null && wizardTask?.required !== undefined && preparationSpells.length < wizardTask.required
      ? `В книге доступно ${preparationSpells.length} обычных подготовляемых заклинаний, а для полной подготовки нужно ${wizardTask.required}. Всегда подготовленные заклинания не занимают квоту, и Гена не будет дополнять список догадками.`
      : ""

  return { model, spells: preparationSpells, wizardSpellbook, loading, error: error || wizardBookError, refresh }
}
