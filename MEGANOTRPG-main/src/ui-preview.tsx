import { useMemo, useState } from "react"
import { createRoot } from "react-dom/client"

import "./App.css"
import "./social.css"
import "./character-sheet.css"
import "./character-engine-sheet.css"
import "./character-profile-v3.css"

import { resolveCharacterContract, type CharacterContribution } from "./character-engine/index.ts"
import CharacterSpellbook from "./components/characters/CharacterSpellbook.tsx"
import ResolvedCharacterSheet from "./components/characters/ResolvedCharacterSheet.tsx"
import SquareImageCropper from "./components/common/SquareImageCropper.tsx"
import { buildLegacyCharacterEngineInput } from "./lib/legacyCharacterEngineAdapter.ts"
import type { CharacterFeature, CharacterSheet, CharacterSpell, CharacterSpellOption } from "./types/characterSheet.ts"

const now = "2026-08-26T12:00:00.000Z"

function spell(id: string, name: string, level: number, prepared: boolean, description: string): CharacterSpell {
  return {
    id,
    character_id: "preview-character",
    name,
    spell_level: level,
    school: level === 0 ? "Воплощение" : "Ограждение",
    casting_time: "1 действие",
    spell_range: "60 футов",
    duration: level === 0 ? "Мгновенно" : "Концентрация, до 1 минуты",
    components: "В, С",
    concentration: level > 0,
    ritual: false,
    prepared,
    cast_mode: level === 0 ? "cantrip" : "slot",
    slot_level: level || null,
    description,
    source: "Клирик",
    sort_order: level,
    created_at: now,
    updated_at: now,
  }
}

const spells = [
  spell("spell-guidance", "Указание", 0, true, "Коснись согласного существа и помоги ему в следующей проверке характеристики."),
  spell("spell-bless", "Благословение", 1, true, "До трёх существ получают дополнительный к4 к броскам атаки и спасброскам."),
  spell("spell-shield", "Щит веры с очень длинным названием для проверки", 1, false, "Мерцающее поле окружает выбранное существо и повышает его защиту."),
  spell("spell-aid", "Подмога", 2, false, "Укрепляет решимость и здоровье союзников."),
]

const options: CharacterSpellOption[] = [
  { ...spell("option-command", "Приказ", 1, false, "Произнеси однословный приказ."), granted_by: "Клирик" },
  { ...spell("option-silence", "Тишина", 2, false, "Создаёт область, в которой невозможно издать звук."), granted_by: "Клирик" },
]

const features: CharacterFeature[] = [
  {
    id: "feature-channel",
    character_id: "preview-character",
    kind: "class_feature",
    name: "Божественный канал",
    description: "Направь священную энергию, чтобы применить эффект своего домена. Доступ восстанавливается после отдыха.",
    sort_order: 0,
    created_at: now,
    updated_at: now,
  },
  {
    id: "feature-legacy",
    character_id: "preview-character",
    kind: "racial_trait",
    name: "Тёмное зрение",
    description: "Ты различаешь детали в темноте на расстоянии до 60 футов.",
    sort_order: 1,
    created_at: now,
    updated_at: now,
  },
]

const sheet: CharacterSheet = {
  character_id: "preview-character",
  race: "Лунный эльф",
  background: "Хранитель архива с очень длинной предысторией",
  alignment: "Нейтрально-добрый",
  experience: 6500,
  strength: 10,
  dexterity: 14,
  constitution: 16,
  intelligence: 12,
  wisdom: 18,
  charisma: 11,
  armor_class: 17,
  initiative_bonus: 2,
  speed: 30,
  proficiency_bonus: 3,
  max_hp: 47,
  current_hp: 31,
  temp_hp: 5,
  hit_dice: "7к8",
  death_save_successes: 0,
  death_save_failures: 0,
  passive_perception: 17,
  saving_throw_proficiencies: ["wisdom", "charisma"],
  skill_proficiencies: { insight: 2, medicine: 1, perception: 1, religion: 1 },
  proficiencies: "Лёгкие и средние доспехи; щиты; простое оружие",
  languages: "Общий; Эльфийский; Небесный",
  senses: "Тёмное зрение 60 футов",
  personality_traits: "Всегда ищет смысл в старых рукописях и задаёт слишком много вопросов.",
  ideals: "Знание должно помогать людям, а не пылиться под замком.",
  bonds: "Хранит письмо пропавшего наставника.",
  flaws: "Не умеет отступать от загадки.",
  backstory: "Много лет служила в архиве при храме, пока одна найденная карта не заставила её отправиться в путь.",
  notes: "Помнит символ на серебряной двери.",
  spellcasting_enabled: true,
  spell_change_unlocked: true,
  spellcasting_ability: "wisdom",
  spell_save_dc: 15,
  spell_attack_bonus: 7,
  spell_slots: {
    "1": { max: 4, used: 1 },
    "2": { max: 3, used: 1 },
    "3": { max: 2, used: 2 },
  },
  created_at: now,
  updated_at: now,
}

