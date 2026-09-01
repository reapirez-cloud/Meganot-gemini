import { useMemo, useState } from "react"
import type { ChangeEvent, FormEvent } from "react"

import "../../styles/textRpgSheet.css"
import type {
  CharacterSheet,
  SkillRank,
  SpellSlotState,
} from "../../types/characterSheet"

const abilities = [
  ["strength", "Сила"],
  ["dexterity", "Ловкость"],
  ["constitution", "Телосложение"],
  ["intelligence", "Интеллект"],
  ["wisdom", "Мудрость"],
  ["charisma", "Харизма"],
] as const

const skills = [
  ["acrobatics", "Акробатика"],
  ["animal_handling", "Уход за животными"],
  ["arcana", "Магия"],
  ["athletics", "Атлетика"],
  ["deception", "Обман"],
  ["history", "История"],
  ["insight", "Проницательность"],
  ["intimidation", "Запугивание"],
  ["investigation", "Анализ"],
  ["medicine", "Медицина"],
  ["nature", "Природа"],
  ["perception", "Восприятие"],
  ["performance", "Выступление"],
  ["persuasion", "Убеждение"],
  ["religion", "Религия"],
  ["sleight_of_hand", "Ловкость рук"],
  ["stealth", "Скрытность"],
  ["survival", "Выживание"],
] as const

type Props = {
  sheet: CharacterSheet
  systemEditable?: boolean
  onClose: () => void
  onSave: (
    input: Partial<CharacterSheet>,
  ) => Promise<{ ok: boolean; error?: string }>
}

function normalizeSlot(value: SpellSlotState | undefined): SpellSlotState {
  return {
    max: Math.max(0, Number(value?.max || 0)),
    used: Math.max(0, Number(value?.used || 0)),
  }
}

