import { useState } from "react"
import type { FormEvent } from "react"
import ImageUploadField from "../common/ImageUploadField"

import type {
  CampaignInfoInput,
  CampaignMember,
  Character,
} from "../../context/CharacterContext"
import type {
  AchievementEntry,
  CampaignUpdate,
  LocationEntry,
  LocationLink,
  LocationSection,
  WorldArticle,
  WorldSection,
} from "../../types/world"

export type WorldEditorMode =
  | { type: "campaign" }
  | { type: "world-section" }
  | { type: "world-section-edit"; section: WorldSection }
  | { type: "article"; sectionId: string }
  | { type: "article-edit"; article: WorldArticle }
  | { type: "location"; parentId: string | null }
  | { type: "location-edit"; location: LocationEntry }
  | { type: "location-section"; locationId: string }
  | { type: "location-section-edit"; section: LocationSection }
  | { type: "location-link"; section: LocationSection }
  | { type: "location-link-edit"; link: LocationLink }
  | { type: "achievement" }
  | { type: "achievement-edit"; achievement: AchievementEntry }
  | { type: "update" }
  | { type: "update-edit"; update: CampaignUpdate }
  | null

type AsyncResult = Promise<{ ok: boolean; error?: string }>

type Props = {
  mode: WorldEditorMode
  onClose: () => void
  campaignTitle: string
  campaignSummary: string
  campaignRulesSummary: string
  campaignCoverUrl: string | null
  campaignId: string
  locations: LocationEntry[]
  locationSections: LocationSection[]
  characters: Character[]
  members: CampaignMember[]
  updateCampaignInfo: (input: CampaignInfoInput) => AsyncResult
  createWorldSection: (title: string, description: string) => AsyncResult
  updateWorldSection: (
    sectionId: string,
    title: string,
    description: string,
  ) => AsyncResult
  createWorldArticle: (
    sectionId: string,
    title: string,
    summary: string,
    body: string,
  ) => AsyncResult
  updateWorldArticle: (
    articleId: string,
    title: string,
    summary: string,
    body: string,
  ) => AsyncResult
  createLocation: (input: {
    parent_location_id: string | null
    name: string
    summary: string
    description: string
    image_url: string | null
  }) => AsyncResult
  updateLocation: (
    locationId: string,
    input: {
      name: string
      summary: string
      description: string
      image_url: string | null
    },
  ) => AsyncResult
  createLocationSection: (
    locationId: string,
    title: string,
    body: string,
  ) => AsyncResult
  updateLocationSection: (
    sectionId: string,
    title: string,
    body: string,
  ) => AsyncResult
  createLocationLink: (
    sectionId: string,
    targetLocationId: string,
    label: string,
  ) => AsyncResult
  updateLocationLink: (
    linkId: string,
    targetLocationId: string,
    label: string,
  ) => AsyncResult
  createAchievement: (input: {
    character_id: string | null
    title: string
    description: string
    icon: string
  }) => AsyncResult
  updateAchievement: (
    achievementId: string,
    input: {
      character_id: string | null
      title: string
      description: string
      icon: string
    },
  ) => AsyncResult
  createUpdate: (input: {
    kind: "change" | "announcement"
    title: string
    body: string
  }) => AsyncResult
  updateUpdate: (
    updateId: string,
    input: {
      kind: "change" | "announcement"
      title: string
      body: string
    },
  ) => AsyncResult
}

function initialTitle(mode: Exclude<WorldEditorMode, null>, campaignTitle: string) {
  if (mode.type === "campaign") return campaignTitle
  if (mode.type === "world-section-edit") return mode.section.title
  if (mode.type === "article-edit") return mode.article.title
  if (mode.type === "location-edit") return mode.location.name
  if (mode.type === "location-section-edit") return mode.section.title
  if (mode.type === "location-link-edit") return mode.link.label
  if (mode.type === "achievement-edit") return mode.achievement.title
  if (mode.type === "update-edit") return mode.update.title
  return ""
}

