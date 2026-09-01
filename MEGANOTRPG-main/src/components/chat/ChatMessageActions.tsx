import { useState } from "react"
import type { ChatMessage } from "../../types/chat"

type Result = { ok: boolean; error?: string }

type Props = {
  message: ChatMessage
  characterId: string | null
  own: boolean
  canManage: boolean
  onOpenCharacter: (characterId: string) => void
  onClose: () => void
  onEdit: (messageId: number, body: string) => Promise<Result>
  onDelete: (messageId: number) => Promise<Result>
}

export default function ChatMessageActions({
  message,
  characterId,
  own,
  canManage,
  onOpenCharacter,
  onClose,
  onEdit,
  onDelete,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.body)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function copyText() {
    setError("")

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message.body)
      } else {
        const area = document.createElement("textarea")
        area.value = message.body
        area.style.position = "fixed"
        area.style.opacity = "0"
        document.body.appendChild(area)
        area.focus()
        area.select()
        document.execCommand("copy")
        area.remove()
      }
      onClose()
    } catch {
      setError("Не удалось скопировать сообщение.")
    }
  }

  async function saveEdit() {
    const body = draft.trim()
    if (!body) {
      setError("Сообщение не может быть пустым.")
      return
    }

    setBusy(true)
    setError("")
    const result = await onEdit(message.id, body)
    setBusy(false)

    if (!result.ok) {
      setError(result.error || "Не удалось изменить сообщение.")
      return
    }

    onClose()
  }

  async function remove() {
    setBusy(true)
    setError("")
    const result = await onDelete(message.id)
    setBusy(false)

    if (!result.ok) {
      setError(result.error || "Не удалось удалить сообщение.")
      return
    }

    onClose()
  }

  if (editing) {
    return (
      <div className="sheet-backdrop" onMouseDown={onClose}>
        <div
          className="bottom-sheet compact-editor-sheet"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="sheet-handle" />
          <div className="character-editor-head">
            <div>
              <h3 className="sheet-title">Редактировать сообщение</h3>
              <p className="sheet-copy">Изменять можно только собственные сообщения.</p>
            </div>
            <button className="sheet-close" type="button" onClick={onClose}>
              ×
            </button>
          </div>

          <textarea
            className="app-textarea"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={4000}
            autoFocus
            style={{ minHeight: 120 }}
          />

          {error && <div className="auth-error">{error}</div>}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button
              className="secondary-action-button"
              type="button"
              onClick={() => setEditing(false)}
              disabled={busy}
            >
              Назад
            </button>
            <button
              className="sheet-save"
              type="button"
              onClick={() => void saveEdit()}
              disabled={busy || !draft.trim()}
            >
              {busy ? "Сохраняем…" : "Сохранить"}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <div
        className="bottom-sheet"
        onMouseDown={(event) => event.stopPropagation()}
        style={{ maxHeight: "78dvh", overflowY: "auto" }}
      >
        <div className="sheet-handle" />
        <div className="character-editor-head">
          <div>
            <h3 className="sheet-title">{message.author_name}</h3>
            <p className="sheet-copy">Действия с сообщением</p>
          </div>
          <button className="sheet-close" type="button" onClick={onClose}>
            ×
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 10 }}>
          {characterId && (
            <button
              type="button"
              onClick={() => {
                onClose()
                onOpenCharacter(characterId)
              }}
              style={actionStyle}
            >
              <span>
                <strong style={titleStyle}>Открыть персонажа</strong>
                <small style={detailStyle}>Лист, дневник, инвентарь и заклинания</small>
              </span>
              <span>›</span>
            </button>
          )}

          <button type="button" onClick={() => void copyText()} style={actionStyle}>
            <span>
              <strong style={titleStyle}>Копировать текст</strong>
              <small style={detailStyle}>Скопировать сообщение в буфер</small>
            </span>
            <span>›</span>
          </button>

          {own && (
            <button
              type="button"
              onClick={() => {
                setError("")
                setEditing(true)
              }}
              style={actionStyle}
            >
              <span>
                <strong style={titleStyle}>Редактировать</strong>
                <small style={detailStyle}>Изменить своё сообщение</small>
              </span>
              <span>›</span>
            </button>
          )}

          {(own || canManage) && (
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy}
              style={{
                ...actionStyle,
                borderColor: "#4b292d",
                background: "#1a1214",
                color: "#fecaca",
                opacity: busy ? 0.5 : 1,
              }}
            >
              <span>
                <strong style={titleStyle}>{busy ? "Удаляем…" : "Удалить сообщение"}</strong>
                <small style={{ ...detailStyle, color: "#a9797d" }}>
                  {own
                    ? "Удалить своё сообщение"
                    : "Модерация ГМ / владельца"}
                </small>
              </span>
              <span>›</span>
            </button>
          )}
        </div>

        {error && <div className="auth-error">{error}</div>}
      </div>
    </div>
  )
}

const actionStyle = {
  width: "100%",
  minHeight: 54,
  padding: "9px 11px",
  border: "1px solid #2d2933",
  borderRadius: 13,
  background: "#141416",
  color: "#e4e4e7",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  textAlign: "left" as const,
}

const titleStyle = {
  display: "block",
  fontSize: 11,
}

const detailStyle = {
  display: "block",
  marginTop: 3,
  color: "#77717e",
  fontSize: 8,
  lineHeight: 1.35,
}
