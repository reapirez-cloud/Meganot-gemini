import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

const ROOT = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data"
const OUTPUT = "supabase/migrations/20260826095000_official_supplement_spell_catalog.sql"

const excludedSources = new Set(["PHB", "XPHB"])
const sourcePriority = [
  "XGE", "GGR", "AI", "LLK", "EGW", "IDRotF", "TCE", "FTD", "SCC",
  "AAG", "AitFR-AVT", "BMT", "SatO", "EFA", "FRHoF",
]

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

const schoolNames = {
  A: "Abjuration",
  C: "Conjuration",
  D: "Divination",
  E: "Enchantment",
  V: "Evocation",
  I: "Illusion",
  N: "Necromancy",
  T: "Transmutation",
}

const classKeys = {
  artificer: "artificer",
  barbarian: "barbarian",
  bard: "bard",
  cleric: "cleric",
  druid: "druid",
  fighter: "fighter",
  monk: "monk",
  paladin: "paladin",
  ranger: "ranger",
  rogue: "rogue",
  sorcerer: "sorcerer",
  warlock: "warlock",
  wizard: "wizard",
}

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
  return value
    .normalize("NFKD")
    .replace(/[’']/g, "-")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
}

function sql(value) {
  if (value == null) return "null"
  return `'${String(value).replaceAll("'", "''")}'`
}

function sqlArray(values) {
  if (!values?.length) return "'{}'::text[]"
  return `array[${values.map(sql).join(", ")}]::text[]`
}

async function getJson(path) {
  const response = await fetch(`${ROOT}/${path}`)
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
  return response.json()
}

function formatTime(time = []) {
  if (!time.length) return ""
  return time.map((item) => {
    const number = Number(item.number || 1)
    const unitMap = {
      action: "действие",
      bonus: "бонусное действие",
      reaction: "реакция",
      round: "раунд",
      minute: "минута",
      hour: "час",
      day: "день",
    }
    const unit = unitMap[item.unit] || item.unit || ""
    const base = `${number} ${unit}`.trim()
    return item.condition ? `${base} (${String(item.condition).replace(/\{@[^ ]+ ([^}|]+).*?\}/g, "$1")})` : base
  }).join(" или ")
}

function formatDistance(distance) {
  if (!distance) return ""
  if (distance.type === "self") return "На себя"
  if (distance.type === "touch") return "Касание"
  if (distance.type === "sight") return "В пределах видимости"
  if (distance.type === "unlimited") return "Неограниченная"
  if (distance.type === "plane") return "Другой план"
  const amount = distance.amount ?? ""
  const unitMap = { feet: "футов", miles: "миль" }
  return `${amount} ${unitMap[distance.type] || distance.type || ""}`.trim()
}

function formatRange(range) {
  if (!range) return { range: "", area: "" }
  if (range.type === "point") return { range: formatDistance(range.distance), area: "" }
  const rangeLabel = formatDistance(range.distance) || "На себя"
  const areaMap = {
    cone: "конус",
    cube: "куб",
    cylinder: "цилиндр",
    hemisphere: "полусфера",
    line: "линия",
    radius: "радиус",
    sphere: "сфера",
  }
  const area = areaMap[range.type] || range.type || ""
  return { range: rangeLabel, area }
}

function formatDuration(duration = []) {
  if (!duration.length) return ""
  return duration.map((item) => {
    if (item.type === "instant") return "Мгновенная"
    if (item.type === "permanent") return "Постоянная"
    if (item.type === "special") return "Особая"
    if (item.type === "timed" && item.duration) {
      const unitMap = { round: "раунд", minute: "минута", hour: "час", day: "день", week: "неделя", year: "год" }
      const amount = item.duration.amount ?? 1
      const unit = unitMap[item.duration.type] || item.duration.type || ""
      return `${item.concentration ? "Концентрация, до " : ""}${amount} ${unit}`.trim()
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

function checkTypeOf(spell) {
  const bits = []
  if (spell.savingThrow?.length) bits.push(`Спасбросок: ${spell.savingThrow.join(", ").toUpperCase()}`)
  if (spell.spellAttack?.length) bits.push(`Атака заклинанием: ${spell.spellAttack.join(", ")}`)
  if (spell.opposedCheck?.length) bits.push("Противопоставленная проверка")
  return bits.join(" · ")
}

function damageOf(spell) {
  return (spell.damageInflict || []).join(", ")
}

function classNamesFromBlock(block, out) {
  if (!block || typeof block !== "object") return
  for (const perSource of Object.values(block)) {
    if (!perSource || typeof perSource !== "object") continue
    for (const className of Object.keys(perSource)) {
      const key = classKeys[className.toLowerCase()]
      if (key) out.add(key)
    }
  }
}

function classesFor(lookup, sourceCode, spellName) {
  const meta = lookup[sourceCode.toLowerCase()]?.[spellName.toLowerCase()]
  const out = new Set()
  classNamesFromBlock(meta?.class, out)
  classNamesFromBlock(meta?.classVariant, out)
  if (sourceCode === "EGW") out.add("wizard")
  return [...out].sort()
}

function sourceRank(code) {
  const index = sourcePriority.indexOf(code)
  return index === -1 ? sourcePriority.length + 100 : index
}

async function main() {
  const [index, lookup] = await Promise.all([
    getJson("spells/index.json"),
    getJson("generated/gendata-spell-source-lookup.json"),
  ])

  const sourceEntries = Object.entries(index)
    .filter(([code]) => !excludedSources.has(code))
    .sort(([a], [b]) => sourceRank(a) - sourceRank(b))

  const all = []
  for (const [sourceCode, filename] of sourceEntries) {
    const data = await getJson(`spells/${filename}`)
    for (const spell of data.spell || []) {
      if (!spell?.name) continue
      all.push({ sourceCode, spell })
    }
  }

  const bySlug = new Map()
  for (const item of all) {
    const slug = slugify(item.spell.name)
    const previous = bySlug.get(slug)
    if (!previous || sourceRank(item.sourceCode) < sourceRank(previous.sourceCode)) {
      bySlug.set(slug, { ...item, slug })
    }
  }

  const rows = [...bySlug.values()].sort((a, b) =>
    Number(a.spell.level || 0) - Number(b.spell.level || 0) || a.spell.name.localeCompare(b.spell.name),
  )

  const primal = rows.find((row) => row.spell.name === "Primal Savagery")
  if (!primal) throw new Error("Primal Savagery missing from generated supplement catalog")
  const primalClasses = classesFor(lookup, primal.sourceCode, primal.spell.name)
  if (Number(primal.spell.level) !== 0 || !primalClasses.includes("druid") || primal.sourceCode !== "XGE") {
    throw new Error(`Primal Savagery metadata mismatch: ${JSON.stringify({ level: primal.spell.level, source: primal.sourceCode, classes: primalClasses })}`)
  }

  const insertRows = []
  const classRows = []
  const sourceCounts = new Map()

  for (let index = 0; index < rows.length; index += 1) {
    const { spell, sourceCode, slug } = rows[index]
    const title = sourceTitles[sourceCode] || sourceCode
    const range = formatRange(spell.range)
    const duration = formatDuration(spell.duration)
    const concentration = Boolean((spell.duration || []).some((item) => item.concentration))
    const ritual = Boolean(spell.meta?.ritual)
    const damage = damageOf(spell)
    const classes = classesFor(lookup, sourceCode, spell.name)
    const summaryParts = []
    if (damage) summaryParts.push(`Тип урона: ${damage}.`)
    if (spell.savingThrow?.length) summaryParts.push(`Требует спасбросок ${spell.savingThrow.join(", ").toUpperCase()}.`)
    if (spell.spellAttack?.length) summaryParts.push("Использует атаку заклинанием.")
    const summary = `${summaryParts.join(" ")} Официальное заклинание из ${title}.`.trim()
    const authorDescription = `Справочная карточка официального заклинания из ${title}. Основные параметры и принадлежность классам уже доступны; подробное авторское русское объяснение будет дополнено отдельно.`
    const notes = classes.length ? "" : "Класс задаётся специальным правилом, подклассом, происхождением или иным источником доступа."

    sourceCounts.set(sourceCode, (sourceCounts.get(sourceCode) || 0) + 1)

    insertRows.push(`(${[
      sql(slug),
      sql(spell.name),
      sql(russianNames[spell.name] || null),
      Number(spell.level || 0),
      sql(schoolNames[spell.school] || spell.school || ""),
      sql(formatTime(spell.time)),
      sql(range.range),
      sql(range.area),
      sql(duration),
      sqlArray(componentsOf(spell.components)),
      "null",
      concentration ? "true" : "false",
      ritual ? "true" : "false",
      sql(checkTypeOf(spell)),
      sql(damage),
      sql(summary),
      sql(authorDescription),
      sql(""),
      sql(""),
      sql(notes),
      "null",
      sql(title),
      sql("official"),
      "null",
      index + 10000,
    ].join(", ")})`)

    for (const classKey of classes) classRows.push(`(${sql(slug)}, ${sql(classKey)})`)
  }

  const sqlText = `begin;\n\n-- Generated from structured spell metadata only.\n-- Non-SRD rules prose is intentionally NOT copied; rules_text remains NULL.\n-- Core PHB/XPHB sources are excluded and existing SRD rows win on slug conflicts.\n\ninsert into public.spell_catalog (\n  slug, name_en, name_ru, spell_level, school, casting_time, spell_range, area, duration,\n  components, material, concentration, ritual, check_type, damage, effect_summary,\n  author_description, author_comment, upcast, notes, rules_text, source, source_kind, license, sort_order\n) values\n${insertRows.join(",\n")}\non conflict (slug) do nothing;\n\nwith mappings(slug, class_key) as (\n  values\n${classRows.length ? classRows.join(",\n") : "  (null::text, null::text)"}\n)\ninsert into public.spell_catalog_classes (spell_id, class_key)\nselect sc.id, mappings.class_key\nfrom mappings\njoin public.spell_catalog sc on sc.slug = mappings.slug\nwhere mappings.slug is not null\non conflict do nothing;\n\ncommit;\n`

  await mkdir(dirname(OUTPUT), { recursive: true })
  await writeFile(OUTPUT, sqlText, "utf8")

  console.log(`Generated ${rows.length} unique supplement spell candidates.`)
  console.log(`Class mappings: ${classRows.length}.`)
  console.log(`Sources: ${[...sourceCounts.entries()].map(([source, count]) => `${source}:${count}`).join(", ")}`)
  console.log(`Primal Savagery: source=${primal.sourceCode}, classes=${primalClasses.join(",")}.`)
}

await main()
