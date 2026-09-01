import { useMemo, useState } from "react"
import type {
  AbilityKey,
  ResolvedAction,
  ResolvedCharacterContract,
  ResolvedResource,
  ResolvedSpell,
  ResolvedSpellAccess,
  ResolvedSpellCastingMethod,
  ResolvedSpellResourceOption,
  SkillKey,
} from "../../character-engine/index.ts"
import { spellSlotResources } from "../characters/spellSlots.ts"
import { buildChatActionModel, type ChatActionSourceGroup } from "./chatActionModel.ts"
import "./ChatActionSheet.css"

type Tab = "dice" | "attacks" | "spells" | "class" | "unique"
type SpellChannel = "cantrips" | string | null
type AttackChannel = "weapon" | "spell" | "special" | null

export type SpellCastSelection = {
  spell: ResolvedSpell
  accessKey: string
  methodKey: string
  optionKey?: string
}
export type FreeDiceRequest = { count: number; sides: number; modifier: number }

type Props = {
  characterName?: string | null
  contract: ResolvedCharacterContract | null
  loading?: boolean
  includePrivateSources?: boolean
  onClose: () => void
  onFreeRoll: (request: FreeDiceRequest) => boolean | void | Promise<boolean | void>
  onCheck: (label: string, modifier: number, kind: "ability" | "skill" | "save") => void | Promise<void>
  onAction: (action: ResolvedAction) => void | Promise<void>
  onSpell: (spell: ResolvedSpell) => void | Promise<void>
}

const abilityRows: Array<[AbilityKey, string, string]> = [
  ["strength", "СИЛ", "Сила"], ["dexterity", "ЛОВ", "Ловкость"], ["constitution", "ТЕЛ", "Телосложение"],
  ["intelligence", "ИНТ", "Интеллект"], ["wisdom", "МДР", "Мудрость"], ["charisma", "ХАР", "Харизма"],
]
const skillNames: Record<SkillKey, string> = {
  acrobatics: "Акробатика", animal_handling: "Уход за животными", arcana: "Магия", athletics: "Атлетика", deception: "Обман", history: "История",
  insight: "Проницательность", intimidation: "Запугивание", investigation: "Анализ", medicine: "Медицина", nature: "Природа", perception: "Восприятие",
  performance: "Выступление", persuasion: "Убеждение", religion: "Религия", sleight_of_hand: "Ловкость рук", stealth: "Скрытность", survival: "Выживание",
}
const standardDice = [4, 6, 8, 10, 12, 20, 100]
const signed = (value: number) => value >= 0 ? `+${value}` : String(value)
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min))

function payloadLabel(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null
  const label = (payload as Record<string, unknown>).label
  return typeof label === "string" && label.trim() ? label.trim() : null
}

function resourceLabels(contract: ResolvedCharacterContract | null) {
  const result = new Map<string, string>()
  if (!contract) return result
  for (const grant of contract.grants) {
    if (grant.target !== "resource") continue
    const label = payloadLabel(grant.payload)
    if (!label) continue
    const stateKey = grant.variantKey === "default" ? grant.key : `${grant.key}::${grant.variantKey}`
    result.set(stateKey, label)
  }
  return result
}

function resourceName(resource: ResolvedResource, labels: Map<string, string>) {
  const explicit = labels.get(resource.stateKey)
  if (explicit) return explicit
  return resource.key.split(/[_-]+/g).map((part) => part ? part[0]!.toLocaleUpperCase("ru-RU") + part.slice(1) : part).join(" ")
}

function actionSummary(action: ResolvedAction, resources: Map<string, ResolvedResource>, labels: Map<string, string>) {
  const parts: string[] = []
  if (action.attack) parts.push(`атака ${signed(action.attack.bonus.value)}`)
  const first = action.damage[0]
  if (first?.dice) parts.push(`${first.dice.count}d${first.dice.sides}${first.modifier.value ? signed(first.modifier.value) : ""} ${first.type}`)
  if (action.resourceCosts.length) parts.push(action.resourceCosts.map((cost) => {
    const resolved = resources.get(cost.stateKey)
    return resolved ? `${cost.amount} ${resourceName(resolved, labels)}` : `${cost.amount} ${cost.key}`
  }).join(" + "))
  return parts.join(" · ") || action.economy.split("_").join(" ")
}

