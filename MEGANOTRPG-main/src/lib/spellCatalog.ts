export type SpellClassKey =
  | "artificer"
  | "barbarian"
  | "bard"
  | "cleric"
  | "druid"
  | "fighter"
  | "monk"
  | "paladin"
  | "ranger"
  | "rogue"
  | "sorcerer"
  | "warlock"
  | "wizard"

export type CatalogSpell = {
  id: string
  slug: string
  name_en: string
  name_ru: string | null
  spell_level: number
  school: string
  casting_time: string
  spell_range: string
  area: string
  duration: string
  components: string[]
  material: string | null
  concentration: boolean
  ritual: boolean
  check_type: string
  damage: string
  effect_summary: string
  author_description: string
  author_comment: string
  upcast: string
  notes: string
  rules_text: string | null
  source: string
  source_kind: "srd" | "official"
  license: string | null
  sort_order: number
  classes: SpellClassKey[]
}

export type SpellSlotStateLike = {
  max?: number | null
  used?: number | null
}

export const spellClassOptions: Array<{ value: SpellClassKey; label: string }> = [
  { value: "artificer", label: "Артификер" },
  { value: "barbarian", label: "Варвар" },
  { value: "bard", label: "Бард" },
  { value: "cleric", label: "Жрец" },
  { value: "druid", label: "Друид" },
  { value: "fighter", label: "Воин" },
  { value: "monk", label: "Монах" },
  { value: "paladin", label: "Паладин" },
  { value: "ranger", label: "Следопыт" },
  { value: "rogue", label: "Плут" },
  { value: "sorcerer", label: "Чародей" },
  { value: "warlock", label: "Варлок" },
  { value: "wizard", label: "Волшебник" },
]

const classLabels = new Map(spellClassOptions.map((item) => [item.value, item.label]))

const aliases: Record<string, SpellClassKey> = {
  artificer: "artificer",
  артификер: "artificer",
  изобретатель: "artificer",
  barbarian: "barbarian",
  варвар: "barbarian",
  bard: "bard",
  бард: "bard",
  cleric: "cleric",
  жрец: "cleric",
  клирик: "cleric",
  druid: "druid",
  друид: "druid",
  fighter: "fighter",
  воин: "fighter",
  monk: "monk",
  монах: "monk",
  paladin: "paladin",
  паладин: "paladin",
  ranger: "ranger",
  рейнджер: "ranger",
  следопыт: "ranger",
  rogue: "rogue",
  плут: "rogue",
  разбойник: "rogue",
  sorcerer: "sorcerer",
  чародей: "sorcerer",
  warlock: "warlock",
  варлок: "warlock",
  колдун: "warlock",
  wizard: "wizard",
  волшебник: "wizard",
  маг: "wizard",
}

function normalizeLabel(value: string) {
  return value.trim().toLocaleLowerCase("ru-RU").replace(/ё/g, "е")
}

export function normalizeSpellClass(value: string | null | undefined): SpellClassKey | null {
  if (!value) return null
  return aliases[normalizeLabel(value)] || null
}

export function spellClassLabel(value: SpellClassKey) {
  return classLabels.get(value) || value
}

export function maxAvailableSpellLevel(
  slots: Record<string, SpellSlotStateLike> | null | undefined,
) {
  if (!slots) return 0

  return Object.entries(slots).reduce((max, [level, state]) => {
    const parsedLevel = Number(level)
    const slotMax = Number(state?.max || 0)
    if (!Number.isInteger(parsedLevel) || parsedLevel < 1 || parsedLevel > 9 || slotMax <= 0) {
      return max
    }
    return Math.max(max, parsedLevel)
  }, 0)
}

export function isSpellAvailableToCharacter(
  spell: Pick<CatalogSpell, "spell_level" | "classes">,
  classKey: SpellClassKey | null,
  maxSpellLevel: number,
  spellcastingEnabled = true,
) {
  if (!spellcastingEnabled || !classKey || !spell.classes.includes(classKey)) return false
  return spell.spell_level === 0 || spell.spell_level <= maxSpellLevel
}

export function catalogSpellName(spell: Pick<CatalogSpell, "name_ru" | "name_en">) {
  return spell.name_ru?.trim() || spell.name_en
}
