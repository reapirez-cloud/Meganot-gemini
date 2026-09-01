import { useEffect, useMemo, useState } from "react"

import { spellReferenceAuthor } from "../../data/spellReferenceAuthor"
import { supabase } from "../../lib/supabase"
import {
  catalogSpellName,
  isSpellAvailableToCharacter,
  maxAvailableSpellLevel,
  normalizeSpellClass,
  spellClassLabel,
  spellClassOptions,
  type CatalogSpell,
  type SpellClassKey,
} from "../../lib/spellCatalog"
import SpellAuthorProfile from "./SpellAuthorProfile"

type CharacterTarget = {
  id: string
  name: string
  character_class: string
}

type SheetSummary = {
  spellcasting_enabled: boolean
  spell_slots: Record<string, { max?: number; used?: number }>
}

type Props = {
  character: CharacterTarget | null
  canManage: boolean
  onClose: () => void
  onCharacterChanged?: () => void
}

type CatalogRow = Omit<CatalogSpell, "classes"> & {
  spell_catalog_classes?: Array<{ class_key: SpellClassKey }>
}

const schoolTranslations: Record<string, string> = {
  Abjuration: "Ограждение",
  Conjuration: "Вызов",
  Divination: "Прорицание",
  Enchantment: "Очарование",
  Evocation: "Воплощение",
  Illusion: "Иллюзия",
  Necromancy: "Некромантия",
  Transmutation: "Преобразование",
}

function schoolLabel(value: string) {
  return schoolTranslations[value] || value || "Без школы"
}

function levelLabel(level: number) {
  return level === 0 ? "Заговор" : `${level} уровень`
}

