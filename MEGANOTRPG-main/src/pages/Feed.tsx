import { useMemo, useRef, useState } from "react"
import type { FormEvent } from "react"

import CampaignImage from "../components/common/CampaignImage"
import ContextActionSheet, { type ContextAction } from "../components/common/ContextActionSheet"
import CharacterAvatar from "../components/characters/CharacterAvatar"
import { useAuth } from "../context/AuthContext"
import { useCharacters } from "../context/CharacterContext"
import { useFeed } from "../hooks/useFeed"
import { uploadCampaignImage } from "../lib/mediaUpload"
import type { FeedComment, FeedItem, FeedSource } from "../types/feed"
import { useLongPressItem } from "../hooks/useLongPressItem"
import "../game-story-v2.css"

type Props = {
  onOpenCharacter: (id: string) => void
  onOpenGallery: () => void
}

type FeedMenu =
  | { type: "item"; item: FeedItem }
  | { type: "comment"; item: FeedComment }

const sourceLabels: Record<FeedSource, string> = {
  diary: "Дневник",
  art: "Арт",
  achievement: "Достижение",
  update: "Событие мира",
  moment: "Момент",
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

export default function Feed({ onOpenCharacter, onOpenGallery }: Props) {
  const { user, profile } = useAuth()
  const {
    campaignId,
    campaignTitle,
    characters,
    members,
    activeCharacter,
    canManage,
  } = useCharacters()
  const feed = useFeed(campaignId)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [actionError, setActionError] = useState("")
  const [openComments, setOpenComments] = useState<string | null>(null)
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [feedMenu, setFeedMenu] = useState<FeedMenu | null>(null)
  const bindFeedLongPress = useLongPressItem<FeedMenu>((target) => setFeedMenu(target))

  const characterMap = useMemo(
    () => new Map(characters.map((character) => [character.id, character])),
    [characters],
  )
  const memberMap = useMemo(
    () => new Map(members.map((member) => [member.user_id, member])),
    [members],
  )

  function authorFor(item: FeedItem) {
    const character = item.character_id ? characterMap.get(item.character_id) ?? null : null
    const member = item.created_by ? memberMap.get(item.created_by) : null

    if (item.source_type === "update") {
      return {
        character: null,
        label: member?.is_owner ? "Владелец" : member?.role === "gm" ? "ГМ" : "Мир",
        sublabel: sourceLabels[item.source_type],
      }
    }

    if (item.source_type === "achievement") {
      return {
        character,
        label: character ? character.name : "Достижение кампании",
        sublabel: sourceLabels[item.source_type],
      }
    }

    if (character) {
      return {
        character,
        label: character.name,
        sublabel: sourceLabels[item.source_type],
      }
    }

    return {
      character: null,
      label: member?.display_name || campaignTitle,
      sublabel: sourceLabels[item.source_type],
    }
  }

  function commentAuthor(comment: FeedComment) {
    const character = comment.character_id ? characterMap.get(comment.character_id) : null
    const member = memberMap.get(comment.user_id)
    return character?.name || member?.display_name || "Игрок"
  }

  async function publish(event: FormEvent) {
    event.preventDefault()
    if (publishing || (!draft.trim() && !mediaFile)) return
    setPublishing(true)
    setActionError("")

    let mediaUrl: string | null = null
    if (mediaFile) {
      const upload = await uploadCampaignImage(mediaFile, "feed", campaignId)
      if (!upload.ok) {
        setPublishing(false)
        setActionError(upload.error)
        return
      }
      mediaUrl = upload.url
    }

    const result = await feed.createMoment(draft, mediaUrl)
    setPublishing(false)
    if (!result.ok) {
      setActionError(result.error || "Не удалось добавить событие в хронику.")
      return
    }

    setDraft("")
    setMediaFile(null)
    setComposerOpen(false)
  }

  async function submitComment(itemId: string) {
    const body = commentDrafts[itemId]?.trim()
    if (!body) return
    setActionError("")
    const result = await feed.addComment(itemId, body)
    if (!result.ok) {
      setActionError(result.error || "Не удалось добавить комментарий.")
      return
    }
    setCommentDrafts((current) => ({ ...current, [itemId]: "" }))
  }

  async function deleteItem(item: FeedItem) {
    if (!window.confirm("Удалить эту запись из хроники?")) return
    setActionError("")
    const result = await feed.deleteItem(item.id)
    if (!result.ok) setActionError(result.error || "Не удалось удалить запись.")
  }

  function feedActions(target: FeedMenu): ContextAction[] {
    if (target.type === "comment") {
      const comment = target.item
      const canDeleteComment = canManage || comment.user_id === user.id
      return [
        {
          id: "copy",
          label: "Копировать",
          detail: "Скопировать текст комментария",
          icon: "▣",
          onSelect: () => navigator.clipboard?.writeText(comment.body),
        },
        ...(canDeleteComment
          ? [{
              id: "delete",
              label: "Удалить комментарий",
              detail: "Комментарий исчезнет из хроники",
              icon: "×",
              danger: true,
              onSelect: async () => {
                const result = await feed.deleteComment(comment.id)
                if (!result.ok) setActionError(result.error || "Не удалось удалить комментарий.")
              },
            } satisfies ContextAction]
          : []),
      ]
    }

    const item = target.item
    const author = authorFor(item)
    const canDeleteItem = canManage || item.created_by === user.id
    return [
      ...(author.character
        ? [{
            id: "character",
            label: "Открыть персонажа",
            detail: author.character.name,
            icon: "↗",
            onSelect: () => onOpenCharacter(author.character!.id),
          } satisfies ContextAction]
        : []),
      ...(item.source_type === "art"
        ? [{
            id: "gallery",
            label: "Открыть галерею",
            detail: "Перейти к артам кампании",
            icon: "▧",
            onSelect: onOpenGallery,
          } satisfies ContextAction]
        : []),
      {
        id: "comments",
        label: "Комментарии",
        detail: `${item.comments.length} в этой записи`,
        icon: "◌",
        onSelect: () => setOpenComments(item.id),
      },
      ...(canDeleteItem
        ? [{
            id: "delete",
            label: "Удалить из хроники",
            detail: "Запись исчезнет для участников",
            icon: "×",
            danger: true,
            onSelect: () => deleteItem(item),
          } satisfies ContextAction]
        : []),
    ]
  }

  return (
    <div className="chronicle-page">
      <header className="chronicle-head">
        <div>
          <span>История кампании</span>
          <h2>Хроника</h2>
          <p>Дневники, арты, достижения, решения ГМ и изменения мира складываются сюда автоматически.</p>
        </div>
        <button type="button" onClick={onOpenGallery}>Галерея</button>
      </header>

      <button className="chronicle-composer" type="button" onClick={() => setComposerOpen(true)}>
        <CharacterAvatar character={activeCharacter} size="small" />
        <span>{activeCharacter ? `Добавить момент от лица ${activeCharacter.name}` : `Добавить событие, ${profile.display_name}`}</span>
        <em>＋</em>
      </button>

      {(actionError || feed.error) && <div className="auth-error feed-error">{actionError || feed.error}</div>}
      {feed.loading && <div className="center-state"><span className="status-spinner" /><span>Собираем хронику…</span></div>}

      {!feed.loading && feed.items.length === 0 && (
        <div className="feed-empty surface">
          <span>✦</span>
          <strong>Хроника пока пуста</strong>
          <p>Первая запись появится после события мира, достижения, дневника или арта.</p>
        </div>
      )}

      <section className="chronicle-list" aria-label="Хроника кампании">
        {feed.items.map((item) => {
          const author = authorFor(item)
          const liked = item.reactions.some((reaction) => reaction.user_id === user.id)
          const commentsOpen = openComments === item.id

          return (
            <article
              {...bindFeedLongPress({ type: "item", item })}
              className="chronicle-card"
              key={item.id}
              style={{ touchAction: "pan-y" }}
            >
              <header className="chronicle-card__head">
                <button
                  className="chronicle-author"
                  type="button"
                  onClick={() => author.character && onOpenCharacter(author.character.id)}
                  disabled={!author.character}
                >
                  <CharacterAvatar character={author.character} size="small" />
                  <span>
                    <strong>{author.label}</strong>
                    <small>{author.sublabel} · {formatDate(item.published_at)}</small>
                  </span>
                </button>
                <span className="chronicle-kind">{sourceLabels[item.source_type]}</span>
              </header>

              {item.media_url && (
                <CampaignImage className="chronicle-card__media" value={item.media_url} alt={item.title || "Событие кампании"} loading="lazy" />
              )}

              {(item.title || item.body) && (
                <div className="chronicle-card__body">
                  {item.title && <h3>{item.title}</h3>}
                  {item.body && <p>{item.body}</p>}
                </div>
              )}

              <div className="chronicle-card__actions">
                <button className={liked ? "is-liked" : ""} type="button" onClick={() => void feed.toggleReaction(item.id)}>
                  <span>{liked ? "♥" : "♡"}</span>{item.reactions.length > 0 && <small>{item.reactions.length}</small>}
                </button>
                <button type="button" onClick={() => setOpenComments(commentsOpen ? null : item.id)}>
                  <span>◌</span>{item.comments.length > 0 && <small>{item.comments.length}</small>}
                </button>
                <button type="button" onClick={() => setFeedMenu({ type: "item", item })}>•••</button>
              </div>

              {commentsOpen && (
                <div className="chronicle-comments">
                  {item.comments.map((comment) => (
                    <div
                      {...bindFeedLongPress({ type: "comment", item: comment })}
                      className="chronicle-comment"
                      key={comment.id}
                      style={{ touchAction: "pan-y" }}
                    >
                      <strong>{commentAuthor(comment)}</strong> {comment.body}
                    </div>
                  ))}
                  <form className="chronicle-comment-form" onSubmit={(event) => { event.preventDefault(); void submitComment(item.id) }}>
                    <input
                      value={commentDrafts[item.id] || ""}
                      onChange={(event) => setCommentDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                      placeholder="Комментарий…"
                      maxLength={2000}
                    />
                    <button type="submit" disabled={!commentDrafts[item.id]?.trim()}>Отправить</button>
                  </form>
                </div>
              )}
            </article>
          )
        })}
      </section>

      {feed.hasMore && (
        <button className="feed-load-more" type="button" onClick={() => void feed.loadMore()} disabled={feed.loadingMore}>
          {feed.loadingMore ? "Загружаем…" : "Более ранние события"}
        </button>
      )}

      {composerOpen && (
        <div className="sheet-backdrop" onMouseDown={() => setComposerOpen(false)}>
          <form className="bottom-sheet feed-composer-sheet" onSubmit={publish} onMouseDown={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="character-editor-head">
              <div>
                <h3 className="sheet-title">Добавить момент</h3>
                <p className="sheet-copy">Ручная запись в хронике. Остальные игровые события появляются автоматически.</p>
              </div>
              <button className="sheet-close" type="button" onClick={() => setComposerOpen(false)}>×</button>
            </div>

            <div className="composer-identity">
              <CharacterAvatar character={activeCharacter} size="small" />
              <span>
                <strong>{activeCharacter?.name || (canManage ? "ГМ" : profile.display_name)}</strong>
                <small>{activeCharacter ? "Персонаж" : "Кампания"}</small>
              </span>
            </div>

            <textarea
              className="app-textarea feed-composer-textarea"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Что произошло?"
              maxLength={4000}
              autoFocus
            />

            {mediaFile && (
              <div className="composer-file"><span>▧ {mediaFile.name}</span><button type="button" onClick={() => setMediaFile(null)}>Убрать</button></div>
            )}

            <div className="composer-actions">
              <button className="media-file-button" type="button" onClick={() => fileRef.current?.click()}>▧ Арт</button>
              <input ref={fileRef} className="media-hidden-input" type="file" accept="image/*" onChange={(event) => { setMediaFile(event.target.files?.[0] || null); event.currentTarget.value = "" }} />
              <button className="sheet-save" type="submit" disabled={publishing || (!draft.trim() && !mediaFile)}>{publishing ? "Публикуем…" : "В хронику"}</button>
            </div>
          </form>
        </div>
      )}

      {feedMenu && <ContextActionSheet title={feedMenu.type === "item" ? authorFor(feedMenu.item).label : commentAuthor(feedMenu.item)} subtitle="Действия" actions={feedActions(feedMenu)} onClose={() => setFeedMenu(null)} />}
    </div>
  )
}