const extras: CharacterContribution[] = [
  {
    id: "preview-focus",
    kind: "grant",
    operation: "GRANT",
    target: "resource",
    key: "divine_focus",
    payload: { max: 3, initial: "full", label: "Божественный фокус", recharge: { triggers: ["short_rest", "long_rest"], restore: "full" } },
    source: { id: "preview-class", name: "Клирик 7 уровня" },
  },
  {
    id: "preview-action",
    kind: "grant",
    operation: "GRANT",
    target: "action",
    key: "radiant-strike",
    payload: {
      label: "Сияющий удар с очень длинным названием",
      economy: "bonus_action",
    },
    source: { id: "preview-relic", name: "Реликвия рассвета" },
  },
]

function fullBodyFile() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="700" height="1400" viewBox="0 0 700 1400"><defs><linearGradient id="b" x2="1" y2="1"><stop stop-color="#432b65"/><stop offset="1" stop-color="#101016"/></linearGradient></defs><rect width="700" height="1400" fill="url(#b)"/><circle cx="350" cy="210" r="95" fill="#dfbda5"/><path d="M245 320h210l105 610H140z" fill="#7c5bb0"/><path d="M235 920h105l-35 420H185zM360 920h105l50 420H395z" fill="#272434"/><text x="350" y="90" text-anchor="middle" fill="#fff" font-size="34" font-family="sans-serif">ЛИЦО</text><text x="350" y="1320" text-anchor="middle" fill="#fff" font-size="34" font-family="sans-serif">НОГИ</text></svg>`
  return new File([svg], "full-body.svg", { type: "image/svg+xml" })
}

export function Preview() {
  const [tab, setTab] = useState<"sheet" | "spells">("sheet")
  const [level, setLevel] = useState<number | null>(null)
  const [cropOpen, setCropOpen] = useState(false)
  const [cropResult, setCropResult] = useState("")
  const view = useMemo(() => {
    const input = buildLegacyCharacterEngineInput({
      character: { id: "preview-character", name: "Элеонора Светозарная", level: 7 },
      sheet,
      spells,
      features,
    })
    const previewInput = { ...input, contributions: [...input.contributions, ...extras] }
    return { input: previewInput, contract: resolveCharacterContract(previewInput) }
  }, [])

  return (
    <div className="screen character-profile-screen character-profile-v2">
      <div className="profile-scroll character-profile-scroll profile-v3">
        <section className="profile-v3__hero">
          <button className="profile-v3__portrait" type="button" onClick={() => setCropOpen(true)} aria-label="Изменить портрет">
            <span>Э</span><i aria-hidden="true">✎</i>
          </button>
          <div className="profile-v3__identity">
            <div className="profile-v3__name-row"><div><span>Персонаж</span><h2>Элеонора Светозарная</h2></div><span className="profile-v3__active">Активен</span></div>
            <p>Игрок · Екатерина с длинным именем</p>
            <button className="profile-v3__class" type="button"><span><strong>Клирик Домена Света</strong><small>7 уровень</small></span><i>›</i></button>
            {cropResult && <p className="profile-v3__bio">Кадр подготовлен: {cropResult}</p>}
          </div>
          <button className="profile-v3__reference" type="button"><span>⌘</span><span><strong>Справочник</strong><small>Классы и правила</small></span></button>
        </section>
        <nav className="profile-v3__tabs" aria-label="Разделы персонажа">
          <button className={tab === "sheet" ? "is-active" : ""} type="button" onClick={() => setTab("sheet")}><span>◈</span>Лист</button>
          <button className={tab === "spells" ? "is-active" : ""} type="button" onClick={() => setTab("spells")}><span>✦</span>Магия</button>
          <button type="button"><span>▣</span>Вещи</button><button type="button"><span>≡</span>Дневник</button><button type="button"><span>◇</span>Арты</button>
        </nav>
        {tab === "sheet" ? (
          <ResolvedCharacterSheet input={view.input} contract={view.contract} narrative={sheet} characterClass="Клирик Домена Света" spellcastingAbility="wisdom" canManage features={features} onEditSheet={() => {}} onEditResources={() => {}} onAddFeature={() => {}} onEditFeature={() => {}} onDeleteFeature={async () => ({ ok: true })} onOpenClassReference={() => {}} onOpenSpells={(nextLevel) => { setLevel(nextLevel ?? null); setTab("spells") }} />
        ) : (
          <CharacterSpellbook sheet={sheet} contract={view.contract} spellcastingAbility="wisdom" spells={spells} options={options} canManage canChooseSpells selectedLevel={level} actionId={null} error="" onSelectedLevelChange={setLevel} onOpenReference={() => {}} onEditResources={() => {}} onEnableMagic={() => {}} onDisableMagic={() => {}} onAddOption={() => {}} onEditOption={() => {}} onLearn={() => {}} onTogglePrepared={() => {}} onForget={() => {}} onEditSpell={() => {}} />
        )}
      </div>
      {cropOpen && <SquareImageCropper file={fullBodyFile()} onCancel={() => setCropOpen(false)} onConfirm={(file) => { setCropResult(file.name); setCropOpen(false) }} />}
    </div>
  )
}

createRoot(document.getElementById("root")!).render(<Preview />)
