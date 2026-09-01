import { useMemo, useState } from "react"
import type { FormEvent } from "react"
import type { CharacterFeature, FeatureInput } from "../../types/characterSheet"
import type { StoredMechanics } from "../../types/characterMechanics"
import { mechanicSummary } from "../../lib/characterMechanics"
import MechanicsBuilder from "./MechanicsBuilder"

type Props = {
  feature: CharacterFeature | null
  onClose: () => void
  onSave: (input: FeatureInput) => Promise<{ ok: boolean; error?: string }>
  onDelete?: () => Promise<{ ok: boolean; error?: string }>
}

type Step = 1 | 2 | 3

const featureKinds: Array<{ value: FeatureInput["kind"]; icon: string; label: string; detail: string }> = [
  { value: "feat", icon: "✦", label: "Фит", detail: "Отдельная особенность или талант персонажа." },
  { value: "class_feature", icon: "◇", label: "Классовая черта", detail: "То, что даёт класс или подкласс." },
  { value: "racial_trait", icon: "◈", label: "Расовая черта", detail: "Врожденная или видовая особенность." },
  { value: "feature", icon: "◆", label: "Уникальный эффект", detail: "Сюжетная, временная или особая механика." },
  { value: "other", icon: "…", label: "Другое", detail: "Если ни один готовый тип не подходит." },
]

export default function FeatureEditor({ feature, onClose, onSave, onDelete }: Props) {
  const [step, setStep] = useState<Step>(1)
  const [kind, setKind] = useState<FeatureInput["kind"]>(feature?.kind || "feat")
  const [name, setName] = useState(feature?.name || "")
  const [description, setDescription] = useState(feature?.description || "")
  const [mechanics, setMechanics] = useState<StoredMechanics>(feature?.mechanics || [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const selectedKind = featureKinds.find((candidate) => candidate.value === kind) || featureKinds[0]
  const reviewMechanics = useMemo(() => mechanics.slice(0, 5).map(mechanicSummary), [mechanics])

  function nextStep() {
    setError("")
    if (step === 1 && !name.trim()) { setError("Укажи название."); return }
    setStep((Math.min(3, step + 1)) as Step)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (step < 3) { nextStep(); return }
    if (!name.trim()) { setError("Укажи название."); setStep(1); return }
    setSaving(true); setError("")
    const result = await onSave({ kind, name: name.trim(), description, mechanics })
    setSaving(false)
    if (!result.ok) { setError(result.error || "Не удалось сохранить."); return }
    onClose()
  }

  async function remove() {
    if (!onDelete) return
    setSaving(true); setError("")
    const result = await onDelete(); setSaving(false)
    if (!result.ok) { setError(result.error || "Не удалось удалить."); return }
    onClose()
  }

  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <form className="bottom-sheet v2-editor-sheet creation-wizard" onSubmit={submit} onMouseDown={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <header className="v2-sheet-head creation-wizard__head">
          <div><span>{feature ? "Редактирование" : "Создание"} · шаг {step} из 3</span><h3>{feature ? "Особенность" : "Новая особенность"}</h3><p>{step === 1 ? "Сначала объясни, что это за штука." : step === 2 ? "Теперь добавь реальные игровые эффекты." : "Проверь, что игрок увидит и как способность повлияет на персонажа."}</p></div>
          <button type="button" onClick={onClose}>×</button>
        </header>
        <div className="creation-wizard__progress">{[1, 2, 3].map((value) => <i key={value} className={value <= step ? "is-active" : ""} />)}</div>

        {step === 1 && <section className="creation-wizard__step">
          <div className="creation-wizard__intro"><span>01</span><div><strong>Что это?</strong><small>Тип нужен только для понятной группировки — механику он сам не придумывает.</small></div></div>
          <div className="creation-preset-grid creation-preset-grid--compact">{featureKinds.map((candidate) => <button type="button" key={candidate.value} className={kind === candidate.value ? "creation-preset is-active" : "creation-preset"} onClick={() => setKind(candidate.value)}><span>{candidate.icon}</span><div><strong>{candidate.label}</strong><small>{candidate.detail}</small></div><i>{kind === candidate.value ? "✓" : "›"}</i></button>)}</div>
          <label className="field-label">Название</label><input className="app-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={140} autoFocus placeholder="Например: Ярость Пепла" />
          <label className="field-label">Описание <small className="creation-optional">необязательно</small></label><textarea className="app-textarea dnd-long-text" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} placeholder="Что должен понимать игрок…" />
        </section>}

        {step === 2 && <section className="creation-wizard__step">
          <div className="creation-wizard__intro"><span>02</span><div><strong>Что это меняет?</strong><small>Оставь пустым — и особенность будет только описанием. Никаких скрытых эффектов.</small></div></div>
          <div className="creation-default-note creation-default-note--neutral"><span>✦</span><p><strong>{mechanics.length ? `${mechanics.length} эффектов настроено` : "Механики пока нет"}</strong><small>Бонусы, сопротивления, иммунитеты, ресурсы, действия и заклинания добавляются отдельно и могут иметь условия.</small></p></div>
          <MechanicsBuilder value={mechanics} onChange={setMechanics} />
        </section>}

        {step === 3 && <section className="creation-wizard__step">
          <div className="creation-wizard__intro"><span>03</span><div><strong>Проверка</strong><small>Всё, чего нет здесь, не будет внезапно работать в движке.</small></div></div>
          <div className="creation-review-card"><div className="creation-review-card__icon">{selectedKind.icon}</div><div><small>{selectedKind.label}</small><strong>{name.trim() || "Без названия"}</strong><span>{description.trim() ? "Есть описание" : "Без описания"} · {mechanics.length} эффектов</span></div></div>
          <div className="creation-review-block"><span>Описание</span><p>{description.trim() || "Без описания."}</p></div>
          <div className="creation-review-block"><span>Механика</span>{reviewMechanics.length ? <ul>{reviewMechanics.map((summary) => <li key={summary}>{summary}</li>)}</ul> : <p>Нет механических эффектов.</p>}</div>
        </section>}

        {error && <div className="auth-error">{error}</div>}
        <div className="v2-editor-actions creation-wizard__actions">
          {feature && onDelete && step === 3 && <button className="v2-danger-button" type="button" onClick={() => void remove()} disabled={saving}>Удалить</button>}
          {step > 1 && <button className="v2-secondary-button" type="button" onClick={() => setStep((step - 1) as Step)} disabled={saving}>Назад</button>}
          <button className="v2-primary-button" type="submit" disabled={saving}>{saving ? "Сохраняем…" : step < 3 ? "Далее" : feature ? "Сохранить изменения" : "Создать особенность"}</button>
        </div>
      </form>
    </div>
  )
}
