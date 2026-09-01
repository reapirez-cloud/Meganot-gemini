import { useCallback, useEffect, useMemo, useState } from "react"
import type { FormEvent } from "react"
import InventoryItemEditor from "../characters/InventoryItemEditor"
import ContextActionSheet from "../common/ContextActionSheet"
import type { ContextAction } from "../common/ContextActionSheet"
import { useAuth } from "../../context/AuthContext"
import { useCharacters } from "../../context/CharacterContext"
import { createEngineCommandContext } from "../../engine-contracts/index.ts"
import { categoryLabel, categoryOrder, equipmentSlots, inventoryCategories } from "../../lib/dndInventory"
import { oracle } from "../../oracle-engine/runtime.ts"
import { chasovoy } from "../../reference-engine/runtime.ts"
import { normalizeDefinitionSlug } from "../../reference-engine/index.ts"
import type { ChasovoyDefinition, ChasovoyJson } from "../../reference-engine/index.ts"
import type { StoredMechanics } from "../../types/characterMechanics"
import type { EquipmentSlot, InventoryCategory, InventoryInput, InventoryItem, ItemUsageMode } from "../../types/characterSheet"

type ItemFilter = "all" | "equipment" | "consumable" | "other"

type Props = {
  onError?: (message: string) => void
}

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback
}

function readCategory(value: ChasovoyJson | undefined): InventoryCategory {
  if (typeof value === "string" && inventoryCategories.some((option) => option.value === value)) return value as InventoryCategory
  return "other"
}

function readSlot(value: ChasovoyJson | undefined): EquipmentSlot | null {
  if (typeof value === "string" && equipmentSlots.some((option) => option.value === value)) return value as EquipmentSlot
  return null
}

