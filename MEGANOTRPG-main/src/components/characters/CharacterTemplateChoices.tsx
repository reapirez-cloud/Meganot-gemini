import { useEffect, useMemo, useState } from "react"
import { useAuth } from "../../context/AuthContext.tsx"
import { useCharacters } from "../../context/CharacterContext.tsx"
import { commitCharacterTemplateChoice } from "../../lib/templateChoiceRuntime.ts"
import {
  registeredCharacterTemplateBundles,
  subscribeCharacterTemplateBundles,
} from "../../rule-templates/registry.ts"
import {
  resolveTemplateChoiceStates,
  type TemplateChoiceOptionState,
  type TemplateChoiceState,
} from "../../rule-templates/choiceState.ts"
import "./CharacterTemplateChoices.css"

function optionMatches(option: TemplateChoiceOptionState, query: string) {
  const wanted = query.trim().toLocaleLowerCase("ru-RU")
  if (!wanted) return true
  return `${option.label} ${option.key}`.toLocaleLowerCase("ru-RU").includes(wanted)
}

function ChoiceCard({
  key,
  characterId,
  state,
  canChoose,
}: {
  key?: string | number
  characterId: string
  state: TemplateChoiceState
  canChoose: boolean
}) {
  const [draft, setDraft] = useState<string[]>(state.selected)
  const [query, setQuery] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    setDraft(state.selected)
    setError("")
  }, [state.selected, state.required])

  const fixed = new Set(state.selected)
  const searchable = state.options.length > 8
  const available = state.options.filter((option) => option.available)
  const visible = available.filter((option) => optionMatches(option, query))
  const complete = draft.length === state.required

  function toggle(option: TemplateChoiceOptionState) {
    if (!canChoose || fixed.has(option.key) || !option.available) return
    setError("")
    setDraft((current) => {
      if (current.includes(option.key)) return current.filter((key) => key !== option.key)
      if (state.required === 1 && fixed.size === 0) return [option.key]
      if (current.length >= state.required) return current
      return [...current, option.key]
    })
  }

  async function confirm() {
    if (!canChoose || busy || !complete) return
    setBusy(true)
    setError("")
    const result = await commitCharacterTemplateChoice(characterId, state.assignmentId, state.key, draft)
    setBusy(false)
    if (!result.ok) setError((result as any).error || "Error")
  }

  if (state.status === "locked") {
    const selected = state.options.filter((option) => option.selected)
    const showAll = state.options.length <= 8
    return (
      <article className="template-choice-card is-locked">
        <header className="template-choice-card__head">
          <div>
            <small>{state.sourceName} · {state.sourceLevel} ур.</small>
            <strong>{state.label}</strong>
          </div>
          <span className="template-choice-card__badge is-locked">🔒 Зафиксировано</span>
        </header>
        <div className="template-choice-card__options is-summary">
          {(showAll ? state.options : selected).map((option) => (
            <div className={`template-choice-option ${option.selected ? "is-selected" : "is-off"}`} key={option.key}>
              <span>{option.selected ? "✓" : "×"}</span>
              <strong>{option.label}</strong>
              <small>{option.selected ? "Вкл" : "Выкл"}</small>
            </div>
          ))}
          {!showAll && <div className="template-choice-option is-off is-aggregate"><span>×</span><strong>Остальные варианты</strong><small>Выкл · {Math.max(0, state.options.length - selected.length)}</small></div>}
        </div>
      </article>
    )
  }

  return (
    <article className="template-choice-card is-pending">
      <header className="template-choice-card__head">
        <div>
          <small>{state.sourceName} · {state.sourceLevel} ур.</small>
          <strong>{state.label}</strong>
        </div>
        <span className="template-choice-card__badge">Нужен выбор</span>
      </header>

      <div className="template-choice-card__progress">
        <span>{state.selected.length > 0 ? `Уже зафиксировано: ${state.selected.length}` : "Пока ничего не выбрано"}</span>
        <strong>{draft.length}/{state.required}</strong>
      </div>

      {searchable && <label className="template-choice-card__search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти вариант" /></label>}

      <div className={`template-choice-card__options ${searchable ? "is-scrollable" : ""}`}>
        {visible.map((option) => {
          const selected = draft.includes(option.key)
          const locked = fixed.has(option.key)
          return (
            <button
              type="button"
              className={`template-choice-option ${selected ? "is-selected" : ""} ${locked ? "is-fixed" : ""}`}
              key={option.key}
              disabled={!canChoose || locked}
              onClick={() => toggle(option)}
            >
              <span>{selected ? "✓" : ""}</span>
              <strong>{option.label}</strong>
              <small>{locked ? "Зафиксировано" : selected ? "Выбрано" : "Выбрать"}</small>
            </button>
          )
        })}
        {visible.length === 0 && <div className="template-choice-card__empty">Подходящих вариантов нет.</div>}
      </div>

      {!canChoose && <p className="template-choice-card__notice">Этот выбор может подтвердить владелец персонажа или ГМ.</p>}
      {error && <div className="auth-error template-choice-card__error">{error}</div>}
      <div className="template-choice-card__confirm">
        <p>После подтверждения уже выбранные варианты нельзя заменить. Если позже правило даст ещё один выбор, CE попросит только добавить новый.</p>
        <button type="button" disabled={!canChoose || busy || !complete} onClick={() => void confirm()}>
          {busy ? "Фиксируем…" : "Зафиксировать выбор"}
        </button>
      </div>
    </article>
  )
}

export default function CharacterTemplateChoices({ characterId }: { characterId: string }) {
  const { user } = useAuth()
  const { characters, canManage } = useCharacters()
  const character = characters.find((item) => item.id === characterId) || null
  const [revision, setRevision] = useState(0)

  useEffect(() => subscribeCharacterTemplateBundles(characterId, () => setRevision((value) => value + 1)), [characterId])

  const states = useMemo(() => resolveTemplateChoiceStates(
    registeredCharacterTemplateBundles(characterId),
    character?.level || 1,
  ).filter((state) => state.status !== "hidden" && (state.templateKind === "class" || state.templateKind === "subclass")), [characterId, character?.level, revision])

  if (!states.length) return null

  const pending = states.filter((state) => state.status === "pending").length
  const canChoose = Boolean(canManage || (character?.assigned_user_id && character.assigned_user_id === user.id))

  return (
    <section className="character-tab-section template-choices">
      <header className="template-choices__head">
        <div>
          <span>Character Engine · решения</span>
          <h2>{pending > 0 ? "Нужно завершить выбор" : "Выборы персонажа"}</h2>
          <p>CE показывает только разрешённые правилом варианты. Постоянный выбор фиксируется на сервере и не переключается игроком после подтверждения.</p>
        </div>
        <strong className={pending > 0 ? "is-pending" : ""}>{pending > 0 ? `${pending} ждёт` : "✓ Готово"}</strong>
      </header>
      <div className="template-choices__list">
        {states.map((state) => <ChoiceCard key={state.id} characterId={characterId} state={state} canChoose={canChoose} />)}
      </div>
    </section>
  )
}
