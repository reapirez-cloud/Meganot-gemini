import { useMemo, useState } from "react"

import type {
  AbilityKey,
  ResolvedCharacterContract,
} from "../../character-engine/index.ts"
import type {
  CharacterSheet,
  CharacterSpell,
  CharacterSpellOption,
} from "../../types/characterSheet.ts"
import SpellSlotMeter from "./SpellSlotMeter.tsx"
import { spellSlotResources } from "./spellSlots.ts"

type SpellMode = "prepared" | "known"

type Props = {
  sheet: CharacterSheet
  contract: ResolvedCharacterContract
  spellcastingAbility?: AbilityKey
  spells: CharacterSpell[]
  /** Legacy catalog-option projection. Kept in the prop contract during migration, never authored here. */
  options: CharacterSpellOption[]
  canManage: boolean
  canChooseSpells: boolean
  selectedLevel: number | null
  actionId: string | null
  error: string
  onSelectedLevelChange: (level: number | null) => void
  onOpenReference: () => void
  onEditResources: () => void
  onEnableMagic: () => void
  onDisableMagic: () => void
  /** Legacy callbacks stay accepted so old profile shells remain source-compatible. */
  onAddOption: () => void
  onEditOption: (option: CharacterSpellOption) => void
  onLearn: (option: CharacterSpellOption) => void
  onTogglePrepared: (spell: CharacterSpell) => void
  onForget: (spell: CharacterSpell) => void
  onEditSpell: (spell: CharacterSpell) => void
}

const abilityNames: Record<AbilityKey, string> = {
  strength: "Сила",
  dexterity: "Ловкость",
  constitution: "Телосложение",
  intelligence: "Интеллект",
  wisdom: "Мудрость",
  charisma: "Харизма",
}

function signed(value: number) {
  return value >= 0 ? `+${value}` : String(value)
}

function levelName(level: number) {
  return level === 0 ? "Заговор" : `${level} уровень`
}

function spellMeta(spell: CharacterSpell) {
  return [spell.school, spell.casting_time, spell.spell_range]
    .filter(Boolean)
    .join(" · ") || "Параметры не указаны"
}

