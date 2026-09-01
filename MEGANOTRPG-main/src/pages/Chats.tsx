import { useMemo, useState } from "react"
import type { FormEvent } from "react"

import { useRooms } from "../hooks/useRooms"
import { useCharacters } from "../context/CharacterContext"
import CampaignImage from "../components/common/CampaignImage"
import ImageUploadField from "../components/common/ImageUploadField"
import ContextActionSheet, { type ContextAction } from "../components/common/ContextActionSheet"
import type { ChatRoom } from "../types/chat"
import { useLongPressItem } from "../hooks/useLongPressItem"
import { createEngineCommandContext } from "../engine-contracts/index.ts"
import { deleteCampaignMediaObject } from "../lib/mediaUpload"
import { supabase } from "../lib/supabase"
import { oracle } from "../oracle-engine/runtime.ts"
import "../game-story-v2.css"
import "../chats-v3.css"

type Props = { onOpenRoom: (id: string) => void }
type Editor = { mode: "create" } | { mode: "edit"; room: ChatRoom } | null
type ChatSection = "home" | "personal" | "scenes"
type ArchiveView = "active" | "closed"

function roomLabel(room: ChatRoom) {
  if (room.room_type === "character") return room.character_life_state === "dead" || room.room_state === "closed" ? "Закрытая история" : "Личная история"
  if (room.room_type === "scene") return room.scene_state === "closed" || room.room_state === "closed" ? "Закрытая сцена" : "Сцена"
  return "Флуд"
}

function periodLabel(value: ChatRoom["day_period"]) {
  const labels: Record<ChatRoom["day_period"], string> = {
    dawn: "рассвет",
    morning: "утро",
    day: "день",
    late_day: "после полудня",
    evening: "вечер",
    night: "ночь",
    deep_night: "глубокая ночь",
  }
  return labels[value]
}

function roomClosed(room: ChatRoom) {
  if (room.room_type === "character") return room.character_life_state === "dead" || room.room_state === "closed"
  if (room.room_type === "scene") return room.scene_state === "closed" || room.room_state === "closed"
  return false
}

