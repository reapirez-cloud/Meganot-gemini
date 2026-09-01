import { useEffect } from "react"

import { useCharacters } from "../../context/CharacterContext"
import type { AppNotification } from "../../types/feed"

type Props = {
  items: AppNotification[]
  loading: boolean
  error: string | null
  onClose: () => void
  onMarkRead: () => Promise<void>
  onOpenFeed: () => void
}

function relativeTime(value: string) {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return "только что"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} мин.`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ч.`
  return `${Math.floor(hours / 24)} дн.`
}

export default function NotificationsSheet({ items, loading, error, onClose, onMarkRead, onOpenFeed }: Props) {
  const { characters, members } = useCharacters()

  useEffect(() => {
    void onMarkRead()
  }, [onMarkRead])

  function actorName(item: AppNotification) {
    const character = item.actor_character_id
      ? characters.find((candidate) => candidate.id === item.actor_character_id)
      : null
    if (character) return character.name
    return members.find((member) => member.user_id === item.actor_user_id)?.display_name || "Кампания"
  }

  function message(item: AppNotification) {
    if (item.kind === "achievement") return `получено достижение «${item.body}»`
    if (item.kind === "comment") return `оставил комментарий: ${item.body}`
    return item.body || "отреагировал на публикацию"
  }

  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <section className="bottom-sheet notifications-sheet" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="character-editor-head">
          <div><h3 className="sheet-title">Уведомления</h3><p className="sheet-copy">Реакции, комментарии и достижения</p></div>
          <button className="sheet-close" type="button" onClick={onClose}>×</button>
        </div>
        {loading && <div className="center-state"><span className="status-spinner" /></div>}
        {error && <div className="auth-error">{error}</div>}
        {!loading && items.length === 0 && <div className="notifications-empty">Пока тихо. Новые реакции появятся здесь.</div>}
        <div className="notifications-list">
          {items.map((item) => (
            <button
              className={`notification-row ${item.read_at ? "" : "notification-row--unread"}`}
              type="button"
              key={item.id}
              onClick={() => { onOpenFeed(); onClose() }}
            >
              <span className="notification-row__icon">{item.kind === "achievement" ? "★" : item.kind === "comment" ? "◌" : "♥"}</span>
              <span><strong>{actorName(item)}</strong> {message(item)}<small>{relativeTime(item.created_at)}</small></span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
