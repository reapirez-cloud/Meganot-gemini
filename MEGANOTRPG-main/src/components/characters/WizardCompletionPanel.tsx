import { useCallback, useEffect, useMemo, useState } from "react"
import type { RealtimeChannel } from "@supabase/supabase-js"
import { useAuth } from "../../context/AuthContext.tsx"
import { useCharacters } from "../../context/CharacterContext.tsx"
import {
  loadWizardSpellbook,
  memorizeWizardSpell,
  setWizardSignatureSpells,
  setWizardSpellMastery,
  type WizardSpellbookSpell,
  type WizardSpellbookState,
} from "../../lib/wizardSpellbook.ts"
import { supabase } from "../../lib/supabase.ts"
import "./WizardCompletionPanel.css"

type Props = { characterId: string }
type RestWindow = { generation: number; is_open: boolean }

const EMPTY: WizardSpellbookState = { hasBook: false, wizardLevel: null, maxSpellLevel: null, books: [], spells: [] }
const ACTION_TIMES = new Set(["action", "1 action", "действие", "1 действие"])

function message(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback
}

function uniqueCharacterSpells(spells: WizardSpellbookSpell[]) {
  const result = new Map<string, WizardSpellbookSpell>()
  for (const spell of spells) {
    if (!spell.characterSpellId || result.has(spell.characterSpellId)) continue
    result.set(spell.characterSpellId, spell)
  }
  return [...result.values()]
}

function spellLabel(spell: WizardSpellbookSpell) {
  return `${spell.name} · ${spell.level} ур.${spell.ritual ? " · ритуал" : ""}`
}