export default function CharacterSpellbook(props: Props) {
  const {
    sheet,
    contract,
    spellcastingAbility,
    spells,
    canManage,
    canChooseSpells,
    selectedLevel,
    actionId,
    error,
    onSelectedLevelChange,
    onOpenReference,
    onEditResources,
    onEnableMagic,
    onDisableMagic,
    onTogglePrepared,
    onForget,
  } = props

  const [mode, setMode] = useState<SpellMode>(
    spells.some((spell) => spell.prepared) ? "prepared" : "known",
  )
  const [selectedSpell, setSelectedSpell] = useState<CharacterSpell | null>(null)

  const magic = spellcastingAbility
    ? contract.spellcasting.byAbility[spellcastingAbility]
    : null
  const preparedCount = spells.filter((spell) => spell.prepared).length
  const levels = useMemo(() => {
    const values = new Set<number>()
    for (const spell of spells) values.add(spell.spell_level)
    for (const slot of spellSlotResources(contract.resources)) values.add(slot.level)
    return [...values].sort((left, right) => left - right)
  }, [contract.resources, spells])

  const visibleSpells = spells.filter((spell) =>
    (mode !== "prepared" || spell.prepared) &&
    (selectedLevel === null || spell.spell_level === selectedLevel),
  )

  if (!sheet.spellcasting_enabled) {
    return (
      <section className="spellbook-v3 spellbook-v3--empty">
        <div className="spellbook-v3__empty-card">
          <span aria-hidden="true">✦</span>
          <h3>Магия не открыта</h3>
          <p>Раздел появится у персонажа, когда ГМ включит заклинания.</p>
          {canManage && <button type="button" onClick={onEnableMagic}>Включить магию</button>}
        </div>
      </section>
    )
  }

  return (
    <section className="spellbook-v3">
      <header className="spellbook-v3__hero">
        <div className="spellbook-v3__hero-copy">
          <span>Книга заклинаний</span>
          <h3>{preparedCount} подготовлено · {spells.length} изучено</h3>
          <p>Заклинания персонажа всегда ссылаются на общий каталог. Здесь меняется только его личный выбор и подготовка.</p>
        </div>
        <button className="spellbook-v3__reference" type="button" onClick={onOpenReference}>
          <span aria-hidden="true">⌘</span>
          Справочник
        </button>
      </header>

      {(magic || spellcastingAbility) && (
        <div className="spellbook-v3__casting">
          <div><span>Характеристика</span><strong>{spellcastingAbility ? abilityNames[spellcastingAbility] : "—"}</strong></div>
          <div><span>СЛ</span><strong>{magic?.saveDc ?? "—"}</strong></div>
          <div><span>Атака</span><strong>{magic ? signed(magic.attackBonus) : "—"}</strong></div>
        </div>
      )}

      <div className="spellbook-v3__slots">
        <div className="sheet-v3__section-heading">
          <div><span>Магический ресурс</span><h3>Ячейки заклинаний</h3></div>
          {canManage && <button type="button" onClick={onEditResources}>Настроить</button>}
        </div>
        <SpellSlotMeter
          resources={contract.resources}
          selectedLevel={selectedLevel}
          onSelect={(level) => onSelectedLevelChange(selectedLevel === level ? null : level)}
        />
      </div>

      <div className="spellbook-v3__mode" role="tablist" aria-label="Раздел заклинаний">
        <button type="button" role="tab" aria-selected={mode === "prepared"} className={mode === "prepared" ? "is-active" : ""} onClick={() => setMode("prepared")}>Подготовлено <span>{preparedCount}</span></button>
        <button type="button" role="tab" aria-selected={mode === "known"} className={mode === "known" ? "is-active" : ""} onClick={() => setMode("known")}>Изучено <span>{spells.length}</span></button>
      </div>

      <div className="spellbook-v3__levels" aria-label="Фильтр по уровню">
        <button type="button" className={selectedLevel === null ? "is-active" : ""} onClick={() => onSelectedLevelChange(null)}>Все</button>
        {levels.map((level) => (
          <button type="button" key={level} className={selectedLevel === level ? "is-active" : ""} onClick={() => onSelectedLevelChange(level)}>
            {level === 0 ? "Заговоры" : level}
          </button>
        ))}
      </div>

      {error && <div className="auth-error">{error}</div>}

      <div className="spellbook-v3__list">
        {visibleSpells.map((spell) => (
          <article className="spellbook-v3__spell" key={spell.id}>
            <button className="spellbook-v3__spell-main" type="button" onClick={() => setSelectedSpell(spell)}>
              <span className="spellbook-v3__level-rune">{spell.spell_level === 0 ? "∞" : spell.spell_level}</span>
              <span className="spellbook-v3__spell-copy">
                <strong>{spell.name}</strong>
                <small>{spellMeta(spell)}</small>
              </span>
              <span className="spellbook-v3__chevron" aria-hidden="true">›</span>
            </button>
            <div className="spellbook-v3__spell-actions">
              {canChooseSpells ? (
                <button
                  type="button"
                  className={spell.prepared ? "spellbook-v3__prepare is-prepared" : "spellbook-v3__prepare"}
                  aria-pressed={spell.prepared}
                  disabled={actionId === `prepare:${spell.id}`}
                  onClick={() => onTogglePrepared(spell)}
                >
                  <span aria-hidden="true">{spell.prepared ? "◆" : "◇"}</span>
                  {spell.prepared ? "Подготовлено" : "Подготовить"}
                </button>
              ) : spell.prepared ? (
                <span className="spellbook-v3__prepared-label">◆ Подготовлено</span>
              ) : <span />}
            </div>
          </article>
        ))}
        {visibleSpells.length === 0 && (
          <div className="spellbook-v3__empty-list">
            <strong>{mode === "prepared" ? "Нет подготовленных заклинаний" : "Список пуст"}</strong>
            <span>{selectedLevel === null ? "Добавить заклинание можно только из Справочника." : "На этом уровне ничего не найдено."}</span>
          </div>
        )}
      </div>

      <button className="spellbook-v3__add-option" type="button" onClick={onOpenReference}>
        + Добавить из Справочника
      </button>

      {!canManage && (
        <div className="spellbook-v3__access-note">
          <span className={sheet.spell_change_unlocked ? "is-open" : ""} aria-hidden="true" />
          <div>
            <strong>{sheet.spell_change_unlocked ? "Смена заклинаний открыта" : "Смена заклинаний закрыта"}</strong>
            <p>{sheet.spell_change_unlocked ? "Можно менять подготовку и добавлять разрешённые заклинания из каталога." : "Заклинания можно просматривать, но изменять выбор пока нельзя."}</p>
          </div>
        </div>
      )}

      {canManage && (
        <button className="spellbook-v3__disable" type="button" onClick={onDisableMagic}>Отключить магию у персонажа</button>
      )}

      {selectedSpell && (
        <div className="sheet-backdrop sheet-backdrop--spell" onMouseDown={() => setSelectedSpell(null)}>
          <article className="bottom-sheet spell-detail-v3" onMouseDown={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <header className="spell-detail-v3__head">
              <div>
                <span>{levelName(selectedSpell.spell_level)}</span>
                <h3>{selectedSpell.name}</h3>
              </div>
              <button type="button" onClick={() => setSelectedSpell(null)} aria-label="Закрыть">×</button>
            </header>
            <div className="spell-detail-v3__facts">
              {selectedSpell.school && <div><span>Школа</span><strong>{selectedSpell.school}</strong></div>}
              {selectedSpell.casting_time && <div><span>Накладывание</span><strong>{selectedSpell.casting_time}</strong></div>}
              {selectedSpell.spell_range && <div><span>Дистанция</span><strong>{selectedSpell.spell_range}</strong></div>}
              {selectedSpell.duration && <div><span>Длительность</span><strong>{selectedSpell.duration}</strong></div>}
            </div>
            <div className="spell-detail-v3__tags">
              {selectedSpell.concentration && <span>Концентрация</span>}
              {selectedSpell.ritual && <span>Ритуал</span>}
              {selectedSpell.components && <span>{selectedSpell.components}</span>}
            </div>
            {selectedSpell.description ? <p>{selectedSpell.description}</p> : <p className="spell-detail-v3__muted">Описание приходит из общего каталога.</p>}
            {selectedSpell.source && <small>Источник: {selectedSpell.source}</small>}
            <div className="spell-detail-v3__actions">
              {canChooseSpells && (
                <button type="button" className="spell-detail-v3__primary" onClick={() => onTogglePrepared(selectedSpell)}>
                  {selectedSpell.prepared ? "Убрать подготовку" : "Подготовить"}
                </button>
              )}
              {canChooseSpells && (
                <button type="button" className="spell-detail-v3__danger" onClick={() => onForget(selectedSpell)}>Убрать из изученных</button>
              )}
            </div>
          </article>
        </div>
      )}
    </section>
  )
}
