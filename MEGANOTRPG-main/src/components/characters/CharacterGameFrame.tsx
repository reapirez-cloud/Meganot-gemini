import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { useAuth } from "../../context/AuthContext"
import { useCharacters } from "../../context/CharacterContext"
import { createEngineCommandContext } from "../../engine-contracts/index.ts"
import { CharacterRuntimeProvider, useResolvedCharacterRuntime } from "../../hooks/useResolvedCharacterRuntime"
import { useRuleTemplates } from "../../hooks/useRuleTemplates"
import { supabase } from "../../lib/supabase"
import { oracle } from "../../oracle-engine/runtime.ts"
import { choiceCountAtLevel, choiceDefinitionAvailable, choiceOptionAvailableAtLevel, resolveTemplateBundles } from "../../rule-templates/resolver"
import type { CharacterTemplateBundle, RuleChoiceDefinition, RuleTemplateKind } from "../../rule-templates/types"
import "./CharacterGameFrame.css"

type Props = { characterId: string; children: ReactNode }
type LifeState = "alive" | "dead"
type SelectedChoices = Record<string, string | string[]>
type RecoveryTrigger = "short_rest" | "long_rest" | "dawn"

const assignmentKinds: RuleTemplateKind[] = ["race", "subrace", "class", "subclass"]
const kindLabel: Record<RuleTemplateKind, string> = {
  race: "Раса",
  subrace: "Подраса",
  class: "Класс",
  subclass: "Подкласс",
}

function selectedValues(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value
  return value ? [value] : []
}

function cloneChoices(value: SelectedChoices | null | undefined): SelectedChoices {
  return Object.fromEntries(
    Object.entries(value || {}).map(([key, selected]) => [key, Array.isArray(selected) ? [...selected] : selected]),
  )
}

function choiceOptionLabel(definition: RuleChoiceDefinition, option: string) {
  return definition.option_labels?.[option] || option
}

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error && reason.message ? reason.message : fallback
}