function spellSummary(spell: ResolvedSpell) {
  const sources = [...new Set(spell.accesses.flatMap((access) => access.sources.map((ref) => ref.source.name)).filter(Boolean))]
  return [spell.identity.level === 0 ? "Кантрип" : `${spell.identity.level} уровень`, spell.identity.school || "", sources.slice(0, 2).join(" · ")].filter(Boolean).join(" · ")
}

function exactSpellCast(selection: SpellCastSelection): ResolvedSpell {
  const access = selection.spell.accesses.find((entry) => entry.key === selection.accessKey)
  const method = access?.methods.find((entry) => entry.key === selection.methodKey)
  if (!access || !method) return selection.spell
  const option = selection.optionKey ? method.resourceOptions.find((entry) => entry.key === selection.optionKey) : undefined
  const selectedMethod: ResolvedSpellCastingMethod = {
    ...method,
    available: true,
    resourceOptions: option ? [{ ...option, available: true }] : [],
  }
  const selectedAccess: ResolvedSpellAccess = {
    ...access,
    available: true,
    methods: [selectedMethod],
  }
  return { ...selection.spell, available: true, accesses: [selectedAccess] }
}

function firstSpellCast(spell: ResolvedSpell): SpellCastSelection | null {
  for (const access of spell.accesses) {
    if (!access.available) continue
    for (const method of access.methods) {
      if (!method.available) continue
      const option = method.resourceOptions.find((entry) => entry.available)
      if (method.resourceOptions.length === 0 || option) return {
        spell,
        accessKey: access.key,
        methodKey: method.key,
        ...(option ? { optionKey: option.key } : {}),
      }
    }
  }
  return null
}

function cantripCast(spell: ResolvedSpell): SpellCastSelection | null {
  if (spell.identity.level !== 0) return null
  for (const access of spell.accesses) {
    if (!access.available) continue
    for (const method of access.methods) {
      if (!method.available) continue
      const option = method.resourceOptions.find((item) => item.available && item.castLevel === 0)
      if (method.resourceOptions.length === 0 || option) return { spell, accessKey: access.key, methodKey: method.key, ...(option ? { optionKey: option.key } : {}) }
    }
  }
  return null
}

function spellCastForSlot(spell: ResolvedSpell, level: number, stateKey: string): SpellCastSelection | null {
  for (const access of spell.accesses) {
    if (!access.available) continue
    for (const method of access.methods) {
      if (!method.available) continue
      const option = method.resourceOptions.find((item) => item.available && item.castLevel === level && item.costs.some((cost) => cost.stateKey === stateKey && cost.available))
      if (option) return { spell, accessKey: access.key, methodKey: method.key, optionKey: option.key }
    }
  }
  return null
}

function actionIsAttack(action: ResolvedAction) {
  return Boolean(action.attack) || action.damage.some((entry) => Boolean(entry.dice))
}

function ResourceMeter({ key, resource, labels }: { key?: string | number; resource: ResolvedResource; labels: Map<string, string> }) {
  const max = Math.max(0, resource.max.value)
  const current = Math.max(0, Math.min(resource.current, max))
  return <div className="action-resource-meter"><div><span>{resourceName(resource, labels)}</span><strong>{current}/{max}</strong></div><progress max={Math.max(1, max)} value={current} /></div>
}

