import { useEffect, useMemo, useState } from "react"
import type {
  CharacterPreparationModel,
  ChoicePreparationTask,
  NoticePreparationTask,
  RollPreparationTask,
  SpellPreparationTask,
} from "../../lib/characterPreparation.ts"
import { supabase } from "../../lib/supabase.ts"
import { commitGenaCharacterTemplateChoice } from "../../lib/templateChoiceRuntime.ts"
import { useAuth } from "../../context/AuthContext.tsx"
import { useCharacters } from "../../context/CharacterContext.tsx"
import "./ChatPreparationCard.css"

type ChatPreparationSpell = {
  id: string
  name: string
  spell_level: number
  prepared: boolean
  cast_mode: string
}

type Props = {
  roomId: string
  characterId: string
  model: CharacterPreparationModel
  spells: ChatPreparationSpell[]
  onChanged: () => void
}

function outcomeLabel(value: unknown) {
  if (value === "weal") return "Благо"
  if (value === "woe") return "Беда"
  if (typeof value === "string") return value
  if (typeof value === "number") return String(value)
  return "Записано"
}

function SpellTask({ key, characterId, task, spells, onChanged }: {
  key?: string | number
  characterId: string
  task: SpellPreparationTask
  spells: ChatPreparationSpell[]
  onChanged: () => void
}) {
  const canonical = useMemo(
    () => spells.filter((spell) => spell.prepared).map((spell) => spell.id),
    [spells],
  )
  const [draft, setDraft] = useState<string[]>(canonical)
  const [busy, setBusy] = useState(false)
  const [committed, setCommitted] = useState(Boolean(task.record))
  const [error, setError] = useState("")
  const required = task.required
  const locked = committed || Boolean(task.record)
  const valid = required !== null && draft.length === required

  useEffect(() => {
    if (!locked) setDraft(canonical)
    setError("")
  }, [canonical, locked])

  useEffect(() => {
    setCommitted(Boolean(task.record))
  }, [task.record])

  const levels = useMemo(() => {
    const grouped = new Map<number, ChatPreparationSpell[]>()
    for (const spell of spells) {
      const current = grouped.get(spell.spell_level) || []
      current.push(spell)
      grouped.set(spell.spell_level, current)
    }
    return [...grouped.entries()].sort(([left], [right]) => left - right)
  }, [spells])

  function toggle(id: string) {
    if (busy || locked) return
    setError("")
    setDraft((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id)
      if (required !== null && current.length >= required) return current
      return [...current, id]
    })
  }

  async function save() {
    if (busy || locked || !valid) return
    setBusy(true); setError("")
    const { error: rpcError } = await supabase.rpc("gena_commit_character_spell_preparation_v1", {
      p_character_id: characterId,
      p_assignment_id: task.assignmentId,
      p_prepared_spell_ids: draft,
    })
    setBusy(false)
    if (rpcError) { setError(rpcError.message); return }
    setCommitted(true)
    onChanged()
  }

  return <section className={locked ? "rest-prep-task is-locked" : "rest-prep-task"}>
    <div className="rest-prep-task__head">
      <span>✧</span>
      <div><small>{task.sourceName}</small><strong>Подготовить заклинания</strong></div>
      {locked && <b className="rest-prep-task__done">Зафиксировано · {draft.length}</b>}
    </div>

    {required === null && (
      <div className="rest-prep-error">Класс не описал точную квоту подготовленных заклинаний для {task.sourceLevel} уровня. Гена не позволит сохранить догадку.</div>
    )}

    {spells.length === 0 ? (
      <div className="rest-prep-empty">Нет личных заклинаний 1–9 уровня, которые требуют ежедневной подготовки.</div>
    ) : (
      <div className="rest-prep-spell-levels">
        {levels.map(([level, entries]) => <section className="rest-prep-spell-level" key={level}>
          <div className="rest-prep-spell-level__title"><span>{level} уровень</span><small>{entries.filter((spell) => draft.includes(spell.id)).length}/{entries.length}</small></div>
          <div className="rest-prep-spell-list">
            {entries.map((spell) => {
              const selected = draft.includes(spell.id)
              const atLimit = !selected && required !== null && draft.length >= required
              return <button
                type="button"
                className={selected ? "rest-prep-spell is-selected" : "rest-prep-spell"}
                disabled={busy || locked || atLimit}
                key={spell.id}
                onClick={() => toggle(spell.id)}
              >
                <i>{selected ? "✓" : ""}</i>
                <span>{spell.name}</span>
              </button>
            })}
          </div>
        </section>)}
      </div>
    )}

    <div className="rest-prep-spell-summary">
      <span>Выбрано <strong>{draft.length}{required !== null ? ` / ${required}` : ""}</strong></span>
      <small>{required !== null ? `Нужно выбрать ровно ${required}. ` : ""}Заговоры и всегда подготовленные заклинания класса в эту квоту не входят.</small>
    </div>
    <button className="rest-prep-confirm" type="button" disabled={busy || locked || !valid} onClick={() => void save()}>
      {busy ? "Сохраняем…" : locked ? "Зафиксировано" : "Готово"}
    </button>
    {error && <div className="rest-prep-error">{error}</div>}
  </section>
}