export default function CharacterSheetEditor({
  sheet,
  systemEditable = true,
  onClose,
  onSave,
}: Props) {
  const [draft, setDraft] = useState<CharacterSheet>({ ...sheet })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const saveSet = useMemo(
    () => new Set(draft.saving_throw_proficiencies || []),
    [draft.saving_throw_proficiencies],
  )

  function numberField(key: keyof CharacterSheet, value: number) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const parsed = Number.parseInt(event.target.value || "0", 10)
      setDraft((current) => ({
        ...current,
        [key]: Number.isFinite(parsed) ? parsed : value,
      }))
    }
  }

  function toggleSave(key: string) {
    const next = new Set(saveSet)
    if (next.has(key)) next.delete(key)
    else next.add(key)

    setDraft((current) => ({
      ...current,
      saving_throw_proficiencies: Array.from(next),
    }))
  }

  function setSkill(key: string, rank: SkillRank) {
    setDraft((current) => ({
      ...current,
      skill_proficiencies: {
        ...(current.skill_proficiencies || {}),
        [key]: rank,
      },
    }))
  }

  function setSlotMax(level: number, maxValue: number) {
    const key = String(level)

    setDraft((current) => {
      const currentSlot = normalizeSlot(current.spell_slots?.[key])
      const max = Math.max(0, Math.min(20, maxValue))
      const used = Math.min(currentSlot.used, max)

      return {
        ...current,
        spell_slots: {
          ...(current.spell_slots || {}),
          [key]: { max, used },
        },
      }
    })
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError("")

    const result = await onSave(draft)
    setSaving(false)

    if (!result.ok) {
      setError(result.error || "Не удалось сохранить лист.")
      return
    }

    onClose()
  }

  if (!systemEditable) {
    const narrativeFields: Array<{
      key: keyof CharacterSheet
      label: string
      multiline?: boolean
    }> = [
      { key: "race", label: "Раса / вид" },
      { key: "proficiencies", label: "Владения", multiline: true },
      { key: "languages", label: "Языки", multiline: true },
      { key: "senses", label: "Чувства", multiline: true },
      { key: "personality_traits", label: "Черты личности", multiline: true },
      { key: "ideals", label: "Идеалы", multiline: true },
      { key: "bonds", label: "Привязанности", multiline: true },
      { key: "flaws", label: "Слабости", multiline: true },
      { key: "backstory", label: "История персонажа", multiline: true },
      { key: "notes", label: "Личные заметки", multiline: true },
    ]

    return (
      <div className="sheet-backdrop" onMouseDown={onClose}>
        <form
          className="bottom-sheet dnd-sheet-editor"
          onSubmit={submit}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="sheet-handle" />
          <div className="character-editor-head">
            <div>
              <h3 className="sheet-title">Моя часть листа</h3>
              <p className="sheet-copy">
                Здесь ты ведёшь описание и историю героя. Боевые параметры и ресурсы меняет ГМ.
              </p>
            </div>
            <button className="sheet-close" type="button" onClick={onClose}>×</button>
          </div>

          <div className="dnd-editor-section narrative-editor-grid">
            {narrativeFields.map((field) => (
              <label key={field.key}>
                {field.label}
                {field.multiline ? (
                  <textarea
                    className="app-textarea"
                    value={String(draft[field.key] ?? "")}
                    onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
                    maxLength={12000}
                  />
                ) : (
                  <input
                    className="app-input"
                    value={String(draft[field.key] ?? "")}
                    onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
                    maxLength={240}
                  />
                )}
              </label>
            ))}
          </div>

          {error && <div className="auth-error">{error}</div>}
          <button className="sheet-save" type="submit" disabled={saving}>
            {saving ? "Сохраняем…" : "Сохранить мою часть"}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <form
        className="bottom-sheet dnd-sheet-editor"
        onSubmit={submit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="character-editor-head">
          <div>
            <h3 className="sheet-title">Редактировать лист</h3>
            <p className="sheet-copy">
              Параметры, которые используются в текстовой игре. ГМ ведёт боевые значения и доступы.
            </p>
          </div>
          <button className="sheet-close" type="button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="dnd-editor-section">
          <h4>Основное</h4>
          <div className="dnd-editor-grid">
            <label>
              Раса / вид
              <input
                className="app-input"
                value={draft.race}
                onChange={(event) =>
                  setDraft({ ...draft, race: event.target.value })
                }
              />
            </label>
          </div>
        </div>

        <div className="dnd-editor-section">
          <h4>Характеристики</h4>
          <div className="dnd-editor-grid dnd-editor-grid--3">
            {abilities.map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  className="app-input"
                  type="number"
                  min="1"
                  max="30"
                  value={draft[key]}
                  onChange={numberField(key, draft[key])}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="dnd-editor-section">
          <h4>Бой и проверки</h4>
          <div className="dnd-editor-grid dnd-editor-grid--3">
            <label>
              КД
              <input
                className="app-input"
                type="number"
                min="0"
                value={draft.armor_class}
                onChange={numberField("armor_class", draft.armor_class)}
              />
            </label>
            <label>
              Инициатива
              <input
                className="app-input"
                type="number"
                value={draft.initiative_bonus}
                onChange={numberField(
                  "initiative_bonus",
                  draft.initiative_bonus,
                )}
              />
            </label>
            <label>
              Бонус мастерства
              <input
                className="app-input"
                type="number"
                value={draft.proficiency_bonus}
                onChange={numberField(
                  "proficiency_bonus",
                  draft.proficiency_bonus,
                )}
              />
            </label>
            <label>
              Макс. HP
              <input
                className="app-input"
                type="number"
                min="0"
                value={draft.max_hp}
                onChange={numberField("max_hp", draft.max_hp)}
              />
            </label>
            <label>
              Текущие HP
              <input
                className="app-input"
                type="number"
                min="0"
                value={draft.current_hp}
                onChange={numberField("current_hp", draft.current_hp)}
              />
            </label>
            <label>
              Временные HP
              <input
                className="app-input"
                type="number"
                min="0"
                value={draft.temp_hp}
                onChange={numberField("temp_hp", draft.temp_hp)}
              />
            </label>
            <label>
              Пассивное восприятие
              <input
                className="app-input"
                type="number"
                value={draft.passive_perception}
                onChange={numberField(
                  "passive_perception",
                  draft.passive_perception,
                )}
              />
            </label>
          </div>
        </div>

        <div className="dnd-editor-section">
          <h4>Спасброски</h4>
          <div className="dnd-check-grid">
            {abilities.map(([key, label]) => (
              <label className="dnd-check" key={key}>
                <input
                  type="checkbox"
                  checked={saveSet.has(key)}
                  onChange={() => toggleSave(key)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="dnd-editor-section">
          <h4>Навыки</h4>
          <div className="dnd-skill-edit-list">
            {skills.map(([key, label]) => (
              <label className="dnd-skill-edit-row" key={key}>
                <span>{label}</span>
                <select
                  className="app-select"
                  value={draft.skill_proficiencies?.[key] || 0}
                  onChange={(event) =>
                    setSkill(key, Number(event.target.value) as SkillRank)
                  }
                >
                  <option value={0}>Нет</option>
                  <option value={1}>Владение</option>
                  <option value={2}>Экспертиза</option>
                </select>
              </label>
            ))}
          </div>
        </div>

        <div className="dnd-editor-section">
          <h4>Заклинания</h4>

          <label className="dnd-switch-row">
            <span>
              <strong>Персонаж использует заклинания</strong>
              <small>Вкладка появится игроку только если включено.</small>
            </span>
            <input
              type="checkbox"
              checked={draft.spellcasting_enabled}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  spellcasting_enabled: event.target.checked,
                })
              }
            />
          </label>

          {draft.spellcasting_enabled && (
            <>
              <div className="dnd-editor-grid dnd-editor-grid--3">
                <label>
                  Базовая характеристика
                  <input
                    className="app-input"
                    value={draft.spellcasting_ability || ""}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        spellcasting_ability: event.target.value || null,
                      })
                    }
                    placeholder="Мудрость"
                  />
                </label>
                <label>
                  СЛ спасброска
                  <input
                    className="app-input"
                    type="number"
                    value={draft.spell_save_dc ?? ""}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        spell_save_dc: event.target.value
                          ? Number(event.target.value)
                          : null,
                      })
                    }
                  />
                </label>
                <label>
                  Бонус атаки
                  <input
                    className="app-input"
                    type="number"
                    value={draft.spell_attack_bonus ?? ""}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        spell_attack_bonus: event.target.value
                          ? Number(event.target.value)
                          : null,
                      })
                    }
                  />
                </label>
              </div>

              <div className="spell-slot-editor">
                <div className="spell-slot-editor__head">
                  <strong>Ячейки заклинаний</strong>
                  <small>
                    Укажи максимум. Потраченные ячейки приложение считает само.
                  </small>
                </div>

                <div className="spell-slot-editor__grid">
                  {Array.from({ length: 9 }, (_, index) => index + 1).map(
                    (level) => {
                      const slot = normalizeSlot(
                        draft.spell_slots?.[String(level)],
                      )
                      const remaining = Math.max(0, slot.max - slot.used)

                      return (
                        <label key={level}>
                          <span>{level} ур.</span>
                          <input
                            className="app-input"
                            type="number"
                            min="0"
                            max="20"
                            value={slot.max}
                            onChange={(event) =>
                              setSlotMax(level, Number(event.target.value) || 0)
                            }
                          />
                          <small>
                            сейчас {remaining}/{slot.max}
                          </small>
                        </label>
                      )
                    },
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="dnd-editor-section">
          <h4>Описание</h4>
          <label>
            Владения
            <textarea
              className="app-textarea"
              value={draft.proficiencies}
              onChange={(event) =>
                setDraft({ ...draft, proficiencies: event.target.value })
              }
            />
          </label>
          <label>
            Языки
            <textarea
              className="app-textarea"
              value={draft.languages}
              onChange={(event) =>
                setDraft({ ...draft, languages: event.target.value })
              }
            />
          </label>
          <label>
            Чувства
            <textarea
              className="app-textarea"
              value={draft.senses}
              onChange={(event) =>
                setDraft({ ...draft, senses: event.target.value })
              }
            />
          </label>
          <label>
            Черты личности
            <textarea
              className="app-textarea"
              value={draft.personality_traits}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  personality_traits: event.target.value,
                })
              }
            />
          </label>
          <label>
            Идеалы
            <textarea
              className="app-textarea"
              value={draft.ideals}
              onChange={(event) =>
                setDraft({ ...draft, ideals: event.target.value })
              }
            />
          </label>
          <label>
            Привязанности
            <textarea
              className="app-textarea"
              value={draft.bonds}
              onChange={(event) =>
                setDraft({ ...draft, bonds: event.target.value })
              }
            />
          </label>
          <label>
            Слабости
            <textarea
              className="app-textarea"
              value={draft.flaws}
              onChange={(event) =>
                setDraft({ ...draft, flaws: event.target.value })
              }
            />
          </label>
          <label>
            История персонажа
            <textarea
              className="app-textarea dnd-long-text"
              value={draft.backstory}
              onChange={(event) =>
                setDraft({ ...draft, backstory: event.target.value })
              }
            />
          </label>
          <label>
            Заметки
            <textarea
              className="app-textarea"
              value={draft.notes}
              onChange={(event) =>
                setDraft({ ...draft, notes: event.target.value })
              }
            />
          </label>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <button className="sheet-save" type="submit" disabled={saving}>
          {saving ? "Сохраняем…" : "Сохранить лист"}
        </button>
      </form>
    </div>
  )
}