function SpellSlotFlow({ spells, contract, channel, setChannel, busy, onCast, emptyTitle }: {
  spells: ResolvedSpell[]
  contract: ResolvedCharacterContract
  channel: SpellChannel
  setChannel: (value: SpellChannel) => void
  busy: boolean
  onCast: (selection: SpellCastSelection) => void
  emptyTitle: string
}) {
  const slots = useMemo(() => spellSlotResources(contract.resources), [contract.resources])
  const cantrips = useMemo(() => spells.map(cantripCast).filter((item): item is SpellCastSelection => item !== null), [spells])
  const selectedSlot = channel && channel !== "cantrips" ? slots.find(({ resource }) => resource.stateKey === channel) || null : null
  const casts = useMemo(() => {
    if (!channel) return []
    if (channel === "cantrips") return cantrips
    const slot = slots.find(({ resource }) => resource.stateKey === channel)
    if (!slot || slot.resource.current <= 0) return []
    return spells.map((spell) => spellCastForSlot(spell, slot.level, slot.resource.stateKey)).filter((item): item is SpellCastSelection => item !== null)
  }, [cantrips, channel, slots, spells])

  if (!spells.length) return <div className="action-v2-empty"><span>✧</span><strong>{emptyTitle}</strong><p>Подходящих заклинаний сейчас нет.</p></div>
  if (!channel) return <div className="action-spell-picker">
    <header><small>Шаг 1</small><strong>Выбери ячейку</strong><p>После этого покажем только заклинания, которые можно применить именно этой ячейкой.</p></header>
    <div className="action-spell-slots">
      {cantrips.length > 0 && <button className="action-spell-slot action-spell-slot--cantrip" type="button" onClick={() => setChannel("cantrips")}><span className="action-spell-slot__level">∞</span><span className="action-spell-slot__copy"><strong>Заговоры</strong><small>Без расхода ячейки · {cantrips.length}</small></span><em>›</em></button>}
      {slots.map(({ resource, level }) => {
        const maximum = Math.max(0, Math.round(resource.max.value))
        const current = Math.max(0, Math.min(maximum, Math.round(resource.current)))
        const depleted = current <= 0
        return <button className={`action-spell-slot ${depleted ? "is-depleted" : ""}`} type="button" key={resource.stateKey} disabled={busy || depleted} onClick={() => setChannel(resource.stateKey)}><span className="action-spell-slot__level">{level}</span><span className="action-spell-slot__copy"><strong>Ячейка {level} уровня</strong><span className="action-spell-slot__orbs" aria-hidden="true">{Array.from({ length: maximum }, (_, index) => <i className={index < current ? "is-lit" : ""} key={index} />)}</span><small>{depleted ? "Ячейки закончились" : `${current} из ${maximum} доступно`}</small></span><b>{current}/{maximum}</b></button>
      })}
    </div>
  </div>
  return <div className="action-spell-results">
    <div className="action-spell-results__head"><button type="button" onClick={() => setChannel(null)}>‹ Ячейки</button><div><small>{channel === "cantrips" ? "Без ячейки" : `Ячейка ${selectedSlot?.level || "—"} уровня`}</small><strong>Шаг 2 · {casts.length} доступно</strong>{selectedSlot && <span>{Math.round(selectedSlot.resource.current)}/{Math.round(selectedSlot.resource.max.value)} ячеек осталось</span>}</div></div>
    {casts.length ? <div className="action-v2-list action-v2-list--cards">{casts.map((selection) => <button disabled={busy} type="button" key={`${selection.spell.key}:${selection.accessKey}:${selection.methodKey}:${selection.optionKey || "free"}`} onClick={() => onCast(selection)}><i>✧</i><span><strong>{selection.spell.identity.name}</strong><small>{spellSummary(selection.spell)}</small></span><em>›</em></button>)}</div> : <div className="action-v2-empty action-v2-empty--compact"><span>✧</span><strong>Этой ячейкой нечего применить</strong><p>Вернись и выбери другой уровень.</p></div>}
  </div>
}