export default function Chats({ onOpenRoom }: Props) {
  const { canManage, campaignId, characters } = useCharacters()
  const rooms = useRooms()
  const [section, setSection] = useState<ChatSection>("home")
  const [personalView, setPersonalView] = useState<ArchiveView>("active")
  const [sceneView, setSceneView] = useState<ArchiveView>("active")
  const [editor, setEditor] = useState<Editor>(null)
  const [title, setTitle] = useState("")
  const [preview, setPreview] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [menu, setMenu] = useState<ChatRoom | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ChatRoom | null>(null)
  const bind = useLongPressItem<ChatRoom>((room) => setMenu(room))

  const characterMap = useMemo(
    () => new Map(characters.map((character) => [character.id, character])),
    [characters],
  )

  const flood = rooms.rooms.filter((room) => room.room_type === "flood")
  const personal = rooms.rooms.filter((room) => room.room_type === "character")
  const scenes = rooms.rooms.filter((room) => room.room_type === "scene")
  const personalActive = personal.filter((room) => !roomClosed(room))
  const personalClosed = personal.filter(roomClosed)
  const scenesActive = scenes.filter((room) => !roomClosed(room))
  const scenesClosed = scenes.filter(roomClosed)

  const personalUnread = personalActive.reduce((sum, room) => sum + room.unread_count, 0)
  const sceneUnread = scenesActive.reduce((sum, room) => sum + room.unread_count, 0)

  function openCreate() {
    setTitle("")
    setPreview("")
    setError("")
    setEditor({ mode: "create" })
  }

  function openEdit(room: ChatRoom) {
    setTitle(room.title)
    setPreview(room.avatar_url || "")
    setError("")
    setEditor({ mode: "edit", room })
  }

  async function closeEditor() {
    if (editor?.mode === "create" && preview) await deleteCampaignMediaObject(preview)
    if (editor?.mode === "edit" && preview && preview !== editor.room.avatar_url) {
      await deleteCampaignMediaObject(preview)
    }
    setEditor(null)
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!editor) return
    setSaving(true)
    setError("")

    if (editor.mode === "create") {
      if (!title.trim()) {
        setSaving(false)
        setError("Укажи название сцены.")
        return
      }
      const result = await rooms.createSceneRoom(title)
      if (!result.ok || !result.id) {
        setSaving(false)
        setError(result.error || "Не удалось создать сцену.")
        return
      }
      if (preview) {
        const art = await rooms.setRoomAvatar(result.id, preview)
        if (!art.ok) {
          setSaving(false)
          setError(art.error || "Сцена создана, но превью не сохранилось.")
          return
        }
      }
      setSaving(false)
      setEditor(null)
      setSection("scenes")
      setSceneView("active")
      onOpenRoom(result.id)
      return
    }

    const room = editor.room
    const oldPreview = room.avatar_url
    if (room.room_type === "scene" && title.trim() !== room.title) {
      const rename = await rooms.renameRoom(room.id, title)
      if (!rename.ok) {
        setSaving(false)
        setError(rename.error || "Не удалось сохранить название.")
        return
      }
    }

    const art = await rooms.setRoomAvatar(room.id, preview || null)
    setSaving(false)
    if (!art.ok) {
      setError(art.error || "Не удалось сохранить превью.")
      return
    }
    if (oldPreview && oldPreview !== preview) void deleteCampaignMediaObject(oldPreview)
    setEditor(null)
  }

  async function remove(room: ChatRoom) {
    setSaving(true)
    setError("")
    const result = await rooms.deleteRoom(room.id)
    setSaving(false)
    if (!result.ok) {
      setError(result.error || "Не удалось удалить сцену.")
      return
    }
    if (room.avatar_url) void deleteCampaignMediaObject(room.avatar_url)
    setDeleteTarget(null)
  }

  async function setCharacterLife(room: ChatRoom, next: "alive" | "dead") {
    if (!room.character_id) return
    setSaving(true)
    setError("")

    if (!campaignId) {
      setSaving(false)
      setError("Кампания ещё не загружена.")
      return
    }

    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData.user) {
      setSaving(false)
      setError(authError?.message || "Нужна авторизация.")
      return
    }

    try {
      await oracle.characters.setLifeState(
        createEngineCommandContext({
          campaignId,
          requestedBy: authData.user.id,
          authority: "gm",
          actorCharacterId: room.character_id,
        }),
        room.character_id,
        next,
      )
    } catch (reason) {
      setSaving(false)
      setError(reason instanceof Error ? reason.message : "Не удалось изменить состояние персонажа.")
      return
    }

    setSaving(false)
    await rooms.reload()
    if (next === "dead") setPersonalView("closed")
  }

  async function toggleSceneClosed(room: ChatRoom) {
    const closed = roomClosed(room)
    setSaving(true)
    setError("")
    const result = await rooms.setRoomState(room.id, closed ? "open" : "closed")
    setSaving(false)
    if (!result.ok) {
      setError(result.error || "Не удалось изменить состояние сцены.")
      return
    }
    setSceneView(closed ? "active" : "closed")
  }

  function actions(room: ChatRoom): ContextAction[] {
    const dead = room.character_life_state === "dead"
    const closedScene = room.room_type === "scene" && roomClosed(room)
    return [
      {
        id: "open",
        label: "Открыть",
        detail: roomClosed(room) ? "Открыть сохранённую историю" : "Перейти в чат",
        icon: "↗",
        onSelect: () => onOpenRoom(room.id),
      },
      ...(canManage
        ? [{
            id: "edit",
            label: room.room_type === "scene" ? "Настроить сцену" : "Изменить превью",
            detail: room.room_type === "character" ? "История остаётся закреплена за персонажем" : "Название и оформление комнаты",
            icon: "✎",
            onSelect: () => openEdit(room),
          } satisfies ContextAction]
        : []),
      ...(canManage && room.room_type === "character" && room.character_id
        ? [{
            id: dead ? "revive" : "death",
            label: dead ? "Вернуть персонажа" : "Отметить погибшим",
            detail: dead ? "Вернуть историю в список живых" : "Перенести историю в закрытые и запретить новые сообщения",
            icon: dead ? "↺" : "†",
            danger: !dead,
            onSelect: () => setCharacterLife(room, dead ? "alive" : "dead"),
          } satisfies ContextAction]
        : []),
      ...(canManage && room.room_type === "scene"
        ? [{
            id: closedScene ? "reopen" : "close",
            label: closedScene ? "Вернуть сцену" : "Закрыть сцену",
            detail: closedScene ? "Снова разрешить игру в сцене" : "Сохранить историю и перенести её в закрытые сцены",
            icon: closedScene ? "↺" : "□",
            onSelect: () => toggleSceneClosed(room),
          } satisfies ContextAction]
        : []),
      ...(canManage && room.room_type === "scene"
        ? [{
            id: "delete",
            label: "Удалить сцену",
            detail: "Сообщения и вложения будут удалены без восстановления",
            icon: "×",
            danger: true,
            onSelect: () => setDeleteTarget(room),
          } satisfies ContextAction]
        : []),
    ]
  }

  function roomMeta(room: ChatRoom) {
    if (room.room_type === "character" && room.character_id) {
      const character = characterMap.get(room.character_id)
      if (character) return `${character.character_class || "Без класса"} · ${character.level} ур.`
      return "Персональная история"
    }
    if (room.room_type === "scene") return `День ${room.campaign_day} · ${periodLabel(room.day_period)}`
    return "Общий разговор кампании"
  }

  function roomRow(room: ChatRoom) {
    const closed = roomClosed(room)
    return (
      <article
        className={`chat-v3__room ${closed ? "is-closed" : ""}`}
        key={room.id}
        {...bind(room)}
        style={{ touchAction: "pan-y" }}
      >
        <button className="chat-v3__room-open" type="button" onClick={() => onOpenRoom(room.id)}>
          <span className="chat-v3__avatar">
            {room.avatar_url
              ? <CampaignImage value={room.avatar_url} alt="" />
              : <span aria-hidden="true">{room.room_type === "flood" ? "◌" : room.room_type === "character" ? "◇" : "✦"}</span>}
          </span>
          <span className="chat-v3__copy">
            <span className="chat-v3__title-line">
              <strong>{room.title}</strong>
              {closed && <em className="chat-v3__badge is-closed">Закрыто</em>}
              {!closed && room.room_state === "gm_only" && <em className="chat-v3__badge">Только ГМ</em>}
            </span>
            <span className="chat-v3__meta">{roomMeta(room)}</span>
            <span className="chat-v3__preview">{room.preview || "Пока без сообщений"}</span>
          </span>
          <span className="chat-v3__side">
            <time>{room.time}</time>
            {room.unread_count > 0 && <b>{room.unread_count > 99 ? "99+" : room.unread_count}</b>}
          </span>
        </button>
        {canManage && room.room_type !== "flood" && (
          <button className="chat-v3__menu" type="button" onClick={() => setMenu(room)} aria-label={`Действия: ${room.title}`}>•••</button>
        )}
      </article>
    )
  }

  function roomList(items: ChatRoom[], empty: string) {
    return (
      <div className="chat-v3__room-list">
        {items.map(roomRow)}
        {!items.length && <div className="chat-v3__empty">{empty}</div>}
      </div>
    )
  }

  if (rooms.loading) {
    return <div className="center-state"><span className="status-spinner" /><span>Загружаем чаты…</span></div>
  }

  return (
    <>
      <div className="chats-v3">
        {(error || rooms.error) && <div className="auth-error">{error || rooms.error}</div>}

        {section === "home" && (
          <>
            <section className="chat-v3__surface">
              <header className="chat-v3__section-head">
                <div><span className="chat-v3__eyebrow">Общение</span><h3>Флуд</h3><p>Весь общий разговор кампании — без игровых архивов вперемешку.</p></div>
                <span className="chat-v3__count">{flood.length}</span>
              </header>
              {roomList(flood, "Флуд-чат пока не создан.")}
            </section>

            <nav className="chat-v3__directory" aria-label="Игровые чаты">
              <button type="button" onClick={() => { setSection("personal"); setPersonalView("active") }}>
                <span className="chat-v3__directory-icon">◇</span>
                <span className="chat-v3__directory-copy"><small>Персонажи</small><strong>Личные истории</strong><em>Живые персонажи отдельно от завершённых историй</em></span>
                <span className="chat-v3__directory-stats"><b>{personalActive.length}</b><span>{personalClosed.length} закрыто{personalUnread > 0 ? ` · ${personalUnread} новых` : ""}</span></span>
                <span className="chat-v3__directory-chevron">›</span>
              </button>
              <button type="button" onClick={() => { setSection("scenes"); setSceneView("active") }}>
                <span className="chat-v3__directory-icon">✦</span>
                <span className="chat-v3__directory-copy"><small>Игра</small><strong>Сцены</strong><em>Текущие сцены и отдельный архив завершённых</em></span>
                <span className="chat-v3__directory-stats"><b>{scenesActive.length}</b><span>{scenesClosed.length} закрыто{sceneUnread > 0 ? ` · ${sceneUnread} новых` : ""}</span></span>
                <span className="chat-v3__directory-chevron">›</span>
              </button>
            </nav>
          </>
        )}

        {section === "personal" && (
          <section className="chat-v3__focus">
            <header className="chat-v3__focus-head">
              <button className="chat-v3__back" type="button" onClick={() => setSection("home")} aria-label="Назад">←</button>
              <div><span className="chat-v3__eyebrow">Персонажи</span><h3>Личные истории</h3><p>У каждого персонажа своя непрерывная история.</p></div>
              <span className="chat-v3__count">{personal.length}</span>
            </header>
            <nav className="chat-v3__tabs" aria-label="Личные истории">
              <button className={personalView === "active" ? "is-active" : ""} type="button" onClick={() => setPersonalView("active")}>Личные истории <span>{personalActive.length}</span></button>
              <button className={personalView === "closed" ? "is-active" : ""} type="button" onClick={() => setPersonalView("closed")}>Закрытые истории <span>{personalClosed.length}</span></button>
            </nav>
            {personalView === "active"
              ? roomList(personalActive, "У живых персонажей пока нет личных историй.")
              : roomList(personalClosed, "Закрытых историй пока нет.")}
          </section>
        )}

        {section === "scenes" && (
          <section className="chat-v3__focus">
            <header className="chat-v3__focus-head">
              <button className="chat-v3__back" type="button" onClick={() => setSection("home")} aria-label="Назад">←</button>
              <div><span className="chat-v3__eyebrow">Игра</span><h3>Сцены</h3><p>Активная игра отдельно от законченных эпизодов.</p></div>
              {canManage ? <button className="chat-v3__add" type="button" onClick={openCreate}>＋ Сцена</button> : <span className="chat-v3__count">{scenes.length}</span>}
            </header>
            <nav className="chat-v3__tabs" aria-label="Сцены">
              <button className={sceneView === "active" ? "is-active" : ""} type="button" onClick={() => setSceneView("active")}>Сцены <span>{scenesActive.length}</span></button>
              <button className={sceneView === "closed" ? "is-active" : ""} type="button" onClick={() => setSceneView("closed")}>Закрытые сцены <span>{scenesClosed.length}</span></button>
            </nav>
            {sceneView === "active"
              ? roomList(scenesActive, "Активных сцен пока нет.")
              : roomList(scenesClosed, "Закрытых сцен пока нет.")}
          </section>
        )}
      </div>

      {editor && (
        <div className="sheet-backdrop" onMouseDown={() => void closeEditor()}>
          <form className="bottom-sheet v2-editor-sheet chat-room-editor-v2" onSubmit={save} onMouseDown={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <header className="v2-sheet-head">
              <div>
                <span>{editor.mode === "create" ? "Общая игровая сцена" : roomLabel(editor.room)}</span>
                <h3>{editor.mode === "create" ? "Новая сцена" : editor.room.title}</h3>
                <p>Превью помогает быстро узнать сцену в списке. История и состояние комнаты от оформления не зависят.</p>
              </div>
              <button type="button" onClick={() => void closeEditor()}>×</button>
            </header>

            <section className="v2-form-section">
              {(editor.mode === "create" || editor.room.room_type === "scene") && (
                <>
                  <label className="field-label">Название</label>
                  <input className="app-input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} autoFocus />
                </>
              )}
              <ImageUploadField
                value={preview}
                onChange={setPreview}
                folder="chat-previews"
                campaignId={campaignId}
                label="Превью чата"
                hint="Персонаж, место или арт сцены — в списке изображение будет аккуратно обрезано"
              />
            </section>

            {error && <div className="auth-error">{error}</div>}
            <button className="v2-primary-button v2-full-button" type="submit" disabled={saving || (editor.mode === "create" && !title.trim())}>
              {saving ? "Сохраняем…" : editor.mode === "create" ? "Создать сцену" : "Сохранить"}
            </button>
          </form>
        </div>
      )}

      {menu && <ContextActionSheet title={menu.title} subtitle={roomLabel(menu)} actions={actions(menu)} onClose={() => setMenu(null)} />}

      {deleteTarget && (
        <div className="sheet-backdrop" onMouseDown={() => setDeleteTarget(null)}>
          <section className="bottom-sheet v2-confirm" onMouseDown={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <span className="v2-confirm-icon">×</span>
            <h3>Удалить сцену «{deleteTarget.title}»?</h3>
            <p>Сцена, сообщения и вложения исчезнут без восстановления. Если нужно просто убрать её из активной игры — закрой сцену вместо удаления.</p>
            <div>
              <button type="button" onClick={() => setDeleteTarget(null)}>Отмена</button>
              <button type="button" className="is-danger" disabled={saving} onClick={() => void remove(deleteTarget)}>
                {saving ? "Удаляем…" : "Удалить"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  )
}