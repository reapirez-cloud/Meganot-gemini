import { useEffect, useState } from "react"
import { spellReferenceAuthor } from "../../data/spellReferenceAuthor"
import { catalogSpellName, spellClassLabel, type CatalogSpell, type SpellClassKey } from "../../lib/spellCatalog"
import { supabase } from "../../lib/supabase"
import "./ChatSpellDetailSheet.css"

type CatalogRow = Omit<CatalogSpell, "classes"> & {
  spell_catalog_classes?: Array<{ class_key: SpellClassKey }>
}

type Props = {
  spellKey: string
  label: string
  onClose: () => void
}

const fields = "id,slug,name_en,name_ru,spell_level,school,casting_time,spell_range,area,duration,components,material,concentration,ritual,check_type,damage,effect_summary,author_description,author_comment,upcast,notes,rules_text,source,source_kind,license,sort_order,spell_catalog_classes(class_key)"

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

function toSpell(row: CatalogRow): CatalogSpell {
  return {
    ...row,
    classes: (row.spell_catalog_classes || []).map((entry) => entry.class_key),
  }
}

export default function ChatSpellDetailSheet({ spellKey, label, onClose }: Props) {
  const [spell, setSpell] = useState<CatalogSpell | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError("")
      setSpell(null)

      const rawKey = spellKey.trim().replace(/^spell:/i, "")
      const lookup = () => supabase.from("spell_catalog").select(fields)

      let result = rawKey
        ? await lookup().eq("slug", rawKey).maybeSingle()
        : { data: null, error: null }

      if (!result.data && !result.error && label.trim()) {
        result = await lookup().eq("name_ru", label.trim()).maybeSingle()
      }
      if (!result.data && !result.error && label.trim()) {
        result = await lookup().eq("name_en", label.trim()).maybeSingle()
      }

      if (cancelled) return
      if (result.error) {
        setError(result.error.message)
      } else if (!result.data) {
        setError(`Заклинание «${label || rawKey}» не найдено в каталоге.`)
      } else {
        setSpell(toSpell(result.data as unknown as CatalogRow))
      }
      setLoading(false)
    }

    void load()
    return () => { cancelled = true }
  }, [label, spellKey])

  return (
    <div className="sheet-backdrop chat-spell-detail__backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}>
      <article className="bottom-sheet chat-spell-detail" role="dialog" aria-modal="true" aria-label={spell ? catalogSpellName(spell) : label}>
        <div className="sheet-handle" />
        <header className="chat-spell-detail__head">
          <div>
            <small>Заклинание из справочника</small>
            <h3>{spell ? catalogSpellName(spell) : label || "Заклинание"}</h3>
            {spell && <p>{spell.name_en} · {levelLabel(spell.spell_level)} · {schoolLabel(spell.school)}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть описание">×</button>
        </header>

        {loading && <div className="chat-spell-detail__state"><span className="status-spinner" />Загружаем полное описание…</div>}
        {error && <div className="auth-error">{error}</div>}

        {spell && <div className="chat-spell-detail__body">
          {spell.author_description && <section className="chat-spell-detail__author"><small>{spellReferenceAuthor.name} объясняет</small><p>{spell.author_description}</p></section>}

          <section className="chat-spell-detail__facts">
            <div><small>Наложение</small><strong>{spell.casting_time || "—"}</strong></div>
            <div><small>Дистанция</small><strong>{spell.spell_range || "—"}</strong></div>
            <div><small>Область</small><strong>{spell.area || "—"}</strong></div>
            <div><small>Длительность</small><strong>{spell.duration || "—"}</strong></div>
            <div><small>Проверка</small><strong>{spell.check_type || "—"}</strong></div>
            <div><small>Урон / лечение</small><strong>{spell.damage || "—"}</strong></div>
          </section>

          <div className="chat-spell-detail__tags">
            <span>Компоненты: {spell.components.join(", ") || "—"}</span>
            <span>{spell.concentration ? "Концентрация" : "Без концентрации"}</span>
            <span>{spell.ritual ? "Ритуал" : "Не ритуал"}</span>
          </div>

          {spell.material && <section className="chat-spell-detail__block"><small>Материал</small><p>{spell.material}</p></section>}
          {spell.effect_summary && <section className="chat-spell-detail__block"><small>Коротко</small><p>{spell.effect_summary}</p></section>}
          <section className="chat-spell-detail__block chat-spell-detail__rules"><small>Полное правило</small><p>{spell.rules_text || spell.effect_summary || "Полное правило ещё не заполнено в каталоге."}</p></section>
          {spell.upcast && <section className="chat-spell-detail__block"><small>На больших ячейках</small><p>{spell.upcast}</p></section>}
          {spell.notes && <section className="chat-spell-detail__block"><small>Нюансы</small><p>{spell.notes}</p></section>}
          {spell.author_comment && <section className="chat-spell-detail__comment"><small>Заметка Восса</small><p>{spell.author_comment}</p></section>}

          <footer className="chat-spell-detail__source">
            <span><small>Классы</small><strong>{spell.classes.map(spellClassLabel).join(" · ") || "—"}</strong></span>
            <span><small>Источник</small><strong>{spell.source || "—"}</strong></span>
          </footer>
        </div>}
      </article>
    </div>
  )
}
