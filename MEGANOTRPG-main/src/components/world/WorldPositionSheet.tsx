import { useMemo, useState } from "react"
import { DAY_PERIODS, formatCampaignTime, shiftWorldTime } from "../../world-state/time"
import type { DayPeriod, LocationSummary, WorldPosition } from "../../world-state/types"

type WorldPositionIntent = "edit-position" | "move-character" | "edit-location" | "edit-time"

type Props = {
  title: string
  position: WorldPosition
  locations: LocationSummary[]
  intent?: WorldPositionIntent
  onClose: () => void
  onSave: (locationId: string | null, campaignDay: number, dayPeriod: DayPeriod) => Promise<{ ok: boolean; error?: string }>
}

export default function WorldPositionSheet({ title, position, locations, intent = "edit-position", onClose, onSave }: Props) {
  const [locationId, setLocationId] = useState<string | null>(position.location_id)
  const [campaignDay, setCampaignDay] = useState(position.campaign_day)
  const [dayPeriod, setDayPeriod] = useState<DayPeriod>(position.day_period)
  const [query, setQuery] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const movingCharacter = intent === "move-character"
  const editingLocationOnly = intent === "edit-location"
  const editingTimeOnly = intent === "edit-time"
  const showLocation = !editingTimeOnly
  const showTime = !movingCharacter && !editingLocationOnly
  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("ru-RU")
    return locations.filter((location) => location.lifecycle_state === "active" && (!q || location.name.toLocaleLowerCase("ru-RU").includes(q))).slice(0, 40)
  }, [locations, query])

  const originalLocation = locations.find((location) => location.id === position.location_id) || null
  const selectedLocation = locations.find((location) => location.id === locationId) || null
  const destinationChanged = locationId !== position.location_id
  const movePeriod = (direction: -1 | 1) => {
    const next = shiftWorldTime({ location_id: locationId, campaign_day: campaignDay, day_period: dayPeriod }, direction)
    setCampaignDay(next.campaign_day); setDayPeriod(next.day_period)
  }

  async function save() {
    if (movingCharacter && (!selectedLocation || !destinationChanged)) return
    setSaving(true); setError("")
    const result = await onSave(
      editingTimeOnly ? position.location_id : locationId,
      movingCharacter || editingLocationOnly ? position.campaign_day : Math.max(1, campaignDay),
      movingCharacter || editingLocationOnly ? position.day_period : dayPeriod,
    )
    setSaving(false)
    if (!result.ok) { setError(result.error || "Не удалось сохранить позицию."); return }
    onClose()
  }

  const heading = movingCharacter
    ? "Отправить персонажа"
    : editingTimeOnly
      ? "День и время"
      : editingLocationOnly
        ? "Локация"
        : "Позиция в мире"

  const saveLabel = movingCharacter
    ? "Отправить сюда"
    : editingTimeOnly
      ? "Сохранить время"
      : editingLocationOnly
        ? "Сохранить локацию"
        : "Сохранить"

  return (
    <div className="soft-sheet-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}>
      <section className="soft-sheet world-position-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="soft-sheet__handle" />
        <header className="soft-sheet__header"><div><small>{heading}</small><h2>{title}</h2></div><button type="button" className="soft-sheet__close" onClick={onClose}>×</button></header>

        <div className="position-summary">
          <span>{editingTimeOnly ? "◷" : "◈"}</span><div><small>Сейчас</small><strong>{editingTimeOnly ? formatCampaignTime(position) : originalLocation?.name || "Локация не задана"}</strong>{!editingTimeOnly && <p>{formatCampaignTime(position)}</p>}</div>
        </div>

        {showLocation && <div className="sheet-section">
          <div className="sheet-section__head"><span>{movingCharacter ? "Куда отправить" : "Локация"}</span>{!movingCharacter && <button type="button" onClick={() => setLocationId(null)}>Не задана</button>}</div>
          <input className="app-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по миру…" />
          <div className="position-location-list">
            {shown.map((location) => {
              const selected = location.id === locationId
              return <button
                type="button"
                key={location.id}
                className={selected ? "is-active" : ""}
                aria-pressed={selected}
                onClick={() => { setLocationId(location.id); setError("") }}
              >
                <span>{selected ? "✓" : "◈"}</span>
                <strong>{location.name}</strong>
                {selected
                  ? <small>{movingCharacter ? "Цель" : "Выбрано"}</small>
                  : location.visibility_mode === "private"
                    ? <small>Только я</small>
                    : location.visibility_mode === "discover"
                      ? <small>По открытию</small>
                      : null}
              </button>
            })}
          </div>
        </div>}

        {movingCharacter && selectedLocation && destinationChanged && <div className="position-summary">
          <span>⇢</span><div><small>Новая зона</small><strong>{selectedLocation.name}</strong><p>Время персонажа останется без изменений.</p></div>
        </div>}

        {showTime && <div className="sheet-section">
          <div className="sheet-section__head"><span>Время кампании</span><span className="sheet-section__muted">без календарной даты</span></div>
          <div className="campaign-day-control"><button type="button" onClick={() => setCampaignDay((day) => Math.max(1, day - 1))}>−</button><label><small>День кампании</small><input type="number" min="1" value={campaignDay} onChange={(event) => setCampaignDay(Math.max(1, Number(event.target.value) || 1))} /></label><button type="button" onClick={() => setCampaignDay((day) => day + 1)}>＋</button></div>
          <div className="period-stepper"><button type="button" onClick={() => movePeriod(-1)}>‹</button><div><small>Период</small><strong>{DAY_PERIODS.find((period) => period.value === dayPeriod)?.label}</strong></div><button type="button" onClick={() => movePeriod(1)}>›</button></div>
          <div className="period-pills">{DAY_PERIODS.map((period) => <button type="button" key={period.value} className={dayPeriod === period.value ? "is-active" : ""} onClick={() => setDayPeriod(period.value)}>{period.shortLabel}</button>)}</div>
        </div>}

        {error && <div className="sheet-error">{error}</div>}
        <footer className="soft-sheet__footer">
          <button type="button" className="sheet-secondary" onClick={onClose}>Отмена</button>
          {(!movingCharacter || (selectedLocation && destinationChanged)) && <button type="button" className="sheet-primary" disabled={saving} onClick={() => void save()}>{saving ? "Сохраняем…" : saveLabel}</button>}
        </footer>
      </section>
    </div>
  )
}
