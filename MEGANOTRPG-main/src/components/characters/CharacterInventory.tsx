import { useEffect, useMemo, useState } from "react"
import { categoryLabel, categoryOrder, equipmentSlots, slotLabel, slotOrder } from "../../lib/dndInventory"
import { itemCurseInfo, mechanicSummary, playerVisibleItemMechanics } from "../../lib/characterMechanics"
import type { EquipmentSlot, InventoryCategory, InventoryItem } from "../../types/characterSheet"
import CampaignImage from "../common/CampaignImage"
import ContextActionSheet, { type ContextAction } from "../common/ContextActionSheet"
import { useLongPressItem } from "../../hooks/useLongPressItem"
import "./CharacterInventory.css"

type Result = Promise<{ ok: boolean; error?: string }>
type Props = {
  mode: "inventory" | "equipment"
  items: InventoryItem[]
  canManage: boolean
  canEquip: boolean
  onCreate: () => void
  onEdit: (item: InventoryItem) => void
  onDelete: (itemId: string) => Result
  onSetEquipped: (itemId: string, equipped: boolean, equipmentSlot: EquipmentSlot | null) => Result
}

type CurrencyKind = "gold" | "silver" | "copper"

const groupOrder: InventoryCategory[] = ["equipment", "consumable", "tool", "book", "trinket", "quest", "material", "currency", "container", "other"]

const categoryIcons: Record<InventoryCategory, string> = {
  equipment: "◆",
  consumable: "◉",
  tool: "⌁",
  book: "▤",
  trinket: "✦",
  quest: "◇",
  material: "⬡",
  currency: "◈",
  container: "▣",
  other: "·",
}

const slotIcons: Record<EquipmentSlot, string> = {
  head: "◠",
  neck: "◌",
  shoulders: "⌁",
  chest: "⬡",
  back: "▽",
  main_hand: "╱",
  off_hand: "╲",
  two_hands: "═",
  hands: "◇",
  wrists: "○",
  waist: "—",
  legs: "Ⅱ",
  feet: "⌄",
  ring_left: "◦",
  ring_right: "◦",
  ammo: "⋮",
  other: "＋",
}

function ItemThumb({ item, className = "" }: { item: InventoryItem; className?: string }) {
  return (
    <span className={`inventory-rpg__thumb ${className}`.trim()}>
      {item.image_url
        ? <CampaignImage value={item.image_url} alt="" />
        : <span aria-hidden="true">{categoryIcons[item.category]}</span>}
    </span>
  )
}

function gameplayMechanics(item: InventoryItem, canManage: boolean) {
  return playerVisibleItemMechanics(item, canManage)
}

function searchableCurseText(item: InventoryItem, canManage: boolean) {
  const curse = itemCurseInfo(item)
  return canManage || (curse.showCurseToPlayer && curse.showCurseEffectToPlayer) ? curse.description : ""
}

function itemPreview(item: InventoryItem, canManage: boolean) {
  const mechanics = gameplayMechanics(item, canManage)
  if (mechanics.length) return mechanics.slice(0, 2).map(mechanicSummary).join(" · ")
  if (item.description.trim()) return item.description.trim()
  return "Без дополнительных механических эффектов"
}

function chargeLabel(item: InventoryItem) {
  if (item.usage_mode !== "charges") return ""
  if (item.charges_max == null) return "Заряды"
  return `Заряды ${item.charges_current ?? item.charges_max}/${item.charges_max}`
}

function formatWeight(value: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value)
}

function currencyKind(item: InventoryItem): CurrencyKind | null {
  if (item.category !== "currency") return null
  const stored = item.item_state?.denomination ?? item.item_state?.currency
  const text = `${item.name} ${typeof stored === "string" ? stored : ""}`.trim().toLocaleLowerCase("ru-RU")
  if (/(золот|gold|\bgp\b)/u.test(text)) return "gold"
  if (/(сереб|silver|\bsp\b)/u.test(text)) return "silver"
  if (/(мед|copper|\bcp\b)/u.test(text)) return "copper"
  return null
}

