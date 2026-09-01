import { useEffect, useMemo, useState } from "react"
import type { AbilityKey } from "../../character-engine/index.ts"
import { catalogSpellName, type CatalogSpell } from "../../lib/spellCatalog.ts"
import { supabase } from "../../lib/supabase"
import type { StoredMechanic, StoredMechanics, StoredResourceMechanic } from "../../types/characterMechanics.ts"
import "./ItemMechanicPresets.css"

type Props = {
  value: StoredMechanics
  onChange: (value: StoredMechanics) => void
  equippable?: boolean
}

type Activation = "carried" | "equipped"
type SpellPayment = "free" | "slot" | "resource"
type CatalogRow = Pick<CatalogSpell, "id" | "slug" | "name_en" | "name_ru" | "spell_level" | "school" | "ritual">

type QuickPreset = {
  id: string
  icon: string
  title: string
  detail: string
  make: (activation: Activation) => StoredMechanic
}

const abilities: Array<{ value: AbilityKey; label: string }> = [
  { value: "strength", label: "Сила" },
  { value: "dexterity", label: "Ловкость" },
  { value: "constitution", label: "Телосложение" },
  { value: "intelligence", label: "Интеллект" },
  { value: "wisdom", label: "Мудрость" },
  { value: "charisma", label: "Харизма" },
]

const resistances = [
  ["fire", "Огонь"], ["cold", "Холод"], ["lightning", "Молния"], ["acid", "Кислота"],
  ["poison", "Яд"], ["necrotic", "Некротический"], ["radiant", "Излучение"], ["psychic", "Психический"],
  ["force", "Силовой"], ["thunder", "Гром"], ["slashing", "Рубящий"], ["piercing", "Колющий"], ["bludgeoning", "Дробящий"],
] as const