function initialSummary(mode: Exclude<WorldEditorMode, null>) {
  if (mode.type === "article-edit") return mode.article.summary
  if (mode.type === "location-edit") return mode.location.summary
  return ""
}

function initialBody(mode: Exclude<WorldEditorMode, null>) {
  if (mode.type === "world-section-edit") return mode.section.description
  if (mode.type === "article-edit") return mode.article.body
  if (mode.type === "location-edit") return mode.location.description
  if (mode.type === "location-section-edit") return mode.section.body
  if (mode.type === "achievement-edit") return mode.achievement.description
  if (mode.type === "update-edit") return mode.update.body
  return ""
}

export default function WorldEditor(props: Props) {
  if (!props.mode) return null
  return <WorldEditorForm {...props} mode={props.mode} />
}

function WorldEditorForm(
  props: Omit<Props, "mode"> & { mode: Exclude<WorldEditorMode, null> },
) {
  const currentMode = props.mode

  const [title, setTitle] = useState(() =>
    initialTitle(currentMode, props.campaignTitle),
  )
  const [summary, setSummary] = useState(() =>
    currentMode.type === "campaign"
      ? props.campaignSummary
      : initialSummary(currentMode),
  )
  const [body, setBody] = useState(() =>
    currentMode.type === "campaign"
      ? props.campaignRulesSummary
      : initialBody(currentMode),
  )
  const [imageUrl, setImageUrl] = useState(() =>
    currentMode.type === "campaign"
      ? props.campaignCoverUrl || ""
      : currentMode.type === "location-edit"
      ? currentMode.location.image_url || ""
      : "",
  )
  const [targetId, setTargetId] = useState(() =>
    currentMode.type === "location-link-edit"
      ? currentMode.link.target_location_id
      : "",
  )
  const [characterId, setCharacterId] = useState(() =>
    currentMode.type === "achievement-edit"
      ? currentMode.achievement.character_id || ""
      : "",
  )
  const [icon, setIcon] = useState(() =>
    currentMode.type === "achievement-edit"
      ? currentMode.achievement.icon
      : "★",
  )
  const [kind, setKind] = useState<"change" | "announcement">(() =>
    currentMode.type === "update-edit" ? currentMode.update.kind : "change",
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const editorTitle =
    currentMode.type === "campaign" ? "Оформление кампании" :
    currentMode.type === "world-section" ? "Новый раздел мира" :
    currentMode.type === "world-section-edit" ? "Редактировать раздел" :
    currentMode.type === "article" ? "Новая запись" :
    currentMode.type === "article-edit" ? "Редактировать запись" :
    currentMode.type === "location" ? (currentMode.parentId ? "Новая подзона" : "Новая зона") :
    currentMode.type === "location-edit" ? "Редактировать зону" :
    currentMode.type === "location-section" ? "Новый раздел зоны" :
    currentMode.type === "location-section-edit" ? "Редактировать раздел зоны" :
    currentMode.type === "location-link" ? "Переход к зоне" :
    currentMode.type === "location-link-edit" ? "Редактировать переход" :
    currentMode.type === "achievement" ? "Новое достижение" :
    currentMode.type === "achievement-edit" ? "Редактировать достижение" :
    currentMode.type === "update" ? "Запись ГМ" :
    "Редактировать запись ГМ"

  const sourceLocationId = (() => {
    if (currentMode.type === "location-link") {
      return currentMode.section.location_id
    }

    if (currentMode.type === "location-link-edit") {
      const sourceSection = props.locationSections.find(
        (section) => section.id === currentMode.link.section_id,
      )
      return sourceSection?.location_id || null
    }

    return null
  })()

  const targets = props.locations.filter(
    (location) => location.id !== sourceLocationId,
  )

  async function submit(event: FormEvent) {
    event.preventDefault()

    const isLink =
      currentMode.type === "location-link" ||
      currentMode.type === "location-link-edit"

    if (!isLink && !title.trim()) {
      setError("Нужно название.")
      return
    }

    if (isLink && !targetId) {
      setError("Выбери локацию для перехода.")
      return
    }

    setSaving(true)
    setError("")

    let result: { ok: boolean; error?: string }

    if (currentMode.type === "campaign") {
      result = await props.updateCampaignInfo({
        title,
        summary,
        rules_summary: body,
        cover_url: imageUrl || null,
      })
    } else if (currentMode.type === "world-section") {
      result = await props.createWorldSection(title, body)
    } else if (currentMode.type === "world-section-edit") {
      result = await props.updateWorldSection(
        currentMode.section.id,
        title,
        body,
      )
    } else if (currentMode.type === "article") {
      result = await props.createWorldArticle(
        currentMode.sectionId,
        title,
        summary,
        body,
      )
    } else if (currentMode.type === "article-edit") {
      result = await props.updateWorldArticle(
        currentMode.article.id,
        title,
        summary,
        body,
      )
    } else if (currentMode.type === "location") {
      result = await props.createLocation({
        parent_location_id: currentMode.parentId,
        name: title,
        summary,
        description: body,
        image_url: imageUrl || null,
      })
    } else if (currentMode.type === "location-edit") {
      result = await props.updateLocation(currentMode.location.id, {
        name: title,
        summary,
        description: body,
        image_url: imageUrl || null,
      })
    } else if (currentMode.type === "location-section") {
      result = await props.createLocationSection(
        currentMode.locationId,
        title,
        body,
      )
    } else if (currentMode.type === "location-section-edit") {
      result = await props.updateLocationSection(
        currentMode.section.id,
        title,
        body,
      )
    } else if (currentMode.type === "location-link") {
      result = await props.createLocationLink(
        currentMode.section.id,
        targetId,
        title,
      )
    } else if (currentMode.type === "location-link-edit") {
      result = await props.updateLocationLink(
        currentMode.link.id,
        targetId,
        title,
      )
    } else if (currentMode.type === "achievement") {
      result = await props.createAchievement({
        character_id: characterId || null,
        title,
        description: body,
        icon,
      })
    } else if (currentMode.type === "achievement-edit") {
      result = await props.updateAchievement(currentMode.achievement.id, {
        character_id: characterId || null,
        title,
        description: body,
        icon,
      })
    } else if (currentMode.type === "update") {
      result = await props.createUpdate({ kind, title, body })
    } else {
      result = await props.updateUpdate(currentMode.update.id, {
        kind,
        title,
        body,
      })
    }

    setSaving(false)

    if (!result.ok) {
      setError(result.error || "Не удалось сохранить.")
      return
    }

    props.onClose()
  }

  const showSummary =
    currentMode.type === "campaign" ||
    currentMode.type === "article" ||
    currentMode.type === "article-edit" ||
    currentMode.type === "location" ||
    currentMode.type === "location-edit"

  const showImage =
    currentMode.type === "campaign" ||
    currentMode.type === "location" ||
    currentMode.type === "location-edit"

  const showUpdateKind =
    currentMode.type === "update" || currentMode.type === "update-edit"

  const showAchievement =
    currentMode.type === "achievement" ||
    currentMode.type === "achievement-edit"

  const showBody =
    currentMode.type !== "location-link" &&
    currentMode.type !== "location-link-edit"

  const isLocation =
    currentMode.type === "location" || currentMode.type === "location-edit"

  return (
    <div className="sheet-backdrop" onMouseDown={props.onClose}>
      <form
        className="bottom-sheet world-editor-sheet"
        onSubmit={submit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" />

        <div className="world-editor-head">
          <div>
            <h3 className="sheet-title">{editorTitle}</h3>
            <p className="sheet-copy">
              ГМ и владелец могут менять эти данные в любой момент.
            </p>
          </div>
          <button
            className="world-sheet-close"
            type="button"
            onClick={props.onClose}
          >
            ×
          </button>
        </div>

        {showUpdateKind && (
          <div className="world-kind-switch">
            <button
              type="button"
              className={kind === "change" ? "world-kind-switch__active" : ""}
              onClick={() => setKind("change")}
            >
              Изменение
            </button>
            <button
              type="button"
              className={
                kind === "announcement" ? "world-kind-switch__active" : ""
              }
              onClick={() => setKind("announcement")}
            >
              Объявление
            </button>
          </div>
        )}

        {(currentMode.type === "location-link" ||
          currentMode.type === "location-link-edit") && (
          <>
            <label className="field-label" htmlFor="world-target">
              Куда ведёт переход
            </label>
            <select
              id="world-target"
              className="app-select"
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
            >
              <option value="">Выбрать локацию</option>
              {targets.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </>
        )}

        {showAchievement && (
          <>
            <label className="field-label" htmlFor="achievement-character">
              Кому
            </label>
            <select
              id="achievement-character"
              className="app-select"
              value={characterId}
              onChange={(event) => setCharacterId(event.target.value)}
            >
              <option value="">Вся группа</option>
              {props.characters.map((character) => {
                const member = character.assigned_user_id
                  ? props.members.find(
                      (item) => item.user_id === character.assigned_user_id,
                    )
                  : null
                const label = member
                  ? `${character.name} (${member.display_name})`
                  : character.name

                return (
                  <option key={character.id} value={character.id}>
                    {label}
                  </option>
                )
              })}
            </select>

            <label className="field-label" htmlFor="achievement-icon">
              Значок
            </label>
            <input
              id="achievement-icon"
              className="app-input world-icon-input"
              value={icon}
              onChange={(event) => setIcon(event.target.value)}
              maxLength={4}
            />
          </>
        )}

        <label className="field-label" htmlFor="world-title">
          {currentMode.type === "location-link" ||
          currentMode.type === "location-link-edit"
            ? "Подпись перехода"
            : "Название"}
        </label>
        <input
          id="world-title"
          className="app-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Введите название"
          maxLength={120}
          autoFocus={
            currentMode.type !== "location-link" &&
            currentMode.type !== "location-link-edit"
          }
        />

        {showSummary && (
          <>
            <label className="field-label" htmlFor="world-summary">
              {currentMode.type === "campaign" ? "Описание на обложке" : isLocation ? "Превью зоны" : "Короткое описание"}
            </label>
            <input
              id="world-summary"
              className="app-input"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder={currentMode.type === "campaign" ? "О чём эта кампания" : isLocation ? "Коротко: что это за место" : "Для карточки и списка"}
              maxLength={240}
            />
            {isLocation && <p className="world-editor-help">Этот текст показывается на карточке зоны в общем обзоре.</p>}
          </>
        )}

        {showImage && (
          <ImageUploadField
            value={imageUrl}
            onChange={setImageUrl}
            folder={currentMode.type === "campaign" ? "campaign-cover" : "locations"}
            campaignId={props.campaignId}
            label={currentMode.type === "campaign" ? "Обложка мира" : "Арт зоны"}
            hint="Выбери изображение из галереи телефона или камеры."
          />
        )}

        {showBody && (
          <>
            <label className="field-label" htmlFor="world-body">
              {currentMode.type === "campaign"
                ? "Правила и вводная"
                : isLocation
                  ? "Подробное описание"
                : currentMode.type === "world-section" ||
              currentMode.type === "world-section-edit"
                ? "Описание раздела"
                : showAchievement
                  ? "Описание достижения"
                  : showUpdateKind
                    ? "Текст"
                    : "Содержание"}
            </label>
            <textarea
              id="world-body"
              className={`app-textarea world-editor-textarea ${isLocation ? "world-editor-textarea--location" : ""}`}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={isLocation ? "История, атмосфера, ориентиры, жители, опасности и важные детали…" : undefined}
              maxLength={12000}
            />
            {isLocation && <p className="world-editor-help">Подробный текст открывается уже внутри зоны и не перегружает общий список.</p>}
          </>
        )}

        {error && <div className="auth-error">{error}</div>}

        <button className="sheet-save" type="submit" disabled={saving}>
          {saving ? "Сохраняем…" : "Сохранить"}
        </button>
      </form>
    </div>
  )
}