function readNumber(value: ChasovoyJson | undefined, fallback: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function readString(value: ChasovoyJson | undefined): string | null {
  return typeof value === "string" && value.trim() ? value : null
}

function readUsageMode(value: ChasovoyJson | undefined): ItemUsageMode {
  return value === "quantity" || value === "charges" ? value : "none"
}

function readItemState(value: ChasovoyJson | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function definitionToItem(definition: ChasovoyDefinition): InventoryItem {
  const data = definition.data
  const category = readCategory(data.category)
  return {
    id: definition.id,
    character_id: "",
    name: definition.name,
    quantity: Math.max(1, readNumber(data.quantity, 1) || 1),
    weight: readNumber(data.weight, null),
    equipped: false,
    category,
    equipment_slot: category === "equipment" ? readSlot(data.equipment_slot) : null,
    image_url: readString(data.image_url),
    description: definition.rulesText || definition.summary,
    mechanics: Array.isArray(definition.mechanics) ? definition.mechanics as unknown as StoredMechanics : [],
    usage_mode: readUsageMode(data.usage_mode),
    charges_current: readNumber(data.charges_current, null),
    charges_max: readNumber(data.charges_max, null),
    item_state: readItemState(data.item_state),
    version: definition.revision,
    sort_order: 0,
    created_at: definition.createdAt,
    updated_at: definition.updatedAt,
  }
}

function definitionData(input: InventoryInput): Record<string, ChasovoyJson> {
  return {
    quantity: Math.max(1, input.quantity || 1),
    weight: input.weight,
    category: input.category,
    equipment_slot: input.category === "equipment" ? input.equipment_slot : null,
    image_url: input.image_url,
    usage_mode: input.usage_mode || "none",
    charges_current: input.charges_current ?? null,
    charges_max: input.charges_max ?? null,
    item_state: (input.item_state || {}) as unknown as ChasovoyJson,
  }
}

function itemFilterMatches(category: InventoryCategory, filter: ItemFilter) {
  if (filter === "all") return true
  if (filter === "other") return category !== "equipment" && category !== "consumable"
  return category === filter
}

export default function GmItemLibrary({ onError }: Props) {
  const { user } = useAuth()
  const { campaignId, characters } = useCharacters()
  const [definitions, setDefinitions] = useState<ChasovoyDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<ItemFilter>("all")
  const [editor, setEditor] = useState<ChasovoyDefinition | "new" | null>(null)
  const [menuTarget, setMenuTarget] = useState<ChasovoyDefinition | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<ChasovoyDefinition | null>(null)
  const [issueTarget, setIssueTarget] = useState<ChasovoyDefinition | null>(null)
  const [issueCharacterId, setIssueCharacterId] = useState("")
  const [issueQuantity, setIssueQuantity] = useState("1")
  const [saving, setSaving] = useState(false)
  const [localError, setLocalError] = useState("")

  const context = useCallback(() => createEngineCommandContext({
    campaignId,
    requestedBy: user.id,
    authority: "gm",
  }), [campaignId, user.id])

  const reportError = useCallback((message: string) => {
    setLocalError(message)
    onError?.(message)
  }, [onError])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await chasovoy.listDefinitions({ kind: "item", scope: "campaign", campaignId, status: "active" })
      setDefinitions(rows)
      setLocalError("")
    } catch (reason) {
      reportError(errorMessage(reason, "Не удалось загрузить базу предметов."))
    } finally {
      setLoading(false)
    }
  }, [campaignId, reportError])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) void load() })
    return () => { cancelled = true }
  }, [load])

  const filteredDefinitions = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ru-RU")
    return definitions
      .filter((definition) => {
        const item = definitionToItem(definition)
        if (!itemFilterMatches(item.category, filter)) return false
        if (!needle) return true
        return `${definition.name} ${definition.summary} ${definition.rulesText}`.toLocaleLowerCase("ru-RU").includes(needle)
      })
      .sort((left, right) => {
        const leftItem = definitionToItem(left)
        const rightItem = definitionToItem(right)
        return categoryOrder(leftItem.category) - categoryOrder(rightItem.category) || left.name.localeCompare(right.name, "ru")
      })
  }, [definitions, filter, query])

  async function saveDefinition(input: InventoryInput): Promise<{ ok: boolean; error?: string }> {
    setSaving(true)
    setLocalError("")
    try {
      const summary = input.description.trim().replace(/\s+/g, " ").slice(0, 180)
      const mechanics = (input.mechanics || []) as unknown as ChasovoyJson
      const data = definitionData(input)
      if (editor === "new") {
        const baseSlug = normalizeDefinitionSlug(input.name) || "item"
        await oracle.definitions.create(context(), {
          kind: "item",
          scope: "campaign",
          campaignId,
          slug: `${baseSlug}-${Date.now().toString(36)}`,
          visibility: "campaign",
          status: "active",
          sourceKind: "custom",
          name: input.name,
          summary,
          rulesText: input.description,
          mechanics,
          data,
        })
      } else if (editor) {
        await oracle.definitions.revise(context(), editor.id, {
          name: input.name,
          summary,
          rulesText: input.description,
          mechanics,
          data,
        })
      } else {
        return { ok: false, error: "Редактор предмета не открыт." }
      }
      await load()
      return { ok: true }
    } catch (reason) {
      const message = errorMessage(reason, "Не удалось сохранить предмет в базе.")
      reportError(message)
      return { ok: false, error: message }
    } finally {
      setSaving(false)
    }
  }

  function openIssue(definition: ChasovoyDefinition) {
    const firstPc = characters.find((character) => character.character_type === "pc")
    setIssueTarget(definition)
    setIssueCharacterId(firstPc?.id || characters[0]?.id || "")
    setIssueQuantity(String(definitionToItem(definition).quantity || 1))
    setLocalError("")
  }

  async function issueItem(event: FormEvent) {
    event.preventDefault()
    if (!issueTarget || !issueCharacterId) return
    const template = definitionToItem(issueTarget)
    const quantity = Math.max(1, Number.parseInt(issueQuantity || "1", 10) || 1)
    setSaving(true)
    setLocalError("")
    try {
      await oracle.inventory.create(context(), issueCharacterId, {
        name: template.name,
        quantity,
        weight: template.weight,
        equipped: false,
        category: template.category,
        equipment_slot: template.category === "equipment" ? template.equipment_slot : null,
        image_url: template.image_url,
        description: template.description,
        mechanics: template.mechanics || [],
        usage_mode: template.usage_mode || "none",
        charges_current: template.charges_current ?? null,
        charges_max: template.charges_max ?? null,
        item_state: {
          ...(template.item_state || {}),
          source_definition_id: issueTarget.id,
          source_definition_revision: issueTarget.revision,
        },
      })
      setIssueTarget(null)
    } catch (reason) {
      reportError(errorMessage(reason, "Не удалось выдать предмет персонажу."))
    } finally {
      setSaving(false)
    }
  }

  async function archiveDefinition() {
    if (!archiveTarget) return
    setSaving(true)
    setLocalError("")
    try {
      await oracle.definitions.archive(context(), archiveTarget.id)
      setArchiveTarget(null)
      await load()
    } catch (reason) {
      reportError(errorMessage(reason, "Не удалось убрать предмет из базы."))
    } finally {
      setSaving(false)
    }
  }

  const menuActions: ContextAction[] = menuTarget ? [
    { id: "issue", icon: "↗", label: "Выдать персонажу", detail: "Создать экземпляр этого предмета в инвентаре", onSelect: () => openIssue(menuTarget) },
    { id: "edit", icon: "✎", label: "Редактировать", detail: "Создать новую ревизию записи в базе", onSelect: () => setEditor(menuTarget) },
    { id: "archive", icon: "×", label: "Убрать из базы", detail: "Существующие экземпляры у персонажей останутся", danger: true, onSelect: () => setArchiveTarget(menuTarget) },
  ] : []

  const playerCharacters = characters.filter((character) => character.character_type === "pc")
  const npcCharacters = characters.filter((character) => character.character_type === "npc")

  return <section className="gm-section" aria-label="База предметов">
    <div className="gm-subrail gm-subrail--four" role="tablist" aria-label="Категория предметов">
      {(["all", "equipment", "consumable", "other"] as ItemFilter[]).map((id) => <button type="button" role="tab" aria-selected={filter === id} className={filter === id ? "is-active" : ""} key={id} onClick={() => setFilter(id)}>{id === "all" ? "Все" : id === "equipment" ? "Экипировка" : id === "consumable" ? "Расходники" : "Прочее"}</button>)}
    </div>

    <div className="gm-list-tools">
      <label className="gm-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти предмет" /></label>
      <button className="gm-add-button" type="button" onClick={() => setEditor("new")} aria-label="Создать предмет">＋</button>
    </div>

    {localError && <div className="auth-error">{localError}</div>}

    <div className="gm-clean-list">
      {filteredDefinitions.map((definition) => {
        const item = definitionToItem(definition)
        return <article className="gm-clean-row" key={definition.id}>
          <button className="gm-clean-row__main" type="button" onClick={() => setEditor(definition)}>
            <span className="gm-row-mark" aria-hidden="true">{item.category === "equipment" ? "◇" : item.category === "consumable" ? "◉" : "·"}</span>
            <span className="gm-row-copy"><strong>{definition.name}</strong><small>{categoryLabel(item.category)}{definition.summary ? ` · ${definition.summary}` : ""}</small></span>
          </button>
          <button className="gm-row-quick" type="button" onClick={() => openIssue(definition)}>Выдать</button>
          <button className="gm-row-more" type="button" onClick={() => setMenuTarget(definition)} aria-label={`Действия с предметом ${definition.name}`}>•••</button>
        </article>
      })}
      {!loading && !filteredDefinitions.length && <div className="gm-empty"><span>◇</span><strong>{definitions.length ? "Ничего не найдено" : "База предметов пуста"}</strong><p>{definitions.length ? "Измени поиск или категорию." : "Создай предмет один раз — потом его можно выдавать любому персонажу."}</p></div>}
      {loading && <div className="gm-empty gm-empty--loading"><span>···</span><strong>Загружаем предметы</strong></div>}
    </div>

    {editor && <InventoryItemEditor
      item={editor === "new" ? null : definitionToItem(editor)}
      campaignId={campaignId}
      onClose={() => setEditor(null)}
      onSave={saveDefinition}
    />}

    {menuTarget && <ContextActionSheet title={menuTarget.name} subtitle="Предмет из базы кампании" actions={menuActions} onClose={() => setMenuTarget(null)} />}

    {issueTarget && <div className="sheet-backdrop" onMouseDown={() => { if (!saving) setIssueTarget(null) }}><form className="bottom-sheet v2-editor-sheet gm-short-sheet" onSubmit={issueItem} onMouseDown={(event) => event.stopPropagation()}><div className="sheet-handle"/><header className="v2-sheet-head"><div><span>Выдать предмет</span><h3>{issueTarget.name}</h3><p>Экземпляр появится в инвентаре выбранного персонажа.</p></div><button type="button" onClick={() => setIssueTarget(null)} disabled={saving}>×</button></header><section className="v2-form-section"><label className="field-label" htmlFor="gm-item-recipient">Персонаж</label><select id="gm-item-recipient" className="app-select" value={issueCharacterId} onChange={(event) => setIssueCharacterId(event.target.value)} disabled={saving}><option value="">Выбрать</option>{playerCharacters.length > 0 && <optgroup label="PC">{playerCharacters.map((character) => <option value={character.id} key={character.id}>{character.name}</option>)}</optgroup>}{npcCharacters.length > 0 && <optgroup label="NPC">{npcCharacters.map((character) => <option value={character.id} key={character.id}>{character.name}</option>)}</optgroup>}</select><label className="field-label" htmlFor="gm-item-quantity">Количество</label><input id="gm-item-quantity" className="app-input" type="number" min="1" value={issueQuantity} onChange={(event) => setIssueQuantity(event.target.value)} disabled={saving}/></section><button className="v2-primary-button v2-full-button" type="submit" disabled={saving || !issueCharacterId}>{saving ? "Выдаём…" : "Выдать"}</button></form></div>}

    {archiveTarget && <div className="sheet-backdrop" onMouseDown={() => { if (!saving) setArchiveTarget(null) }}><section className="bottom-sheet v2-confirm" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-handle"/><span className="v2-confirm-icon">×</span><h3>Убрать «{archiveTarget.name}» из базы?</h3><p>Предмет исчезнет из каталога выдачи. Уже выданные экземпляры останутся у персонажей.</p><div><button type="button" onClick={() => setArchiveTarget(null)} disabled={saving}>Отмена</button><button className="is-danger" type="button" onClick={() => void archiveDefinition()} disabled={saving}>{saving ? "Убираем…" : "Убрать"}</button></div></section></div>}
  </section>
}
