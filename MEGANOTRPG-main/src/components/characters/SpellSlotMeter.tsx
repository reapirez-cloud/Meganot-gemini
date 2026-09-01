import type { ResolvedResource } from "../../character-engine/index.ts"
import { spellSlotResources } from "./spellSlots.ts"

type Props = {
  resources: ResolvedResource[]
  selectedLevel?: number | null
  compact?: boolean
  onSelect?: (level: number) => void
}

type SlotState = {
  resource: ResolvedResource
  level: number
  maximum: number
  current: number
}

function formatLevels(levels: number[]) {
  if (levels.length === 1) return `${levels[0]} ур.`
  return levels.map((level) => `${level}`).join(", ") + " ур."
}

export default function SpellSlotMeter({
  resources,
  selectedLevel = null,
  compact = false,
  onSelect,
}: Props) {
  const slots: SlotState[] = spellSlotResources(resources).map(({ resource, level }) => {
    const maximum = Math.max(0, Math.round(resource.max.value))
    const current = Math.max(0, Math.min(maximum, Math.round(resource.current)))
    return { resource, level, maximum, current }
  })

  if (slots.length === 0) return null

  return (
    <div className={`spell-slots-v3 ${compact ? "spell-slots-v3--compact" : ""}`}>
      {!compact && (
        <div className="spell-slots-v3__guide">
          <span aria-hidden="true">↗</span>
          <p>
            <strong>Заклинание можно наложить ячейкой выше уровнем.</strong>
            <small>Если ячейки нужного уровня закончились, спишется ближайшая доступная старшая.</small>
          </p>
        </div>
      )}

      {slots.map(({ resource, level, maximum, current }) => {
        const depleted = maximum > 0 && current === 0
        const fallbackLevels = current > 0
          ? slots
              .filter((slot) => {
                if (slot.level >= level || slot.maximum <= 0 || slot.current > 0) return false
                const nearestAvailable = slots.find((candidate) => candidate.level > slot.level && candidate.current > 0)
                return nearestAvailable?.level === level
              })
              .map((slot) => slot.level)
          : []
        const canReplaceLower = fallbackLevels.length > 0
        const classNames = [
          "spell-slots-v3__level",
          selectedLevel === level ? "spell-slots-v3__level--active" : "",
          depleted ? "spell-slots-v3__level--depleted" : "",
          canReplaceLower ? "spell-slots-v3__level--fallback" : "",
        ].filter(Boolean).join(" ")
        const usageLabel = depleted
          ? "Ячейки закончились"
          : canReplaceLower
            ? `Будет использована вместо ${formatLevels(fallbackLevels)}`
            : "Доступны"

        return (
          <button
            className={classNames}
            type="button"
            key={resource.stateKey}
            onClick={() => onSelect?.(level)}
            disabled={!onSelect}
            aria-label={`${level} уровень: ${current} из ${maximum} ячеек. ${usageLabel}`}
          >
            <span className="spell-slots-v3__label">
              <strong>{level}</strong>
              <small>ур.</small>
            </span>
            <span className="spell-slots-v3__body">
              <span className="spell-slots-v3__orbs" aria-hidden="true">
                {Array.from({ length: maximum }, (_, index) => (
                  <i
                    className={index < current ? "spell-slots-v3__orb spell-slots-v3__orb--lit" : "spell-slots-v3__orb"}
                    key={index}
                  />
                ))}
              </span>
              <small className="spell-slots-v3__usage">{usageLabel}</small>
            </span>
            <span className="spell-slots-v3__count">{current}/{maximum}</span>
          </button>
        )
      })}
    </div>
  )
}
