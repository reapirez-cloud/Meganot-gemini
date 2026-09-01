export const SHEET_MODULE_TONES = [
  "neutral",
  "violet",
  "blue",
  "cyan",
  "green",
  "amber",
  "red",
] as const

export type SheetModuleTone = (typeof SHEET_MODULE_TONES)[number]
export type SheetModuleDisplay = "counter" | "pips" | "bar"

/**
 * Presentation-only metadata. Character Engine must never branch on this.
 * Class/item/feature sources may attach it to a grant payload when they want a
 * distinct visual identity (rage, ki, wild shape, charges, etc.).
 */
export type SheetModulePresentation = {
  tone: SheetModuleTone
  icon?: string
  display: SheetModuleDisplay
  priority?: number
}

const toneSet = new Set<string>(SHEET_MODULE_TONES)
const displays = new Set<SheetModuleDisplay>(["counter", "pips", "bar"])

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export function readSheetModulePresentation(payload: unknown): SheetModulePresentation | null {
  const root = asRecord(payload)
  const raw = asRecord(root?.presentation)
  if (!raw) return null

  const tone = typeof raw.tone === "string" && toneSet.has(raw.tone)
    ? raw.tone as SheetModuleTone
    : "neutral"
  const display = typeof raw.display === "string" && displays.has(raw.display as SheetModuleDisplay)
    ? raw.display as SheetModuleDisplay
    : "counter"
  const icon = typeof raw.icon === "string" && raw.icon.trim()
    ? raw.icon.trim().slice(0, 8)
    : undefined
  const priority = typeof raw.priority === "number" && Number.isFinite(raw.priority)
    ? Math.round(raw.priority)
    : undefined

  return {
    tone,
    display,
    ...(icon ? { icon } : {}),
    ...(priority !== undefined ? { priority } : {}),
  }
}

export function defaultSheetModulePresentation(): SheetModulePresentation {
  return { tone: "neutral", display: "counter" }
}