function ChoiceTask({ key, characterId, task, onChanged }: {
  key?: string | number
  characterId: string
  task: ChoicePreparationTask
  onChanged: () => void
}) {
  const required = task.required
  const [draft, setDraft] = useState<string[]>(task.selected.slice(0, required))
  const [busy, setBusy] = useState(false)
  const [committed, setCommitted] = useState(Boolean(task.record))
  const [error, setError] = useState("")
  const locked = committed || Boolean(task.record)

  useEffect(() => {
    if (!locked) setDraft(task.selected.slice(0, required))
    setError("")
  }, [locked, required, task.selected])

  useEffect(() => {
    setCommitted(Boolean(task.record))
  }, [task.record])

  const options = useMemo(() => task.definition.options.map((key) => ({
    key,
    label: task.definition.option_labels?.[key] || key,
  })), [task.definition])

  function toggle(key: string) {
    if (busy || locked) return
    setError("")
    setDraft((current) => {
      if (current.includes(key)) return current.filter((item) => item !== key)
      if (required === 1) return [key]
      if (current.length >= required) return current
      return [...current, key]
    })
  }

  async function save() {
    if (busy || locked || draft.length !== required) return
    setBusy(true); setError("")
    const result = await commitGenaCharacterTemplateChoice(characterId, task.assignmentId, task.key, draft)
    setBusy(false)
    if (!result.ok) { setError((result as any).error || "Error"); return }
    setCommitted(true)
    onChanged()
  }

  return <section className={locked ? "rest-prep-task is-locked" : "rest-prep-task"}>
    <div className="rest-prep-task__head">
      <span>◇</span>
      <div><small>{task.sourceName}</small><strong>{task.label}</strong></div>
      {locked && <b className="rest-prep-task__done">Зафиксировано</b>}
    </div>
    <div className="rest-prep-options">
      {options.map((option) => {
        const selected = draft.includes(option.key)
        const atLimit = !selected && required > 1 && draft.length >= required
        return <button type="button" className={selected ? "is-selected" : ""} disabled={busy || locked || atLimit} key={option.key} onClick={() => toggle(option.key)}><i>{selected ? "✓" : ""}</i><span>{option.label}</span></button>
      })}
    </div>
    <div className="rest-prep-spell-summary">
      <span>Выбрано <strong>{draft.length} / {required}</strong></span>
      <small>После «Готово» этот выбор нельзя менять до следующего долгого отдыха.</small>
    </div>
    <button className="rest-prep-confirm" type="button" disabled={busy || locked || draft.length !== required} onClick={() => void save()}>{busy ? "Сохраняем…" : locked ? "Зафиксировано" : "Готово"}</button>
    {error && <div className="rest-prep-error">{error}</div>}
  </section>
}