export default function CharacterGameFrame({ characterId, children }: Props) {
  const { user } = useAuth()
  const { characters, campaignId, canManage, refresh } = useCharacters()
  const character = characters.find((item) => item.id === characterId) || null
  const sharedRuntime = useResolvedCharacterRuntime(character)
  const assigned = sharedRuntime.templates
  const runtime = sharedRuntime.resources
  const rules = useRuleTemplates(campaignId)
  const [lifeState, setLifeState] = useState<LifeState>("alive")
  const [diedAt, setDiedAt] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [kind, setKind] = useState<RuleTemplateKind>("race")
  const [templateId, setTemplateId] = useState("")
  const [templateLevel, setTemplateLevel] = useState(character?.level || 1)
  const [selectedChoices, setSelectedChoices] = useState<SelectedChoices>({})
  const [saving, setSaving] = useState(false)
  const [suppressionSaving, setSuppressionSaving] = useState("")
  const [error, setError] = useState("")

  const loadLife = useCallback(async () => {
    const { data, error: lifeError } = await supabase
      .from("characters")
      .select("life_state,died_at")
      .eq("id", characterId)
      .maybeSingle()
    if (lifeError || !data) return
    setLifeState(data.life_state === "dead" ? "dead" : "alive")
    setDiedAt(data.died_at || null)
  }, [characterId])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) void loadLife() })
    return () => { cancelled = true }
  }, [loadLife])

  const existingRace = assigned.bundles.find((item) => item.template.kind === "race") || null
  const existingSubrace = assigned.bundles.find((item) => item.template.kind === "subrace") || null
  const existingClasses = assigned.bundles.filter((item) => item.template.kind === "class")
  const existingSubclasses = assigned.bundles.filter((item) => item.template.kind === "subclass")
  const chosenTemplate = rules.templates.find((item) => item.id === templateId) || null
  const existingChosenBundle = assigned.bundles.find((item) => item.template.id === templateId) || null
  const classLevelByTemplate = useMemo(
    () => new Map(existingClasses.map((bundle) => [bundle.template.id, bundle.assignment.template_level || 1])),
    [existingClasses],
  )

  const templatesForKind = useMemo(() => rules.templates.filter((item) => {
    if (item.kind !== kind || !item.is_active) return false
    if (kind === "subrace") return Boolean(existingRace && item.parent_template_id === existingRace.template.id)
    if (kind === "subclass") {
      if (!item.parent_template_id) return false
      const parentLevel = classLevelByTemplate.get(item.parent_template_id)
      return parentLevel !== undefined && parentLevel >= (item.unlock_level || 1)
    }
    return true
  }), [classLevelByTemplate, existingRace, kind, rules.templates])

  const effectiveChoiceLevel = chosenTemplate?.kind === "class"
    ? templateLevel
    : chosenTemplate?.kind === "subclass" && chosenTemplate.parent_template_id
      ? classLevelByTemplate.get(chosenTemplate.parent_template_id) || 1
      : character?.level || 1

  const choiceDefs = useMemo(() => {
    if (!chosenTemplate) return []
    const result = [...(chosenTemplate.choices || [])]
    for (const level of rules.levels
      .filter((item) => item.template_id === chosenTemplate.id && item.level <= effectiveChoiceLevel)
      .sort((a, b) => a.level - b.level)) {
      result.push(...(level.choices || []))
    }
    return result
  }, [chosenTemplate, effectiveChoiceLevel, rules.levels])

  const visibleChoiceDefs = useMemo(
    () => choiceDefs.filter((definition) => choiceDefinitionAvailable(definition, selectedChoices)),
    [choiceDefs, selectedChoices],
  )

  const sourceResolution = useMemo(
    () => resolveTemplateBundles(assigned.bundles, character?.level || 1),
    [assigned.bundles, character?.level],
  )

  const classMechanicGroups = useMemo(() => assigned.bundles
    .filter((bundle) => bundle.template.kind === "class" || bundle.template.kind === "subclass")
    .map((bundle) => ({
      bundle,
      root: sourceResolution.sources.find((node) => node.templateId === bundle.template.id && node.nodeKind === "template") || null,
      nodes: sourceResolution.sources.filter((node) => node.templateId === bundle.template.id && node.nodeKind !== "template"),
    })), [assigned.bundles, sourceResolution.sources])

  const classBindings = useMemo(() => existingClasses.map((classBundle) => {
    const level = classBundle.assignment.template_level || 1
    const subclassBundle = existingSubclasses.find((bundle) => bundle.template.parent_template_id === classBundle.template.id) || null
    const subclassUnlock = subclassBundle?.template.unlock_level || Math.min(
      ...rules.templates
        .filter((template) => template.kind === "subclass" && template.parent_template_id === classBundle.template.id)
        .map((template) => template.unlock_level || 1),
      Number.POSITIVE_INFINITY,
    )
    return {
      classBundle,
      subclassBundle,
      level,
      subclassUnlock: Number.isFinite(subclassUnlock) ? subclassUnlock : null,
      subclassActive: Boolean(subclassBundle && level >= (subclassBundle.template.unlock_level || 1)),
    }
  }), [existingClasses, existingSubclasses, rules.templates])

  const chosenSubclassParent = chosenTemplate?.kind === "subclass" && chosenTemplate.parent_template_id
    ? existingClasses.find((bundle) => bundle.template.id === chosenTemplate.parent_template_id) || null
    : null

  function chooseKind(next: RuleTemplateKind) {
    setKind(next)
    setTemplateId("")
    setSelectedChoices({})
  }

  function chooseTemplate(id: string) {
    setTemplateId(id)
    const next = rules.templates.find((item) => item.id === id)
    const existing = assigned.bundles.find((item) => item.template.id === id)
    setSelectedChoices(cloneChoices(existing?.assignment.selected_choices))
    setKind(next?.kind || kind)
    if (next?.kind === "class") {
      setTemplateLevel(existing?.assignment.template_level || character?.level || 1)
    }
  }

  function beginClassBinding(bundle?: CharacterTemplateBundle | null) {
    if (bundle) {
      chooseTemplate(bundle.template.id)
      return
    }
    chooseKind("class")
    setTemplateLevel(1)
  }

  function beginSubclassBinding(bundle?: CharacterTemplateBundle | null) {
    if (bundle) {
      chooseTemplate(bundle.template.id)
      return
    }
    chooseKind("subclass")
  }

  function toggleChoice(definition: RuleChoiceDefinition, option: string) {
    const required = choiceCountAtLevel(definition, effectiveChoiceLevel)
    if (required === 1) {
      setSelectedChoices((current) => ({ ...current, [definition.key]: option }))
      return
    }
    setSelectedChoices((current) => {
      const previous = selectedValues(current[definition.key])
      const exists = previous.includes(option)
      const next = exists
        ? previous.filter((item) => item !== option)
        : previous.length < required
          ? [...previous, option]
          : [...previous.slice(1), option]
      return { ...current, [definition.key]: next }
    })
  }

  async function assignTemplate() {
    if (!chosenTemplate || !character || !campaignId || !canManage) return
    const selectedLevel = chosenTemplate.kind === "class" ? Math.max(1, Math.min(30, templateLevel)) : null
    const nextChoices = {
      ...cloneChoices(existingChosenBundle?.assignment.selected_choices),
      ...cloneChoices(selectedChoices),
    }

    setSaving(true)
    setError("")
    try {
      await oracle.characters.assignTemplate(
        createEngineCommandContext({
          campaignId,
          requestedBy: user.id,
          authority: "gm",
          actorCharacterId: characterId,
        }),
        characterId,
        {
          templateId: chosenTemplate.id,
          templateLevel: selectedLevel,
          selectedChoices: nextChoices,
        },
      )
      setTemplateId("")
      setSelectedChoices({})
      await Promise.all([assigned.reload(), refresh()])
    } catch (reason) {
      setError(errorMessage(reason, "Oracle не смог назначить шаблон персонажу."))
    } finally {
      setSaving(false)
    }
  }

  async function removeAssignment(assignmentId: string) {
    if (!campaignId || !canManage) return
    setSaving(true)
    setError("")
    try {
      await oracle.characters.removeTemplateAssignment(
        createEngineCommandContext({
          campaignId,
          requestedBy: user.id,
          authority: "gm",
          actorCharacterId: characterId,
        }),
        characterId,
        assignmentId,
      )
      await Promise.all([assigned.reload(), refresh()])
    } catch (reason) {
      setError(errorMessage(reason, "Oracle не смог снять шаблон с персонажа."))
    } finally {
      setSaving(false)
    }
  }

  async function toggleSource(sourceId: string) {
    if (!sourceId || suppressionSaving) return
    const currentlySuppressed = assigned.suppressions.sourceIds.has(sourceId)
    setSuppressionSaving(sourceId)
    setError("")
    const result = await assigned.suppressions.setSuppressed(sourceId, !currentlySuppressed)
    setSuppressionSaving("")
    if (!result.ok) setError(result.error)
  }

  async function changeLife(next: LifeState) {
    if (!canManage || !campaignId) return
    setSaving(true)
    setError("")
    try {
      await oracle.characters.setLifeState(
        createEngineCommandContext({
          campaignId,
          requestedBy: user.id,
          authority: "gm",
          actorCharacterId: characterId,
        }),
        characterId,
        next,
      )
      await Promise.all([loadLife(), refresh()])
    } catch (reason) {
      setError(errorMessage(reason, "Oracle не смог изменить состояние персонажа."))
    } finally {
      setSaving(false)
    }
  }

  async function recover(trigger: RecoveryTrigger) {
    if (!canManage || !campaignId) return
    setSaving(true)
    setError("")
    try {
      await oracle.characters.recover(
        createEngineCommandContext({
          campaignId,
          requestedBy: user.id,
          authority: "gm",
          actorCharacterId: characterId,
        }),
        characterId,
        trigger,
      )
      await runtime.reload()
    } catch (reason) {
      setError(errorMessage(reason, "Oracle не смог выполнить восстановление персонажа."))
    } finally {
      setSaving(false)
    }
  }

  const assignedSummary = useMemo(() => [
    existingRace?.template.name,
    existingSubrace?.template.name,
    ...existingClasses.flatMap((entry) => [
      entry.template.name,
      ...existingSubclasses
        .filter((sub) => sub.template.parent_template_id === entry.template.id)
        .map((sub) => sub.template.name),
    ]),
  ].filter(Boolean).join(" · "), [existingClasses, existingRace, existingSubclasses, existingSubrace])

  const ancestryItems = [existingRace, existingSubrace]
    .filter((item): item is CharacterTemplateBundle => Boolean(item))

  return <CharacterRuntimeProvider value={sharedRuntime}><div className={`character-game-frame ${lifeState === "dead" ? "is-dead" : ""}`}>
    {children}
    {lifeState === "dead" && <div className="character-death-ribbon">
      <span>†</span>
      <div>
        <strong>Мёртв</strong>
        <small>{diedAt ? `С ${new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(diedAt))}` : "История персонажа закрыта для действий"}</small>
      </div>
    </div>}

    {canManage && <button type="button" className="character-game-admin-button" onClick={() => setSheetOpen(true)}>
      <span>◇</span>
      <span>
        <small>Игровые правила</small>
        <strong>{assignedSummary || "Шаблоны и статус"}</strong>
      </span>
    </button>}

    {sheetOpen && <div className="soft-sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSheetOpen(false) }}>
      <section className="soft-sheet character-game-admin-sheet">
        <div className="soft-sheet__handle"/>
        <header className="soft-sheet__header">
          <div><small>Персонаж</small><h2>{character?.name || "Игровые правила"}</h2></div>
          <button type="button" className="soft-sheet__close" onClick={() => setSheetOpen(false)}>×</button>
        </header>

        <section className="character-admin-section">
          <div className="character-admin-section__head">
            <div><small>Статус</small><h3>Состояние персонажа</h3></div>
            <span className={`life-pill life-pill--${lifeState}`}>{lifeState === "dead" ? "Мёртв" : "Жив"}</span>
          </div>
          <div className="life-actions">
            <button type="button" className={lifeState === "alive" ? "is-active" : ""} disabled={saving} onClick={() => void changeLife("alive")}>Жив</button>
            <button type="button" className={lifeState === "dead" ? "is-danger is-active" : "is-danger"} disabled={saving} onClick={() => void changeLife("dead")}>† Мёртв</button>
          </div>
          <p>Смерть автоматически закрывает персональный чат для действий и снимает персонажа с активного статуса.</p>
        </section>

        <section className="character-admin-section">
          <div className="character-admin-section__head">
            <div><small>Ресурсы</small><h3>Отдых и восстановление</h3></div>
            <span className="life-pill">{runtime.rows.length} ресурсов</span>
          </div>
          <div className="resource-recovery-grid">
            <button type="button" disabled={saving} onClick={() => void recover("short_rest")}>◷ Короткий отдых</button>
            <button type="button" disabled={saving} onClick={() => void recover("long_rest")}>☾ Долгий отдых</button>
            <button type="button" disabled={saving} onClick={() => void recover("dawn")}>☀ Рассвет</button>
          </div>
          <p>Каждый запас восстанавливается по правилам своей способности. Долгий отдых также возвращает HP и ячейки заклинаний.</p>
        </section>

        <section className="character-admin-section class-binding-control">
          <div className="character-admin-section__head">
            <div><small>Character Engine</small><h3>Класс персонажа</h3></div>
            <span className="life-pill">{character?.level || 1} общий ур.</span>
          </div>
          <p>Класс и подкласс — отдельные источники механик CE. Здесь они связаны визуально и общим уровнем родительского класса.</p>
          <div className="class-binding-list">
            {classBindings.map(({ classBundle, subclassBundle, level, subclassUnlock, subclassActive }) => <article className="class-binding-card" key={classBundle.assignment.id}>
              <div className="class-binding-node class-binding-node--class">
                <span className="class-binding-node__icon">◇</span>
                <span className="class-binding-node__copy">
                  <small>Класс · {level} ур. · CE подключён</small>
                  <strong>{classBundle.template.name}</strong>
                </span>
                <button type="button" disabled={saving} onClick={() => beginClassBinding(classBundle)} aria-label={`Изменить ${classBundle.template.name}`}>✎</button>
              </div>
              <div className={`class-binding-node class-binding-node--subclass ${subclassBundle && !subclassActive ? "is-locked" : ""}`}>
                <span className="class-binding-node__icon">✦</span>
                <span className="class-binding-node__copy">
                  <small>{subclassBundle ? subclassActive ? `Подкласс · ${level} ур. · CE подключён` : `Подкласс · ждёт ${subclassBundle.template.unlock_level || 1} ур.` : subclassUnlock ? level >= subclassUnlock ? "Подкласс · можно выбрать" : `Подкласс · откроется с ${subclassUnlock} ур.` : "Подкласс · доступных нет"}</small>
                  <strong>{subclassBundle?.template.name || "Не выбран"}</strong>
                </span>
                {(subclassBundle || (subclassUnlock && level >= subclassUnlock)) && <button type="button" disabled={saving} onClick={() => beginSubclassBinding(subclassBundle)} aria-label={subclassBundle ? `Изменить ${subclassBundle.template.name}` : `Выбрать подкласс для ${classBundle.template.name}`}>{subclassBundle ? "✎" : "+"}</button>}
              </div>
            </article>)}
            {!classBindings.length && <button type="button" className="class-binding-empty" onClick={() => beginClassBinding()}>
              <span>◇</span><span><strong>Привязать класс к листу</strong><small>Уровень, способности и ресурсы пойдут в Character Engine</small></span><i>＋</i>
            </button>}
          </div>
          {classBindings.length > 0 && <button type="button" className="class-binding-add" onClick={() => beginClassBinding()}>＋ Добавить ещё класс</button>}
        </section>

        {ancestryItems.length > 0 && <section className="character-admin-section">
          <div className="character-admin-section__head"><div><small>Происхождение</small><h3>Раса и подраса</h3></div></div>
          <div className="assigned-template-list">
            {ancestryItems.map((bundle) => <div className="assigned-template assigned-template--editable" key={bundle.assignment.id}>
              <span className="assigned-template__icon">◈</span>
              <span>
                <small>{kindLabel[bundle.template.kind]}</small>
                <strong>{bundle.template.name}</strong>
              </span>
              <button type="button" className="assigned-template__edit" disabled={saving} onClick={() => chooseTemplate(bundle.template.id)} aria-label={`Изменить ${bundle.template.name}`}>✎</button>
              <button type="button" disabled={saving} onClick={() => void removeAssignment(bundle.assignment.id)} aria-label={`Удалить ${bundle.template.name}`}>×</button>
            </div>)}
          </div>
        </section>}

        {classMechanicGroups.length > 0 && <section className="character-admin-section class-mechanics-control">
          <div className="character-admin-section__head">
            <div><small>Точная настройка</small><h3>Механики класса</h3></div>
            <span className="life-pill">{assigned.suppressions.sourceIds.size} выкл.</span>
          </div>
          <p>Выключение хранится у персонажа отдельно. Повышение уровня не включит способность обратно само.</p>
          <div className="class-mechanics-groups">
            {classMechanicGroups.map(({ bundle, root, nodes }) => {
              const rootSuppressed = Boolean(root && assigned.suppressions.sourceIds.has(root.id))
              const effectiveLevel = bundle.template.kind === "class"
                ? bundle.assignment.template_level || character?.level || 1
                : classLevelByTemplate.get(bundle.template.parent_template_id || "") || character?.level || 1
              const lockedByLevel = bundle.template.kind === "subclass" && effectiveLevel < (bundle.template.unlock_level || 1)
              return <details className={`class-mechanics-group ${rootSuppressed ? "is-suppressed" : ""} ${lockedByLevel ? "is-level-locked" : ""}`} key={bundle.assignment.id}>
                <summary>
                  <span className="class-mechanics-group__icon">{bundle.template.kind === "class" ? "◇" : "✦"}</span>
                  <span><small>{kindLabel[bundle.template.kind]} · {effectiveLevel} ур.{lockedByLevel ? ` · откроется с ${bundle.template.unlock_level || 1}` : ""}</small><strong>{bundle.template.name}</strong></span>
                  <span className="class-mechanics-group__count">{nodes.length}</span>
                </summary>
                <div className="class-mechanics-group__body">
                  {root && <div className="class-source-row class-source-row--root">
                    <span><small>{lockedByLevel ? "Ветка ждёт уровень" : "Вся ветка"}</small><strong>{bundle.template.name}</strong></span>
                    <button
                      type="button"
                      className={rootSuppressed ? "is-off" : "is-on"}
                      disabled={lockedByLevel || Boolean(suppressionSaving)}
                      aria-pressed={!rootSuppressed}
                      onClick={() => void toggleSource(root.id)}
                    >{lockedByLevel ? "Неактивен" : suppressionSaving === root.id ? "…" : rootSuppressed ? "Выкл" : "Вкл"}</button>
                  </div>}
                  <div className="class-source-list">
                    {nodes.map((node) => {
                      const ownSuppressed = assigned.suppressions.sourceIds.has(node.id)
                      const effectiveSuppressed = rootSuppressed || ownSuppressed
                      return <div className={`class-source-row ${effectiveSuppressed ? "is-suppressed" : ""}`} key={node.id}>
                        <span>
                          <small>{node.nodeKind === "choice" ? "Выбор" : node.unlockLevel > 1 ? `${node.unlockLevel} уровень` : "Базовая механика"}</small>
                          <strong>{node.name}</strong>
                        </span>
                        <button
                          type="button"
                          className={effectiveSuppressed ? "is-off" : "is-on"}
                          disabled={rootSuppressed || Boolean(suppressionSaving)}
                          aria-pressed={!effectiveSuppressed}
                          onClick={() => void toggleSource(node.id)}
                        >{suppressionSaving === node.id ? "…" : rootSuppressed ? "Ветка выкл" : ownSuppressed ? "Выкл" : "Вкл"}</button>
                      </div>
                    })}
                    {!nodes.length && <div className="template-assignment-empty">{lockedByLevel ? `Способности появятся в CE на ${bundle.template.unlock_level || 1} уровне родительского класса.` : "У этого шаблона пока нет отдельных автоматических механик."}</div>}
                  </div>
                </div>
              </details>
            })}
          </div>
        </section>}

        <section className="character-admin-section template-binding-editor">
          <div className="character-admin-section__head"><div><small>Назначение</small><h3>{kind === "class" ? "Привязать класс к листу" : kind === "subclass" ? "Привязать подкласс" : "Раса, класс и специализация"}</h3></div></div>
          <div className="template-kind-switch template-kind-switch--four">
            {assignmentKinds.map((entry) => <button type="button" key={entry} className={kind === entry ? "is-active" : ""} onClick={() => chooseKind(entry)}>{kindLabel[entry]}</button>)}
          </div>
          <select className="app-select" value={templateId} onChange={(event) => chooseTemplate(event.target.value)}>
            <option value="">{kind === "class" ? "Выберите класс" : kind === "subclass" ? "Выберите подкласс" : "Выберите шаблон"}</option>
            {templatesForKind.map((template) => {
              const parent = template.kind === "subclass" && template.parent_template_id
                ? existingClasses.find((bundle) => bundle.template.id === template.parent_template_id)
                : null
              return <option key={template.id} value={template.id}>{parent ? `${parent.template.name} · ${template.name}` : template.name}</option>
            })}
          </select>
          {kind === "class" && chosenTemplate && <div className="class-level-editor">
            <span><strong>Уровень класса</strong><small>Этот уровень определяет способности класса и его подкласса. Общий уровень персонажа пересчитается автоматически.</small></span>
            <div>
              <button type="button" onClick={() => setTemplateLevel((value) => Math.max(1, value - 1))} aria-label="Уменьшить уровень">−</button>
              <input className="app-input" type="number" min="1" max="30" value={templateLevel} onChange={(event) => setTemplateLevel(Math.max(1, Math.min(30, Number(event.target.value) || 1)))}/>
              <button type="button" onClick={() => setTemplateLevel((value) => Math.min(30, value + 1))} aria-label="Увеличить уровень">＋</button>
            </div>
          </div>}
          {kind === "subclass" && chosenSubclassParent && <div className="subclass-parent-link">
            <span>◇</span><span><small>Родительский класс · уровень приходит отсюда</small><strong>{chosenSubclassParent.template.name} · {chosenSubclassParent.assignment.template_level || 1} ур.</strong></span><i>→</i><span className="subclass-parent-link__child">✦</span>
          </div>}
          {(kind === "subrace" && !existingRace) && <div className="template-assignment-empty">Сначала назначьте расу.</div>}
          {(kind === "subclass" && !existingClasses.length) && <div className="template-assignment-empty">Сначала привяжите класс и задайте ему нужный уровень.</div>}
          {(kind === "subclass" && existingClasses.length > 0 && templatesForKind.length === 0) && <div className="template-assignment-empty">У назначенных классов пока не достигнут уровень открытия подкласса.</div>}
          {visibleChoiceDefs.length > 0 && <div className="template-choice-fields">
            <div className="template-choice-note"><span>◇</span><p><strong>Выбор можно оставить на потом</strong><small>Нерешённый вариант ничего не выдаёт и не мешает назначить класс. Уже сделанный выбор сохраняется при повышении уровня.</small></p></div>
            {visibleChoiceDefs.map((choice) => {
              const required = choiceCountAtLevel(choice, effectiveChoiceLevel)
              const selected = selectedValues(selectedChoices[choice.key])
              const availableOptions = choice.options.filter((option) => choiceOptionAvailableAtLevel(choice, option, effectiveChoiceLevel))
              return <div className="template-choice-field" key={choice.key}>
                <span>{choice.label}{required > 1 ? ` · ${selected.length}/${required}` : ""}</span>
                {required === 1
                  ? <select className="app-select" value={selected[0] || ""} onChange={(event) => toggleChoice(choice, event.target.value)}>
                      <option value="">Не выбрано</option>
                      {availableOptions.map((option) => <option key={option} value={option}>{choiceOptionLabel(choice, option)}</option>)}
                    </select>
                  : <div className="template-choice-chips">{availableOptions.map((option) => <button type="button" key={option} className={selected.includes(option) ? "is-active" : ""} onClick={() => toggleChoice(choice, option)}>{selected.includes(option) ? "✓ " : ""}{choiceOptionLabel(choice, option)}</button>)}</div>}
              </div>
            })}
          </div>}
          <button className="template-assign-button" type="button" disabled={!chosenTemplate || saving} onClick={() => void assignTemplate()}>
            {saving ? "Сохраняем…" : existingChosenBundle ? "Сохранить изменения" : kind === "class" ? "Привязать класс к листу CE" : kind === "subclass" ? "Привязать подкласс к классу" : "Назначить шаблон"}
          </button>
        </section>

        {(error || assigned.error || rules.error || runtime.error) && <div className="sheet-error">{error || assigned.error || rules.error || runtime.error}</div>}
      </section>
    </div>}
  </div></CharacterRuntimeProvider>
}
