import { useEffect, useMemo, useState } from "react"
import type { FormEvent } from "react"
import type { CampaignMember, Character, CharacterInput } from "../../context/CharacterContext"
import type { CharacterSheet, SkillRank } from "../../types/characterSheet"
import {
  CHARACTER_WIZARD_ABILITIES,
  CHARACTER_WIZARD_SKILLS,
  characterWizardPatch,
  defaultCharacterWizardSheet,
  emptySpellSlots,
  sheetValueMatchesAuto,
  wizardInitiative,
  wizardPassivePerception,
  wizardProficiency,
  type CharacterWizardSheet,
  type WizardAbilityKey,
  type WizardSkillKey,
} from "../../lib/characterWizard"
import { supabase } from "../../lib/supabase"
import { deleteCampaignMediaObject } from "../../lib/mediaUpload"
import CharacterAvatar from "./CharacterAvatar"
import ImageUploadField from "../common/ImageUploadField"
import "./CharacterCreationWizard.css"

export type CharacterWizardTarget =
  | { mode: "create"; type: "pc" | "npc" }
  | { mode: "edit"; character: Character }

type Props = {
  target: CharacterWizardTarget
  campaignId: string
  members: CampaignMember[]
  updateCharacter: (characterId: string, input: CharacterInput) => Promise<{ ok: boolean; error?: string }>
  onClose: () => void
  onSaved: (characterId: string, openCharacter: boolean) => void | Promise<void>
}

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7

type AutoState = {
  initiative: boolean
  proficiency: boolean
  passivePerception: boolean
}

const stepCopy: Record<Step, { title: string; copy: string }> = {
  1: { title: "Кто это?", copy: "Имя, роль и несколько слов о персонаже. Остальное можно заполнить позже." },
  2: { title: "Характеристики", copy: "Шесть базовых значений. Старт — 10 во всём, без спрятанных бонусов." },
  3: { title: "Боевая база", copy: "HP, КД и скорость. Производные значения приложение рассчитывает автоматически." },
  4: { title: "Владения", copy: "Отметь только то, чем персонаж действительно владеет. Ничего не выбрано — значит ничего нет." },
  5: { title: "Магия", copy: "Если магии нет — просто оставь выключенной. Если есть, настрой источник и ячейки." },
  6: { title: "Доступ", copy: "Кто владеет PC и кто вообще видит этого персонажа." },
  7: { title: "Проверка", copy: "Перед сохранением видно всю основу. Предметы, фиты и заклинания можно добавить после создания." },
}

function numberValue(value: string | number, fallback: number, min: number, max: number) {
  const parsed = Number(value)
  return Math.max(min, Math.min(max, Number.isFinite(parsed) ? Math.round(parsed) : fallback))
}

function sheetFromStored(row: CharacterSheet, level: number): CharacterWizardSheet {
  const base = defaultCharacterWizardSheet(level)
  return {
    race: row.race || "",
    background: row.background || "",
    alignment: row.alignment || "",
    strength: row.strength,
    dexterity: row.dexterity,
    constitution: row.constitution,
    intelligence: row.intelligence,
    wisdom: row.wisdom,
    charisma: row.charisma,
    armor_class: row.armor_class,
    initiative_bonus: row.initiative_bonus,
    speed: row.speed,
    proficiency_bonus: row.proficiency_bonus,
    max_hp: row.max_hp,
    current_hp: row.current_hp,
    temp_hp: row.temp_hp,
    passive_perception: row.passive_perception,
    saving_throw_proficiencies: row.saving_throw_proficiencies || [],
    skill_proficiencies: row.skill_proficiencies || {},
    proficiencies: row.proficiencies || "",
    languages: row.languages || "",
    senses: row.senses || "",
    spellcasting_enabled: Boolean(row.spellcasting_enabled),
    spellcasting_ability: row.spellcasting_ability || null,
    spell_slots: { ...base.spell_slots, ...(row.spell_slots || {}) },
  }
}

