import { useMemo } from "react"
import type { ResolvedCharacterContract } from "../../character-engine/index.ts"
import type { SpellSlotRecoverySelection } from "../../lib/wizardArcaneRecovery.ts"
import "./SpellSlotRecoveryPicker.css"

type Props = {
  contract: ResolvedCharacterContract
  budget: number
  maxSlotLevel: number
  value: SpellSlotRecoverySelection
  disabled?: boolean
  onChange: (value: SpellSlotRecoverySelection) => void
}

export default function SpellSlotRecoveryPicker({ contract, budget, maxSlotLevel, value, disabled = false, onChange }: Props) {
  const slots = useMemo(() => contract.resources
    .map((resource) => {
      const match = resource.stateKey.match(/^spell_slot_([1-9])$/)
      if (!match) return null
      const level = Number(match[1])
      const max = Math.max(0, Number(resource.max.value || 0))
      const current = Math.max(0, Number(resource.current || 0))
      return { level, max, current, spent: Math.max(0, max - current) }
    })
    .filter((slot): slot is NonNullable<typeof slot> => Boolean(slot && slot.level <= maxSlotLevel && slot.spent > 0))
    .sort((left, right) => left.level - right.level), [contract.resources, maxSlotLevel])

  const spentBudget = Object.entries(value).reduce((sum, [rawLevel, rawAmount]) => sum + Number(rawLevel) * Math.max(0, Number(rawAmount) || 0), 0)

  function change(level: number, delta: number, spent: number) {
    if (disabled) return
    const current = Math.max(0, Number(value[level] || 0))
    const next = Math.max(0, Math.min(spent, current + delta))
    if (delta > 0 && spentBudget + level > budget) return
    const result = { ...value, [level]: next }
    if (!next) delete result[level]
    onChange(result)
  }

  if (!slots.length) return <div className="slot-recovery-picker__empty">Нет потраченных ячеек 1–{maxSlotLevel} уровня.</div>

  return <div className="slot-recovery-picker">
    <div className="slot-recovery-picker__budget"><span>Уровней выбрано</span><strong>{spentBudget} / {budget}</strong></div>
    {slots.map((slot) => {
      const selected = Math.max(0, Number(value[slot.level] || 0))
      const canAdd = !disabled && selected < slot.spent && spentBudget + slot.level <= budget
      return <div className="slot-recovery-picker__row" key={slot.level}>
        <div><strong>{slot.level} уровень</strong><small>Потрачено {slot.spent} из {slot.max}</small></div>
        <div className="slot-recovery-picker__stepper">
          <button type="button" disabled={disabled || selected <= 0} onClick={() => change(slot.level, -1, slot.spent)}>−</button>
          <b>{selected}</b>
          <button type="button" disabled={!canAdd} onClick={() => change(slot.level, 1, slot.spent)}>＋</button>
        </div>
      </div>
    })}
  </div>
}
