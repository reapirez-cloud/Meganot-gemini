import { useCallback, useMemo, useState } from "react"

import CharacterAvatar from "../components/characters/CharacterAvatar"
import CampaignImage from "../components/common/CampaignImage"
import ContextActionSheet from "../components/common/ContextActionSheet"
import type { ContextAction } from "../components/common/ContextActionSheet"
import { ZoneHabitatNpcsSheet } from "../components/world/NpcZoneHabitatSheet"
import WorldEditor from "../components/world/WorldEditor"
import type { WorldEditorMode } from "../components/world/WorldEditor"
import WorldMapView from "../components/world/WorldMapView"
import { useCharacters } from "../context/CharacterContext"
import { useLongPressItem } from "../hooks/useLongPressItem"
import { useNpcZoneHabitats } from "../hooks/useNpcZoneHabitats"
import { useWorldContent } from "../hooks/useWorldContent"
import { useWorldState } from "../hooks/useWorldState"
import { locationAncestorIds } from "../lib/worldHierarchy"
import type {
  LocationEntry,
  LocationLink,
  LocationSection,
  VisibilityMode,
} from "../types/world"
import { formatCampaignTime } from "../world-state/time"

const visibilityLabel: Record<VisibilityMode, string> = {
  always: "Видно всегда",
  discover: "По открытию",
  private: "Только я",
}

type MenuTarget =
  | { kind: "location"; item: LocationEntry }
  | { kind: "section"; item: LocationSection }
  | { kind: "link"; item: LocationLink }

type DeleteTarget =
  | { kind: "section"; item: LocationSection }
  | { kind: "link"; item: LocationLink }

type LocationCardProps = {
  key?: string | number
  location: LocationEntry
  eyebrow: string
  subzoneCount: number
  sectionCount: number
  canManage: boolean
  onOpen: (location: LocationEntry) => void
  onMenu: (location: LocationEntry) => void
}

function LocationPreviewCard({
  location,
  eyebrow,
  subzoneCount,
  sectionCount,
  canManage,
  onOpen,
  onMenu,
}: LocationCardProps) {
  const bindLongPress = useLongPressItem(onMenu)
  const details = [
    subzoneCount ? `${subzoneCount} подзон` : "",
    sectionCount ? `${sectionCount} разделов` : "",
  ].filter(Boolean).join(" · ")

  return (
    <article
      className={`world-zone-card ${location.lifecycle_state === "archived" ? "is-archived" : ""}`}
      style={{ touchAction: "pan-y" }}
      {...(canManage ? bindLongPress(location) : {})}
    >
      <button className="world-zone-card__main" type="button" onClick={() => onOpen(location)}>
        {location.image_url
          ? <CampaignImage className="world-zone-card__image" value={location.image_url} alt="" />
          : <span className="world-zone-card__placeholder" aria-hidden="true">◇</span>}
        <span className="world-zone-card__scrim" />
        <span className="world-zone-card__copy">
          <small>{eyebrow}</small>
          <strong>{location.name}</strong>
          <p>{location.summary || "Описание превью пока не заполнено."}</p>
          {details && <em>{details}</em>}
        </span>
      </button>
      {canManage && (
        <>
          <span className="world-zone-card__visibility">{visibilityLabel[location.visibility_mode]}</span>
          <button className="world-zone-card__menu" type="button" onClick={() => onMenu(location)} aria-label={`Действия с зоной ${location.name}`}>•••</button>
        </>
      )}
    </article>
  )
}