function ItemBadges({ item, canManage }: { item: InventoryItem; canManage: boolean }) {
  const curse = itemCurseInfo(item)
  const showCurse = curse.cursed && (canManage || curse.showCurseToPlayer)
  const charges = chargeLabel(item)
  return (
    <span className="inventory-rpg__badges">
      {item.equipped && <i className="inventory-rpg__badge inventory-rpg__badge--equipped">Надето</i>}
      {charges && <i className="inventory-rpg__badge inventory-rpg__badge--charges">{charges}</i>}
      {showCurse && <i className="inventory-rpg__badge inventory-rpg__badge--curse">☠ Проклято</i>}
    </span>
  )
}

export default function CharacterInventory(props: Props) {
  const { mode, items, canManage, canEquip, onCreate, onEdit, onDelete, onSetEquipped } = props
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<InventoryCategory | null>(() => mode === "equipment" ? "equipment" : null)
  const [slot, setSlot] = useState<EquipmentSlot | null>(null)
  const [detail, setDetail] = useState<InventoryItem | null>(null)
  const [menu, setMenu] = useState<InventoryItem | null>(null)
  const [error, setError] = useState("")
  const bindLongPress = useLongPressItem<InventoryItem>((item) => setMenu(item))

  useEffect(() => {
    setQuery("")
    setSlot(null)
    setCategory(mode === "equipment" ? "equipment" : null)
  }, [mode])

  const counts = useMemo(() => {
    const byCategory = new Map<InventoryCategory, number>()
    const bySlot = new Map<EquipmentSlot, number>()
    const currency: Record<CurrencyKind, number> = { gold: 0, silver: 0, copper: 0 }

    for (const item of items) {
      byCategory.set(item.category, (byCategory.get(item.category) || 0) + 1)
      if (item.category === "equipment") {
        const equipmentSlot = item.equipment_slot || "other"
        bySlot.set(equipmentSlot, (bySlot.get(equipmentSlot) || 0) + 1)
      }
      const denomination = currencyKind(item)
      if (denomination) currency[denomination] += Math.max(0, item.quantity)
    }

    return { byCategory, bySlot, currency }
  }, [items])

  const rootCategories = useMemo(
    () => groupOrder.filter((entry) => entry === "equipment" || entry === "consumable" || (counts.byCategory.get(entry) || 0) > 0),
    [counts.byCategory],
  )

  const visibleItems = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("ru-RU")
    return [...items]
      .sort((a, b) => Number(b.equipped) - Number(a.equipped) || categoryOrder(a.category) - categoryOrder(b.category) || slotOrder(a.equipment_slot) - slotOrder(b.equipment_slot) || a.name.localeCompare(b.name, "ru"))
      .filter((item) => !category || item.category === category)
      .filter((item) => !slot || (item.equipment_slot || "other") === slot)
      .filter((item) => !q || `${item.name} ${item.description} ${categoryLabel(item.category)} ${slotLabel(item.equipment_slot)} ${searchableCurseText(item, canManage)}`.toLocaleLowerCase("ru-RU").includes(q))
  }, [canManage, category, items, query, slot])

  async function toggleEquip(item: InventoryItem) {
    setError("")
    const result = await onSetEquipped(
      item.id,
      !item.equipped,
      item.equipped ? item.equipment_slot : item.equipment_slot || "main_hand",
    )
    if (!result.ok) {
      setError(result.error || "Не удалось изменить экипировку.")
      return
    }
    setDetail(null)
  }

  async function remove(item: InventoryItem) {
    setError("")
    const result = await onDelete(item.id)
    if (!result.ok) setError(result.error || "Не удалось удалить предмет.")
  }

  function actions(item: InventoryItem): ContextAction[] {
    return [
      { id: "open", label: "Просмотр", detail: "Описание, состояние и активные эффекты", icon: "↗", onSelect: () => setDetail(item) },
      ...(item.category === "equipment" && canEquip ? [{
        id: "equip",
        label: item.equipped ? "Снять" : "Надеть",
        detail: item.equipped ? "Отключить эффекты экипировки" : `Использовать слот: ${slotLabel(item.equipment_slot || "main_hand")}`,
        icon: item.equipped ? "↓" : "↑",
        onSelect: () => toggleEquip(item),
      } satisfies ContextAction] : []),
      ...(canManage ? [
        { id: "edit", label: "Редактировать", detail: "Название, арт, слот и механика", icon: "✎", onSelect: () => onEdit(item) } satisfies ContextAction,
        { id: "delete", label: "Удалить", detail: "Удалить предмет из инвентаря", icon: "×", danger: true, onSelect: () => remove(item) } satisfies ContextAction,
      ] : []),
    ]
  }

  function openCategory(next: InventoryCategory) {
    setCategory(next)
    setSlot(null)
    setQuery("")
  }

  function openSlot(next: EquipmentSlot) {
    setSlot(next)
    setQuery("")
  }

  function goBack() {
    setQuery("")
    if (slot) {
      setSlot(null)
      return
    }
    if (mode === "inventory" && category) setCategory(null)
  }

  const detailSheet = detail
    ? <InventoryDetail
        item={detail}
        canManage={canManage}
        canEquip={canEquip}
        onClose={() => setDetail(null)}
        onEdit={() => { setDetail(null); onEdit(detail) }}
        onToggle={() => toggleEquip(detail)}
      />
    : null

  const actionSheet = menu
    ? <ContextActionSheet title={menu.name} subtitle="Действия с предметом" actions={actions(menu)} onClose={() => setMenu(null)} />
    : null

  const atRoot = mode === "inventory" && category === null
  const inEquipmentDirectory = category === "equipment" && slot === null && !query.trim()
  const showSearchResultsAtRoot = atRoot && Boolean(query.trim())
  const pageTitle = atRoot
    ? "Инвентарь"
    : slot
      ? slotLabel(slot)
      : category === "equipment"
        ? "Экипировка"
        : category ? categoryLabel(category) : "Инвентарь"

  const pageEyebrow = slot
    ? "Экипировка · слот"
    : category
      ? "Инвентарь · раздел"
      : "Вещи персонажа"

  return (
    <section className="character-tab-section inventory-rpg">
      <header className="inventory-rpg__hero">
        <div className="inventory-rpg__hero-main">
          {(slot || (category && mode === "inventory")) && (
            <button className="inventory-rpg__back" type="button" onClick={goBack} aria-label="Назад">←</button>
          )}
          <div className="inventory-rpg__hero-copy">
            <span className="inventory-rpg__eyebrow">{pageEyebrow}</span>
            <h3>{pageTitle}</h3>
            <p>{atRoot ? "Открывай нужный раздел, а не прокручивай одну бесконечную стену предметов." : slot ? "Предметы этого слота. Надетое всегда отмечено отдельно." : category === "equipment" ? "Выбери часть экипировки — внутри будут только подходящие вещи." : "Все предметы этого типа собраны в одном месте."}</p>
          </div>
          {canManage && <button className="inventory-rpg__create" type="button" onClick={onCreate}>＋ Предмет</button>}
        </div>

        <div className="inventory-rpg__wallet" aria-label="Валюта персонажа">
          <div className="inventory-rpg__coin inventory-rpg__coin--gold"><small>Золото</small><strong>{counts.currency.gold}</strong><span>ЗМ</span></div>
          <div className="inventory-rpg__coin inventory-rpg__coin--silver"><small>Серебро</small><strong>{counts.currency.silver}</strong><span>СМ</span></div>
          <div className="inventory-rpg__coin inventory-rpg__coin--copper"><small>Медь</small><strong>{counts.currency.copper}</strong><span>ММ</span></div>
        </div>
      </header>

      {items.length > 0 && (
        <label className="inventory-rpg__search">
          <span aria-hidden="true">⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={atRoot ? "Найти предмет во всём инвентаре" : `Поиск: ${pageTitle}`} />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Очистить поиск">×</button>}
        </label>
      )}

      {atRoot && !showSearchResultsAtRoot && (
        <section className="inventory-rpg__directory" aria-label="Разделы инвентаря">
          <div className="inventory-rpg__section-head"><div><small>Разделы</small><strong>Куда открыть</strong></div></div>
          <div className="inventory-rpg__folder-grid">
            {rootCategories.map((entry) => (
              <button className="inventory-rpg__folder" type="button" key={entry} onClick={() => openCategory(entry)}>
                <span className="inventory-rpg__folder-icon">{categoryIcons[entry]}</span>
                <span className="inventory-rpg__folder-copy"><strong>{categoryLabel(entry)}</strong><small>{entry === "equipment" ? "Оружие, броня и слоты" : entry === "consumable" ? "Зелья, свитки и расходуемые вещи" : "Открыть раздел"}</small></span>
                <span className="inventory-rpg__folder-count">{counts.byCategory.get(entry) || 0}</span>
                <span className="inventory-rpg__folder-chevron">›</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {inEquipmentDirectory && (
        <section className="inventory-rpg__directory" aria-label="Слоты экипировки">
          <div className="inventory-rpg__section-head"><div><small>Экипировка</small><strong>Выбери слот</strong></div></div>
          <div className="inventory-rpg__slot-folders">
            {equipmentSlots.map((entry) => {
              const count = counts.bySlot.get(entry.value) || 0
              return (
                <button className={count ? "inventory-rpg__slot-folder has-items" : "inventory-rpg__slot-folder"} type="button" key={entry.value} onClick={() => openSlot(entry.value)}>
                  <span className="inventory-rpg__slot-folder-icon">{slotIcons[entry.value]}</span>
                  <span><strong>{entry.label}</strong><small>{count ? `${count} ${count === 1 ? "предмет" : "предм."}` : "Пусто"}</small></span>
                  <b>›</b>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {(!atRoot || showSearchResultsAtRoot) && !inEquipmentDirectory && (
        <section className="inventory-rpg__section">
          <div className="inventory-rpg__section-head">
            <div><small>{showSearchResultsAtRoot ? "Поиск" : slot ? "Слот" : "Раздел"}</small><strong>{showSearchResultsAtRoot ? "Результаты" : pageTitle}</strong></div>
            <span>{visibleItems.length}</span>
          </div>
          {visibleItems.length > 0 ? (
            <div className="inventory-rpg__list">
              {visibleItems.map((item) => (
                <article {...bindLongPress(item)} style={{ touchAction: "pan-y" }} className="inventory-rpg__item" key={item.id}>
                  <button type="button" className="inventory-rpg__item-main" onClick={() => setDetail(item)}>
                    <ItemThumb item={item} />
                    <span className="inventory-rpg__item-copy">
                      <span className="inventory-rpg__item-title">
                        <strong>{item.name}</strong>
                        {item.quantity !== 1 && <em className="inventory-rpg__quantity">×{item.quantity}</em>}
                      </span>
                      <span className="inventory-rpg__item-meta">
                        <span>{categoryLabel(item.category)}</span>
                        {item.category === "equipment" && <><span className="inventory-rpg__dot">·</span><span>{slotLabel(item.equipment_slot)}</span></>}
                      </span>
                      <span className="inventory-rpg__item-preview">{itemPreview(item, canManage)}</span>
                      <ItemBadges item={item} canManage={canManage} />
                    </span>
                    <span className="inventory-rpg__chevron">›</span>
                  </button>
                  {canManage && <button className="inventory-rpg__menu" type="button" onClick={() => setMenu(item)} aria-label={`Действия с ${item.name}`}>•••</button>}
                </article>
              ))}
            </div>
          ) : (
            <div className="inventory-rpg__empty">
              <span>{query ? "⌕" : "◇"}</span>
              <strong>{query ? "Ничего не найдено" : "Здесь пока пусто"}</strong>
              <p>{query ? "Попробуй другой запрос." : "Предметы этого типа появятся здесь, когда ГМ добавит их персонажу."}</p>
            </div>
          )}
        </section>
      )}

      {atRoot && items.length === 0 && (
        <div className="inventory-rpg__empty">
          <span>◇</span><strong>Инвентарь пуст</strong><p>Когда появятся предметы, они автоматически разложатся по разделам.</p>
        </div>
      )}

      {error && <div className="inventory-rpg__error">{error}</div>}
      {detailSheet}
      {actionSheet}
    </section>
  )
}

function InventoryDetail({ item, canManage, canEquip, onClose, onEdit, onToggle }: {
  item: InventoryItem
  canManage: boolean
  canEquip: boolean
  onClose: () => void
  onEdit: () => void
  onToggle: () => void
}) {
  const curse = itemCurseInfo(item)
  const showCurse = curse.cursed && (canManage || curse.showCurseToPlayer)
  const showCurseEffect = curse.cursed && (canManage || (curse.showCurseToPlayer && curse.showCurseEffectToPlayer))
  const mechanics = gameplayMechanics(item, canManage)
  const weight = item.weight == null ? "—" : formatWeight(item.weight)
  const status = item.category === "equipment"
    ? item.equipped ? "Надето · эффекты экипировки активны" : "В инвентаре · эффекты экипировки неактивны"
    : "В инвентаре"

  return (
    <div className="sheet-backdrop inventory-rpg__backdrop" onMouseDown={onClose}>
      <section className="bottom-sheet inventory-rpg-detail" role="dialog" aria-modal="true" aria-label={item.name} onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <header className="inventory-rpg-detail__head">
          <ItemThumb item={item} />
          <div className="inventory-rpg-detail__title">
            <small>{categoryLabel(item.category)}{item.equipment_slot ? ` · ${slotLabel(item.equipment_slot)}` : ""}</small>
            <h3>{item.name}</h3>
            <p>{status}</p>
          </div>
          <button className="inventory-rpg-detail__close" type="button" onClick={onClose}>×</button>
        </header>

        {item.image_url && <div className="inventory-rpg-detail__art"><CampaignImage value={item.image_url} alt="" /></div>}

        <div className="inventory-rpg-detail__facts">
          <div className="inventory-rpg-detail__fact"><small>Количество</small><strong>{item.quantity}</strong></div>
          <div className="inventory-rpg-detail__fact"><small>Вес / шт.</small><strong>{weight}</strong></div>
          <div className="inventory-rpg-detail__fact"><small>Состояние</small><strong>{item.equipped ? "Надето" : "В рюкзаке"}</strong></div>
        </div>

        <ItemBadges item={item} canManage={canManage} />

        {item.description && <section className="inventory-rpg-detail__section"><small>Описание</small><p>{item.description}</p></section>}

        {showCurse && (
          <section className="inventory-rpg-detail__section inventory-rpg-detail__section--curse">
            <small>Проклятие</small>
            <p>{showCurseEffect ? (curse.description || "Предмет проклят. Подробности эффекта не указаны.") : "Проклятие обнаружено. Его эффект неизвестен."}</p>
          </section>
        )}

        <section className="inventory-rpg-detail__section">
          <small>Механика</small>
          {mechanics.length ? (
            <div className="inventory-rpg-detail__mechanics">
              {mechanics.map((mechanic) => {
                const inactive = mechanic.activation === "equipped" && !item.equipped
                return (
                  <div className={inactive ? "inventory-rpg-detail__mechanic is-inactive" : "inventory-rpg-detail__mechanic"} key={mechanic.id}>
                    <i>✦</i>
                    <span>
                      <strong>{mechanicSummary(mechanic)}</strong>
                      <small>{inactive ? "Неактивно: предмет нужно надеть" : mechanic.activation === "equipped" ? "Активно, пока предмет надет" : `Источник: ${item.name}`}</small>
                    </span>
                  </div>
                )
              })}
            </div>
          ) : <p>У предмета нет видимых механических эффектов.</p>}
        </section>

        {(canManage || (item.category === "equipment" && canEquip)) && (
          <footer className="inventory-rpg-detail__actions">
            {canManage && <button type="button" className="inventory-rpg-detail__edit" onClick={onEdit}>Редактировать</button>}
            {item.category === "equipment" && canEquip && <button type="button" className={item.equipped ? "inventory-rpg-detail__equip is-remove" : "inventory-rpg-detail__equip"} onClick={onToggle}>{item.equipped ? "Снять" : "Надеть"}</button>}
          </footer>
        )}
      </section>
    </div>
  )
}
