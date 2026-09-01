import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

const ROOT = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data"
const OUTPUT = "supabase/data/official_supplement_spells.json"
const excludedSources = new Set(["PHB", "XPHB"])

const sourceTitles = {
  XGE: "Xanathar's Guide to Everything",
  GGR: "Guildmasters' Guide to Ravnica",
  AI: "Acquisitions Incorporated",
  LLK: "Lost Laboratory of Kwalish",
  EGW: "Explorer's Guide to Wildemount",
  IDRotF: "Icewind Dale: Rime of the Frostmaiden",
  TCE: "Tasha's Cauldron of Everything",
  FTD: "Fizban's Treasury of Dragons",
  SCC: "Strixhaven: A Curriculum of Chaos",
  AAG: "Astral Adventurer's Guide",
  "AitFR-AVT": "Adventures in the Forgotten Realms",
  BMT: "The Book of Many Things",
  SatO: "Sigil and the Outlands",
  EFA: "Eberron: Forge of the Artificer",
  FRHoF: "Forgotten Realms: Heroes of Faerun",
}

const sourcePriority = Object.keys(sourceTitles)
const schoolNames = {
  A: "Abjuration", C: "Conjuration", D: "Divination", E: "Enchantment",
  V: "Evocation", I: "Illusion", N: "Necromancy", T: "Transmutation",
}
const validClasses = new Set([
  "artificer", "barbarian", "bard", "cleric", "druid", "fighter", "monk",
  "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard",
])

const russianNames = {
  "Primal Savagery": "Первобытная ярость",
  "Absorb Elements": "Поглощение стихий",
  "Booming Blade": "Громовой клинок",
  "Catapult": "Катапульта",
  "Control Flames": "Контроль пламени",
  "Create Bonfire": "Сотворение костра",
  "Frostbite": "Обморожение",
  "Green-Flame Blade": "Клинок зелёного пламени",
  "Gust": "Порыв",
  "Ice Knife": "Ледяной нож",
  "Infestation": "Заражение",
  "Lightning Lure": "Приманка молнии",
  "Magic Stone": "Волшебный камень",
  "Mold Earth": "Формование земли",
  "Shape Water": "Формование воды",
  "Sword Burst": "Вспышка мечей",
  "Thunderclap": "Раскат грома",
  "Toll the Dead": "Погребальный звон",
  "Word of Radiance": "Слово сияния",
  "Mind Sliver": "Осколок разума",
  "Silvery Barbs": "Серебристые шипы",
  "Vortex Warp": "Вихревой перенос",
  "Wither and Bloom": "Увядание и цветение",
  "Rime's Binding Ice": "Связывающий лёд Рима",
  "Ashardalon's Stride": "Шаг Ашардалона",
  "Raulothim's Psychic Lance": "Психическое копьё Раулотима",
  "Summon Draconic Spirit": "Призыв драконьего духа",
  "Draconic Transformation": "Драконье преображение",
  "Fizban's Platinum Shield": "Платиновый щит Физбана",
  "Gift of Alacrity": "Дар проворства",
  "Magnify Gravity": "Усиление гравитации",
  "Sapping Sting": "Истощающий укол",
  "Gravity Sinkhole": "Гравитационная воронка",
  "Temporal Shunt": "Временной сдвиг",
  "Dark Star": "Тёмная звезда",
  "Ravenous Void": "Ненасытная пустота",
}

