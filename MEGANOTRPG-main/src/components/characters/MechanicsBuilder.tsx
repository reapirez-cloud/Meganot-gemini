import { useMemo, useState } from "react"
import type { AbilityKey, CharacterCondition, FormulaExpression, NumericTarget } from "../../character-engine/index.ts"
import { mechanicSummary } from "../../lib/characterMechanics.ts"
import type { StoredMechanic, StoredMechanics, StoredResourceMechanic } from "../../types/characterMechanics.ts"
import type { PersistentResourceRecoveryTrigger } from "../../types/characterResources.ts"

type ResourceOption = { key: string; label: string }
type Props = { value: StoredMechanics; onChange: (value: StoredMechanics) => void; itemMode?: boolean; templateMode?: boolean; resourceCatalog?: ResourceOption[] }
type EffectKind = "numeric" | "resistance" | "immunity" | "resource" | "action" | "spell"
type ConditionMode = "always" | "hp"
type ResourceMaxMode = "fixed" | "source_level" | "character_level" | "proficiency" | "ability"
type SpellPayment = "none" | "resource" | "slot"

const numericTargets: Array<{ value: NumericTarget; label: string }> = [
  { value: "combat.ac", label: "Класс доспеха" }, { value: "combat.initiative", label: "Инициатива" }, { value: "combat.maxHp", label: "Максимум HP" }, { value: "combat.speed", label: "Скорость" }, { value: "core.proficiencyBonus", label: "Бонус мастерства" },
  { value: "abilities.strength", label: "Сила" }, { value: "abilities.dexterity", label: "Ловкость" }, { value: "abilities.constitution", label: "Телосложение" }, { value: "abilities.intelligence", label: "Интеллект" }, { value: "abilities.wisdom", label: "Мудрость" }, { value: "abilities.charisma", label: "Харизма" },
]
const abilities: Array<{ value: AbilityKey; label: string }> = [
  { value: "strength", label: "Сила" }, { value: "dexterity", label: "Ловкость" }, { value: "constitution", label: "Телосложение" }, { value: "intelligence", label: "Интеллект" }, { value: "wisdom", label: "Мудрость" }, { value: "charisma", label: "Харизма" },
]
const damageTypes = ["рубящий", "колющий", "дробящий", "огонь", "холод", "молния", "кислота", "яд", "некротический", "излучение", "психический", "силовой", "гром"]
const rechargeOptions: Array<{ value: PersistentResourceRecoveryTrigger; label: string }> = [
  { value: "short_rest", label: "Короткий отдых" }, { value: "long_rest", label: "Долгий отдых" }, { value: "dawn", label: "Рассвет" },
]
function makeId() { return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `m-${Date.now()}-${Math.random().toString(36).slice(2)}` }
function keyFromLabel(value: string) { const cleaned = value.trim().toLocaleLowerCase("ru-RU").replace(/[^a-zа-яё0-9]+/giu, "-").replace(/^-|-$/g, ""); return cleaned || makeId() }
function reference(key: string): FormulaExpression { return { kind: "reference", key } }