export default function World() {
  const context = useCharacters()
  const world = useWorldContent()
  const state = useWorldState()
  const habitats = useNpcZoneHabitats()
  const [viewMode, setViewMode] = useState<"lore" | "map">("lore")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editor, setEditor] = useState<WorldEditorMode>(null)
  const [menuTarget, setMenuTarget] = useState<MenuTarget | null>(null)
  const [visibilityTarget, setVisibilityTarget] = useState<LocationEntry | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [habitatEditorOpen, setHabitatEditorOpen] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => new Set())
  const [error, setError] = useState("")

  const openLocationMenu = useCallback((item: LocationEntry) => {
    if (context.canManage) setMenuTarget({ kind: "location", item })
  }, [context.canManage])
  const openSectionMenu = useCallback((item: LocationSection) => {
    if (context.canManage) setMenuTarget({ kind: "section", item })
  }, [context.canManage])
  const openLinkMenu = useCallback((item: LocationLink) => {
    if (context.canManage) setMenuTarget({ kind: "link", item })
  }, [context.canManage])
  const bindSectionLongPress = useLongPressItem(openSectionMenu)
  const bindLinkLongPress = useLongPressItem(openLinkMenu)

  const activeLocations = useMemo(
    () => world.locations.filter((location) => location.lifecycle_state === "active"),
    [world.locations],
  )
  const archivedLocations = useMemo(
    () => world.locations.filter((location) => location.lifecycle_state === "archived"),
    [world.locations],
  )
  const activeLocationIds = useMemo(
    () => new Set(activeLocations.map((location) => location.id)),
    [activeLocations],
  )
  const rootLocations = useMemo(
    () => activeLocations.filter((location) => !location.parent_location_id || !activeLocationIds.has(location.parent_location_id)),
    [activeLocationIds, activeLocations],
  )
  const selected = useMemo(
    () => world.locations.find((location) => location.id === selectedId) || null,
    [selectedId, world.locations],
  )
  const selectedSections = useMemo(
    () => selected ? world.locationSections.filter((section) => section.location_id === selected.id) : [],
    [selected, world.locationSections],
  )
  const selectedSectionIds = useMemo(
    () => new Set(selectedSections.map((section) => section.id)),
    [selectedSections],
  )
  const selectedLinks = useMemo(
    () => world.locationLinks.filter((link) => selectedSectionIds.has(link.section_id)),
    [selectedSectionIds, world.locationLinks],
  )
  const children = useMemo(
    () => selected ? activeLocations.filter((location) => location.parent_location_id === selected.id) : [],
    [activeLocations, selected],
  )
  const locationById = useMemo(
    () => new Map(world.locations.map((location) => [location.id, location])),
    [world.locations],
  )
  const currentLocationEntry = state.currentLocation
    ? locationById.get(state.currentLocation.id) || null
    : null
  const linksBySection = useMemo(() => {
    const result = new Map<string, LocationLink[]>()
    for (const link of selectedLinks) {
      const current = result.get(link.section_id) || []
      current.push(link)
      result.set(link.section_id, current)
    }
    return result
  }, [selectedLinks])
  const ancestorPath = useMemo(
    () => locationAncestorIds(world.locations, selected?.id || null)
      .map((id) => locationById.get(id))
      .filter((location): location is LocationEntry => Boolean(location)),
    [locationById, selected?.id, world.locations],
  )
  const routeEntries = useMemo(() => {
    const linkedIds = new Set<string>()
    const result: Array<{ location: LocationEntry; eyebrow: string }> = []
    for (const link of selectedLinks) {
      const target = locationById.get(link.target_location_id)
      if (!target || target.lifecycle_state !== "active" || linkedIds.has(target.id)) continue
      linkedIds.add(target.id)
      result.push({ location: target, eyebrow: link.label || "Переход" })
    }
    for (const child of children) {
      if (!linkedIds.has(child.id)) result.push({ location: child, eyebrow: "Подзона" })
    }
    return result
  }, [children, locationById, selectedLinks])
  const peopleHere = useMemo(
    () => selected
      ? state.states
          .filter((entry) => entry.location_id === selected.id)
          .map((entry) => ({ state: entry, character: context.characters.find((character) => character.id === entry.character_id) }))
          .filter((entry) => entry.character)
      : [],
    [context.characters, selected, state.states],
  )
  const scenesHere = useMemo(
    () => selected ? state.scenes.filter((scene) => scene.location_id === selected.id && scene.scene_state === "active") : [],
    [selected, state.scenes],
  )
  const habitatNpcIds = useMemo(
    () => new Set(selected ? habitats.npcIdsForZone(selected.id) : []),
    [habitats, selected],
  )
  const npcsUsuallyHere = useMemo(
    () => context.characters.filter((character) => character.character_type === "npc" && habitatNpcIds.has(character.id)),
    [context.characters, habitatNpcIds],
  )
  const availableNpcs = useMemo(
    () => context.characters.filter((character) => character.character_type === "npc").sort((left, right) => left.name.localeCompare(right.name, "ru")),
    [context.characters],
  )

  function openLocation(location: LocationEntry) {
    setSelectedId(location.id)
    setHabitatEditorOpen(false)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  function openLocationFromMap(location: LocationEntry) {
    setViewMode("lore")
    openLocation(location)
  }

  function toggleSection(sectionId: string) {
    setExpandedSections((current) => {
      const next = new Set(current)
      if (next.has(sectionId)) next.delete(sectionId)
      else next.add(sectionId)
      return next
    })
  }

  function subzoneCount(locationId: string) {
    return activeLocations.filter((location) => location.parent_location_id === locationId).length
  }

  function sectionCount(locationId: string) {
    return world.locationSections.filter((section) => section.location_id === locationId).length
  }

  async function setVisibility(location: LocationEntry, mode: VisibilityMode) {
    const result = await world.setLocationVisibility(location.id, mode)
    if (!result.ok) setError(result.error || "Не удалось изменить видимость.")
  }

  async function toggleArchive(location: LocationEntry) {
    const archiving = location.lifecycle_state !== "archived"
    const result = await world.setLocationArchived(location.id, archiving)
    if (!result.ok) { setError(result.error || "Не удалось изменить состояние зоны."); return }
    if (archiving && selectedId === location.id) setSelectedId(null)
  }

  async function publishLocation(location: LocationEntry) {
    const result = await world.publishLocationEvent(location.id, "updated")
    if (!result.ok) setError(result.error || "Не удалось опубликовать изменение в Хронике.")
  }

  async function toggleZoneNpc(npcId: string, attached: boolean) {
    if (!selected) return
    const result = await habitats.setAttached(npcId, selected.id, attached)
    if (!result.ok) setError(result.error || "Не удалось изменить обитателей зоны.")
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const table = deleteTarget.kind === "section" ? "location_sections" : "location_links"
    const result = await world.deleteWorldItem(table, deleteTarget.item.id)
    if (!result.ok) { setError(result.error || "Не удалось удалить элемент."); return }
    setDeleteTarget(null)
  }

  let menuTitle = ""
  let menuSubtitle = ""
  let menuActions: ContextAction[] = []
  if (menuTarget?.kind === "location") {
    const location = menuTarget.item
    menuTitle = location.name
    menuSubtitle = "Действия с зоной"
    menuActions = [
      { id: "open", icon: "◇", label: "Открыть зону", detail: "Перейти к подробному экрану", onSelect: () => openLocation(location) },
      { id: "edit", icon: "✎", label: "Редактировать", detail: "Превью, подробное описание и арт", onSelect: () => setEditor({ type: "location-edit", location }) },
      { id: "child", icon: "＋", label: "Добавить подзону", detail: "Создать вложенную область", onSelect: () => setEditor({ type: "location", parentId: location.id }) },
      { id: "section", icon: "≡", label: "Добавить раздел", detail: "Лор, детали или полезная информация", onSelect: () => setEditor({ type: "location-section", locationId: location.id }) },
      { id: "npcs", icon: "♟", label: "Обитатели зоны", detail: "Кого обычно можно встретить здесь", onSelect: () => { setSelectedId(location.id); setHabitatEditorOpen(true) } },
      { id: "visibility", icon: "◉", label: "Видимость", detail: visibilityLabel[location.visibility_mode], onSelect: () => setVisibilityTarget(location) },
      { id: "publish", icon: "✦", label: "Опубликовать в Хронике", detail: "Сообщить о значимом изменении", onSelect: () => publishLocation(location) },
      { id: "archive", icon: "⌁", label: location.lifecycle_state === "archived" ? "Вернуть из архива" : "Архивировать", detail: "История и старые сцены сохранятся", danger: location.lifecycle_state !== "archived", onSelect: () => toggleArchive(location) },
    ]
  } else if (menuTarget?.kind === "section") {
    const section = menuTarget.item
    menuTitle = section.title
    menuSubtitle = "Действия с разделом зоны"
    menuActions = [
      { id: "edit", icon: "✎", label: "Редактировать раздел", detail: "Изменить название и содержание", onSelect: () => setEditor({ type: "location-section-edit", section }) },
      { id: "link", icon: "⇢", label: "Добавить переход", detail: "Связать раздел с другой зоной", onSelect: () => setEditor({ type: "location-link", section }) },
      { id: "delete", icon: "×", label: "Удалить раздел", detail: "Связанные переходы тоже удалятся", danger: true, onSelect: () => setDeleteTarget({ kind: "section", item: section }) },
    ]
  } else if (menuTarget?.kind === "link") {
    const link = menuTarget.item
    const target = locationById.get(link.target_location_id)
    menuTitle = link.label || target?.name || "Переход"
    menuSubtitle = "Действия с переходом"
    menuActions = [
      { id: "open", icon: "◇", label: "Открыть связанную зону", detail: target?.name || "Зона недоступна", disabled: !target, onSelect: () => { if (target) openLocation(target) } },
      { id: "edit", icon: "✎", label: "Редактировать переход", detail: "Изменить подпись или цель", onSelect: () => setEditor({ type: "location-link-edit", link }) },
      { id: "delete", icon: "×", label: "Удалить переход", detail: "Сами зоны останутся на месте", danger: true, onSelect: () => setDeleteTarget({ kind: "link", item: link }) },
    ]
  }

  const visibilityActions: ContextAction[] = visibilityTarget ? [
    { id: "discover", icon: "◌", label: "После открытия", detail: "Появится, когда персонаж откроет эту зону", onSelect: () => setVisibility(visibilityTarget, "discover") },
    { id: "always", icon: "◉", label: "Видно всегда", detail: "Доступна всем игрокам кампании", onSelect: () => setVisibility(visibilityTarget, "always") },
    { id: "private", icon: "◇", label: "Только я", detail: "Не раскрывается игрокам автоматически", onSelect: () => setVisibility(visibilityTarget, "private") },
  ] : []

  if (world.loading || state.loading || habitats.loading) {
    return <div className="world-v2-loading"><span className="auth-spinner"/><p>Собираем известный мир…</p></div>
  }

  return (
    <div className="world-v2">
      <nav className="world-mode-nav" role="tablist" aria-label="Представление мира">
        <button type="button" role="tab" aria-selected={viewMode === "lore"} className={viewMode === "lore" ? "is-active" : ""} onClick={() => setViewMode("lore")}>ЛОР</button>
        <button type="button" role="tab" aria-selected={viewMode === "map"} className={viewMode === "map" ? "is-active" : ""} onClick={() => setViewMode("map")}>КАРТА</button>
      </nav>

      {viewMode === "map" ? (
        <WorldMapView
          locations={world.locations}
          sections={world.locationSections}
          links={world.locationLinks}
          currentLocationId={state.currentLocation?.id || null}
          canManage={context.canManage}
          onOpen={openLocationFromMap}
        />
      ) : !selected ? (
        <>
          <header className="world-v2-top">
            <div><span>Мир кампании</span><h2>{context.campaignTitle}</h2><p>{context.activeCharacter ? `Мир глазами ${context.activeCharacter.name}` : "Зоны, места и связи кампании"}</p></div>
            {context.canManage && <button type="button" className="world-v2-add" onClick={() => setEditor({ type: "location", parentId: null })} aria-label="Добавить зону">＋</button>}
          </header>

          {state.currentState && (
            <section className="world-position-strip">
              <span>◉</span>
              <div><small>Текущая позиция</small><strong>{state.currentLocation?.name || "Зона не задана"}</strong><p>{formatCampaignTime(state.currentState)}</p></div>
              {currentLocationEntry && <button type="button" onClick={() => openLocation(currentLocationEntry)}>Открыть</button>}
            </section>
          )}

          <section className="world-zone-overview">
            <div className="world-section-title"><small>Обзор</small><h3>Зоны мира</h3><p>Выбери зону, чтобы открыть её описание, подзоны и переходы.</p></div>
            {rootLocations.length > 0 ? (
              <div className="world-zone-grid">
                {rootLocations.map((location) => (
                  <LocationPreviewCard key={location.id} location={location} eyebrow="Зона" subzoneCount={subzoneCount(location.id)} sectionCount={sectionCount(location.id)} canManage={context.canManage} onOpen={openLocation} onMenu={openLocationMenu}/>
                ))}
              </div>
            ) : (
              <div className="world-v2-empty world-v2-empty--compact"><span>◇</span><strong>Мир ещё не открыт</strong><p>{context.canManage ? "Создай первую зону — здесь появится её превью." : "Открытые персонажу зоны появятся здесь."}</p>{context.canManage && <button type="button" onClick={() => setEditor({ type: "location", parentId: null })}>Создать зону</button>}</div>
            )}
          </section>

          {context.canManage && archivedLocations.length > 0 && (
            <section className="world-archive-section">
              <div className="world-section-title"><small>Управление</small><h3>Архив</h3><p>Архивные зоны скрыты из основного обзора, но их можно восстановить.</p></div>
              <div className="world-archive-list">
                {archivedLocations.map((location) => <button type="button" key={location.id} onClick={() => setMenuTarget({ kind: "location", item: location })}><span>⌁</span><span><strong>{location.name}</strong><small>{location.summary || "Без описания"}</small></span><em>•••</em></button>)}
              </div>
            </section>
          )}
        </>
      ) : (
        <>
          <nav className="world-detail-nav" aria-label="Навигация по зонам">
            <button className="world-detail-back" type="button" onClick={() => setSelectedId(null)}>← Все зоны</button>
            {ancestorPath.length > 0 && <div className="world-detail-crumbs">{ancestorPath.map((ancestor) => <button type="button" key={ancestor.id} onClick={() => openLocation(ancestor)}>{ancestor.name}</button>)}</div>}
          </nav>

          <section className={`world-location-hero ${selected.lifecycle_state === "archived" ? "is-archived" : ""}`} style={{ touchAction: "pan-y" }}>
            {selected.image_url && <CampaignImage className="world-location-hero__image" value={selected.image_url} alt={selected.name}/>}
            <div className="world-location-hero__scrim"/>
            <div className="world-location-hero__copy">
              <div className="world-location-hero__crumb"><span>{ancestorPath.length ? "Подзона" : "Зона мира"}</span></div>
              <h1>{selected.name}</h1>
              <p>{selected.summary || "Описание превью пока не заполнено."}</p>
              {context.canManage && <div className="world-location-hero__badges"><span>{visibilityLabel[selected.visibility_mode]}</span>{selected.lifecycle_state === "archived" && <span>Архив</span>}</div>}
            </div>
            {context.canManage && <button type="button" className="world-location-hero__menu" onClick={() => openLocationMenu(selected)} aria-label={`Действия с зоной ${selected.name}`}>•••</button>}
          </section>

          <section className="world-description-card">
            <header><div><small>О зоне</small><h3>Подробное описание</h3></div>{context.canManage && <button type="button" onClick={() => setEditor({ type: "location-edit", location: selected })}>Изменить</button>}</header>
            <p className={selected.description ? "" : "is-empty"}>{selected.description || (context.canManage ? "Заполни историю, атмосферу, ориентиры и важные детали зоны." : "Подробности этой зоны пока не открыты.")}</p>
          </section>

          {(npcsUsuallyHere.length > 0 || context.canManage) && (
            <section className="world-habitat-section">
              <div className="world-section-title world-habitat-head"><div><small>Обычно здесь</small><h3>Обитатели зоны</h3><p>Это привычные места NPC, а не их текущая позиция в сцене.</p></div>{context.canManage && <button type="button" onClick={() => setHabitatEditorOpen(true)}>＋ NPC</button>}</div>
              {npcsUsuallyHere.length > 0 ? <div className="world-habitat-row">{npcsUsuallyHere.map((npc) => <button type="button" className="world-habitat-card" key={npc.id} onClick={() => { window.location.hash = `#/character/${npc.id}?from=world` }}><CharacterAvatar character={npc} size="small"/><span><strong>{npc.name}</strong><small>Обычно можно встретить здесь</small></span></button>)}</div> : <div className="world-habitat-empty">Никто пока не привязан к этой зоне как постоянный или частый обитатель.</div>}
            </section>
          )}

          {routeEntries.length > 0 && (
            <section className="world-route-section">
              <div className="world-section-title"><small>Дальше</small><h3>Подзоны и переходы</h3></div>
              <div className="world-zone-grid world-zone-grid--routes">
                {routeEntries.map(({ location, eyebrow }) => <LocationPreviewCard key={location.id} location={location} eyebrow={eyebrow} subzoneCount={subzoneCount(location.id)} sectionCount={sectionCount(location.id)} canManage={context.canManage} onOpen={openLocation} onMenu={openLocationMenu}/>)}
              </div>
            </section>
          )}

          <section className="world-info-section">
            <div className="world-section-title world-section-title--actions"><div><small>Сведения</small><h3>Разделы зоны</h3><p>Открывай только нужный раздел — всё больше не свалено в одну простыню.</p></div>{context.canManage && <button type="button" onClick={() => setEditor({ type: "location-section", locationId: selected.id })}>＋ Раздел</button>}</div>
            {selectedSections.length > 0 ? (
              <div className="world-info-list">
                {selectedSections.map((section) => {
                  const expanded = expandedSections.has(section.id)
                  const links = linksBySection.get(section.id) || []
                  return <article className={`world-info-card ${expanded ? "is-open" : ""}`} key={section.id} style={{ touchAction: "pan-y" }} {...(context.canManage ? bindSectionLongPress(section) : {})}>
                    <header><button className="world-info-card__toggle" type="button" onClick={() => toggleSection(section.id)} aria-expanded={expanded}><span><strong>{section.title}</strong><small>{expanded ? "Скрыть содержание" : "Открыть содержание"}</small></span><em>{expanded ? "⌃" : "⌄"}</em></button>{context.canManage && <button className="world-info-card__menu" type="button" onClick={() => openSectionMenu(section)} aria-label={`Действия с разделом ${section.title}`}>•••</button>}</header>
                    {expanded && <div className="world-info-card__body"><p>{section.body || "Содержание пока не заполнено."}</p>{links.length > 0 && <div className="world-info-links">{links.map((link) => { const target = locationById.get(link.target_location_id); return <div className="world-info-link" key={link.id} style={{ touchAction: "pan-y" }} {...(context.canManage ? bindLinkLongPress(link) : {})}><button className="world-info-link__main" type="button" disabled={!target} onClick={() => { if (target) openLocation(target) }}><span>⇢</span><span><small>{link.label || "Переход"}</small><strong>{target?.name || "Зона недоступна"}</strong></span>{!context.canManage && <em>›</em>}</button>{context.canManage && <button className="world-info-link__menu" type="button" onClick={() => openLinkMenu(link)} aria-label={`Действия с переходом ${link.label || target?.name || "без подписи"}`}>•••</button>}</div> })}</div>}</div>}
                  </article>
                })}
              </div>
            ) : (
              <div className="world-info-empty"><span>≡</span><div><strong>Разделов пока нет</strong><p>{context.canManage ? "Добавь отдельные блоки: историю, ориентиры, обитателей или секреты." : "Дополнительные сведения появятся после открытия."}</p></div></div>
            )}
          </section>

          {(peopleHere.length > 0 || scenesHere.length > 0) && (
            <section className="world-live-section">
              <div className="world-section-title"><small>Сейчас здесь</small><h3>Живое состояние зоны</h3></div>
              {peopleHere.length > 0 && <div className="world-presence-row">{peopleHere.map(({ character, state: position }) => character && <button type="button" key={character.id} onClick={() => { window.location.hash = `#/character/${character.id}?from=world` }}><CharacterAvatar character={character} size="small"/><span><strong>{character.name}</strong><small>{context.canManage || (state.currentState && position.campaign_day === state.currentState.campaign_day && position.day_period === state.currentState.day_period) ? formatCampaignTime(position) : "В этой зоне"}</small></span></button>)}</div>}
              {scenesHere.length > 0 && <div className="world-scenes-row">{scenesHere.map((scene) => <button type="button" key={scene.room_id} onClick={() => { window.location.hash = `#/chat/${scene.room_id}` }}><span>✦</span><div><small>Активная сцена</small><strong>{scene.title}</strong><p>{formatCampaignTime(scene)}</p></div><b>›</b></button>)}</div>}
            </section>
          )}
        </>
      )}

      {(error || world.error || habitats.error) && <div className="world-inline-error">{error || world.error || habitats.error}<button type="button" onClick={() => setError("")}>×</button></div>}

      {menuTarget && <ContextActionSheet title={menuTitle} subtitle={menuSubtitle} actions={menuActions} onClose={() => setMenuTarget(null)}/>}
      {visibilityTarget && <ContextActionSheet title={visibilityTarget.name} subtitle="Кто видит эту зону" actions={visibilityActions} onClose={() => setVisibilityTarget(null)}/>}
      {habitatEditorOpen && selected && <ZoneHabitatNpcsSheet zoneName={selected.name} npcs={availableNpcs} selectedIds={habitatNpcIds} savingKey={habitats.savingKey} onClose={() => setHabitatEditorOpen(false)} onToggle={(npcId, next) => { void toggleZoneNpc(npcId, next) }}/>} 

      {deleteTarget && <div className="sheet-backdrop" onMouseDown={() => setDeleteTarget(null)}><section className="bottom-sheet v2-confirm" role="dialog" aria-modal="true" aria-label="Подтверждение удаления" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-handle"/><span className="v2-confirm-icon">×</span><h3>{deleteTarget.kind === "section" ? `Удалить «${deleteTarget.item.title}»?` : `Удалить переход «${deleteTarget.item.label || "Без подписи"}»?`}</h3><p>{deleteTarget.kind === "section" ? "Раздел и его переходы будут удалены. Сами зоны останутся." : "Связанные зоны и их содержимое останутся на месте."}</p><div><button type="button" onClick={() => setDeleteTarget(null)}>Отмена</button><button className="is-danger" type="button" onClick={() => void confirmDelete()}>Удалить</button></div></section></div>}

      <WorldEditor mode={editor} onClose={() => setEditor(null)} campaignTitle={context.campaignTitle} campaignSummary={context.campaignSummary} campaignRulesSummary={context.campaignRulesSummary} campaignCoverUrl={context.campaignCoverUrl} campaignId={context.campaignId} locations={world.locations} locationSections={world.locationSections} characters={context.characters} members={context.members} updateCampaignInfo={context.updateCampaignInfo} createWorldSection={world.createWorldSection} updateWorldSection={world.updateWorldSection} createWorldArticle={world.createWorldArticle} updateWorldArticle={world.updateWorldArticle} createLocation={world.createLocation} updateLocation={world.updateLocation} createLocationSection={world.createLocationSection} updateLocationSection={world.updateLocationSection} createLocationLink={world.createLocationLink} updateLocationLink={world.updateLocationLink} createAchievement={world.createAchievement} updateAchievement={world.updateAchievement} createUpdate={world.createUpdate} updateUpdate={world.updateUpdate}/>
    </div>
  )
}