function makeId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `m-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function withActivation<T extends StoredMechanic>(mechanic: T, activation: Activation): T {
  return { ...mechanic, activation }
}

const quickPresets: QuickPreset[] = [
  {
    id: "ac-1", icon: "⬡", title: "+1 к КД", detail: "Простой защитный бонус.",
    make: (activation) => withActivation({ id: makeId(), type: "numeric", target: "combat.ac", operation: "ADD", value: 1 }, activation),
  },
  {
    id: "ac-minus-1", icon: "▽", title: "−1 к КД", detail: "Готовый штраф, удобно для проклятий.",
    make: (activation) => withActivation({ id: makeId(), type: "numeric", target: "combat.ac", operation: "ADD", value: -1 }, activation),
  },
  {
    id: "initiative-1", icon: "◇", title: "+1 к инициативе", detail: "Добавляется к итоговой инициативе персонажа.",
    make: (activation) => withActivation({ id: makeId(), type: "numeric", target: "combat.initiative", operation: "ADD", value: 1 }, activation),
  },
  {
    id: "speed-10", icon: "➜", title: "+10 к скорости", detail: "Готовый бонус к скорости персонажа.",
    make: (activation) => withActivation({ id: makeId(), type: "numeric", target: "combat.speed", operation: "ADD", value: 10 }, activation),
  },
  {
    id: "hp-5", icon: "✚", title: "+5 максимум HP", detail: "Увеличивает итоговый максимум здоровья.",
    make: (activation) => withActivation({ id: makeId(), type: "numeric", target: "combat.maxHp", operation: "ADD", value: 5 }, activation),
  },
  {
    id: "charges-3", icon: "◎", title: "3 заряда", detail: "Полностью восстанавливаются после долгого отдыха.",
    make: (activation) => withActivation({ id: makeId(), type: "resource", key: `resource:item-charges-${makeId()}`, label: "Заряды предмета", max: 3, recharge: ["long_rest"], restore: "full", initial: "full" }, activation),
  },
  {
    id: "fire-half-hp", icon: "◒", title: "Огонь при HP < 50%", detail: "Сопротивление огню включается только ниже половины HP.",
    make: (activation) => withActivation({ id: makeId(), type: "grant", target: "resistance", key: "fire", condition: { kind: "hp_below_percent", percent: 50 } }, activation),
  },
]

export default function ItemMechanicPresets({ value, onChange, equippable = true }: Props) {
  const [activation, setActivation] = useState<Activation>(equippable ? "equipped" : "carried")
  const [abilityName, setAbilityName] = useState("Активировать предмет")
  const [abilityEconomy, setAbilityEconomy] = useState("action")
  const [spellOpen, setSpellOpen] = useState(false)
  const [spells, setSpells] = useState<CatalogRow[]>([])
  const [spellLoading, setSpellLoading] = useState(false)
  const [spellError, setSpellError] = useState("")
  const [spellQuery, setSpellQuery] = useState("")
  const [spellAbility, setSpellAbility] = useState<AbilityKey>("intelligence")
  const [spellPayment, setSpellPayment] = useState<SpellPayment>("free")
  const [spellResourceKey, setSpellResourceKey] = useState("")

  useEffect(() => {
    if (equippable || activation === "carried") return
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) setActivation("carried") })
    return () => { cancelled = true }
  }, [activation, equippable])

  const resources = useMemo(
    () => value.filter((item): item is StoredResourceMechanic => item.type === "resource"),
    [value],
  )

  useEffect(() => {
    if (!spellOpen || spells.length) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setSpellLoading(true)
      setSpellError("")
      void supabase
        .from("spell_catalog")
        .select("id,slug,name_en,name_ru,spell_level,school,ritual")
        .order("spell_level", { ascending: true })
        .order("name_en", { ascending: true })
        .limit(2000)
        .then(({ data, error }) => {
          if (cancelled) return
          setSpellLoading(false)
          if (error) { setSpellError(error.message); return }
          setSpells((data || []) as CatalogRow[])
        })
    })
    return () => { cancelled = true }
  }, [spellOpen, spells.length])

  const visibleSpells = useMemo(() => {
    const needle = spellQuery.trim().toLocaleLowerCase("ru-RU")
    return spells
      .filter((spell) => !needle || `${spell.name_ru || ""} ${spell.name_en} ${spell.school}`.toLocaleLowerCase("ru-RU").includes(needle))
      .slice(0, 12)
  }, [spellQuery, spells])

  function append(mechanic: StoredMechanic) {
    const safeMechanic = !equippable && mechanic.activation === "equipped"
      ? { ...mechanic, activation: "carried" as const }
      : mechanic
    onChange([...value, safeMechanic])
  }

  function addResistance(key: string) {
    append(withActivation({ id: makeId(), type: "grant", target: "resistance", key }, activation))
  }

  function addAbility() {
    const label = abilityName.trim() || "Активировать предмет"
    append(withActivation({
      id: makeId(),
      type: "action",
      key: `action:item-${makeId()}`,
      label,
      economy: abilityEconomy,
      tags: ["unique", "magic_item"],
    }, activation))
    setAbilityName("Активировать предмет")
  }

  function addSpell(spell: CatalogRow) {
    const name = catalogSpellName(spell)
    const level = Math.max(0, Math.min(9, spell.spell_level))
    const selectedResource = resources.find((resource) => resource.key === spellResourceKey)
    const resourceOptions = level === 0 || spellPayment === "free"
      ? undefined
      : spellPayment === "slot"
        ? [{ key: `slot-${level}`, castLevel: level, costs: [{ key: `spell_slot_${level}`, amount: 1 }] }]
        : selectedResource
          ? [{ key: "item-resource", castLevel: level, costs: [{ key: selectedResource.key, amount: 1 }] }]
          : undefined

    append(withActivation({
      id: makeId(),
      type: "spell",
      key: `spell:item-${spell.slug || spell.id}-${makeId()}`,
      payload: {
        spell: { name, level, school: spell.school || undefined, ritual: Boolean(spell.ritual) },
        preparation: { mode: "not_required" },
        methods: [{
          key: "item",
          kind: "granted",
          ability: spellAbility,
          requiresPrepared: false,
          ...(resourceOptions ? { resourceOptions } : {}),
        }],
      },
    }, activation))
  }

  return <section className="item-mechanic-presets">
    <header><div><span>Быстрые шаблоны</span><strong>Готовые эффекты</strong><small>Выбери подходящий вариант — приложение само добавит его к предмету.</small></div></header>

    <div className="item-mechanic-activation"><span>Эффект работает</span>{equippable ? <div><button type="button" className={activation === "equipped" ? "is-active" : ""} onClick={() => setActivation("equipped")}>Когда надето</button><button type="button" className={activation === "carried" ? "is-active" : ""} onClick={() => setActivation("carried")}>Пока в инвентаре</button></div> : <small>Этот предмет нельзя надеть, поэтому его эффекты работают, пока он находится в инвентаре.</small>}</div>

    <div className="item-mechanic-preset-grid">
      {quickPresets.map((preset) => <button type="button" key={preset.id} onClick={() => append(preset.make(activation))}><span>{preset.icon}</span><strong>{preset.title}</strong><small>{preset.detail}</small><em>＋</em></button>)}
    </div>

    <div className="item-mechanic-block">
      <div className="item-mechanic-block__head"><div><strong>Сопротивление</strong><small>Частые типы — одним нажатием. Свой странный тег всё ещё можно сделать ниже.</small></div></div>
      <div className="item-mechanic-chip-grid">{resistances.map(([key, label]) => <button type="button" key={key} onClick={() => addResistance(key)}>＋ {label}</button>)}</div>
    </div>

    <div className="item-mechanic-block">
      <div className="item-mechanic-block__head"><div><strong>Умение от предмета</strong><small>Такое действие станет источником предмета и появится в «Уникальное».</small></div></div>
      <div className="item-mechanic-fields"><label><span>Название умения</span><input className="app-input" value={abilityName} onChange={(event) => setAbilityName(event.target.value)} /></label><label><span>Когда используется</span><select className="app-select" value={abilityEconomy} onChange={(event) => setAbilityEconomy(event.target.value)}><option value="action">Действие</option><option value="bonus_action">Бонусное действие</option><option value="reaction">Реакция</option><option value="free">Свободное действие</option></select></label></div>
      <button className="item-mechanic-add" type="button" onClick={addAbility}>＋ Добавить умение в «Уникальное»</button>
    </div>

    <div className="item-mechanic-block">
      <div className="item-mechanic-block__head"><div><strong>Заклинание от предмета</strong><small>Выбери реальное заклинание из каталога — не надо печатать название вручную.</small></div><button type="button" onClick={() => setSpellOpen((current) => !current)}>{spellOpen ? "Скрыть" : "Выбрать"}</button></div>
      {spellOpen && <div className="item-spell-picker">
        <input className="app-input" value={spellQuery} onChange={(event) => setSpellQuery(event.target.value)} placeholder="Поиск заклинания…" autoFocus />
        <div className="item-mechanic-fields item-mechanic-fields--three"><label><span>Характеристика</span><select className="app-select" value={spellAbility} onChange={(event) => setSpellAbility(event.target.value as AbilityKey)}>{abilities.map((ability) => <option key={ability.value} value={ability.value}>{ability.label}</option>)}</select></label><label><span>Расход</span><select className="app-select" value={spellPayment} onChange={(event) => setSpellPayment(event.target.value as SpellPayment)}><option value="free">Без расхода</option><option value="slot">Ячейка того же уровня</option><option value="resource">Ресурс предмета</option></select></label>{spellPayment === "resource" && <label><span>Какой ресурс</span><select className="app-select" value={spellResourceKey} onChange={(event) => setSpellResourceKey(event.target.value)}><option value="">Выбери ресурс</option>{resources.map((resource) => <option key={resource.key} value={resource.key}>{resource.label}</option>)}</select></label>}</div>
        {spellPayment === "resource" && !resources.length && <div className="item-spell-picker__note">Сначала добавь пресет «3 заряда» или создай ресурс ниже.</div>}
        {spellLoading && <div className="item-spell-picker__note">Загружаем каталог…</div>}
        {spellError && <div className="auth-error">{spellError}</div>}
        {!spellLoading && <div className="item-spell-results">{visibleSpells.map((spell) => <button type="button" key={spell.id} disabled={spellPayment === "resource" && !spellResourceKey} onClick={() => addSpell(spell)}><span><strong>{catalogSpellName(spell)}</strong><small>{spell.spell_level === 0 ? "Заговор" : `${spell.spell_level} ур.`}{spell.school ? ` · ${spell.school}` : ""}</small></span><em>＋</em></button>)}{!visibleSpells.length && <p>Ничего не найдено.</p>}</div>}
      </div>}
    </div>

    <div className="item-mechanic-advanced"><span>Нужно что-то нестандартное?</span><p>Ниже остаётся полный редактор: «защита от жаб», условие по HP, своя атака, иммунитет или произвольный ресурс никуда не делись.</p></div>
  </section>
}