function SourceGroup({ key, group, kind, resources, labels, busy, onAction, onSpell }: {
  key?: string | number
  group: ChatActionSourceGroup
  kind: "class" | "unique"
  resources: Map<string, ResolvedResource>
  labels: Map<string, string>
  busy: boolean
  onAction: (action: ResolvedAction) => void
  onSpell: (spell: ResolvedSpell) => void
}) {
  return <section className={`action-source-group action-source-group--${kind}`}><header><span>{kind === "class" ? "◇" : "✦"}</span><div><small>{kind === "class" ? "Класс / подкласс" : "Особый источник"}</small><strong>{group.name}</strong></div></header>{group.resources.length > 0 && <div className="action-source-resources">{group.resources.map((resource) => <ResourceMeter key={resource.stateKey} resource={resource} labels={labels} />)}</div>}{(group.actions.length > 0 || group.spells.length > 0) && <div className="action-v2-list action-v2-list--cards action-source-list">{group.actions.map((action) => <button disabled={busy || !action.available} type="button" key={`${action.key}:${action.variantKey}`} onClick={() => onAction(action)}><i>{action.attack ? "⚔" : "◆"}</i><span><strong>{action.label || action.key}</strong><small>{actionSummary(action, resources, labels)}</small></span><em>›</em></button>)}{group.spells.map((spell) => <button disabled={busy || !spell.available} type="button" key={`spell:${spell.key}`} onClick={() => onSpell(spell)}><i>✧</i><span><strong>{spell.identity.name}</strong><small>{spellSummary(spell)}</small></span><em>›</em></button>)}</div>}</section>
}