function abilityLabel(key: string | null) {
  return CHARACTER_WIZARD_ABILITIES.find(([value]) => value === key)?.[1] || "не выбрана"
}

export default function CharacterCreationWizard({ target, campaignId, members, updateCharacter, onClose, onSaved }: Props) {
  const editing = target.mode === "edit"
  const initialCharacter = target.mode === "edit" ? target.character : null
  const initialType = target.mode === "edit" ? target.character.character_type : target.type
  const initialLevel = target.mode === "edit" ? target.character.level : 1
  const [step, setStep] = useState<Step>(1)
  const [name, setName] = useState(initialCharacter?.name || "")
  const [role, setRole] = useState(initialCharacter?.character_class || "")
  const [level, setLevelState] = useState(initialLevel)
  const [bio, setBio] = useState(initialCharacter?.bio || "")
  const [avatar, setAvatar] = useState(initialCharacter?.avatar_url || "")
  const [type, setType] = useState<"pc" | "npc">(initialType)
  const [visibility, setVisibility] = useState<"campaign" | "private">(initialCharacter?.visibility || (initialType === "npc" ? "private" : "campaign"))
  const [assigned, setAssigned] = useState(initialCharacter?.assigned_user_id || "")
  const [sheet, setSheet] = useState<CharacterWizardSheet>(() => defaultCharacterWizardSheet(initialLevel))
  const [dirty, setDirty] = useState<Set<keyof CharacterWizardSheet>>(new Set())
  const [auto, setAuto] = useState<AutoState>({ initiative: true, proficiency: true, passivePerception: true })
  const [loadingSheet, setLoadingSheet] = useState(editing)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [createdCharacterId, setCreatedCharacterId] = useState<string | null>(null)

  useEffect(() => {
    if (!editing || !initialCharacter) return
    let cancelled = false
    void (async () => {
      const { data, error: loadError } = await supabase.from("character_sheets").select("*").eq("character_id", initialCharacter.id).maybeSingle()
      if (cancelled) return
      if (loadError) {
        setError(loadError.message)
        setLoadingSheet(false)
        return
      }
      const next = data ? sheetFromStored(data as CharacterSheet, initialCharacter.level) : defaultCharacterWizardSheet(initialCharacter.level)
      setSheet(next)
      setAuto(sheetValueMatchesAuto(next, initialCharacter.level))
      setDirty(new Set())
      setLoadingSheet(false)
    })()
    return () => { cancelled = true }
  }, [editing, initialCharacter])

  const saveSet = useMemo(() => new Set(sheet.saving_throw_proficiencies || []), [sheet.saving_throw_proficiencies])
  const skillCount = useMemo(() => Object.values(sheet.skill_proficiencies || {}).filter((rank) => Number(rank) > 0).length, [sheet.skill_proficiencies])
  const expertCount = useMemo(() => Object.values(sheet.skill_proficiencies || {}).filter((rank) => Number(rank) >= 2).length, [sheet.skill_proficiencies])
  const slotSummary = useMemo(() => Object.entries(sheet.spell_slots || {}).filter(([, slot]) => Number(slot?.max || 0) > 0).map(([key, slot]) => `${key} ур. ×${slot.max}`).join(" · "), [sheet.spell_slots])

  function mark(...keys: Array<keyof CharacterWizardSheet>) {
    setDirty((current) => {
      const next = new Set(current)
      keys.forEach((key) => next.add(key))
      return next
    })
  }

  function updateField<K extends keyof CharacterWizardSheet>(key: K, value: CharacterWizardSheet[K]) {
    setSheet((current) => ({ ...current, [key]: value }))
    mark(key)
  }

  function setAbility(key: WizardAbilityKey, raw: string) {
    const value = numberValue(raw, 10, 1, 30)
    setSheet((current) => {
      const next = { ...current, [key]: value }
      const changed: Array<keyof CharacterWizardSheet> = [key]
      if (key === "dexterity" && auto.initiative) { next.initiative_bonus = wizardInitiative(next); changed.push("initiative_bonus") }
      if (key === "wisdom" && auto.passivePerception) { next.passive_perception = wizardPassivePerception(next); changed.push("passive_perception") }
      mark(...changed)
      return next
    })
  }

  function resetAbilities() {
    setSheet((current) => {
      const next = { ...current, strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 }
      if (auto.initiative) next.initiative_bonus = wizardInitiative(next)
      if (auto.passivePerception) next.passive_perception = wizardPassivePerception(next)
      return next
    })
    mark("strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma", ...(auto.initiative ? ["initiative_bonus" as const] : []), ...(auto.passivePerception ? ["passive_perception" as const] : []))
  }

  function setLevel(raw: string) {
    const nextLevel = numberValue(raw, 1, 1, 30)
    setLevelState(nextLevel)
    setSheet((current) => {
      const next = { ...current }
      const changed: Array<keyof CharacterWizardSheet> = []
      if (auto.proficiency) { next.proficiency_bonus = wizardProficiency(nextLevel); changed.push("proficiency_bonus") }
      if (auto.passivePerception) { next.passive_perception = wizardPassivePerception(next); changed.push("passive_perception") }
      if (changed.length) mark(...changed)
      return next
    })
  }

  function setMaxHp(raw: string) {
    const value = numberValue(raw, 1, 0, 99999)
    setSheet((current) => {
      const followCurrent = !editing || current.current_hp === current.max_hp
      const next = { ...current, max_hp: value, ...(followCurrent ? { current_hp: value } : {}) }
      mark("max_hp", ...(followCurrent ? ["current_hp" as const] : []))
      return next
    })
  }

  function setAutoField(key: keyof AutoState, enabled: boolean) {
    setAuto((current) => ({ ...current, [key]: enabled }))
    if (!enabled) return
    setSheet((current) => {
      const next = { ...current }
      if (key === "initiative") { next.initiative_bonus = wizardInitiative(next); mark("initiative_bonus") }
      if (key === "proficiency") { next.proficiency_bonus = wizardProficiency(level); mark("proficiency_bonus") }
      if (key === "passivePerception") { next.passive_perception = wizardPassivePerception(next); mark("passive_perception") }
      return next
    })
  }

  function toggleSave(key: WizardAbilityKey) {
    const next = new Set(saveSet)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    updateField("saving_throw_proficiencies", [...next])
  }

  function cycleSkill(key: WizardSkillKey) {
    const currentRank = Number(sheet.skill_proficiencies?.[key] || 0) as SkillRank
    const nextRank = ((currentRank + 1) % 3) as SkillRank
    const skills = { ...(sheet.skill_proficiencies || {}), [key]: nextRank }
    setSheet((current) => {
      const next = { ...current, skill_proficiencies: skills }
      if (key === "perception" && auto.passivePerception) next.passive_perception = wizardPassivePerception(next)
      return next
    })
    mark("skill_proficiencies", ...(key === "perception" && auto.passivePerception ? ["passive_perception" as const] : []))
  }

  function setSpellSlot(slotLevel: number, raw: string) {
    const max = numberValue(raw, 0, 0, 20)
    const key = String(slotLevel)
    const current = sheet.spell_slots?.[key] || { max: 0, used: 0 }
    updateField("spell_slots", { ...sheet.spell_slots, [key]: { max, used: Math.min(max, current.used || 0) } })
  }

  function clearSpellSlots() {
    updateField("spell_slots", emptySpellSlots())
  }

  function nextStep() {
    setError("")
    if (step === 1 && !name.trim()) { setError("Укажи имя персонажа."); return }
    if (step === 5 && sheet.spellcasting_enabled && !sheet.spellcasting_ability) { setError("Выбери базовую характеристику для магии."); return }
    setStep((Math.min(7, step + 1)) as Step)
  }

  async function cancel() {
    const original = initialCharacter?.avatar_url || ""
    if (!createdCharacterId && avatar && avatar !== original) await deleteCampaignMediaObject(avatar)
    onClose()
  }

  async function persistSheet(characterId: string) {
    if (!dirty.size) return { ok: true as const }
    const patch = characterWizardPatch(sheet, dirty)
    const { error: sheetError } = await supabase.from("character_sheets").update({ ...patch, updated_at: new Date().toISOString() }).eq("character_id", characterId)
    return sheetError ? { ok: false as const, error: sheetError.message } : { ok: true as const }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (step < 7) { nextStep(); return }
    if (!name.trim()) { setError("Укажи имя персонажа."); setStep(1); return }
    if (sheet.spellcasting_enabled && !sheet.spellcasting_ability) { setError("Для включённой магии нужна базовая характеристика."); setStep(5); return }

    setSaving(true)
    setError("")
    const input: CharacterInput = {
      name: name.trim(),
      character_class: role.trim() || (type === "npc" ? "NPC" : "Персонаж"),
      level,
      bio: bio.trim(),
      avatar_url: avatar || null,
      assigned_user_id: type === "pc" ? (assigned || null) : null,
      character_type: type,
      visibility,
    }

    if (editing && initialCharacter) {
      const characterResult = await updateCharacter(initialCharacter.id, input)
      if (!characterResult.ok) { setSaving(false); setError(characterResult.error || "Не удалось сохранить персонажа."); return }
      const sheetResult = await persistSheet(initialCharacter.id)
      if (!sheetResult.ok) { setSaving(false); setError(sheetResult.error || "Основное сохранено, но лист обновить не удалось."); return }
      if (initialCharacter.avatar_url && initialCharacter.avatar_url !== avatar) void deleteCampaignMediaObject(initialCharacter.avatar_url)
      setSaving(false)
      await onSaved(initialCharacter.id, false)
      return
    }

    let characterId = createdCharacterId
    if (!characterId) {
      const { data, error: createError } = await supabase.rpc("create_campaign_character", {
        p_campaign_id: campaignId,
        p_name: input.name,
        p_character_class: input.character_class,
        p_level: input.level,
        p_bio: input.bio,
        p_avatar_url: input.avatar_url,
        p_assigned_user_id: input.assigned_user_id,
        p_character_type: input.character_type,
        p_visibility: input.visibility,
      })
      if (createError || !data) { setSaving(false); setError(createError?.message || "Не удалось создать персонажа."); return }
      characterId = String(data)
      setCreatedCharacterId(characterId)
    }

    const sheetResult = await persistSheet(characterId)
    if (!sheetResult.ok) {
      setSaving(false)
      setError(`Персонаж уже создан, но лист не сохранился: ${sheetResult.error || "ошибка"}. Нажми «Сохранить» ещё раз — дубль не создастся.`)
      return
    }
    setSaving(false)
    await onSaved(characterId, true)
  }

  if (loadingSheet) {
    return <div className="sheet-backdrop"><section className="bottom-sheet character-wizard character-wizard--loading"><div className="sheet-handle"/><span className="status-spinner"/><strong>Загружаем лист персонажа…</strong></section></div>
  }

  const stepInfo = stepCopy[step]
  const assignedMember = members.find((member) => member.user_id === assigned)
  const changedCount = dirty.size

  return <div className="sheet-backdrop" onMouseDown={() => void cancel()}>
    <form className="bottom-sheet v2-editor-sheet creation-wizard character-wizard" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
      <div className="sheet-handle" />
      <header className="v2-sheet-head creation-wizard__head character-wizard__head">
        <div><span>{editing ? "Редактирование" : type === "npc" ? "Новый NPC" : "Новый PC"} · шаг {step} из 7</span><h3>{stepInfo.title}</h3><p>{stepInfo.copy}</p></div>
        <button type="button" onClick={() => void cancel()}>×</button>
      </header>
      <div className="creation-wizard__progress" aria-label={`Шаг ${step} из 7`}>{Array.from({ length: 7 }, (_, index) => index + 1).map((value) => <i key={value} className={value <= step ? "is-active" : ""}/>)}</div>

      {step === 1 && <section className="creation-wizard__step character-wizard__step">
        <div className="creation-wizard__intro"><span>01</span><div><strong>Личность</strong><small>Нужно только имя. Всё остальное здесь необязательно.</small></div></div>
        <label><span className="field-label">Имя</span><input className="app-input" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} autoFocus placeholder={type === "npc" ? "Например: Капитан Рей" : "Имя персонажа"}/></label>
        <div className="v2-field-grid"><label><span className="field-label">Класс / роль</span><input className="app-input" value={role} onChange={(event) => setRole(event.target.value)} maxLength={120} placeholder={type === "npc" ? "Стражник, торговец, маг…" : "Воин, друид, следопыт…"}/></label><label><span className="field-label">Уровень</span><input className="app-input" type="number" min="1" max="30" value={level} onChange={(event) => setLevel(event.target.value)}/></label></div>
        <div className="character-wizard__optional-grid"><label><span className="field-label">Раса / вид <small>необязательно</small></span><input className="app-input" value={sheet.race} onChange={(event) => updateField("race", event.target.value)} placeholder="Человек, дроу…"/></label><label><span className="field-label">Происхождение <small>необязательно</small></span><input className="app-input" value={sheet.background} onChange={(event) => updateField("background", event.target.value)} placeholder="Солдат, дворянин…"/></label><label><span className="field-label">Мировоззрение <small>необязательно</small></span><input className="app-input" value={sheet.alignment} onChange={(event) => updateField("alignment", event.target.value)} placeholder="Можно оставить пустым"/></label></div>
        <ImageUploadField value={avatar} onChange={setAvatar} folder="character-avatars" campaignId={campaignId} label="Портрет" crop="square"/>
        <label><span className="field-label">Короткое описание <small>необязательно</small></span><textarea className="app-textarea" value={bio} onChange={(event) => setBio(event.target.value)} maxLength={3000} placeholder="То, что удобно видеть в списке персонажей."/></label>
      </section>}

      {step === 2 && <section className="creation-wizard__step character-wizard__step">
        <div className="creation-wizard__intro"><span>02</span><div><strong>Характеристики</strong><small>По умолчанию все шесть = 10. Модификаторы будут рассчитаны автоматически.</small></div></div>
        <div className="character-wizard__ability-head"><div><strong>База 10 × 6</strong><small>Меняй только то, что нужно.</small></div><button type="button" onClick={resetAbilities}>Сбросить к 10</button></div>
        <div className="character-wizard__abilities">{CHARACTER_WIZARD_ABILITIES.map(([key, label, short]) => { const value = sheet[key]; const modifier = Math.floor((value - 10) / 2); return <label key={key}><span><small>{short}</small><strong>{label}</strong></span><input type="number" min="1" max="30" value={value} onChange={(event) => setAbility(key, event.target.value)}/><em>{modifier >= 0 ? `+${modifier}` : modifier}</em></label> })}</div>
        <div className="creation-default-note creation-default-note--neutral"><span>◇</span><p><strong>Никаких ручных модификаторов</strong><small>Из значения характеристики движок сам получает модификатор, проверки и связанные формулы.</small></p></div>
      </section>}

      {step === 3 && <section className="creation-wizard__step character-wizard__step">
        <div className="creation-wizard__intro"><span>03</span><div><strong>Боевая база</strong><small>Минимум для игры. Продвинутые формулы и эффекты потом могут приходить из класса, фитов и предметов.</small></div></div>
        <div className="character-wizard__combat-grid"><label><span>КД</span><input type="number" min="0" max="99" value={sheet.armor_class} onChange={(event) => updateField("armor_class", numberValue(event.target.value, 10, 0, 99))}/><small>Базовое значение до эффектов</small></label><label><span>Макс. HP</span><input type="number" min="0" value={sheet.max_hp} onChange={(event) => setMaxHp(event.target.value)}/><small>Новый герой стартует с 1</small></label><label><span>Текущие HP</span><input type="number" min="0" value={sheet.current_hp} onChange={(event) => updateField("current_hp", numberValue(event.target.value, sheet.max_hp, 0, 99999))}/><small>Обычно = максимуму</small></label><label><span>Временные HP</span><input type="number" min="0" value={sheet.temp_hp} onChange={(event) => updateField("temp_hp", numberValue(event.target.value, 0, 0, 99999))}/><small>По умолчанию 0</small></label><label><span>Скорость</span><input type="number" min="0" value={sheet.speed} onChange={(event) => updateField("speed", numberValue(event.target.value, 30, 0, 999))}/><small>По умолчанию 30</small></label></div>
        <div className="character-wizard__derived">
          <DerivedCard label="Инициатива" value={sheet.initiative_bonus} auto={auto.initiative} onAuto={(value) => setAutoField("initiative", value)} onValue={(value) => updateField("initiative_bonus", value)} hint="Из Ловкости" />
          <DerivedCard label="Мастерство" value={sheet.proficiency_bonus} auto={auto.proficiency} onAuto={(value) => setAutoField("proficiency", value)} onValue={(value) => { updateField("proficiency_bonus", value); if (auto.passivePerception) { const next = { ...sheet, proficiency_bonus: value }; updateField("passive_perception", wizardPassivePerception(next)) } }} hint={`По уровню: ${wizardProficiency(level) >= 0 ? "+" : ""}${wizardProficiency(level)}`} />
          <DerivedCard label="Пассивное восприятие" value={sheet.passive_perception} auto={auto.passivePerception} onAuto={(value) => setAutoField("passivePerception", value)} onValue={(value) => updateField("passive_perception", value)} hint="Из Мудрости и навыка" />
        </div>
      </section>}

      {step === 4 && <section className="creation-wizard__step character-wizard__step">
        <div className="creation-wizard__intro"><span>04</span><div><strong>Владения</strong><small>Нажатие на навык переключает: нет → владение → экспертиза.</small></div></div>
        <div className="character-wizard__subhead"><strong>Спасброски</strong><small>{saveSet.size ? `Выбрано: ${saveSet.size}` : "По умолчанию — ни одного"}</small></div>
        <div className="character-wizard__save-grid">{CHARACTER_WIZARD_ABILITIES.map(([key, label, short]) => <button type="button" key={key} className={saveSet.has(key) ? "is-active" : ""} onClick={() => toggleSave(key)}><span>{short}</span><strong>{label}</strong>{saveSet.has(key) && <i>✓</i>}</button>)}</div>
        <div className="character-wizard__subhead"><strong>Навыки</strong><small>{skillCount ? `Владений: ${skillCount}${expertCount ? ` · экспертиз: ${expertCount}` : ""}` : "Ничего не выбрано"}</small></div>
        <div className="character-wizard__skills">{CHARACTER_WIZARD_SKILLS.map(([key, label]) => { const rank = Number(sheet.skill_proficiencies?.[key] || 0); return <button type="button" key={key} className={rank ? rank >= 2 ? "is-expert" : "is-active" : ""} onClick={() => cycleSkill(key)}><span>{label}</span><small>{rank >= 2 ? "Экспертиза" : rank === 1 ? "Владение" : "Нет"}</small></button> })}</div>
        <details className="character-wizard__details"><summary>Дополнительные владения, языки и чувства</summary><div><label><span className="field-label">Владения</span><textarea className="app-textarea" value={sheet.proficiencies} onChange={(event) => updateField("proficiencies", event.target.value)} placeholder="Доспехи, инструменты, оружие…"/></label><label><span className="field-label">Языки</span><textarea className="app-textarea" value={sheet.languages} onChange={(event) => updateField("languages", event.target.value)} placeholder="Общий, эльфийский…"/></label><label><span className="field-label">Чувства</span><textarea className="app-textarea" value={sheet.senses} onChange={(event) => updateField("senses", event.target.value)} placeholder="Тёмное зрение 60 фт…"/></label></div></details>
      </section>}

      {step === 5 && <section className="creation-wizard__step character-wizard__step">
        <div className="creation-wizard__intro"><span>05</span><div><strong>Магия</strong><small>Выключено по умолчанию. Предметы всё равно могут давать собственные заклинания.</small></div></div>
        <label className="v2-toggle-row creation-inline-toggle character-wizard__magic-toggle"><span><strong>Персонаж использует собственные заклинания</strong><small>Включай для классовой/врождённой магии персонажа. Магия предметов живёт отдельно.</small></span><input type="checkbox" checked={sheet.spellcasting_enabled} onChange={(event) => updateField("spellcasting_enabled", event.target.checked)}/></label>
        {!sheet.spellcasting_enabled ? <div className="character-wizard__empty-choice"><span>◇</span><strong>Магии нет — и это нормально</strong><p>Шаг закончен. Вкладка заклинаний не появится без реального источника.</p></div> : <>
          <label><span className="field-label">Базовая характеристика</span><select className="app-select" value={sheet.spellcasting_ability || ""} onChange={(event) => updateField("spellcasting_ability", event.target.value || null)}><option value="">Выбери характеристику…</option>{CHARACTER_WIZARD_ABILITIES.map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select><small className="control-field-help">СЛ и бонус атаки не вводятся вручную — они вычисляются из характеристики и бонуса мастерства.</small></label>
          <div className="character-wizard__slot-head"><div><strong>Ячейки заклинаний</strong><small>Максимум по уровням. Потраченные ячейки приложение ведёт само.</small></div><button type="button" onClick={clearSpellSlots}>Очистить</button></div>
          <div className="character-wizard__slots">{Array.from({ length: 9 }, (_, index) => index + 1).map((slotLevel) => <label key={slotLevel}><span>{slotLevel}</span><input type="number" min="0" max="20" value={sheet.spell_slots?.[String(slotLevel)]?.max || 0} onChange={(event) => setSpellSlot(slotLevel, event.target.value)}/><small>ур.</small></label>)}</div>
          <div className="creation-default-note creation-default-note--neutral"><span>✧</span><p><strong>Сами заклинания добавляются из каталога</strong><small>После создания открой персонажа → Магия. Не нужно забивать названия руками в этот мастер.</small></p></div>
        </>}
      </section>}

      {step === 6 && <section className="creation-wizard__step character-wizard__step">
        <div className="creation-wizard__intro"><span>06</span><div><strong>Доступ</strong><small>Тип персонажа и видимость не связаны с ролью аккаунта.</small></div></div>
        <div className="character-wizard__type-grid"><button type="button" className={type === "pc" ? "is-active" : ""} onClick={() => setType("pc")}><span>♙</span><strong>PC</strong><small>Можно назначить участнику кампании.</small></button><button type="button" className={type === "npc" ? "is-active" : ""} onClick={() => { setType("npc"); setAssigned("") }}><span>◇</span><strong>NPC</strong><small>Не принадлежит игроку.</small></button></div>
        <div className="character-wizard__visibility"><button type="button" className={visibility === "campaign" ? "is-active" : ""} onClick={() => setVisibility("campaign")}><strong>Кампания</strong><small>Доступен по обычным правилам кампании.</small></button><button type="button" className={visibility === "private" ? "is-active" : ""} onClick={() => setVisibility("private")}><strong>Только я</strong><small>Creator-only: другой ГМ/админ игровые данные не увидит.</small></button></div>
        {type === "pc" && <label><span className="field-label">Кому принадлежит</span><select className="app-select" value={assigned} onChange={(event) => setAssigned(event.target.value)}><option value="">Пока никому</option>{members.map((member) => <option value={member.user_id} key={member.user_id}>{member.display_name} · {member.is_owner ? "владелец" : member.role === "gm" ? "ГМ" : "игрок"}</option>)}</select><small className="control-field-help">Игрок не создаёт PC сам. Здесь ГМ выдаёт ему уже созданного персонажа.</small></label>}
      </section>}

      {step === 7 && <section className="creation-wizard__step character-wizard__step">
        <div className="creation-wizard__intro"><span>07</span><div><strong>Проверка</strong><small>Если что-то пропущено, используются видимые дефолты — никаких скрытых бонусов.</small></div></div>
        <div className="character-wizard__review-hero"><CharacterAvatar character={{ name: name || "?", avatar_url: avatar || null }} size="large"/><div><small>{type === "npc" ? "NPC" : "PC"}{visibility === "private" ? " · Только я" : " · Кампания"}</small><strong>{name.trim() || "Без имени"}</strong><span>{role.trim() || (type === "npc" ? "NPC" : "Персонаж")} · {level} ур.</span>{sheet.race && <em>{sheet.race}</em>}</div></div>
        <div className="character-wizard__review-grid"><Review label="Характеристики" value={CHARACTER_WIZARD_ABILITIES.map(([key, , short]) => `${short} ${sheet[key]}`).join(" · ")}/><Review label="Бой" value={`КД ${sheet.armor_class} · HP ${sheet.current_hp}/${sheet.max_hp} · скорость ${sheet.speed} · инициатива ${sheet.initiative_bonus >= 0 ? "+" : ""}${sheet.initiative_bonus}`}/><Review label="Владения" value={`${saveSet.size} спасбросков · ${skillCount} навыков${expertCount ? ` · ${expertCount} экспертиз` : ""}`}/><Review label="Магия" value={sheet.spellcasting_enabled ? `${abilityLabel(sheet.spellcasting_ability)}${slotSummary ? ` · ${slotSummary}` : " · без ячеек"}` : "Выключена"}/><Review label="Доступ" value={type === "npc" ? `NPC · ${visibility === "private" ? "только я" : "кампания"}` : `${assignedMember ? `владелец: ${assignedMember.display_name}` : "без владельца"} · ${visibility === "private" ? "только я" : "кампания"}`}/></div>
        <div className="creation-default-note creation-default-note--neutral"><span>↳</span><p><strong>{editing ? `${changedCount} полей листа изменено в этом мастере` : changedCount ? `${changedCount} отклонений от базовых значений` : "Чистая базовая заготовка"}</strong><small>{editing ? "Нетронутые поля листа не перезаписываются." : "Если ничего не менять: 10×6, HP 1, КД 10, скорость 30, без владений и магии."}</small></p></div>
        <div className="character-wizard__after"><strong>После сохранения</strong><span>Предметы → Инвентарь</span><span>Фиты и уникальные эффекты → Особенности</span><span>Заклинания → Магия</span><small>Каждый раздел влияет на персонажа отдельно, поэтому дублировать эффекты здесь не нужно.</small></div>
      </section>}

      {error && <div className="auth-error">{error}</div>}
      <div className="v2-editor-actions creation-wizard__actions character-wizard__actions">{step > 1 && <button className="v2-secondary-button" type="button" onClick={() => { setError(""); setStep((step - 1) as Step) }} disabled={saving}>Назад</button>}<button className="v2-primary-button" type="submit" disabled={saving || (step === 1 && !name.trim())}>{saving ? "Сохраняем…" : step < 7 ? "Далее" : editing ? "Сохранить изменения" : "Создать и открыть"}</button></div>
    </form>
  </div>
}

function DerivedCard({ label, value, auto, onAuto, onValue, hint }: { label: string; value: number; auto: boolean; onAuto: (value: boolean) => void; onValue: (value: number) => void; hint: string }) {
  return <div className="character-wizard__derived-card"><div><span>{label}</span><strong>{value >= 0 && label !== "Пассивное восприятие" ? `+${value}` : value}</strong><small>{auto ? `Авто · ${hint}` : "Ручное значение"}</small></div><label><span>Авто</span><input type="checkbox" checked={auto} onChange={(event) => onAuto(event.target.checked)}/></label>{!auto && <input type="number" value={value} onChange={(event) => onValue(numberValue(event.target.value, value, -99, 999))}/>}</div>
}

function Review({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><p>{value}</p></div>
}