export default function WizardCompletionPanel({ characterId }: Props) {
  const { user } = useAuth()
  const { characters } = useCharacters()
  const character = characters.find((entry) => entry.id === characterId)
  const isOwner = Boolean(character?.assigned_user_id && character.assigned_user_id === user.id)
  const [book, setBook] = useState<WizardSpellbookState>(EMPTY)
  const [shortRest, setShortRest] = useState<RestWindow | null>(null)
  const [longRest, setLongRest] = useState<RestWindow | null>(null)
  const [memorizeUsed, setMemorizeUsed] = useState(false)
  const [masteryReplacementUsed, setMasteryReplacementUsed] = useState(false)
  const [forgetId, setForgetId] = useState("")
  const [prepareId, setPrepareId] = useState("")
  const [masteryOneId, setMasteryOneId] = useState("")
  const [masteryTwoId, setMasteryTwoId] = useState("")
  const [signatureOneId, setSignatureOneId] = useState("")
  const [signatureTwoId, setSignatureTwoId] = useState("")
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")

  const refresh = useCallback(async () => {
    try {
      const [nextBook, shortResult, longResult] = await Promise.all([
        loadWizardSpellbook(characterId),
        supabase.from("character_short_rest_sessions").select("generation,is_open").eq("character_id", characterId).maybeSingle(),
        supabase.from("character_preparation_sessions").select("generation,is_open").eq("character_id", characterId).maybeSingle(),
      ])
      const firstError = shortResult.error || longResult.error
      if (firstError) throw firstError
      const nextShort = (shortResult.data || null) as RestWindow | null
      const nextLong = (longResult.data || null) as RestWindow | null
      setBook(nextBook)
      setShortRest(nextShort)
      setLongRest(nextLong)

      const [memorizeResult, masteryResult] = await Promise.all([
        nextShort
          ? supabase.from("wizard_memorize_spell_uses").select("character_id").eq("character_id", characterId).eq("short_rest_generation", nextShort.generation).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        nextLong
          ? supabase.from("wizard_spell_mastery_replacements").select("character_id").eq("character_id", characterId).eq("long_rest_generation", nextLong.generation).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ])
      const usageError = memorizeResult.error || masteryResult.error
      if (usageError) throw usageError
      setMemorizeUsed(Boolean(memorizeResult.data))
      setMasteryReplacementUsed(Boolean(masteryResult.data))
      setError("")
    } catch (reason) {
      setError(message(reason, "Не удалось загрузить механики Волшебника."))
    }
  }, [characterId])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) void refresh() })
    return () => { cancelled = true }
  }, [refresh])

  useEffect(() => {
    let channel: RealtimeChannel | null = supabase.channel(`wizard-completion-${characterId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "character_spells", filter: `character_id=eq.${characterId}` }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "character_short_rest_sessions", filter: `character_id=eq.${characterId}` }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "character_preparation_sessions", filter: `character_id=eq.${characterId}` }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "wizard_memorize_spell_uses" }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "wizard_spell_mastery_replacements" }, () => void refresh())
      .subscribe()
    return () => { if (channel) { void supabase.removeChannel(channel); channel = null } }
  }, [characterId, refresh])

  const spells = useMemo(() => uniqueCharacterSpells(book.spells), [book.spells])
  const level = book.wizardLevel || 0
  const preparedOrdinary = useMemo(() => spells.filter((spell) => spell.level > 0 && spell.prepared && !spell.spellMastery && !spell.signatureSpell), [spells])
  const unpreparedOrdinary = useMemo(() => spells.filter((spell) => spell.level > 0 && !spell.prepared), [spells])
  const masteryOneOptions = useMemo(() => spells.filter((spell) => spell.level === 1 && ACTION_TIMES.has(spell.castingTime.trim().toLocaleLowerCase("ru-RU"))), [spells])
  const masteryTwoOptions = useMemo(() => spells.filter((spell) => spell.level === 2 && ACTION_TIMES.has(spell.castingTime.trim().toLocaleLowerCase("ru-RU"))), [spells])
  const signatureOptions = useMemo(() => spells.filter((spell) => spell.level === 3), [spells])
  const masterySelected = useMemo(() => spells.filter((spell) => spell.spellMastery), [spells])
  const signatureSelected = useMemo(() => spells.filter((spell) => spell.signatureSpell), [spells])
  const currentMasteryOne = masterySelected.find((spell) => spell.level === 1)?.characterSpellId || ""
  const currentMasteryTwo = masterySelected.find((spell) => spell.level === 2)?.characterSpellId || ""

  useEffect(() => {
    setForgetId((current) => preparedOrdinary.some((spell) => spell.characterSpellId === current) ? current : preparedOrdinary[0]?.characterSpellId || "")
    setPrepareId((current) => unpreparedOrdinary.some((spell) => spell.characterSpellId === current) ? current : unpreparedOrdinary[0]?.characterSpellId || "")
  }, [preparedOrdinary, unpreparedOrdinary])

  useEffect(() => {
    setMasteryOneId((current) => masteryOneOptions.some((spell) => spell.characterSpellId === current) ? current : currentMasteryOne || masteryOneOptions[0]?.characterSpellId || "")
    setMasteryTwoId((current) => masteryTwoOptions.some((spell) => spell.characterSpellId === current) ? current : currentMasteryTwo || masteryTwoOptions[0]?.characterSpellId || "")
  }, [currentMasteryOne, currentMasteryTwo, masteryOneOptions, masteryTwoOptions])

  useEffect(() => {
    setSignatureOneId((current) => signatureOptions.some((spell) => spell.characterSpellId === current) ? current : signatureOptions[0]?.characterSpellId || "")
    setSignatureTwoId((current) => signatureOptions.some((spell) => spell.characterSpellId === current) && current !== signatureOneId ? current : signatureOptions.find((spell) => spell.characterSpellId !== signatureOneId)?.characterSpellId || "")
  }, [signatureOneId, signatureOptions])

  const masteryChangedCount = Number(Boolean(currentMasteryOne) && masteryOneId !== currentMasteryOne)
    + Number(Boolean(currentMasteryTwo) && masteryTwoId !== currentMasteryTwo)
  const masteryInitialized = masterySelected.length > 0

  async function run(key: string, action: () => Promise<unknown>) {
    if (busy) return
    setBusy(key); setError("")
    try {
      await action()
      await refresh()
    } catch (reason) {
      setError(message(reason, "Не удалось применить выбор Волшебника."))
    } finally {
      setBusy("")
    }
  }

  if (!level) return null

  const knownCantrips = level >= 10 ? 5 : level >= 4 ? 4 : 3

  return <section className="wizard-completion">
    <header className="wizard-completion__head">
      <div><small>Волшебник · завершение механик</small><h3>Память и мастерство</h3></div>
      <span>{level} ур.</span>
    </header>

    {level >= 5 && <article className="wizard-completion__card">
      <div className="wizard-completion__title"><span>↻</span><div><strong>Запомнить заклинание</strong><small>5 уровень · после короткого отдыха</small></div></div>
      <p>Один раз сразу после выданного ГМ Короткого отдыха можно заменить одно обычное подготовленное заклинание 1+ уровня другим заклинанием из имеющейся книги.</p>
      <div className="wizard-completion__grid">
        <label><span>Убрать из подготовки</span><select value={forgetId} onChange={(event) => setForgetId(event.target.value)} disabled={!isOwner || Boolean(busy)}>{preparedOrdinary.map((spell) => <option value={spell.characterSpellId || ""} key={spell.characterSpellId}>{spellLabel(spell)}</option>)}</select></label>
        <label><span>Подготовить вместо него</span><select value={prepareId} onChange={(event) => setPrepareId(event.target.value)} disabled={!isOwner || Boolean(busy)}>{unpreparedOrdinary.map((spell) => <option value={spell.characterSpellId || ""} key={spell.characterSpellId}>{spellLabel(spell)}</option>)}</select></label>
      </div>
      <button type="button" disabled={!isOwner || Boolean(busy) || !shortRest?.is_open || memorizeUsed || !forgetId || !prepareId} onClick={() => void run("memorize", () => memorizeWizardSpell(characterId, forgetId, prepareId))}>{busy === "memorize" ? "Меняем…" : memorizeUsed ? "Уже использовано после этого отдыха" : shortRest?.is_open ? "Заменить подготовленное" : "Ждёт Короткого отдыха от ГМ"}</button>
    </article>}

    {level >= 18 && <article className="wizard-completion__card">
      <div className="wizard-completion__title"><span>✦</span><div><strong>Мастерство заклинаний</strong><small>18 уровень · 1-е + 2-е</small></div></div>
      <p>Выбранные заклинания всегда подготовлены и получают отдельный бесплатный способ каста на минимальном уровне. После Долгого отдыха можно заменить только одно из двух.</p>
      <div className="wizard-completion__grid">
        <label><span>1 уровень</span><select value={masteryOneId} onChange={(event) => setMasteryOneId(event.target.value)} disabled={!isOwner || Boolean(busy) || (masteryInitialized && masteryTwoId !== currentMasteryTwo)}>{masteryOneOptions.map((spell) => <option value={spell.characterSpellId || ""} key={spell.characterSpellId}>{spellLabel(spell)}</option>)}</select></label>
        <label><span>2 уровень</span><select value={masteryTwoId} onChange={(event) => setMasteryTwoId(event.target.value)} disabled={!isOwner || Boolean(busy) || (masteryInitialized && masteryOneId !== currentMasteryOne)}>{masteryTwoOptions.map((spell) => <option value={spell.characterSpellId || ""} key={spell.characterSpellId}>{spellLabel(spell)}</option>)}</select></label>
      </div>
      <button type="button" disabled={!isOwner || Boolean(busy) || !masteryOneId || !masteryTwoId || (masteryInitialized && (!longRest?.is_open || masteryReplacementUsed || masteryChangedCount !== 1))} onClick={() => void run("mastery", () => setWizardSpellMastery(characterId, masteryOneId, masteryTwoId))}>{busy === "mastery" ? "Фиксируем…" : !masteryInitialized ? "Выбрать два заклинания" : masteryReplacementUsed ? "Замена после этого отдыха уже сделана" : longRest?.is_open ? "Заменить одно заклинание" : "Следующая замена — после Долгого отдыха"}</button>
    </article>}

    {level >= 20 && <article className="wizard-completion__card">
      <div className="wizard-completion__title"><span>★</span><div><strong>Фирменные заклинания</strong><small>20 уровень · два заклинания 3 уровня</small></div></div>
      {signatureSelected.length ? <div className="wizard-completion__fixed">{signatureSelected.map((spell) => <span key={spell.characterSpellId}>{spell.name}<small>всегда подготовлено · бесплатный каст восстанавливается после Короткого/Долгого отдыха</small></span>)}</div> : <>
        <p>Выбери два разных заклинания 3 уровня из книги. После выбора обычной игроковой замены у этой способности нет.</p>
        <div className="wizard-completion__grid">
          <label><span>Первое</span><select value={signatureOneId} onChange={(event) => setSignatureOneId(event.target.value)} disabled={!isOwner || Boolean(busy)}>{signatureOptions.map((spell) => <option value={spell.characterSpellId || ""} key={spell.characterSpellId}>{spellLabel(spell)}</option>)}</select></label>
          <label><span>Второе</span><select value={signatureTwoId} onChange={(event) => setSignatureTwoId(event.target.value)} disabled={!isOwner || Boolean(busy)}>{signatureOptions.filter((spell) => spell.characterSpellId !== signatureOneId).map((spell) => <option value={spell.characterSpellId || ""} key={spell.characterSpellId}>{spellLabel(spell)}</option>)}</select></label>
        </div>
        <button type="button" disabled={!isOwner || Boolean(busy) || !signatureOneId || !signatureTwoId || signatureOneId === signatureTwoId} onClick={() => void run("signature", () => setWizardSignatureSpells(characterId, signatureOneId, signatureTwoId))}>{busy === "signature" ? "Фиксируем…" : "Выбрать фирменные заклинания"}</button>
      </>}
    </article>}

    <article className="wizard-completion__card wizard-completion__card--manual">
      <div className="wizard-completion__title"><span>GM</span><div><strong>Ручные решения класса</strong><small>без отдельного мини-движка</small></div></div>
      <ul>
        <li><strong>Заговоры:</strong> известно {knownCantrips}; после каждого Долгого отдыха Гена напоминает, что можно заменить один заговор. Выбор применяет ГМ обычным листом.</li>
        {level >= 2 && <li><strong>Учёный:</strong> выбери один навык из списка способности, которым персонаж уже владеет. ГМ повышает его до Экспертизы.</li>}
        {level >= 4 && <li><strong>Увеличение характеристик / черты:</strong> уровни 4, 8, 12 и 16 используют общий путь листа/черт, а не Wizard-only picker.</li>}
        {level >= 19 && <li><strong>Эпический дар:</strong> применяется общим контрактом черт или ГМ через лист; отдельной системы Волшебника для него нет.</li>}
      </ul>
    </article>

    {!isOwner && <p className="wizard-completion__hint">Просмотр доступен, но фиксировать личные выборы может только назначенный владелец персонажа.</p>}
    {!book.hasBook && <p className="wizard-completion__error">Физической книги в инвентаре нет. Книжные выборы и ритуальный доступ недоступны до её возвращения.</p>}
    {error && <p className="wizard-completion__error">{error}</p>}
  </section>
}
