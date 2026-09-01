import { useMemo, type CSSProperties } from "react"

import CampaignImage from "../common/CampaignImage"
import type { LocationEntry, LocationLink, LocationSection } from "../../types/world"
import "../../world-map.css"

type Connection = {
  target: LocationEntry
  label: string
}

type MapRow = {
  location: LocationEntry
  depth: number
  ancestors: LocationEntry[]
}

type Props = {
  locations: LocationEntry[]
  sections: LocationSection[]
  links: LocationLink[]
  currentLocationId?: string | null
  canManage: boolean
  onOpen: (location: LocationEntry) => void
}

function sortLocations(left: LocationEntry, right: LocationEntry) {
  return left.sort_order - right.sort_order || left.name.localeCompare(right.name, "ru")
}

export default function WorldMapView({
  locations,
  sections,
  links,
  currentLocationId = null,
  canManage,
  onOpen,
}: Props) {
  const activeLocations = useMemo(
    () => locations.filter((location) => location.lifecycle_state === "active"),
    [locations],
  )
  const locationById = useMemo(
    () => new Map(activeLocations.map((location) => [location.id, location])),
    [activeLocations],
  )
  const sectionLocation = useMemo(
    () => new Map(sections.map((section) => [section.id, section.location_id])),
    [sections],
  )

  const connections = useMemo(() => {
    const result = new Map<string, Connection[]>()
    const seen = new Set<string>()

    for (const link of links) {
      const sourceId = sectionLocation.get(link.section_id)
      const target = locationById.get(link.target_location_id)
      if (!sourceId || !locationById.has(sourceId) || !target) continue
      const key = `${sourceId}:${target.id}`
      if (seen.has(key)) continue
      seen.add(key)
      const current = result.get(sourceId) || []
      current.push({ target, label: link.label || "Переход" })
      result.set(sourceId, current)
    }

    for (const list of result.values()) {
      list.sort((left, right) => sortLocations(left.target, right.target))
    }
    return result
  }, [links, locationById, sectionLocation])

  const orderedLocations = useMemo<MapRow[]>(() => {
    const source = [...activeLocations].sort(sortLocations)
    const activeIds = new Set(source.map((location) => location.id))
    const childrenByParent = new Map<string, LocationEntry[]>()
    const roots: LocationEntry[] = []

    for (const location of source) {
      if (location.parent_location_id && activeIds.has(location.parent_location_id)) {
        const children = childrenByParent.get(location.parent_location_id) || []
        children.push(location)
        childrenByParent.set(location.parent_location_id, children)
      } else {
        roots.push(location)
      }
    }

    for (const children of childrenByParent.values()) children.sort(sortLocations)
    roots.sort(sortLocations)

    const result: MapRow[] = []
    const visited = new Set<string>()
    const walk = (location: LocationEntry, ancestors: LocationEntry[]) => {
      if (visited.has(location.id)) return
      visited.add(location.id)
      result.push({ location, depth: ancestors.length, ancestors })
      for (const child of childrenByParent.get(location.id) || []) {
        walk(child, [...ancestors, location])
      }
    }

    for (const root of roots) walk(root, [])
    for (const location of source) {
      if (!visited.has(location.id)) walk(location, [])
    }
    return result
  }, [activeLocations])

  if (!orderedLocations.length) {
    return <div className="world-map-empty"><span>⌁</span><strong>Карта пока пустая</strong><p>{canManage ? "Создай зоны и переходы — связи появятся здесь автоматически." : "Открытые тебе локации появятся здесь."}</p></div>
  }

  return <section className="world-map-view" aria-label="Карта связей мира">
    <header className="world-map-intro"><div><small>Навигация</small><h3>Карта переходов</h3><p>Вложенные зоны идут прямо под родительскими. Стрелки ниже показывают реальные переходы между местами.</p></div><span>{orderedLocations.length}</span></header>

    <div className="world-map-board">
      {orderedLocations.map(({ location, depth, ancestors }) => {
        const routes = connections.get(location.id) || []
        const isCurrent = currentLocationId === location.id
        const parentPath = ancestors.map((ancestor) => ancestor.name).join(" › ")
        return <article
          className={`world-map-node ${depth ? "is-nested" : ""} ${isCurrent ? "is-current" : ""}`}
          key={location.id}
          style={{ "--map-depth": Math.min(depth, 4) } as CSSProperties}
        >
          {parentPath && <div className="world-map-parentage" title={parentPath}><span>Внутри</span><strong>{parentPath}</strong></div>}

          <button className="world-map-card" type="button" onClick={() => onOpen(location)}>
            {location.image_url ? <CampaignImage className="world-map-card__image" value={location.image_url} alt=""/> : <span className="world-map-card__mark" aria-hidden="true">◇</span>}
            <span className="world-map-card__copy"><small>{isCurrent ? "Сейчас здесь" : "Локация"}</small><strong>{location.name}</strong>{location.summary && <p>{location.summary}</p>}</span>
            {canManage && location.visibility_mode === "private" && <span className="world-map-private">Только я</span>}
          </button>

          {routes.length > 0 && <div className="world-map-routes" aria-label={`Переходы из ${location.name}`}>
            <span className="world-map-routes__label">Переходы</span>
            <div className="world-map-routes__rail">
              {routes.map((route) => <button className="world-map-route" type="button" key={`${location.id}:${route.target.id}`} onClick={() => onOpen(route.target)}><span className="world-map-route__arrow">→</span><span><small>{route.label}</small><strong>{route.target.name}</strong></span></button>)}
            </div>
          </div>}
        </article>
      })}
    </div>
  </section>
}
