import type { DayPeriod, WorldPosition } from "./types.ts"

export const DAY_PERIODS: ReadonlyArray<{ value: DayPeriod; label: string; shortLabel: string }> = [
  { value: "dawn", label: "Рассвет", shortLabel: "Рассвет" },
  { value: "morning", label: "Утро", shortLabel: "Утро" },
  { value: "day", label: "День", shortLabel: "День" },
  { value: "late_day", label: "Поздний день", shortLabel: "Поздний день" },
  { value: "evening", label: "Вечер", shortLabel: "Вечер" },
  { value: "night", label: "Ночь", shortLabel: "Ночь" },
  { value: "deep_night", label: "Глубокая ночь", shortLabel: "Глубокая ночь" },
]

const periodIndex = new Map(DAY_PERIODS.map((period, index) => [period.value, index]))

export function dayPeriodLabel(period: DayPeriod): string {
  return DAY_PERIODS.find((entry) => entry.value === period)?.label || period
}

export function formatCampaignTime(position: Pick<WorldPosition, "campaign_day" | "day_period">): string {
  return `День ${position.campaign_day} кампании · ${dayPeriodLabel(position.day_period)}`
}

export function compareWorldTime(a: Pick<WorldPosition, "campaign_day" | "day_period">, b: Pick<WorldPosition, "campaign_day" | "day_period">): number {
  if (a.campaign_day !== b.campaign_day) return a.campaign_day - b.campaign_day
  return (periodIndex.get(a.day_period) ?? 0) - (periodIndex.get(b.day_period) ?? 0)
}

export function shiftWorldTime(position: WorldPosition, direction: -1 | 1): WorldPosition {
  const current = periodIndex.get(position.day_period) ?? 0
  const next = current + direction
  if (next < 0) return { ...position, campaign_day: Math.max(1, position.campaign_day - 1), day_period: DAY_PERIODS[DAY_PERIODS.length - 1]!.value }
  if (next >= DAY_PERIODS.length) return { ...position, campaign_day: position.campaign_day + 1, day_period: DAY_PERIODS[0]!.value }
  return { ...position, day_period: DAY_PERIODS[next]!.value }
}