function slugify(value) {
  return value.normalize("NFKD").replace(/[’']/g, "-").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase()
}

async function getJson(path) {
  const response = await fetch(`${ROOT}/${path}`)
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
  return response.json()
}

function stripTags(value = "") {
  return String(value).replace(/\{@[^ ]+ ([^}|]+).*?\}/g, "$1")
}

function formatTime(time = []) {
  const units = { action: "действие", bonus: "бонусное действие", reaction: "реакция", round: "раунд", minute: "минута", hour: "час", day: "день" }
  return time.map((item) => {
    const base = `${Number(item.number || 1)} ${units[item.unit] || item.unit || ""}`.trim()
    return item.condition ? `${base} (${stripTags(item.condition)})` : base
  }).join(" или ")
}

function formatDistance(distance) {
  if (!distance) return ""
  if (distance.type === "self") return "На себя"
  if (distance.type === "touch") return "Касание"
  if (distance.type === "sight") return "В пределах видимости"
  if (distance.type === "unlimited") return "Неограниченная"
  if (distance.type === "plane") return "Другой план"
  const unit = { feet: "футов", miles: "миль" }[distance.type] || distance.type || ""
  return `${distance.amount ?? ""} ${unit}`.trim()
}

function formatRange(range) {
  if (!range) return { spell_range: "", area: "" }
  if (range.type === "point") return { spell_range: formatDistance(range.distance), area: "" }
  const areas = { cone: "конус", cube: "куб", cylinder: "цилиндр", hemisphere: "полусфера", line: "линия", radius: "радиус", sphere: "сфера" }
  return { spell_range: formatDistance(range.distance) || "На себя", area: areas[range.type] || range.type || "" }
}

function formatDuration(duration = []) {
  const units = { round: "раунд", minute: "минута", hour: "час", day: "день", week: "неделя", year: "год" }
  return duration.map((item) => {
    if (item.type === "instant") return "Мгновенная"
    if (item.type === "permanent") return "Постоянная"
    if (item.type === "special") return "Особая"
    if (item.type === "timed" && item.duration) {
      return `${item.concentration ? "Концентрация, до " : ""}${item.duration.amount ?? 1} ${units[item.duration.type] || item.duration.type || ""}`.trim()
    }
    return item.type || ""
  }).filter(Boolean).join("; ")
}

function componentsOf(components = {}) {
  const out = []
  if (components.v) out.push("V")
  if (components.s) out.push("S")
  if (components.m) out.push("M")
  if (components.r) out.push("R")
  return out
}

function materialMetadata(components = {}) {
  const material = components.m
  if (!material) return { material: null, material_cost_gp: null, material_consumed: false }
  if (typeof material === "string") {
    return { material: stripTags(material), material_cost_gp: null, material_consumed: false }
  }
  const rawCost = Number(material.cost)
  return {
    material: stripTags(material.text || "") || null,
    material_cost_gp: Number.isFinite(rawCost) ? rawCost / 100 : null,
    material_consumed: Boolean(material.consume),
  }
}

function checkTypeOf(spell) {
  const bits = []
  if (spell.savingThrow?.length) bits.push(`Спасбросок: ${spell.savingThrow.join(", ").toUpperCase()}`)
  if (spell.spellAttack?.length) bits.push(`Атака заклинанием: ${spell.spellAttack.join(", ")}`)
  if (spell.opposedCheck?.length) bits.push("Противопоставленная проверка")
  return bits.join(" · ")
}

function collectClasses(block, out) {
  if (!block || typeof block !== "object") return
  for (const perSource of Object.values(block)) {
    if (!perSource || typeof perSource !== "object") continue
    for (const name of Object.keys(perSource)) {
      const key = name.toLowerCase()
      if (validClasses.has(key)) out.add(key)
    }
  }
}

function classesFor(lookup, sourceCode, spellName) {
  const meta = lookup[sourceCode.toLowerCase()]?.[spellName.toLowerCase()]
  const out = new Set()
  collectClasses(meta?.class, out)
  collectClasses(meta?.classVariant, out)
  if (sourceCode === "EGW") out.add("wizard")
  return [...out].sort()
}

function sourceRank(code) {
  const index = sourcePriority.indexOf(code)
  return index < 0 ? 999 : index
}

async function main() {
  const [index, lookup] = await Promise.all([
    getJson("spells/index.json"),
    getJson("generated/gendata-spell-source-lookup.json"),
  ])

  const sourceEntries = Object.entries(index)
    .filter(([code]) => !excludedSources.has(code))
    .sort(([a], [b]) => sourceRank(a) - sourceRank(b))

  const bySlug = new Map()
  for (const [sourceCode, filename] of sourceEntries) {
    const data = await getJson(`spells/${filename}`)
    for (const spell of data.spell || []) {
      if (!spell?.name) continue
      const slug = slugify(spell.name)
      const previous = bySlug.get(slug)
      if (!previous || sourceRank(sourceCode) < sourceRank(previous.sourceCode)) {
        bySlug.set(slug, { spell, sourceCode })
      }
    }
  }

  const candidates = [...bySlug.entries()]
    .map(([slug, item]) => ({ slug, ...item }))
    .sort((a, b) => Number(a.spell.level || 0) - Number(b.spell.level || 0) || a.spell.name.localeCompare(b.spell.name))

  const rows = candidates.map(({ slug, sourceCode, spell }, index) => {
    const source = sourceTitles[sourceCode] || sourceCode
    const range = formatRange(spell.range)
    const classes = classesFor(lookup, sourceCode, spell.name)
    const damage = (spell.damageInflict || []).join(", ")
    const summaryParts = []
    const material = materialMetadata(spell.components)
    if (damage) summaryParts.push(`Тип урона: ${damage}.`)
    if (spell.savingThrow?.length) summaryParts.push(`Требует спасбросок ${spell.savingThrow.join(", ").toUpperCase()}.`)
    if (spell.spellAttack?.length) summaryParts.push("Использует атаку заклинанием.")

    return {
      slug,
      name_en: spell.name,
      name_ru: russianNames[spell.name] || null,
      spell_level: Number(spell.level || 0),
      school: schoolNames[spell.school] || spell.school || "",
      casting_time: formatTime(spell.time),
      spell_range: range.spell_range,
      area: range.area,
      duration: formatDuration(spell.duration),
      components: componentsOf(spell.components),
      material: material.material,
      material_cost_gp: material.material_cost_gp,
      material_consumed: material.material_consumed,
      concentration: Boolean((spell.duration || []).some((item) => item.concentration)),
      ritual: Boolean(spell.meta?.ritual),
      check_type: checkTypeOf(spell),
      damage,
      effect_summary: `${summaryParts.join(" ")} Официальное заклинание из ${source}.`.trim(),
      author_description: `Справочная карточка официального заклинания из ${source}. Основные параметры и принадлежность классам уже доступны; подробное авторское русское объяснение будет дополнено отдельно.`,
      author_comment: "",
      upcast: "",
      notes: classes.length ? "" : "Класс задаётся специальным правилом, подклассом, происхождением или иным источником доступа.",
      rules_text: null,
      source,
      source_kind: "official",
      license: null,
      sort_order: index + 10000,
      classes,
    }
  })

  const primal = rows.find((row) => row.slug === "primal-savagery")
  if (!primal || primal.spell_level !== 0 || !primal.classes.includes("druid") || primal.source !== sourceTitles.XGE) {
    throw new Error(`Primal Savagery metadata mismatch: ${JSON.stringify(primal)}`)
  }
  if (rows.some((row) => row.rules_text !== null)) throw new Error("Supplement rules_text must remain null")
  if (rows.some((row) => row.components.includes("M") && !row.material)) throw new Error("Material component text must be preserved for supplement spells")

  await mkdir(dirname(OUTPUT), { recursive: true })
  await writeFile(OUTPUT, `${JSON.stringify({ generated_from: "5etools structured metadata", count: rows.length, spells: rows }, null, 2)}\n`, "utf8")
  console.log(`Generated ${rows.length} supplement spell records.`)
  console.log(`Primal Savagery: ${primal.name_ru}, level=${primal.spell_level}, classes=${primal.classes.join(",")}.`)
}

await main()
