import { useMemo, useRef, useState, type ReactNode } from "react"

import {
  explainCharacter,
  type AbilityKey,
  type CharacterEngineInput,
  type CharacterExplainQuery,
  type ExplanationNode,
  type GrantPayload,
  type ResolvedCharacterContract,
  type ResolvedGrant,
  type SkillKey,
} from "../../character-engine/index.ts"
import { useLongPressItem } from "../../hooks/useLongPressItem.ts"
import { registeredCharacterClassPackages } from "../../rule-templates/classPackages.ts"
import type { CharacterFeature, CharacterSheet } from "../../types/characterSheet.ts"
import ContextActionSheet, { type ContextAction } from "../common/ContextActionSheet.tsx"
import SpellSlotMeter from "./SpellSlotMeter.tsx"
import { spellSlotResources } from "./spellSlots.ts"
import "../../character-profile-v4.css"

const abilities: Array<[AbilityKey, string, string]> = [
  ["strength", "СИЛ", "Сила"],
  ["dexterity", "ЛОВ", "Ловкость"],
  ["constitution", "ТЕЛ", "Телосложение"],
  ["intelligence", "ИНТ", "Интеллект"],
  ["wisdom", "МДР", "Мудрость"],
  ["charisma", "ХАР", "Харизма"],
]

const skills: Array<[SkillKey, string]> = [
  ["acrobatics", "Акробатика"],
  ["animal_handling", "Уход за животными"],
  ["arcana", "Магия"],
  ["athletics", "Атлетика"],
  ["deception", "Обман"],
  ["history", "История"],
  ["insight", "Проницательность"],
  ["intimidation", "Запугивание"],
  ["investigation", "Анализ"],
  ["medicine", "Медицина"],
  ["nature", "Природа"],
  ["perception", "Восприятие"],
  ["performance", "Выступление"],
  ["persuasion", "Убеждение"],
  ["religion", "Религия"],
  ["sleight_of_hand", "Ловкость рук"],
  ["stealth", "Скрытность"],
  ["survival", "Выживание"],
]

const abilityNames = Object.fromEntries(
  abilities.map(([key, , label]) => [key, label]),
) as Record<AbilityKey, string>

const abilityShort = Object.fromEntries(
  abilities.map(([key, short]) => [key, short]),
) as Record<AbilityKey, string>

type SheetSection = "overview" | "resources" | "actions" | "features" | "defenses" | "identity" | "story"

function signed(value: number): string {
  return value >= 0 ? `+${value}` : String(value)
}

function objectPayload(payload: GrantPayload | undefined): Record<string, unknown> | null {
  return typeof payload === "object" && payload !== null && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : null
}