function RollTask({ key, roomId, characterId, task, onChanged }: {
  key?: string | number
  roomId: string
  characterId: string
  task: RollPreparationTask
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const notation = `${task.count}d${task.sides}`

  async function roll() {
    if (busy || task.record) return
    setBusy(true); setError("")
    const { error: rpcError } = await supabase.rpc("gena_send_chat_preparation_roll_v1", {
      p_room_id: roomId,
      p_character_id: characterId,
      p_assignment_id: task.assignmentId,
      p_task_key: task.key,
      p_label: task.label,
    })
    setBusy(false)
    if (rpcError) { setError(rpcError.message); return }
    onChanged()
  }

  return <section className={task.record ? "rest-prep-task is-locked" : "rest-prep-task"}>
    <div className="rest-prep-task__head"><span>◈</span><div><small>{task.sourceName} · {notation}</small><strong>{task.label}</strong></div>{task.record && <b className="rest-prep-task__done">Зафиксировано</b>}</div>
    {task.record
      ? <div className="rest-prep-record"><span>Записано</span><strong>{task.record.input_value}</strong><em>→ {outcomeLabel(task.record.resolved_value)}</em></div>
      : <button className="rest-prep-roll" type="button" disabled={busy} onClick={() => void roll()}>{busy ? "Бросаем…" : `Бросить ${notation} и записать`}</button>}
    {error && <div className="rest-prep-error">{error}</div>}
  </section>
}

function NoticeTask({ key, task }: { key?: string | number; task: NoticePreparationTask }) {
  return <section className="rest-prep-task rest-prep-task--notice">
    <div className="rest-prep-task__head">
      <span>ⓘ</span>
      <div><small>{task.sourceName}</small><strong>{task.label}</strong></div>
      <b className="rest-prep-task__done">Решает ГМ</b>
    </div>
    <div className="rest-prep-empty">{task.body}</div>
  </section>
}

export default function ChatPreparationCard({ roomId, characterId, model, spells, onChanged }: Props) {
  const { user } = useAuth()
  const { characters } = useCharacters()
  const character = characters.find((entry) => entry.id === characterId)
  const isOwner = Boolean(character?.assigned_user_id && character.assigned_user_id === user.id)

  if (!isOwner || !model.session?.is_open || model.tasks.length === 0) return null
  const spellTasks = model.tasks.filter((task): task is SpellPreparationTask => task.kind === "spells")
  const choiceTasks = model.tasks.filter((task): task is ChoicePreparationTask => task.kind === "choice")
  const rollTasks = model.tasks.filter((task): task is RollPreparationTask => task.kind === "roll")
  const noticeTasks = model.tasks.filter((task): task is NoticePreparationTask => task.kind === "notice")

  return <aside className="rest-prep-card">
    <header className="rest-prep-card__header">
      <span className="rest-prep-card__icon">☾</span>
      <div><small>Долгий отдых завершён</small><strong>Гена ждёт решения владельца</strong></div>
      <b>до первой реплики</b>
    </header>
    <p className="rest-prep-card__warning"><strong>Каждая кнопка «Готово» фиксирует конкретный выбор до следующего долгого отдыха.</strong> Первый отправленный текст закроет это окно до следующего долгого отдыха. Броски, способности и заклинания окно не закрывают. Если задача осталась незавершённой, подготовленные заклинания и постоянные выборы сохраняют прошлое значение, а обязательные случайные результаты Гена определяет сама. Информационные решения с пометкой «Решает ГМ» игрок сообщает мастеру, а ГМ применяет их через административный лист.</p>

    {spellTasks.map((task) => <SpellTask characterId={characterId} task={task} spells={spells} onChanged={onChanged} key={`${task.assignmentId}:${task.key}`} />)}
    {choiceTasks.map((task) => <ChoiceTask characterId={characterId} task={task} onChanged={onChanged} key={`${task.assignmentId}:${task.key}`} />)}
    {rollTasks.map((task) => <RollTask roomId={roomId} characterId={characterId} task={task} onChanged={onChanged} key={`${task.assignmentId}:${task.key}`} />)}
    {noticeTasks.map((task) => <NoticeTask task={task} key={`${task.assignmentId}:${task.key}`} />)}
  </aside>
}
