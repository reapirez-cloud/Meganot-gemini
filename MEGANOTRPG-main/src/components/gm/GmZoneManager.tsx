import { useMemo, useState } from "react"
import type { FormEvent } from "react"
import ContextActionSheet from "../common/ContextActionSheet"
import type { ContextAction } from "../common/ContextActionSheet"
import { useWorldContent } from "../../hooks/useWorldContent"
import type { LocationEntry, VisibilityMode } from "../../types/world"

type ZoneScope = "active" | "archived"
type ZoneEditorTarget = LocationEntry | "new" | null

type Props = {
  onError?: (message: string) => void
}

type FlatZone = {
  zone: LocationEntry
  depth: number
  path: string
}

function visibilityLabel(mode: VisibilityMode) {
  if (mode === "always") return "Видна сразу"
  if (mode === "private") return "Только ГМ"
  return "По открытию"
}

function flattenZones(locations: LocationEntry[]): FlatZone[] {
  const source = [...locations].sort((left, right) => left.sort_order - right.sort_order || left.name.localeCompare(right.name, "ru"))
  const byParent = new Map<string | null, LocationEntry[]>()
  for (const zone of source) {
    const parent = zone.parent_location_id && source.some((candidate) => candidate.id === zone.parent_location_id) ? zone.parent_location_id : null
    const bucket = byParent.get(parent) || []
    bucket.push(zone)
    byParent.set(parent, bucket)
  }

  const result: FlatZone[] = []
  const visited = new Set<string>()
  const walk = (parentId: string | null, depth: number, parentPath: string) => {
    for (const zone of byParent.get(parentId) || []) {
      if (visited.has(zone.id)) continue
      visited.add(zone.id)
      const path = parentPath ? `${parentPath} / ${zone.name}` : zone.name
      result.push({ zone, depth, path })
      walk(zone.id, Math.min(depth + 1, 5), path)
    }
  }
  walk(null, 0, "")
  for (const zone of source) {
    if (visited.has(zone.id)) continue
    result.push({ zone, depth: 0, path: zone.name })
  }
  return result
}

function descendantCount(locations: LocationEntry[], zoneId: string): number {
  const childrenByParent = new Map<string, string[]>()
  for (const location of locations) {
    if (!location.parent_location_id) continue
    const children = childrenByParent.get(location.parent_location_id) || []
    children.push(location.id)
    childrenByParent.set(location.parent_location_id, children)
  }

  const visited = new Set<string>()
  const stack = [...(childrenByParent.get(zoneId) || [])]
  while (stack.length) {
    const id = stack.pop()
    if (!id || visited.has(id)) continue
    visited.add(id)
    stack.push(...(childrenByParent.get(id) || []))
  }
  return visited.size
}

