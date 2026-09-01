import { useMemo, useState } from "react"

import type {
  CharacterSheet,
  SpellSlotState,
} from "../../types/characterSheet"

type Props = {
  sheet: CharacterSheet
  onClose: () => void
  onSave: (
    input: Partial<CharacterSheet>,
  ) => Promise<{ ok: boolean; error?: string }>
}

function slotState(
  slots: CharacterSheet["spell_slots"],
  level: number,
): SpellSlotState {
  const value = slots?.[String(level)]
  return {
    max: Math.max(0, Number(value?.max || 0)),
    used: Math.max(0, Number(value?.used || 0)),
  }
}

export default function CharacterResourcesEditor({
  sheet,
  onClose,
  onSave,
}: Props) {
  const [maxHp, setMaxHp] = useState(sheet.max_hp)
  const [currentHp, setCurrentHp] = useState(sheet.current_hp)
  const [tempHp, setTempHp] = useState(sheet.temp_hp)
  const [spellChangeUnlocked, setSpellChangeUnlocked] = useState(
    Boolean(sheet.spell_change_unlocked),
  )
  const [slots, setSlots] = useState<CharacterSheet["spell_slots"]>({
    ...(sheet.spell_slots || {}),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const prepared = useMemo(
    () =>
      Array.from({ length: 9 }, (_, index) => index + 1).map((level) => ({
        level,
        ...slotState(slots, level),
      })),
    [slots],
  )

  function setMax(level: number, value: number) {
    const key = String(level)
    const current = slotState(slots, level)
    const max = Math.max(0, Math.min(20, value))
    const used = Math.min(current.used, max)

    setSlots((existing) => ({
      ...(existing || {}),
      [key]: { max, used },
    }))
  }

  async function toggleSpellChangeAccess() {
    const next = !spellChangeUnlocked
    setSaving(true)
    setError("")
    const result = await onSave({ spell_change_unlocked: next })
    setSaving(false)

    if (!result.ok) {
      setError(result.error || "Не удалось изменить доступ к смене заклинаний.")
      return
    }

    setSpellChangeUnlocked(next)
  }

  async function save() {
    setSaving(true)
    setError("")

    const normalizedMaxHp = Math.max(0, maxHp)
    const normalizedCurrentHp = Math.max(
      0,
      Math.min(currentHp, normalizedMaxHp),
    )

    const result = await onSave({
      max_hp: normalizedMaxHp,
      current_hp: normalizedCurrentHp,
      temp_hp: Math.max(0, tempHp),
      spell_slots: slots,
      spell_change_unlocked: spellChangeUnlocked,
    })

    setSaving(false)

    if (!result.ok) {
      setError(result.error || "Не удалось сохранить ресурсы.")
      return
    }

    onClose()
  }

  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <div
        className="bottom-sheet character-resource-editor"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" />

        <div className="character-editor-head">
          <div>
            <h3 className="sheet-title">Ресурсы персонажа</h3>
            <p className="sheet-copy">
              Здесь ГМ задаёт HP, ячейки и временно открывает игроку смену заклинаний после долгого отдыха.
            </p>
          </div>
          <button className="sheet-close" type="button" onClick={onClose}>
            ×
          </button>
        </div>

        <section className="resource-editor-section">
          <div className="resource-editor-section__head">
            <strong>HP</strong>
            <small>Долгий отдых вернёт текущие HP к максимуму</small>
          </div>

          <div className="resource-hp-grid">
            <label>
              Максимум
              <input
                className="app-input"
                type="number"
                min="0"
                value={maxHp}
                onChange={(event) => setMaxHp(Number(event.target.value) || 0)}
              />
            </label>

            <label>
              Сейчас
              <input
                className="app-input"
                type="number"
                min="0"
                value={currentHp}
                onChange={(event) =>
                  setCurrentHp(Number(event.target.value) || 0)
                }
              />
            </label>

            <label>
              Временные
              <input
                className="app-input"
                type="number"
                min="0"
                value={tempHp}
                onChange={(event) => setTempHp(Number(event.target.value) || 0)}
              />
            </label>
          </div>
        </section>

        {sheet.spellcasting_enabled && (
          <section className="resource-editor-section">
            <div className="resource-editor-section__head">
              <strong>Смена заклинаний после отдыха</strong>
              <small>
                Пока доступ закрыт, игрок может пользоваться текущими заклинаниями, но не может добавлять, убирать или менять подготовленные.
              </small>
            </div>

            <button
              className={spellChangeUnlocked ? "danger-mini-button" : "secondary-action-button"}
              type="button"
              onClick={() => void toggleSpellChangeAccess()}
              disabled={saving}
            >
              {spellChangeUnlocked ? "Закрыть доступ игроку" : "Дать доступ игроку"}
            </button>
          </section>
        )}

        <section className="resource-editor-section">
          <div className="resource-editor-section__head">
            <strong>Ячейки заклинаний</strong>
            <small>
              Укажи только максимум. Использование заклинаний само увеличивает «потрачено».
            </small>
          </div>

          <div className="resource-slot-grid">
            {prepared.map((slot) => {
              const remaining = Math.max(0, slot.max - slot.used)

              return (
                <label key={slot.level}>
                  <span>{slot.level} ур.</span>
                  <input
                    className="app-input"
                    type="number"
                    min="0"
                    max="20"
                    value={slot.max}
                    onChange={(event) =>
                      setMax(slot.level, Number(event.target.value) || 0)
                    }
                  />
                  <small>
                    доступно {remaining}/{slot.max}
                  </small>
                </label>
              )
            })}
          </div>
        </section>

        {error && <div className="auth-error">{error}</div>}

        <button
          className="sheet-save"
          type="button"
          onClick={() => void save()}
          disabled={saving}
        >
          {saving ? "Сохраняем…" : "Сохранить ресурсы"}
        </button>
      </div>
    </div>
  )
}