function friendlyKey(value: string): string {
  const known: Record<string, string> = {
    action: "Действие",
    bonus_action: "Бонусное действие",
    reaction: "Реакция",
    free: "Без действия",
    short_rest: "Короткий отдых",
    long_rest: "Долгий отдых",
    dawn: "На рассвете",
    manual: "Вручную",
  }
  if (known[value]) return known[value]

  const cleaned = value
    .replace(/^legacy[.:_-]*/i, "")
    .replace(/[.:/_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!cleaned) return "Правило персонажа"
  return cleaned.charAt(0).toLocaleUpperCase("ru-RU") + cleaned.slice(1)
}

function grantLabel(grant: ResolvedGrant): string {
  const payload = objectPayload(grant.payload)
  return typeof payload?.label === "string" && payload.label.trim()
    ? payload.label
    : friendlyKey(grant.key)
}

function grantDescription(grant: ResolvedGrant): string {
  const payload = objectPayload(grant.payload)
  return typeof payload?.description === "string" ? payload.description : ""
}

function resourceLabel(contract: ResolvedCharacterContract, key: string, variantKey: string): string {
  const spellSlot = key.match(/^spell_slot_(\d+)$/)
  if (spellSlot) return `Ячейки ${spellSlot[1]} уровня`
  const grant = contract.grants.find((entry) =>
    entry.target === "resource" && entry.key === key && entry.variantKey === variantKey,
  )
  return grant ? grantLabel(grant) : friendlyKey(key)
}

function rechargeLabel(triggers: string[]): string {
  if (!triggers.length) return "Восстановление не указано"
  return triggers.map(friendlyKey).join(" · ")
}

function proficiencyMark(rank: number): string {
  if (rank >= 2) return "◆"
  if (rank >= 1) return "●"
  return "○"
}

function collectSources(node: ExplanationNode, result = new Set<string>()): Set<string> {
  if (node.source?.name) result.add(node.source.name)
  for (const child of node.children || []) collectSources(child, result)
  return result
}

function TextBlock({ title, text }: { title: string; text: string }) {
  if (!text.trim()) return null
  return <article className="sheet-v3__story-card"><span>{title}</span><p>{text}</p></article>
}

function SectionHeading({ eyebrow, title, count, action }: { eyebrow: string; title: string; count?: number; action?: ReactNode }) {
  return <div className="sheet-v3__section-heading"><div><span>{eyebrow}</span><h3>{title}</h3></div>{action ?? (count !== undefined ? <small>{count}</small> : null)}</div>
}

function FocusHeader({ title, detail, onBack }: { title: string; detail: string; onBack: () => void }) {
  return <header className="sheet-v4__focus-head">
    <button type="button" onClick={onBack} aria-label="Назад к листу">←</button>
    <div><small>Раздел листа</small><h3>{title}</h3><p>{detail}</p></div>
  </header>
}

type Props = {
  input: CharacterEngineInput
  contract: ResolvedCharacterContract
  narrative: CharacterSheet
  characterClass: string
  spellcastingAbility?: AbilityKey
  canManage: boolean
  features: CharacterFeature[]
  onEditSheet: () => void
  onEditResources: () => void
  onAddFeature: () => void
  onEditFeature: (feature: CharacterFeature) => void
  onDeleteFeature: (featureId: string) => Promise<{ ok: boolean; error?: string }>
  onOpenClassReference?: () => void
  onOpenSpells: (level?: number) => void
}

export default function ResolvedCharacterSheet({
  input,
  contract,
  narrative,
  characterClass,
  spellcastingAbility,
  canManage,
  features,
  onEditSheet,
  onEditResources,
  onAddFeature,
  onEditFeature,
  onDeleteFeature,
  onOpenClassReference,
  onOpenSpells,
}: Props) {
  const abilityRailRef = useRef<HTMLDivElement>(null)
  const [activeAbility, setActiveAbility] = useState(0)
  const [section, setSection] = useState<SheetSection>("overview")
  const [explain, setExplain] = useState<{ title: string; query: CharacterExplainQuery } | null>(null)
  const [featureMenu, setFeatureMenu] = useState<CharacterFeature | null>(null)
  const [featureError, setFeatureError] = useState("")
  const bindFeature = useLongPressItem<CharacterFeature>((feature) => setFeatureMenu(feature))

  const explanation = useMemo(() => explain ? explainCharacter(input, explain.query) : null, [explain, input])
  const classPackages = registeredCharacterClassPackages(narrative.character_id)
  const visibleResources = contract.resources.filter((resource) => resource.max.value > 0 && !/^spell_slot_\d+$/.test(resource.key))
  const magic = spellcastingAbility ? contract.spellcasting.byAbility[spellcastingAbility] : null
  const slots = spellSlotResources(contract.resources)
  const featureGrants = [...contract.capabilities.features, ...contract.capabilities.traits]
  const protectionCount = contract.capabilities.resistances.length + contract.capabilities.immunities.length
  const knowledgeCount = contract.capabilities.senses.length + contract.capabilities.languages.length + contract.capabilities.proficiencies.length
  const hasNarrative = Boolean(
    narrative.personality_traits.trim() || narrative.ideals.trim() || narrative.bonds.trim() || narrative.flaws.trim() || narrative.backstory.trim() || narrative.notes.trim(),
  )
  const hasIdentity = Boolean(narrative.race || narrative.background || narrative.alignment)
  const hasMagic = Boolean(magic || slots.length > 0 || contract.spells.length > 0)

  const classLabel = classPackages.length
    ? classPackages.map((entry) => `${entry.className} ${entry.level}`).join(" · ")
    : `${characterClass || "Класс не указан"} · ${contract.level} ур.`
  const subclassLabel = classPackages.map((entry) => entry.subclassName).filter(Boolean).join(" · ") || "Подкласс не выбран"

  function explainNumber(title: string, target: CharacterExplainQuery & { kind: "number" }) {
    setExplain({ title, query: target })
  }

  function showAbility(index: number) {
    const rail = abilityRailRef.current
    if (!rail) return
    rail.scrollTo({ left: rail.clientWidth * index, behavior: "smooth" })
    setActiveAbility(index)
  }

  function openSection(next: SheetSection) {
    setSection(next)
    window.requestAnimationFrame(() => document.querySelector(".sheet-v4__focus-head")?.scrollIntoView({ behavior: "smooth", block: "start" }))
  }

  function backToOverview() {
    setSection("overview")
    window.requestAnimationFrame(() => document.querySelector(".sheet-v3__combat")?.scrollIntoView({ behavior: "smooth", block: "start" }))
  }

  async function removeFeature(feature: CharacterFeature) {
    if (!window.confirm(`Удалить особенность «${feature.name}»?`)) return
    const result = await onDeleteFeature(feature.id)
    if (!result.ok) setFeatureError(result.error || "Не удалось удалить особенность.")
  }

  function featureActions(feature: CharacterFeature): ContextAction[] {
    if (!canManage) return []
    return [
      { id: "edit", label: "Редактировать", detail: "Название, тип и описание", icon: "✎", onSelect: () => onEditFeature(feature) },
      { id: "delete", label: "Удалить особенность", detail: "Она исчезнет из листа", icon: "×", danger: true, onSelect: () => void removeFeature(feature) },
    ]
  }

  return <section className="character-tab-section sheet-v3 sheet-v4">
    {canManage && <div className="sheet-v3__admin" aria-label="Инструменты ведущего">
      <button type="button" onClick={onEditSheet}><span>✎</span> Лист</button>
      <button type="button" onClick={onEditResources}><span>♥</span> Ресурсы</button>
      <button type="button" onClick={onAddFeature}><span>＋</span> Особенность</button>
    </div>}

    {section === "overview" && <>
      <section className="sheet-v3__combat sheet-v4__combat" aria-label="Основные показатели">
        <button className="sheet-v3__vital" type="button" onClick={() => explainNumber("Максимум здоровья", { kind: "number", target: "combat.maxHp" })}>
          <span>Здоровье</span><strong>{contract.combat.currentHp}<em> / {contract.combat.maxHp.value}</em></strong><small>{contract.combat.tempHp > 0 ? `+${contract.combat.tempHp} временных` : "HP"}</small>
        </button>
        <button type="button" onClick={() => explainNumber("Класс доспеха", { kind: "number", target: "combat.ac" })}><span>КД</span><strong>{contract.combat.ac.value}</strong><small>Защита</small></button>
        <button type="button" onClick={() => explainNumber("Инициатива", { kind: "number", target: "combat.initiative" })}><span>Инициатива</span><strong>{signed(contract.combat.initiative.value)}</strong><small>Порядок хода</small></button>
        <button type="button" onClick={() => explainNumber("Скорость", { kind: "number", target: "combat.speed" })}><span>Скорость</span><strong>{contract.combat.speed.value}</strong><small>фт.</small></button>
        <button type="button" onClick={() => explainNumber("Бонус мастерства", { kind: "number", target: "core.proficiencyBonus" })}><span>Мастерство</span><strong>{signed(contract.proficiencyBonus.value)}</strong><small>Бонус</small></button>
        <button type="button" onClick={() => explainNumber("Пассивное восприятие", { kind: "number", target: "passives.perception" })}><span>Пассивное</span><strong>{contract.passives.perception.value}</strong><small>Восприятие</small></button>
      </section>

      <section className="sheet-v3__section sheet-v3__abilities sheet-v4__abilities">
        <SectionHeading eyebrow="Проверки и спасброски" title="Характеристики" />
        <div className="sheet-v3__ability-tabs" role="tablist" aria-label="Характеристики">
          {abilities.map(([key, short], index) => <button type="button" role="tab" aria-selected={activeAbility === index} className={activeAbility === index ? "is-active" : ""} key={key} onClick={() => showAbility(index)}>{short}</button>)}
        </div>
        <div className="sheet-v3__ability-rail" ref={abilityRailRef} onScroll={(event) => { const width = event.currentTarget.clientWidth; if (width) setActiveAbility(Math.round(event.currentTarget.scrollLeft / width)) }}>
          {abilities.map(([key, short, label]) => {
            const ability = contract.abilities[key]
            const save = contract.savingThrows[key]
            const relatedSkills = skills.filter(([skillKey]) => contract.skills[skillKey].ability === key)
            return <article className="sheet-v3__ability-page" key={key} role="tabpanel">
              <div className="sheet-v3__ability-score">
                <button type="button" onClick={() => explainNumber(label, { kind: "number", target: `abilities.${key}` })}><span>{short}</span><strong>{ability.value}</strong><em>{signed(ability.modifier)}</em></button>
                <div><span>{label}</span><button type="button" onClick={() => explainNumber(`Спасбросок: ${label}`, { kind: "number", target: `savingThrows.${key}.bonus` })}><i className={save.proficiencyRank > 0 ? "is-proficient" : ""}>{proficiencyMark(save.proficiencyRank)}</i>Спасбросок<strong>{signed(save.bonus.value)}</strong></button></div>
              </div>
              <div className="sheet-v3__skill-column">
                {relatedSkills.length ? relatedSkills.map(([skillKey, skillLabel]) => {
                  const skill = contract.skills[skillKey]
                  return <button type="button" key={skillKey} onClick={() => explainNumber(skillLabel, { kind: "number", target: `skills.${skillKey}.bonus` })}><i className={skill.proficiencyRank > 0 ? "is-proficient" : ""}>{proficiencyMark(skill.proficiencyRank)}</i><span><strong>{skillLabel}</strong><small>{abilityShort[skill.ability]}</small></span><b>{signed(skill.bonus.value)}</b></button>
                }) : <p>Для этой характеристики нет отдельных навыков.</p>}
              </div>
            </article>
          })}
        </div>
        <p className="sheet-v3__swipe-hint"><span aria-hidden="true">↔</span> Листай между характеристиками</p>
      </section>

      <section className="sheet-v4__directory" aria-label="Разделы листа">
        <header><small>Всё остальное — по разделам</small><h3>Разделы листа</h3><p>Открывай только то, что нужно сейчас. Никакой длинной ленты одинаковых панелей.</p></header>
        <div className="sheet-v4__directory-list">
          <button type="button" onClick={onOpenClassReference} disabled={!onOpenClassReference}><span className="sheet-v4__directory-icon">◇</span><span><small>Класс</small><strong>Способности класса</strong><em>{classLabel}</em></span><b>›</b></button>
          <button type="button" onClick={onOpenClassReference} disabled={!onOpenClassReference}><span className="sheet-v4__directory-icon">✦</span><span><small>Подкласс</small><strong>Способности подкласса</strong><em>{subclassLabel}</em></span><b>›</b></button>
          {hasMagic && <button type="button" onClick={() => onOpenSpells()}><span className="sheet-v4__directory-icon">⌁</span><span><small>Магия</small><strong>Заклинания</strong><em>{contract.spells.length ? `${contract.spells.length} доступно` : "Книга заклинаний"}</em></span><b>›</b></button>}
          {visibleResources.length > 0 && <button type="button" onClick={() => openSection("resources")}><span className="sheet-v4__directory-icon">◉</span><span><small>Запасы</small><strong>Ресурсы</strong><em>{visibleResources.length} активных</em></span><b>›</b></button>}
          {contract.actions.length > 0 && <button type="button" onClick={() => openSection("actions")}><span className="sheet-v4__directory-icon">⚔</span><span><small>Механики</small><strong>Действия</strong><em>{contract.actions.length} доступных</em></span><b>›</b></button>}
          {(featureGrants.length > 0 || canManage) && <button type="button" onClick={() => openSection("features")}><span className="sheet-v4__directory-icon">◆</span><span><small>Особое</small><strong>Фиты и особенности</strong><em>{featureGrants.length ? `${featureGrants.length} записей` : "Пока нет"}</em></span><b>›</b></button>}
          {(protectionCount + knowledgeCount > 0) && <button type="button" onClick={() => openSection("defenses")}><span className="sheet-v4__directory-icon">◈</span><span><small>Постоянное</small><strong>Защиты и владения</strong><em>{protectionCount + knowledgeCount} записей</em></span><b>›</b></button>}
          {hasIdentity && <button type="button" onClick={() => openSection("identity")}><span className="sheet-v4__directory-icon">◎</span><span><small>Персонаж</small><strong>Происхождение</strong><em>{[narrative.race, narrative.background].filter(Boolean).join(" · ")}</em></span><b>›</b></button>}
          {hasNarrative && <button type="button" onClick={() => openSection("story")}><span className="sheet-v4__directory-icon">≡</span><span><small>Ролевая часть</small><strong>Характер и история</strong><em>Черты, связи и заметки</em></span><b>›</b></button>}
        </div>
      </section>
    </>}

    {section === "resources" && <section className="sheet-v4__focus"><FocusHeader title="Ресурсы" detail="Все конечные запасы персонажа в одном месте." onBack={backToOverview}/><div className="sheet-v3__resource-list sheet-v4__focus-list">{visibleResources.map((resource) => <button type="button" key={resource.stateKey} onClick={() => setExplain({ title: resourceLabel(contract, resource.key, resource.variantKey), query: { kind: "resource", stateKey: resource.stateKey } })}><span><strong>{resourceLabel(contract, resource.key, resource.variantKey)}</strong><small>{rechargeLabel(resource.recharge.triggers)}</small></span><b>{resource.current}<em> / {resource.max.value}</em></b></button>)}</div></section>}

    {section === "actions" && <section className="sheet-v4__focus"><FocusHeader title="Действия" detail="Боевые и специальные действия без остальных разделов вокруг." onBack={backToOverview}/><div className="sheet-v3__action-list sheet-v4__focus-list">{contract.actions.map((action) => <button type="button" className={action.available ? "" : "is-unavailable"} key={action.stateKey} onClick={() => setExplain({ title: action.label || friendlyKey(action.key), query: { kind: "action", stateKey: action.stateKey } })}><span className="sheet-v3__action-icon" aria-hidden="true">{action.attack ? "⚔" : "✦"}</span><span className="sheet-v3__action-copy"><strong>{action.label || friendlyKey(action.key)}</strong><small>{friendlyKey(action.economy)}{action.resourceCosts.length ? ` · ${action.resourceCosts.map((cost) => `${cost.amount} ${resourceLabel(contract, cost.key, cost.variantKey)}`).join(", ")}` : ""}</small></span><span className="sheet-v3__action-values">{action.attack && <em>Атака {signed(action.attack.bonus.value)}</em>}{action.damage.map((damage) => <em key={damage.key}>{damage.dice ? `${damage.dice.count}к${damage.dice.sides}` : ""}{damage.modifier.value ? signed(damage.modifier.value) : ""}{damage.type ? ` ${friendlyKey(damage.type).toLocaleLowerCase("ru-RU")}` : ""}</em>)}</span><span className="sheet-v3__chevron" aria-hidden="true">›</span></button>)}</div></section>}

    {section === "features" && <section className="sheet-v4__focus"><FocusHeader title="Фиты и особенности" detail="Уникальные правила персонажа собраны отдельно от класса и основных статов." onBack={backToOverview}/>{canManage && <button className="sheet-v4__focus-add" type="button" onClick={onAddFeature}>＋ Добавить особенность</button>}{featureError && <div className="auth-error">{featureError}</div>}<div className="sheet-v3__feature-list sheet-v4__feature-list">{featureGrants.map((entry) => {
      const payload = objectPayload(entry.payload)
      const legacyId = typeof payload?.legacyFeatureId === "string" ? payload.legacyFeatureId : null
      const feature = legacyId ? features.find((item) => item.id === legacyId) : undefined
      return <article key={`${entry.target}:${entry.key}:${entry.variantKey}`} {...(feature && canManage ? bindFeature(feature) : {})} style={{ touchAction: "pan-y" }}><div><strong>{grantLabel(entry)}</strong>{feature && canManage && <button type="button" onClick={() => onEditFeature(feature)} aria-label={`Редактировать ${feature.name}`}>✎</button>}</div>{grantDescription(entry) && <p>{grantDescription(entry)}</p>}</article>
    })}{!featureGrants.length && <div className="sheet-v4__empty">У персонажа пока нет отдельных фитов или особенностей.</div>}</div></section>}

    {section === "defenses" && <section className="sheet-v4__focus"><FocusHeader title="Защиты и владения" detail="Постоянные свойства собраны в одном спокойном разделе." onBack={backToOverview}/>{(contract.capabilities.resistances.length > 0 || contract.capabilities.immunities.length > 0) && <div className="sheet-v4__group"><SectionHeading eyebrow="Устойчивость" title="Защиты"/><div className="sheet-v3__chips">{contract.capabilities.resistances.map((entry) => <span key={`r:${entry.key}:${entry.variantKey}`}><small>Сопротивление</small>{grantLabel(entry)}</span>)}{contract.capabilities.immunities.map((entry) => <span key={`i:${entry.key}:${entry.variantKey}`}><small>Иммунитет</small>{grantLabel(entry)}</span>)}</div></div>}{(["senses", "languages", "proficiencies"] as const).map((group) => {
      const entries = contract.capabilities[group]
      if (!entries.length) return null
      const labels = { senses: ["Восприятие мира", "Чувства"], languages: ["Общение", "Языки"], proficiencies: ["Подготовка", "Владения"] }
      return <div className="sheet-v4__group" key={group}><SectionHeading eyebrow={labels[group][0]} title={labels[group][1]} count={entries.length}/><div className="sheet-v3__chips sheet-v3__chips--plain">{entries.map((entry) => <span key={`${entry.key}:${entry.variantKey}`}>{grantLabel(entry)}</span>)}</div></div>
    })}</section>}

    {section === "identity" && <section className="sheet-v4__focus"><FocusHeader title="Происхождение" detail="То, кем персонаж является, без боевых механик вокруг." onBack={backToOverview}/><div className="sheet-v4__identity-list">{narrative.race && <div><span>Раса / вид</span><strong>{narrative.race}</strong></div>}{narrative.background && <div><span>Предыстория</span><strong>{narrative.background}</strong></div>}{narrative.alignment && <div><span>Мировоззрение</span><strong>{narrative.alignment}</strong></div>}</div></section>}

    {section === "story" && <section className="sheet-v4__focus"><FocusHeader title="Характер и история" detail="Ролевая часть персонажа — отдельно от расчётов и механик." onBack={backToOverview}/><div className="sheet-v3__story-list sheet-v4__story-list"><TextBlock title="Черты личности" text={narrative.personality_traits}/><TextBlock title="Идеалы" text={narrative.ideals}/><TextBlock title="Привязанности" text={narrative.bonds}/><TextBlock title="Слабости" text={narrative.flaws}/><TextBlock title="Предыстория" text={narrative.backstory}/><TextBlock title="Заметки" text={narrative.notes}/></div></section>}

    {explain && explanation && <div className="sheet-backdrop" onMouseDown={() => setExplain(null)}><div className="bottom-sheet sheet-v3__explain" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-handle"/><header><div><span>Расчёт персонажа</span><h3>{explain.title}</h3></div><button type="button" onClick={() => setExplain(null)} aria-label="Закрыть">×</button></header>{explanation.value !== undefined && <div className="sheet-v3__explain-value">{typeof explanation.value === "number" ? signed(explanation.value) : String(explanation.value)}</div>}<p>Значение рассчитано из базовых параметров и всех действующих особенностей.</p><div className="sheet-v3__explain-sources"><strong>Источники</strong>{[...collectSources(explanation.tree)].length ? [...collectSources(explanation.tree)].map((source) => <span key={source}>{source}</span>) : <span>Базовые параметры персонажа</span>}</div></div></div>}

    {featureMenu && <ContextActionSheet title={featureMenu.name} subtitle="Действия с особенностью" actions={featureActions(featureMenu)} onClose={() => setFeatureMenu(null)}/>} 
  </section>
}