export default function GmZoneManager({ onError }: Props) {
  const world = useWorldContent()
  const [scope, setScope] = useState<ZoneScope>("active")
  const [query, setQuery] = useState("")
  const [editor, setEditor] = useState<ZoneEditorTarget>(null)
  const [menuTarget, setMenuTarget] = useState<LocationEntry | null>(null)
  const [name, setName] = useState("")
  const [summary, setSummary] = useState("")
  const [description, setDescription] = useState("")
  const [parentLocationId, setParentLocationId] = useState("")
  const [visibility, setVisibility] = useState<VisibilityMode>("discover")
  const [saving, setSaving] = useState(false)
  const [localError, setLocalError] = useState("")

  const activeLocations = useMemo(() => world.locations.filter((location) => location.lifecycle_state === "active"), [world.locations])
  const scopedLocations = useMemo(() => world.locations.filter((location) => location.lifecycle_state === scope), [scope, world.locations])
  const flatZones = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ru-RU")
    return flattenZones(scopedLocations).filter(({ zone, path }) => !needle || `${path} ${zone.summary} ${zone.description}`.toLocaleLowerCase("ru-RU").includes(needle))
  }, [query, scopedLocations])
  const nestedCount = menuTarget ? descendantCount(world.locations, menuTarget.id) : 0

  function reportError(message: string) {
    setLocalError(message)
    onError?.(message)
  }

  function openEditor(target: LocationEntry | "new") {
    setEditor(target)
    setLocalError("")
    if (target === "new") {
      setName("")
      setSummary("")
      setDescription("")
      setParentLocationId("")
      setVisibility("discover")
      return
    }
    setName(target.name)
    setSummary(target.summary)
    setDescription(target.description)
    setParentLocationId(target.parent_location_id || "")
    setVisibility(target.visibility_mode)
  }

  async function saveZone(event: FormEvent) {
    event.preventDefault()
    if (!editor || !name.trim()) return
    setSaving(true)
    setLocalError("")
    const result = editor === "new"
      ? await world.createLocation({
          parent_location_id: parentLocationId || null,
          name: name.trim(),
          summary: summary.trim(),
          description: description.trim(),
          image_url: null,
          visibility_mode: visibility,
        })
      : await world.updateLocation(editor.id, {
          name: name.trim(),
          summary: summary.trim(),
          description: description.trim(),
          image_url: editor.image_url,
          visibility_mode: visibility,
        })
    setSaving(false)
    if (!result.ok) {
      reportError(result.error || "Не удалось сохранить зону.")
      return
    }
    setEditor(null)
  }

  async function toggleArchive(zone: LocationEntry) {
    setSaving(true)
    setLocalError("")
    const result = await world.setLocationArchived(zone.id, zone.lifecycle_state !== "archived")
    setSaving(false)
    if (!result.ok) reportError(result.error || "Не удалось изменить состояние зоны.")
  }

  async function deleteZone(zone: LocationEntry) {
    const children = descendantCount(world.locations, zone.id)
    const warning = children
      ? `Удалить «${zone.name}» и все вложенные зоны (${children})? Это действие нельзя отменить.`
      : `Удалить «${zone.name}» навсегда? Это действие нельзя отменить.`
    if (!window.confirm(warning)) return

    setSaving(true)
    setLocalError("")
    const result = await world.deleteWorldItem("locations", zone.id)
    setSaving(false)
    if (!result.ok) {
      reportError(result.error || "Не удалось удалить зону.")
      return
    }
    if (editor !== "new" && editor?.id === zone.id) setEditor(null)
    setMenuTarget(null)
  }

  const menuActions: ContextAction[] = menuTarget ? [
    { id: "edit", icon: "✎", label: "Редактировать", detail: "Название, описание и видимость", onSelect: () => openEditor(menuTarget) },
    menuTarget.lifecycle_state === "archived"
      ? { id: "restore", icon: "↥", label: "Вернуть зону", detail: "Снова показать её в активной структуре", onSelect: () => void toggleArchive(menuTarget) }
      : { id: "archive", icon: "⌁", label: "В архив", detail: "Убрать из рабочей структуры без удаления", onSelect: () => void toggleArchive(menuTarget) },
    {
      id: "delete",
      icon: "×",
      label: "Удалить навсегда",
      detail: nestedCount ? `Удалится и всё внутри · ${nestedCount} зон` : "Без возможности восстановления",
      danger: true,
      onSelect: () => void deleteZone(menuTarget),
    },
  ] : []

  return <section className="gm-section" aria-label="Зоны мира">
    <div className="gm-subrail gm-subrail--two" role="tablist" aria-label="Состояние зон">
      <button type="button" role="tab" aria-selected={scope === "active"} className={scope === "active" ? "is-active" : ""} onClick={() => setScope("active")}>Активные</button>
      <button type="button" role="tab" aria-selected={scope === "archived"} className={scope === "archived" ? "is-active" : ""} onClick={() => setScope("archived")}>Архив</button>
    </div>

    <div className="gm-list-tools">
      <label className="gm-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти зону" /></label>
      <button className="gm-add-button" type="button" onClick={() => openEditor("new")} aria-label="Создать зону">＋</button>
    </div>

    {(localError || world.error) && <div className="auth-error">{localError || world.error}</div>}

    <div className="gm-clean-list gm-zone-list">
      {flatZones.map(({ zone, depth, path }) => <article className="gm-clean-row gm-zone-row" key={zone.id} style={{ "--zone-depth": depth } as React.CSSProperties}>
        <button className="gm-clean-row__main" type="button" onClick={() => openEditor(zone)} aria-label={`Редактировать зону ${path}`}>
          <span className="gm-zone-branch" aria-hidden="true">{depth ? "└" : "◇"}</span>
          <span className="gm-row-copy"><strong>{zone.name}</strong><small>{zone.summary || "Без краткого описания"}</small></span>
          <span className="gm-zone-visibility">{visibilityLabel(zone.visibility_mode)}</span>
        </button>
        <button className="gm-row-more" type="button" onClick={() => setMenuTarget(zone)} aria-label={`Действия с зоной ${zone.name}`}>•••</button>
      </article>)}
      {!world.loading && !flatZones.length && <div className="gm-empty"><span>◇</span><strong>{scopedLocations.length ? "Ничего не найдено" : scope === "active" ? "Зон пока нет" : "Архив пуст"}</strong><p>{scopedLocations.length ? "Измени запрос." : scope === "active" ? "Создай первую зону — только название и нужные детали, без визуального шума." : "Архивированные зоны появятся здесь."}</p></div>}
      {world.loading && <div className="gm-empty gm-empty--loading"><span>···</span><strong>Загружаем зоны</strong></div>}
    </div>

    {menuTarget && <ContextActionSheet title={menuTarget.name} subtitle="Зона мира" actions={menuActions} onClose={() => setMenuTarget(null)} />}

    {editor && <div className="sheet-backdrop" onMouseDown={() => { if (!saving) setEditor(null) }}><form className="bottom-sheet v2-editor-sheet gm-zone-editor" onSubmit={saveZone} onMouseDown={(event) => event.stopPropagation()}><div className="sheet-handle"/><header className="v2-sheet-head"><div><span>Зоны</span><h3>{editor === "new" ? "Новая зона" : `Редактировать · ${editor.name}`}</h3><p>В кабинете только структура и текст. Картинки сюда не выводятся.</p></div><button type="button" onClick={() => setEditor(null)} disabled={saving}>×</button></header><section className="v2-form-section"><label className="field-label" htmlFor="gm-zone-name">Название</label><input id="gm-zone-name" className="app-input" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} autoFocus />{editor === "new" && <><label className="field-label" htmlFor="gm-zone-parent">Внутри зоны</label><select id="gm-zone-parent" className="app-select" value={parentLocationId} onChange={(event) => setParentLocationId(event.target.value)}><option value="">Корневой уровень</option>{flattenZones(activeLocations).map(({ zone, depth }) => <option key={zone.id} value={zone.id}>{`${"— ".repeat(depth)}${zone.name}`}</option>)}</select></>}<label className="field-label" htmlFor="gm-zone-summary">Коротко</label><input id="gm-zone-summary" className="app-input" value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={180} placeholder="Одной строкой, если нужно"/><label className="field-label" htmlFor="gm-zone-description">Описание</label><textarea id="gm-zone-description" className="app-textarea gm-zone-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Подробности зоны"/><label className="field-label" htmlFor="gm-zone-visibility">Видимость</label><select id="gm-zone-visibility" className="app-select" value={visibility} onChange={(event) => setVisibility(event.target.value as VisibilityMode)}><option value="discover">По открытию</option><option value="always">Видна сразу</option><option value="private">Только ГМ</option></select></section><button className="v2-primary-button v2-full-button" type="submit" disabled={saving || !name.trim()}>{saving ? "Сохраняем…" : "Сохранить зону"}</button></form></div>}
  </section>
}
