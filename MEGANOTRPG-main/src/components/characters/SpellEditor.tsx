import { useState } from "react"
import type { FormEvent } from "react"
import type { CharacterSpell, SpellInput } from "../../types/characterSheet"

type Props = {
  spell: CharacterSpell | null
  purpose?: "spell" | "option"
  onClose: () => void
  onSave: (input: SpellInput) => Promise<{ ok: boolean; error?: string }>
  onDelete?: () => Promise<{ ok: boolean; error?: string }>
}

export default function SpellEditor({
  spell,
  purpose = "spell",
  onClose,
  onSave,
  onDelete,
}: Props) {
  const inferredMode: "cantrip" | "slot" =
    spell?.cast_mode || (spell?.spell_level === 0 ? "cantrip" : "slot")

  const [draft, setDraft] = useState<SpellInput>({
    name: spell?.name || "",
    spell_level: spell?.spell_level ?? 0,
    school: spell?.school || "",
    casting_time: spell?.casting_time || "",
    spell_range: spell?.spell_range || "",
    duration: spell?.duration || "",
    components: spell?.components || "",
    concentration: spell?.concentration || false,
    ritual: spell?.ritual || false,
    prepared: spell?.prepared || false,
    cast_mode: inferredMode,
    slot_level:
      inferredMode === "slot"
        ? spell?.slot_level || Math.max(1, spell?.spell_level || 1)
        : null,
    description: spell?.description || "",
    source: spell?.source || "",
  })

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function submit(event: FormEvent) {
    event.preventDefault()

    if (!draft.name.trim()) {
      setError("Укажи название заклинания.")
      return
    }

    if (draft.cast_mode === "slot" && !draft.slot_level) {
      setError("Выбери уровень ячейки.")
      return
    }

    setSaving(true)
    setError("")

    const result = await onSave({
      ...draft,
      slot_level: draft.cast_mode === "slot" ? draft.slot_level : null,
    })

    setSaving(false)

    if (!result.ok) {
      setError(result.error || "Не удалось сохранить заклинание.")
      return
    }

    onClose()
  }

  async function remove() {
    if (!onDelete) return

    setSaving(true)
    setError("")
    const result = await onDelete()
    setSaving(false)

    if (!result.ok) {
      setError(result.error || "Не удалось удалить заклинание.")
      return
    }

    onClose()
  }

  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <form
        className="bottom-sheet compact-editor-sheet"
        onSubmit={submit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="character-editor-head">
          <div>
            <h3 className="sheet-title">
              {purpose === "option"
                ? (spell ? "Настроить доступ" : "Выдать заклинание")
                : (spell ? "Редактировать заклинание" : "Добавить заклинание")}
            </h3>
            <p className="sheet-copy">
              {purpose === "option"
                ? "После сохранения игрок сможет добавить это заклинание своему персонажу."
                : "Подготовленные заклинания становятся зелёными и появляются в меню действий чата."}
            </p>
          </div>
          <button className="sheet-close" type="button" onClick={onClose}>
            ×
          </button>
        </div>

        <label className="field-label">Название</label>
        <input
          className="app-input"
          value={draft.name}
          onChange={(event) =>
            setDraft({ ...draft, name: event.target.value })
          }
          maxLength={140}
          autoFocus
        />

        <div className="dnd-editor-grid dnd-editor-grid--2">
          <label>
            Уровень заклинания
            <select
              className="app-select"
              value={draft.spell_level}
              onChange={(event) => {
                const level = Number(event.target.value)
                setDraft((current) => ({
                  ...current,
                  spell_level: level,
                  cast_mode: level === 0 ? "cantrip" : current.cast_mode,
                  slot_level:
                    level === 0
                      ? null
                      : current.slot_level || Math.max(1, level),
                }))
              }}
            >
              {Array.from({ length: 10 }, (_, level) => (
                <option value={level} key={level}>
                  {level === 0 ? "0 · заговор" : `${level} уровень`}
                </option>
              ))}
            </select>
          </label>

          <label>
            Расход в чате
            <select
              className="app-select"
              value={draft.cast_mode}
              onChange={(event) => {
                const castMode =
                  event.target.value === "cantrip" ? "cantrip" : "slot"

                setDraft((current) => ({
                  ...current,
                  cast_mode: castMode,
                  slot_level:
                    castMode === "cantrip"
                      ? null
                      : current.slot_level ||
                        Math.max(1, current.spell_level || 1),
                }))
              }}
            >
              <option value="cantrip">Кантрип · без ячейки</option>
              <option value="slot">Ячейка</option>
            </select>
          </label>

          {draft.cast_mode === "slot" && (
            <label>
              Какая ячейка тратится
              <select
                className="app-select"
                value={draft.slot_level || 1}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    slot_level: Number(event.target.value),
                  })
                }
              >
                {Array.from({ length: 9 }, (_, index) => index + 1).map(
                  (level) => (
                    <option value={level} key={level}>
                      {level} уровень
                    </option>
                  ),
                )}
              </select>
            </label>
          )}

          <label>
            Школа
            <input
              className="app-input"
              value={draft.school}
              onChange={(event) =>
                setDraft({ ...draft, school: event.target.value })
              }
              placeholder="Воплощение"
            />
          </label>

          <label>
            Время накладывания
            <input
              className="app-input"
              value={draft.casting_time}
              onChange={(event) =>
                setDraft({ ...draft, casting_time: event.target.value })
              }
              placeholder="1 действие"
            />
          </label>

          <label>
            Дистанция
            <input
              className="app-input"
              value={draft.spell_range}
              onChange={(event) =>
                setDraft({ ...draft, spell_range: event.target.value })
              }
              placeholder="60 фт."
            />
          </label>

          <label>
            Длительность
            <input
              className="app-input"
              value={draft.duration}
              onChange={(event) =>
                setDraft({ ...draft, duration: event.target.value })
              }
            />
          </label>

          <label>
            Компоненты
            <input
              className="app-input"
              value={draft.components}
              onChange={(event) =>
                setDraft({ ...draft, components: event.target.value })
              }
              placeholder="В, С, М"
            />
          </label>

          <label>
            Источник
            <input
              className="app-input"
              value={draft.source}
              onChange={(event) =>
                setDraft({ ...draft, source: event.target.value })
              }
              placeholder="PHB / класс"
            />
          </label>
        </div>

        <div className="spell-toggle-grid">
          <label className={draft.prepared ? "spell-prepared-toggle spell-prepared-toggle--active" : "spell-prepared-toggle"}>
            <input
              type="checkbox"
              checked={draft.prepared}
              onChange={(event) =>
                setDraft({ ...draft, prepared: event.target.checked })
              }
            />
            Подготовлено
          </label>

          <label>
            <input
              type="checkbox"
              checked={draft.concentration}
              onChange={(event) =>
                setDraft({ ...draft, concentration: event.target.checked })
              }
            />
            Концентрация
          </label>

          <label>
            <input
              type="checkbox"
              checked={draft.ritual}
              onChange={(event) =>
                setDraft({ ...draft, ritual: event.target.checked })
              }
            />
            Ритуал
          </label>
        </div>

        <label className="field-label">Описание</label>
        <textarea
          className="app-textarea dnd-long-text"
          value={draft.description}
          onChange={(event) =>
            setDraft({ ...draft, description: event.target.value })
          }
          maxLength={7000}
        />

        {error && <div className="auth-error">{error}</div>}
        <div className="editor-action-row">
          {spell && onDelete && (
            <button
              className="danger-mini-button"
              type="button"
              onClick={() => void remove()}
              disabled={saving}
            >
              Удалить
            </button>
          )}

          <button className="sheet-save" type="submit" disabled={saving}>
            {saving ? "Сохраняем…" : "Сохранить"}
          </button>
        </div>
      </form>
    </div>
  )
}