export default function MechanicsBuilder({ value, onChange, itemMode = false, templateMode = false, resourceCatalog = [] }: Props) {
  const [adding, setAdding] = useState(false); const [kind, setKind] = useState<EffectKind>("numeric")
  const [activation, setActivation] = useState<"carried" | "equipped">(itemMode ? "equipped" : "carried")
  const [conditionMode, setConditionMode] = useState<ConditionMode>("always"); const [hpPercent, setHpPercent] = useState("50")
  const [numericTarget, setNumericTarget] = useState<NumericTarget>("combat.ac"); const [numericValue, setNumericValue] = useState("1"); const [grantKey, setGrantKey] = useState("fire")
  const [resourceLabel, setResourceLabel] = useState("Заряды"); const [resourceMax, setResourceMax] = useState("3"); const [resourceMaxMode, setResourceMaxMode] = useState<ResourceMaxMode>("fixed"); const [resourceAbility, setResourceAbility] = useState<AbilityKey>("wisdom")
  const [resourceRecharge, setResourceRecharge] = useState<PersistentResourceRecoveryTrigger[]>(["long_rest"]); const [resourceRestore, setResourceRestore] = useState<"full" | "amount">("full"); const [resourceRestoreAmount, setResourceRestoreAmount] = useState("1")
  const [actionLabel, setActionLabel] = useState("Новая атака"); const [actionEconomy, setActionEconomy] = useState("action"); const [attackAbility, setAttackAbility] = useState<AbilityKey>("strength"); const [proficient, setProficient] = useState(true); const [attackFlat, setAttackFlat] = useState("0")
  const [diceCount, setDiceCount] = useState("1"); const [diceSides, setDiceSides] = useState("8"); const [damageType, setDamageType] = useState("рубящий"); const [damageAbility, setDamageAbility] = useState<AbilityKey>("strength"); const [damageFlat, setDamageFlat] = useState("0"); const [actionResourceKey, setActionResourceKey] = useState(""); const [actionResourceCost, setActionResourceCost] = useState("1")
  const [spellName, setSpellName] = useState(""); const [spellLevel, setSpellLevel] = useState("0"); const [spellAbility, setSpellAbility] = useState<AbilityKey>("intelligence"); const [spellPayment, setSpellPayment] = useState<SpellPayment>("none"); const [spellResourceKey, setSpellResourceKey] = useState(""); const [spellResourceCost, setSpellResourceCost] = useState("1")

  const resourceOptions = useMemo(() => {
    const map = new Map<string, ResourceOption>()
    for (const mechanic of value.filter((entry): entry is StoredResourceMechanic => entry.type === "resource")) map.set(mechanic.key, { key: mechanic.key, label: mechanic.label })
    for (const option of resourceCatalog) if (!map.has(option.key)) map.set(option.key, option)
    return [...map.values()]
  }, [resourceCatalog, value])
  const condition = useMemo<CharacterCondition | undefined>(() => conditionMode === "always" ? undefined : { kind: "hp_below_percent", percent: Math.max(1, Math.min(100, Number(hpPercent) || 50)) }, [conditionMode, hpPercent])

  function reset() { setAdding(false); setKind("numeric"); setConditionMode("always"); setHpPercent("50") }
  function resourceMaximum(): number | FormulaExpression {
    if (resourceMaxMode === "fixed") return Math.max(0, Number(resourceMax) || 0)
    if (resourceMaxMode === "source_level" && templateMode) return reference("source.level")
    if (resourceMaxMode === "character_level") return reference("core.level")
    if (resourceMaxMode === "proficiency") return reference("core.proficiencyBonus")
    return reference(`abilities.${resourceAbility}.modifier`)
  }
  function toggleRecharge(trigger: PersistentResourceRecoveryTrigger) {
    setResourceRecharge((current) => {
      if (!current.includes(trigger)) return [...current, trigger]
      const next = current.filter((entry) => entry !== trigger)
      return next.length ? next : ["long_rest"]
    })
  }
  function add() {
    const id = makeId(); const common = { id, ...(itemMode ? { activation } : {}), ...(condition ? { condition } : {}) }; let mechanic: StoredMechanic
    if (kind === "numeric") mechanic = { ...common, type: "numeric", target: numericTarget, operation: "ADD", value: Number(numericValue) || 0 }
    else if (kind === "resistance" || kind === "immunity") mechanic = { ...common, type: "grant", target: kind, key: grantKey.trim() || "fire" }
    else if (kind === "resource") mechanic = { ...common, type: "resource", key: `resource:${keyFromLabel(resourceLabel)}`, label: resourceLabel.trim() || "Ресурс", max: resourceMaximum(), recharge: resourceRecharge, restore: resourceRestore, ...(resourceRestore === "amount" ? { restoreAmount: Math.max(1, Number(resourceRestoreAmount) || 1) } : {}), initial: "full" }
    else if (kind === "action") mechanic = { ...common, type: "action", key: `action:${keyFromLabel(actionLabel)}`, label: actionLabel.trim() || "Действие", economy: actionEconomy, attackAbility, proficient, attackFlat: Number(attackFlat) || 0, damage: [{ key: "primary", damageType, count: Math.max(0, Number(diceCount) || 0), sides: Math.max(2, Number(diceSides) || 2), ability: damageAbility, flat: Number(damageFlat) || 0 }], ...(actionResourceKey ? { resourceKey: actionResourceKey, resourceCost: Math.max(1, Number(actionResourceCost) || 1) } : {}) }
    else {
      const name = spellName.trim() || "Заклинание"; const level = Math.max(0, Math.min(9, Number(spellLevel) || 0)); const amount = Math.max(1, Number(spellResourceCost) || 1)
      const options = level === 0 || spellPayment === "none" ? undefined : spellPayment === "slot" ? [{ key: `slot-${Math.max(1, level)}`, castLevel: Math.max(1, level), costs: [{ key: `spell_slot_${Math.max(1, level)}`, amount: 1 }] }] : spellResourceKey ? [{ key: "resource", castLevel: level, costs: [{ key: spellResourceKey, amount }] }] : undefined
      mechanic = { ...common, type: "spell", key: `spell:${keyFromLabel(name)}`, payload: { spell: { name, level }, preparation: { mode: "not_required" }, methods: [{ key: "granted", kind: "granted", ability: spellAbility, requiresPrepared: false, ...(options ? { resourceOptions: options } : {}) }] } }
    }
    onChange([...value, mechanic]); reset()
  }

  return <section className="mechanics-builder">
    <div className="mechanics-builder__head"><div><span>Механика</span><strong>{value.length ? `${value.length} эффектов` : "Нет эффектов"}</strong></div>{!adding && <button type="button" onClick={() => setAdding(true)}>＋ Эффект</button>}</div>
    {value.length > 0 && <div className="mechanics-list">{value.map((mechanic) => <div className="mechanics-row" key={mechanic.id}><span className="mechanics-row__icon">✦</span><span className="mechanics-row__copy"><strong>{mechanicSummary(mechanic)}</strong><small>{mechanic.type === "action" ? "Появится среди действий персонажа" : "Автоматически учитывается в листе"}</small></span><button type="button" aria-label="Удалить эффект" onClick={() => onChange(value.filter((item) => item.id !== mechanic.id))}>×</button></div>)}</div>}
    {adding && <div className="mechanics-add-card">
      <div className="mechanics-kind-grid">{([["numeric","＋","Бонус"],["resistance","◒","Сопротивление"],["immunity","◆","Иммунитет"],["resource","◎","Ресурс"],["action","⚔","Действие"],["spell","✧","Заклинание"]] as Array<[EffectKind,string,string]>).map(([id,icon,label]) => <button type="button" key={id} className={kind === id ? "is-active" : ""} onClick={() => setKind(id)}><span>{icon}</span><small>{label}</small></button>)}</div>
      {kind === "numeric" && <div className="mechanics-fields"><label><span>Что меняется</span><select className="app-select" value={numericTarget} onChange={(e) => setNumericTarget(e.target.value as NumericTarget)}>{numericTargets.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label><span>Бонус</span><input className="app-input" type="number" value={numericValue} onChange={(e) => setNumericValue(e.target.value)}/></label></div>}
      {(kind === "resistance" || kind === "immunity") && <label className="mechanics-field"><span>Тип урона / ключ</span><input className="app-input" value={grantKey} onChange={(e) => setGrantKey(e.target.value)} placeholder="fire / огонь"/></label>}
      {kind === "resource" && <div className="mechanics-fields mechanics-fields--stack">
        <label><span>Название</span><input className="app-input" value={resourceLabel} onChange={(e) => setResourceLabel(e.target.value)}/></label>
        <label><span>Максимум ресурса</span><select className="app-select" value={resourceMaxMode} onChange={(e) => setResourceMaxMode(e.target.value as ResourceMaxMode)}><option value="fixed">Фиксированное значение</option>{templateMode && <option value="source_level">Уровень этого класса / источника</option>}<option value="character_level">Общий уровень персонажа</option><option value="proficiency">Бонус мастерства</option><option value="ability">Модификатор характеристики</option></select></label>
        {resourceMaxMode === "fixed" && <label><span>Максимум</span><input className="app-input" type="number" min="0" value={resourceMax} onChange={(e) => setResourceMax(e.target.value)}/></label>}
        {resourceMaxMode === "ability" && <label><span>Характеристика</span><select className="app-select" value={resourceAbility} onChange={(e) => setResourceAbility(e.target.value as AbilityKey)}>{abilities.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}
        <div className="mechanics-choice-row"><span>Восстановление</span><div className="mechanics-multi-choice">{rechargeOptions.map((option) => <button type="button" key={option.value} className={resourceRecharge.includes(option.value) ? "is-active" : ""} onClick={() => toggleRecharge(option.value)}>{option.label}</button>)}</div></div>
        <div className="mechanics-fields"><label><span>Сколько восстанавливать</span><select className="app-select" value={resourceRestore} onChange={(e) => setResourceRestore(e.target.value as "full"|"amount")}><option value="full">До максимума</option><option value="amount">Фиксированное количество</option></select></label>{resourceRestore === "amount" && <label><span>Количество</span><input className="app-input" type="number" min="1" value={resourceRestoreAmount} onChange={(e) => setResourceRestoreAmount(e.target.value)}/></label>}</div>
      </div>}
      {kind === "action" && <div className="mechanics-fields mechanics-fields--stack">
        <label><span>Название действия</span><input className="app-input" value={actionLabel} onChange={(e) => setActionLabel(e.target.value)}/></label><div className="mechanics-fields"><label><span>Экономика</span><select className="app-select" value={actionEconomy} onChange={(e) => setActionEconomy(e.target.value)}><option value="action">Действие</option><option value="bonus_action">Бонусное действие</option><option value="reaction">Реакция</option><option value="free">Без действия</option></select></label><label><span>Атака от</span><select className="app-select" value={attackAbility} onChange={(e) => setAttackAbility(e.target.value as AbilityKey)}>{abilities.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div>
        <label className="mechanics-check"><input type="checkbox" checked={proficient} onChange={(e) => setProficient(e.target.checked)}/><span><strong>Добавлять мастерство</strong><small>Обычно включено для оружия, которым персонаж владеет</small></span></label><div className="mechanics-dice-row"><label><span>Кубы</span><input className="app-input" type="number" min="0" value={diceCount} onChange={(e) => setDiceCount(e.target.value)}/></label><b>d</b><label><span>Грани</span><input className="app-input" type="number" min="2" value={diceSides} onChange={(e) => setDiceSides(e.target.value)}/></label></div>
        <div className="mechanics-fields"><label><span>Тип урона</span><select className="app-select" value={damageType} onChange={(e) => setDamageType(e.target.value)}>{damageTypes.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select></label><label><span>Модификатор урона</span><select className="app-select" value={damageAbility} onChange={(e) => setDamageAbility(e.target.value as AbilityKey)}>{abilities.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div><div className="mechanics-fields"><label><span>Доп. к атаке</span><input className="app-input" type="number" value={attackFlat} onChange={(e) => setAttackFlat(e.target.value)}/></label><label><span>Доп. к урону</span><input className="app-input" type="number" value={damageFlat} onChange={(e) => setDamageFlat(e.target.value)}/></label></div>
        <div className="mechanics-fields"><label><span>Тратит ресурс</span><select className="app-select" value={actionResourceKey} onChange={(e) => setActionResourceKey(e.target.value)}><option value="">Не тратит</option>{resourceOptions.map((resource) => <option key={resource.key} value={resource.key}>{resource.label}</option>)}</select></label>{actionResourceKey && <label><span>Стоимость</span><input className="app-input" type="number" min="1" value={actionResourceCost} onChange={(e) => setActionResourceCost(e.target.value)}/></label>}</div>
      </div>}
      {kind === "spell" && <div className="mechanics-fields mechanics-fields--stack">
        <label><span>Название заклинания</span><input className="app-input" value={spellName} onChange={(e) => setSpellName(e.target.value)}/></label><div className="mechanics-fields"><label><span>Уровень</span><input className="app-input" type="number" min="0" max="9" value={spellLevel} onChange={(e) => setSpellLevel(e.target.value)}/></label><label><span>Характеристика</span><select className="app-select" value={spellAbility} onChange={(e) => setSpellAbility(e.target.value as AbilityKey)}>{abilities.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div>
        {Number(spellLevel) > 0 && <div className="mechanics-fields"><label><span>Стоимость применения</span><select className="app-select" value={spellPayment} onChange={(e) => setSpellPayment(e.target.value as SpellPayment)}><option value="none">Без расхода</option><option value="slot">Ячейка этого уровня</option><option value="resource">Другой ресурс</option></select></label>{spellPayment === "resource" && <label><span>Ресурс</span><select className="app-select" value={spellResourceKey} onChange={(e) => setSpellResourceKey(e.target.value)}><option value="">Выберите</option>{resourceOptions.map((resource) => <option key={resource.key} value={resource.key}>{resource.label}</option>)}</select></label>}</div>}{Number(spellLevel) > 0 && spellPayment === "resource" && spellResourceKey && <label><span>Стоимость ресурса</span><input className="app-input" type="number" min="1" value={spellResourceCost} onChange={(e) => setSpellResourceCost(e.target.value)}/></label>}
      </div>}
      {itemMode && <div className="mechanics-choice-row"><span>Когда предмет работает</span><div><button type="button" className={activation === "carried" ? "is-active" : ""} onClick={() => setActivation("carried")}>В инвентаре</button><button type="button" className={activation === "equipped" ? "is-active" : ""} onClick={() => setActivation("equipped")}>Только надет</button></div></div>}
      <div className="mechanics-choice-row"><span>Условие</span><div><button type="button" className={conditionMode === "always" ? "is-active" : ""} onClick={() => setConditionMode("always")}>Всегда</button><button type="button" className={conditionMode === "hp" ? "is-active" : ""} onClick={() => setConditionMode("hp")}>HP ниже</button></div></div>{conditionMode === "hp" && <label className="mechanics-field"><span>Порог HP, %</span><input className="app-input" type="number" min="1" max="100" value={hpPercent} onChange={(e) => setHpPercent(e.target.value)}/></label>}
      <div className="mechanics-add-actions"><button type="button" onClick={reset}>Отмена</button><button type="button" className="mechanics-add-primary" onClick={add}>Добавить эффект</button></div>
    </div>}
  </section>
}