export default function ChatActionSheet({ characterName, contract, loading = false, includePrivateSources = true, onClose, onFreeRoll, onCheck, onAction, onSpell }: Props) {
  const [tab, setTab] = useState<Tab>("dice")
  const [attackChannel, setAttackChannel] = useState<AttackChannel>(null)
  const [attackSpellChannel, setAttackSpellChannel] = useState<SpellChannel>(null)
  const [spellChannel, setSpellChannel] = useState<SpellChannel>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [diceCount, setDiceCount] = useState(1)
  const [diceSides, setDiceSides] = useState(20)
  const [diceModifier, setDiceModifier] = useState(0)
  const model = useMemo(() => buildChatActionModel(contract, includePrivateSources), [contract, includePrivateSources])
  const resources = useMemo(() => new Map((contract?.resources || []).map((resource) => [resource.stateKey, resource])), [contract])
  const labels = useMemo(() => resourceLabels(contract), [contract])
  const skills = useMemo(() => contract ? Object.entries(contract.skills).map(([key, value]) => ({ ...value, key: key as SkillKey })).sort((a, b) => skillNames[a.key].localeCompare(skillNames[b.key], "ru")) : [], [contract])
  const classCount = model.classGroups.reduce((sum, group) => sum + group.actions.length + group.spells.length, 0)
  const uniqueCount = model.uniqueGroups.reduce((sum, group) => sum + group.actions.length + group.spells.length, 0)
  const attackSpellKeys = useMemo(() => new Set(model.attackSpells.map((spell) => spell.key)), [model.attackSpells])
  const specialGroups = useMemo(() => model.uniqueGroups.map((group) => ({ ...group, actions: group.actions.filter(actionIsAttack), spells: group.spells.filter((spell) => attackSpellKeys.has(spell.key)) })).filter((group) => (group.sourceType === "inventory_item" || group.id.startsWith("item:")) && (group.actions.length || group.spells.length)), [attackSpellKeys, model.uniqueGroups])
  const specialCount = specialGroups.reduce((sum, group) => sum + group.actions.length + group.spells.length, 0)

  async function run(task: () => void | Promise<void>) { setBusy(true); setError(""); try { await task() } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось выполнить действие.") } finally { setBusy(false) } }
  function cast(selection: SpellCastSelection) { return onSpell(exactSpellCast(selection)) }
  function castDefault(spell: ResolvedSpell) { const selection = firstSpellCast(spell); if (!selection) throw new Error("У заклинания нет доступного способа сотворения."); return cast(selection) }
  function chooseTab(next: Tab) { setTab(next); setAttackChannel(null); setAttackSpellChannel(null); if (next === "spells") setSpellChannel(null) }
  const notation = `${diceCount}d${diceSides}${diceModifier ? signed(diceModifier) : ""}`
  const tabs: Array<{ key: Tab; label: string; count?: number }> = [
    { key: "dice", label: "Кубы" }, { key: "attacks", label: "Атака", count: model.attacks.length + model.attackSpells.length + specialCount }, { key: "spells", label: "Магия", count: model.spells.length }, { key: "class", label: "Класс", count: classCount }, { key: "unique", label: "Уникальное", count: uniqueCount },
  ]

  return <div className="chat-action-backdrop" onMouseDown={onClose}><section className="chat-action-flow chat-action-flow--v3" onMouseDown={(event) => event.stopPropagation()}><div className="chat-action-flow__handle"/><header className="action-v2-head"><div><span>Игровое действие</span><strong>{characterName || "Свободный бросок"}</strong><small>{contract ? "Данные персонажа" : "Кубы доступны без листа персонажа"}</small></div><button type="button" onClick={onClose}>×</button></header><nav className="action-v3-tabs" aria-label="Тип действия">{tabs.map((item) => <button key={item.key} className={tab === item.key ? "is-active" : ""} type="button" onClick={() => chooseTab(item.key)}><span>{item.label}</span>{Boolean(item.count) && <small>{item.count}</small>}</button>)}</nav><div className="action-v2-body">
    {tab === "dice" && <><section className="free-dice-card"><div className="free-dice-head"><div><small>Без привязки к механике</small><strong>Свободный бросок</strong></div><b>{notation}</b></div><div className="free-dice-quick">{standardDice.map((sides) => <button key={sides} type="button" className={diceSides === sides ? "is-active" : ""} onClick={() => setDiceSides(sides)}>d{sides}</button>)}</div><div className="free-dice-controls"><label><span>Количество</span><div><button type="button" onClick={() => setDiceCount((value) => clamp(value - 1, 1, 40))}>−</button><input type="number" min="1" max="40" value={diceCount} onChange={(event) => setDiceCount(clamp(Number(event.target.value), 1, 40))}/><button type="button" onClick={() => setDiceCount((value) => clamp(value + 1, 1, 40))}>＋</button></div></label><label><span>Грани</span><div className="free-dice-sides"><b>d</b><input type="number" min="2" max="1000" value={diceSides} onChange={(event) => setDiceSides(clamp(Number(event.target.value), 2, 1000))}/></div></label><label><span>Модификатор</span><div><button type="button" onClick={() => setDiceModifier((value) => clamp(value - 1, -500, 500))}>−</button><input type="number" min="-500" max="500" value={diceModifier} onChange={(event) => setDiceModifier(clamp(Number(event.target.value), -500, 500))}/><button type="button" onClick={() => setDiceModifier((value) => clamp(value + 1, -500, 500))}>＋</button></div></label></div><button className="free-dice-roll" disabled={busy} type="button" onClick={() => void run(async () => { const sent = await onFreeRoll({ count: diceCount, sides: diceSides, modifier: diceModifier }); if (sent !== false) onClose() })}>◈ Бросить {notation}</button></section>{loading && <div className="action-inline-loading"><span className="status-spinner"/> Загружаем проверки персонажа…</div>}{!loading && contract && <><div className="action-v2-section-title"><strong>Характеристики и спасброски</strong><small>серверный d20</small></div><div className="action-v2-ability-grid">{abilityRows.map(([key, short, label]) => <div className="action-v2-ability" key={key}><button disabled={busy} type="button" onClick={() => void run(() => onCheck(label, contract.abilities[key].modifier, "ability"))}><span>{short}</span><strong>{signed(contract.abilities[key].modifier)}</strong></button><button disabled={busy} type="button" onClick={() => void run(() => onCheck(`Спасбросок: ${label}`, contract.savingThrows[key].bonus.value, "save"))}><small>Спас</small><b>{signed(contract.savingThrows[key].bonus.value)}</b></button></div>)}</div><div className="action-v2-section-title"><strong>Навыки</strong><small>{skills.length}</small></div><div className="action-v2-list">{skills.map((skill) => <button disabled={busy} type="button" key={skill.key} onClick={() => void run(() => onCheck(skillNames[skill.key], skill.bonus.value, "skill"))}><span><strong>{skillNames[skill.key]}</strong><small>{skill.proficiencyRank >= 2 ? "Экспертиза" : skill.proficiencyRank ? "Владение" : "Без владения"}</small></span><b>{signed(skill.bonus.value)}</b></button>)}</div></>}</>}
    {tab !== "dice" && loading && <div className="action-v2-empty"><span className="status-spinner"/><p>Собираем resolved-персонажа…</p></div>}
    {tab !== "dice" && !loading && !contract && <div className="action-v2-empty"><span>◇</span><strong>Нужен персонаж</strong><p>Эта вкладка использует его лист.</p></div>}
    {!loading && contract && tab === "attacks" && <>{!attackChannel ? <div className="action-v2-list action-v2-list--cards"><button type="button" disabled={!model.attacks.length} onClick={() => setAttackChannel("weapon")}><i>⚔</i><span><strong>Оружие</strong><small>{model.attacks.length ? `${model.attacks.length} доступно` : "Нет доступных атак оружием"}</small></span><em>›</em></button><button type="button" disabled={!model.attackSpells.length} onClick={() => setAttackChannel("spell")}><i>✧</i><span><strong>Заклинание</strong><small>{model.attackSpells.length ? `Урон · ${model.attackSpells.length} доступно` : "Нет наносящих урон заклинаний"}</small></span><em>›</em></button><button type="button" disabled={!specialCount} onClick={() => setAttackChannel("special")}><i>◆</i><span><strong>Особое</strong><small>{specialCount ? `Предметы и расходники · ${specialCount}` : "Нет особых атак из предметов"}</small></span><em>›</em></button></div> : <><div className="action-spell-results__head"><button type="button" onClick={() => { setAttackChannel(null); setAttackSpellChannel(null) }}>‹ Атака</button><div><small>Тип атаки</small><strong>{attackChannel === "weapon" ? "Оружие" : attackChannel === "spell" ? "Заклинание" : "Особое"}</strong></div></div>{attackChannel === "weapon" && <div className="action-v2-list action-v2-list--cards">{model.attacks.map((action) => <button disabled={busy || !action.available} type="button" key={`${action.key}:${action.variantKey}`} onClick={() => void run(() => onAction(action))}><i>⚔</i><span><strong>{action.label || action.key}</strong><small>{actionSummary(action, resources, labels)}</small></span><em>›</em></button>)}</div>}{attackChannel === "spell" && <SpellSlotFlow spells={model.attackSpells} contract={contract} channel={attackSpellChannel} setChannel={setAttackSpellChannel} busy={busy} emptyTitle="Нет атакующих заклинаний" onCast={(selection) => void run(() => cast(selection))}/>} {attackChannel === "special" && <div className="action-source-stack">{specialGroups.map((group) => <SourceGroup key={group.id} group={group} kind="unique" resources={resources} labels={labels} busy={busy} onAction={(action) => void run(() => onAction(action))} onSpell={(spell) => void run(() => castDefault(spell))}/>)}</div>}</>}</>}
    {!loading && contract && tab === "spells" && <SpellSlotFlow spells={model.spells} contract={contract} channel={spellChannel} setChannel={setSpellChannel} busy={busy} emptyTitle="Нет доступной магии" onCast={(selection) => void run(() => cast(selection))}/>} 
    {!loading && contract && tab === "class" && <>{model.classGroups.length ? <div className="action-source-stack">{model.classGroups.map((group) => <SourceGroup key={group.id} group={group} kind="class" resources={resources} labels={labels} busy={busy} onAction={(action) => void run(() => onAction(action))} onSpell={(spell) => void run(() => castDefault(spell))}/>)}</div> : <div className="action-v2-empty"><span>◇</span><strong>Нет классовых действий</strong><p>Ресурсы и способности появятся здесь из CE.</p></div>}</>}
    {!loading && contract && tab === "unique" && <>{model.uniqueGroups.length ? <div className="action-source-stack">{model.uniqueGroups.map((group) => <SourceGroup key={group.id} group={group} kind="unique" resources={resources} labels={labels} busy={busy} onAction={(action) => void run(() => onAction(action))} onSpell={(spell) => void run(() => castDefault(spell))}/>)}</div> : <div className="action-v2-empty"><span>✦</span><strong>Нет уникальных способностей</strong><p>Артефакты, фиты и сюжетные способности появятся здесь по источнику.</p></div>}</>}
    {error && <div className="action-v3-error">{error}</div>}
  </div></section></div>
}