export default function SpellReference({
  character,
  canManage,
  onClose,
  onCharacterChanged,
}: Props) {
  const [spells, setSpells] = useState<CatalogSpell[]>([])
  const [sheet, setSheet] = useState<SheetSummary | null>(null)
  const [learnedIds, setLearnedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [authorOpen, setAuthorOpen] = useState(false)
  const [classFilter, setClassFilter] = useState<"" | SpellClassKey>("")
  const [levelFilter, setLevelFilter] = useState<"all" | string>("all")
  const [schoolFilter, setSchoolFilter] = useState("")
  const [sourceFilter, setSourceFilter] = useState("")
  const [onlyMyClass, setOnlyMyClass] = useState(false)
  const [onlyAvailable, setOnlyAvailable] = useState(false)
  const [selected, setSelected] = useState<CatalogSpell | null>(null)
  const [adding, setAdding] = useState(false)
  const [actionError, setActionError] = useState("")
  const characterId = character?.id || null

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError("")

      const catalogPromise = supabase
        .from("spell_catalog")
        .select("id, slug, name_en, name_ru, spell_level, school, casting_time, spell_range, area, duration, components, material, concentration, ritual, check_type, damage, effect_summary, author_description, author_comment, upcast, notes, rules_text, source, source_kind, license, sort_order, spell_catalog_classes(class_key)")
        .order("spell_level", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("name_en", { ascending: true })
        .limit(2000)

      const sheetPromise = characterId
        ? supabase
            .from("character_sheets")
            .select("spellcasting_enabled, spell_slots")
            .eq("character_id", characterId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null })

      const learnedPromise = characterId
        ? supabase
            .from("character_spells")
            .select("catalog_spell_id")
            .eq("character_id", characterId)
            .not("catalog_spell_id", "is", null)
        : Promise.resolve({ data: [], error: null })

      const [catalogResult, sheetResult, learnedResult] = await Promise.all([
        catalogPromise,
        sheetPromise,
        learnedPromise,
      ])

      if (cancelled) return

      const firstError = catalogResult.error || sheetResult.error || learnedResult.error
      if (firstError) {
        setError(firstError.message)
        setLoading(false)
        return
      }

      const rows = (catalogResult.data || []) as unknown as CatalogRow[]
      setSpells(rows.map((row) => ({
        ...row,
        classes: (row.spell_catalog_classes || []).map((item) => item.class_key),
      })))
      setSheet((sheetResult.data || null) as SheetSummary | null)
      setLearnedIds(new Set(
        ((learnedResult.data || []) as Array<{ catalog_spell_id: string | null }>)
          .map((item) => item.catalog_spell_id)
          .filter((value): value is string => Boolean(value)),
      ))
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [characterId])

  const characterClass = useMemo(
    () => normalizeSpellClass(character?.character_class),
    [character?.character_class],
  )
  const maxSpellLevel = useMemo(
    () => maxAvailableSpellLevel(sheet?.spell_slots),
    [sheet?.spell_slots],
  )

  const schools = useMemo(
    () => Array.from(new Set(spells.map((spell) => spell.school).filter(Boolean)))
      .sort((a, b) => schoolLabel(a).localeCompare(schoolLabel(b), "ru")),
    [spells],
  )
  const sources = useMemo(
    () => Array.from(new Set(spells.map((spell) => spell.source).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ru")),
    [spells],
  )

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ru-RU")

    return spells.filter((spell) => {
      if (needle) {
        const haystack = `${spell.name_ru || ""} ${spell.name_en} ${spell.effect_summary} ${spell.author_description} ${spell.author_comment}`.toLocaleLowerCase("ru-RU")
        if (!haystack.includes(needle)) return false
      }
      if (classFilter && !spell.classes.includes(classFilter)) return false
      if (levelFilter !== "all" && spell.spell_level !== Number(levelFilter)) return false
      if (schoolFilter && spell.school !== schoolFilter) return false
      if (sourceFilter && spell.source !== sourceFilter) return false
      if (onlyMyClass && (!characterClass || !spell.classes.includes(characterClass))) return false
      if (onlyAvailable && !isSpellAvailableToCharacter(
        spell,
        characterClass,
        maxSpellLevel,
        Boolean(sheet?.spellcasting_enabled),
      )) return false
      return true
    })
  }, [
    characterClass,
    classFilter,
    levelFilter,
    maxSpellLevel,
    onlyAvailable,
    onlyMyClass,
    query,
    schoolFilter,
    sheet?.spellcasting_enabled,
    sourceFilter,
    spells,
  ])

  const activeFilterCount = [
    Boolean(classFilter),
    levelFilter !== "all",
    Boolean(schoolFilter),
    Boolean(sourceFilter),
    onlyMyClass,
    onlyAvailable,
  ].filter(Boolean).length

  const canUseAvailableFilter = Boolean(
    character && characterClass && sheet?.spellcasting_enabled,
  )

  function resetFilters() {
    setClassFilter("")
    setLevelFilter("all")
    setSchoolFilter("")
    setSourceFilter("")
    setOnlyMyClass(false)
    setOnlyAvailable(false)
  }

  async function addSelected() {
    if (!selected || !character) return
    setAdding(true)
    setActionError("")

    const { error: addError } = await supabase.rpc("learn_catalog_spell", {
      p_character_id: character.id,
      p_spell_id: selected.id,
    })

    setAdding(false)
    if (addError) {
      setActionError(addError.message)
      return
    }

    setLearnedIds((current) => new Set([...current, selected.id]))
    onCharacterChanged?.()
  }

  function isAvailable(spell: CatalogSpell) {
    return isSpellAvailableToCharacter(
      spell,
      characterClass,
      maxSpellLevel,
      Boolean(sheet?.spellcasting_enabled),
    )
  }

  return (
    <div className="spell-reference-overlay">
      <section className="spell-reference-page">
        <header className="spell-reference-header">
          <button className="icon-button" type="button" onClick={onClose} aria-label="Закрыть справочник">←</button>
          <div>
            <h2>Справочник заклинаний</h2>
            <button className="spell-author-byline" type="button" onClick={() => setAuthorOpen(true)}>
              {spellReferenceAuthor.byline} · об авторе
            </button>
          </div>
          <span />
        </header>

        <div className="spell-reference-toolbar">
          <input
            className="spell-reference-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск заклинания…"
            autoComplete="off"
          />
          <button className="spell-filter-button" type="button" onClick={() => setFiltersOpen(true)}>
            Фильтры{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
          </button>
        </div>

        {character && (
          <div className="spell-character-context surface">
            <div>
              <span>Текущий персонаж</span>
              <strong>{character.name}</strong>
            </div>
            <div>
              <span>Класс</span>
              <strong>{characterClass ? spellClassLabel(characterClass) : character.character_class || "—"}</strong>
            </div>
            <div>
              <span>Доступные ячейки</span>
              <strong>{maxSpellLevel > 0 ? `до ${maxSpellLevel} ур.` : "нет"}</strong>
            </div>
          </div>
        )}

        {loading && <div className="center-state"><span className="status-spinner" /><span>Загружаем справочник…</span></div>}
        {error && <div className="auth-error">{error}</div>}

        {!loading && !error && (
          <div className="spell-reference-results">
            <div className="spell-reference-results__head">
              <span>{filtered.length} заклинаний</span>
              {activeFilterCount > 0 && <button type="button" onClick={resetFilters}>Сбросить фильтры</button>}
            </div>

            {filtered.length === 0 && (
              <div className="character-empty surface">По этим условиям ничего не найдено.</div>
            )}

            {filtered.map((spell) => {
              const available = isAvailable(spell)
              const learned = learnedIds.has(spell.id)
              return (
                <button
                  className="spell-reference-card surface"
                  type="button"
                  key={spell.id}
                  onClick={() => {
                    setActionError("")
                    setSelected(spell)
                  }}
                >
                  <span className="spell-reference-level">{spell.spell_level === 0 ? "∞" : spell.spell_level}</span>
                  <span className="spell-reference-card__body">
                    <span className="spell-reference-card__title">
                      <strong>{catalogSpellName(spell)}</strong>
                      {spell.name_ru && spell.name_ru !== spell.name_en && <small>{spell.name_en}</small>}
                    </span>
                    <span className="spell-reference-card__meta">
                      {levelLabel(spell.spell_level)} · {schoolLabel(spell.school)}
                    </span>
                    <span className="spell-reference-card__classes">
                      {spell.classes.map(spellClassLabel).join(" · ") || "Без базового класса"}
                    </span>
                  </span>
                  <span className="spell-reference-card__flags">
                    {learned && <em>Добавлено</em>}
                    {!learned && available && <em>Доступно</em>}
                    {spell.concentration && <small>К</small>}
                    {spell.ritual && <small>Р</small>}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        <footer className="spell-reference-license">
          SRD 5.2.1: Wizards of the Coast LLC, CC BY 4.0. Авторские русские объяснения и комментарии написаны специально для этого справочника.
        </footer>
      </section>

      {authorOpen && <SpellAuthorProfile onClose={() => setAuthorOpen(false)} />}

      {filtersOpen && (
        <div className="sheet-backdrop spell-filter-backdrop" onMouseDown={() => setFiltersOpen(false)}>
          <div className="bottom-sheet spell-filter-sheet" onMouseDown={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="character-editor-head">
              <div>
                <h3 className="sheet-title">Фильтры справочника</h3>
                <p className="sheet-copy">Выбери, что именно показывать в общем списке.</p>
              </div>
              <button className="sheet-close" type="button" onClick={() => setFiltersOpen(false)}>×</button>
            </div>

            <label className="field-label">Класс</label>
            <select className="app-select" value={classFilter} onChange={(event) => setClassFilter(event.target.value as "" | SpellClassKey)}>
              <option value="">Все классы</option>
              {spellClassOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>

            <label className="field-label">Уровень</label>
            <select className="app-select" value={levelFilter} onChange={(event) => setLevelFilter(event.target.value)}>
              <option value="all">Все уровни</option>
              <option value="0">Заговоры</option>
              {Array.from({ length: 9 }, (_, index) => index + 1).map((level) => (
                <option key={level} value={String(level)}>{level} уровень</option>
              ))}
            </select>

            <label className="field-label">Школа</label>
            <select className="app-select" value={schoolFilter} onChange={(event) => setSchoolFilter(event.target.value)}>
              <option value="">Все школы</option>
              {schools.map((school) => <option key={school} value={school}>{schoolLabel(school)}</option>)}
            </select>

            <label className="field-label">Источник</label>
            <select className="app-select" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
              <option value="">Все источники</option>
              {sources.map((source) => <option key={source} value={source}>{source}</option>)}
            </select>

            <label className={`spell-filter-toggle ${!characterClass ? "spell-filter-toggle--disabled" : ""}`}>
              <span><strong>Мой класс</strong><small>Все заклинания базового класса, включая будущие уровни.</small></span>
              <input type="checkbox" checked={onlyMyClass} disabled={!characterClass} onChange={(event) => setOnlyMyClass(event.target.checked)} />
            </label>

            <label className={`spell-filter-toggle ${!canUseAvailableFilter ? "spell-filter-toggle--disabled" : ""}`}>
              <span>
                <strong>Доступные моему персонажу</strong>
                <small>
                  {canUseAvailableFilter
                    ? `Только ${characterClass ? spellClassLabel(characterClass) : "класс"}: заговоры и заклинания до ${maxSpellLevel} уровня.`
                    : "Нужен активный персонаж с распознанным классом и включённой магией."}
                </small>
              </span>
              <input
                type="checkbox"
                checked={onlyAvailable}
                disabled={!canUseAvailableFilter}
                onChange={(event) => setOnlyAvailable(event.target.checked)}
              />
            </label>

            <div className="editor-action-row spell-filter-actions">
              <button className="secondary-action-button" type="button" onClick={resetFilters}>Сбросить</button>
              <button className="sheet-save" type="button" onClick={() => setFiltersOpen(false)}>Показать {filtered.length}</button>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div className="sheet-backdrop spell-detail-backdrop" onMouseDown={() => setSelected(null)}>
          <article className="bottom-sheet spell-reference-detail" onMouseDown={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="character-editor-head">
              <div>
                <h3 className="sheet-title">{catalogSpellName(selected)}</h3>
                <p className="sheet-copy">{selected.name_en} · {levelLabel(selected.spell_level)} · {schoolLabel(selected.school)}</p>
              </div>
              <button className="sheet-close" type="button" onClick={() => setSelected(null)}>×</button>
            </div>

            {selected.author_description && (
              <div className="spell-author-description">
                <span>{spellReferenceAuthor.name} объясняет</span>
                <p>{selected.author_description}</p>
              </div>
            )}

            <div className="spell-detail-facts">
              <div><span>Наложение</span><strong>{selected.casting_time || "—"}</strong></div>
              <div><span>Дистанция</span><strong>{selected.spell_range || "—"}</strong></div>
              <div><span>Область</span><strong>{selected.area || "—"}</strong></div>
              <div><span>Длительность</span><strong>{selected.duration || "—"}</strong></div>
              <div><span>Проверка</span><strong>{selected.check_type || "—"}</strong></div>
              <div><span>Урон / лечение</span><strong>{selected.damage || "—"}</strong></div>
            </div>

            <div className="spell-detail-tags">
              <span>Компоненты: {selected.components.join(", ") || "—"}</span>
              <span>{selected.concentration ? "Концентрация" : "Без концентрации"}</span>
              <span>{selected.ritual ? "Ритуал" : "Не ритуал"}</span>
            </div>

            {selected.material && <div className="spell-detail-block"><span>Материал</span><p>{selected.material}</p></div>}
            <div className="spell-detail-block"><span>Механика</span><p>{selected.effect_summary || selected.rules_text || "Краткое описание ещё не заполнено."}</p></div>
            {selected.upcast && <div className="spell-detail-block"><span>На больших ячейках</span><p>{selected.upcast}</p></div>}
            {selected.notes && <div className="spell-detail-block"><span>Нюансы</span><p>{selected.notes}</p></div>}

            {selected.author_comment && (
              <blockquote className="spell-author-comment">
                <span>Заметка Восса</span>
                <p>{selected.author_comment}</p>
              </blockquote>
            )}

            <div className="spell-detail-source">
              <span>Классы</span>
              <strong>{selected.classes.map(spellClassLabel).join(" · ") || "—"}</strong>
              <span>Источник</span>
              <strong>{selected.source}</strong>
            </div>

            {actionError && <div className="auth-error">{actionError}</div>}

            {character && (
              <div className="spell-detail-add">
                {learnedIds.has(selected.id) ? (
                  <button type="button" disabled>Уже добавлено персонажу</button>
                ) : canManage || isAvailable(selected) ? (
                  <button type="button" onClick={() => void addSelected()} disabled={adding}>
                    {adding ? "Добавляем…" : canManage && !isAvailable(selected) ? `Выдать ${character.name}` : "Добавить персонажу"}
                  </button>
                ) : (
                  <p>Это заклинание сейчас недоступно классу или уровню ячеек персонажа.</p>
                )}
              </div>
            )}
          </article>
        </div>
      )}
    </div>
  )
}
