import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { FormEvent } from "react"

import CampaignImage from "../components/common/CampaignImage"
import ContextActionSheet, {
  type ContextAction,
} from "../components/common/ContextActionSheet"
import { useAuth } from "../context/AuthContext"
import { useCharacters } from "../context/CharacterContext"
import {
  deleteCampaignMediaObjects,
  uploadCampaignImage,
} from "../lib/mediaUpload"
import { supabase } from "../lib/supabase"
import { useLongPressItem } from "../hooks/useLongPressItem"

type ArtKind = "art" | "comic" | "map" | "sketch"

type ArtItem = {
  id: string
  campaign_id: string
  uploaded_by: string | null
  character_id: string | null
  title: string
  caption: string
  image_url: string
  kind: ArtKind
  created_at: string
}

type ArtPage = {
  id: string
  art_item_id: string
  page_number: number
  image_url: string
}

const filters: Array<{ id: "all" | ArtKind; label: string }> = [
  { id: "all", label: "Все" },
  { id: "art", label: "Арты" },
  { id: "comic", label: "Комиксы" },
  { id: "map", label: "Карты" },
  { id: "sketch", label: "Скетчи" },
]

const kindLabels: Record<ArtKind, string> = {
  art: "Арт",
  comic: "Комикс",
  map: "Карта",
  sketch: "Скетч",
}

export default function Art() {
  const { user } = useAuth()
  const { campaignId, campaignTitle, canManage } = useCharacters()
  const fileRef = useRef<HTMLInputElement | null>(null)

  const [items, setItems] = useState<ArtItem[]>([])
  const [pages, setPages] = useState<ArtPage[]>([])
  const [filter, setFilter] = useState<"all" | ArtKind>("all")
  const [selected, setSelected] = useState<ArtItem | null>(null)
  const [selectedPage, setSelectedPage] = useState(0)
  const [composerOpen, setComposerOpen] = useState(false)
  const [editing, setEditing] = useState<ArtItem | null>(null)
  const [artMenu, setArtMenu] = useState<ArtItem | null>(null)
  const [kind, setKind] = useState<ArtKind>("art")
  const [title, setTitle] = useState("")
  const [caption, setCaption] = useState("")
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const bindArtLongPress = useLongPressItem<ArtItem>((item) => setArtMenu(item))

  const load = useCallback(async () => {
    if (!campaignId) return
    setLoading(true)
    setError("")

    const { data, error: loadError } = await supabase
      .from("campaign_art_items")
      .select("id, campaign_id, uploaded_by, character_id, title, caption, image_url, kind, created_at")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false })

    if (loadError) {
      setError(loadError.message)
      setLoading(false)
      return
    }

    const nextItems = (data || []) as ArtItem[]
    setItems(nextItems)

    if (nextItems.length === 0) {
      setPages([])
      setLoading(false)
      return
    }

    const { data: pageRows, error: pageError } = await supabase
      .from("campaign_art_pages")
      .select("id, art_item_id, page_number, image_url")
      .in("art_item_id", nextItems.map((item) => item.id))
      .order("page_number", { ascending: true })

    if (pageError) {
      setError(pageError.message)
      setLoading(false)
      return
    }

    setPages((pageRows || []) as ArtPage[])
    setLoading(false)
  }, [campaignId])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) void load() })
    return () => { cancelled = true }
  }, [load])

  const visibleItems = useMemo(
    () => items.filter((item) => filter === "all" || item.kind === filter),
    [filter, items],
  )

  const selectedImages = useMemo(() => {
    if (!selected) return []
    const comicPages = pages
      .filter((page) => page.art_item_id === selected.id)
      .sort((a, b) => a.page_number - b.page_number)
      .map((page) => page.image_url)
    return comicPages.length > 0 ? comicPages : [selected.image_url]
  }, [pages, selected])

  function resetComposer() {
    setKind("art")
    setTitle("")
    setCaption("")
    setSelectedFiles([])
    setEditing(null)
    setError("")
  }

  function openComposer(nextKind: ArtKind = "art", item: ArtItem | null = null) {
    if (!item && !canManage) return
    resetComposer()
    setEditing(item)
    setKind(item?.kind || nextKind)
    setTitle(item?.title || "")
    setCaption(item?.caption || "")
    setComposerOpen(true)
  }

  function openViewer(item: ArtItem) {
    setSelected(item)
    setSelectedPage(0)
  }

  function moveSelectedFile(index: number, offset: -1 | 1) {
    setSelectedFiles((current) => {
      const target = index + offset
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  async function publish(event: FormEvent) {
    event.preventDefault()
    if (!editing && !canManage) {
      setError("Общие публикации создаёт ГМ или владелец. Игрок добавляет арт через своего персонажа.")
      return
    }
    if (editing) {
      setUploading(true)
      setError("")
      const { error: updateError } = await supabase
        .from("campaign_art_items")
        .update({
          title: title.trim() || kindLabels[editing.kind],
          caption: caption.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", editing.id)
      setUploading(false)
      if (updateError) {
        setError(updateError.message)
        return
      }
      setComposerOpen(false)
      resetComposer()
      await load()
      return
    }

    const files = kind === "comic" ? selectedFiles : selectedFiles.slice(0, 1)
    if (files.length === 0) {
      setError("Выбери хотя бы одно изображение.")
      return
    }

    setUploading(true)
    setError("")
    const uploaded: string[] = []

    for (const file of files) {
      const result = await uploadCampaignImage(
        file,
        kind === "comic" ? "comics" : "gallery",
        campaignId,
      )
      if (!result.ok) {
        await deleteCampaignMediaObjects(uploaded)
        setUploading(false)
        setError(result.error)
        return
      }
      uploaded.push(result.url)
    }

    const fallbackTitle =
      files[0].name.replace(/\.[^.]+$/, "").slice(0, 120) || kindLabels[kind]
    const { data: artItem, error: insertError } = await supabase
      .from("campaign_art_items")
      .insert({
        campaign_id: campaignId,
        uploaded_by: user.id,
        title: title.trim() || fallbackTitle,
        caption: caption.trim(),
        image_url: uploaded[0],
        kind,
      })
      .select("id")
      .single()

    if (insertError || !artItem) {
      await deleteCampaignMediaObjects(uploaded)
      setUploading(false)
      setError(insertError?.message || "Не удалось создать публикацию.")
      return
    }

    if (kind === "comic") {
      const { error: pagesError } = await supabase.from("campaign_art_pages").insert(
        uploaded.map((imageUrl, index) => ({
          art_item_id: artItem.id,
          created_by: user.id,
          page_number: index + 1,
          image_url: imageUrl,
        })),
      )
      if (pagesError) {
        await supabase.from("campaign_art_items").delete().eq("id", artItem.id)
        await deleteCampaignMediaObjects(uploaded)
        setUploading(false)
        setError(pagesError.message)
        return
      }
    }

    setUploading(false)
    setComposerOpen(false)
    resetComposer()
    await load()
  }

  function imagesFor(item: ArtItem) {
    const comicPages = pages
      .filter((page) => page.art_item_id === item.id)
      .sort((a, b) => a.page_number - b.page_number)
      .map((page) => page.image_url)
    return comicPages.length > 0 ? comicPages : [item.image_url]
  }

  async function deleteItem(item: ArtItem) {
    if (!window.confirm(`Удалить «${item.title || kindLabels[item.kind]}»?`)) return
    const { error: deleteError } = await supabase
      .from("campaign_art_items")
      .delete()
      .eq("id", item.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    await deleteCampaignMediaObjects(imagesFor(item))
    if (selected?.id === item.id) setSelected(null)
    await load()
  }

  async function deleteSelected() {
    if (selected) await deleteItem(selected)
  }

  function canEdit(item: ArtItem) {
    return canManage || item.uploaded_by === user.id
  }

  function artActions(item: ArtItem): ContextAction[] {
    return [
      {
        id: "open",
        label: "Открыть",
        detail: item.kind === "comic" ? "Читать комикс по страницам" : "Посмотреть изображение",
        icon: "↗",
        onSelect: () => openViewer(item),
      },
      ...(canEdit(item)
        ? [
            {
              id: "edit",
              label: "Редактировать",
              detail: "Изменить название и подпись",
              icon: "✎",
              onSelect: () => openComposer(item.kind, item),
            },
            {
              id: "delete",
              label: "Удалить публикацию",
              detail: "Изображения и страницы комикса будут удалены",
              icon: "×",
              danger: true,
              onSelect: () => deleteItem(item),
            },
          ]
        : []),
    ]
  }

  return (
    <>
      <div className="art-library page-stack">
        <section className="art-library-hero surface">
          <div>
            <span>Галерея кампании</span>
            <h2>{campaignTitle}</h2>
            <p>Иллюстрации, игровые карты, скетчи и комиксы живут отдельно от страниц персонажей.</p>
          </div>
          {canManage && <button type="button" onClick={() => openComposer("art")}>＋</button>}
        </section>

        <div className="art-filter-rail" role="tablist" aria-label="Фильтр галереи">
          {filters.map((item) => (
            <button
              type="button"
              role="tab"
              aria-selected={filter === item.id}
              className={filter === item.id ? "active" : ""}
              key={item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
              {item.id !== "all" && <small>{items.filter((art) => art.kind === item.id).length}</small>}
            </button>
          ))}
        </div>

        {canManage && (
          <section className="art-create-strip surface">
            <button type="button" onClick={() => openComposer("art")}><span>✦</span><strong>Арт</strong></button>
            <button type="button" onClick={() => openComposer("comic")}><span>▥</span><strong>Комикс</strong></button>
            <button type="button" onClick={() => openComposer("map")}><span>⌖</span><strong>Карта</strong></button>
            <button type="button" onClick={() => openComposer("sketch")}><span>✎</span><strong>Скетч</strong></button>
          </section>
        )}

        {error && !composerOpen && <div className="auth-error">{error}</div>}
        {loading && <div className="center-state"><span className="status-spinner" /><span>Загружаем галерею…</span></div>}

        {!loading && visibleItems.length === 0 && (
          <div className="art-library-empty surface">
            <span>▧</span>
            <strong>{filter === "all" ? "Галерея пока пуста" : `Нет материалов: ${filters.find((item) => item.id === filter)?.label}`}</strong>
            <p>{canManage ? "Добавь изображение или собери многостраничный комикс прямо с телефона." : "Арты своего персонажа добавляются в его профиле."}</p>
            {canManage && <button type="button" onClick={() => openComposer(filter === "all" ? "art" : filter)}>Добавить</button>}
          </div>
        )}

        {!loading && visibleItems.length > 0 && (
          <div className="art-library-grid" aria-label="Галерея">
            {visibleItems.map((art) => {
              const pageCount = pages.filter((page) => page.art_item_id === art.id).length
              return (
                <button
                  {...bindArtLongPress(art)}
                  type="button"
                  className={`art-library-card art-library-card--${art.kind}`}
                  key={art.id}
                  onClick={() => openViewer(art)}
                  style={{ touchAction: "pan-y" }}
                >
                  <CampaignImage value={art.image_url} alt={art.title} loading="lazy" />
                  <span className="art-library-card__shade" />
                  <span className="art-library-card__kind">{kindLabels[art.kind]}</span>
                  {art.kind === "comic" && <span className="art-library-card__pages">▥ {pageCount || 1}</span>}
                  <span className="art-library-card__copy"><strong>{art.title || kindLabels[art.kind]}</strong>{art.caption && <small>{art.caption}</small>}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {composerOpen && (canManage || Boolean(editing)) && (
        <div className="sheet-backdrop" onMouseDown={() => setComposerOpen(false)}>
          <form className="bottom-sheet art-composer-sheet" onSubmit={publish} onMouseDown={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="character-editor-head">
              <div><h3 className="sheet-title">{editing ? "Редактировать публикацию" : "Новая публикация"}</h3><p className="sheet-copy">{editing ? "Можно изменить название и подпись." : "Комикс можно загрузить сразу несколькими страницами в нужном порядке."}</p></div>
              <button className="sheet-close" type="button" onClick={() => setComposerOpen(false)}>×</button>
            </div>

            {!editing && <div className="art-kind-switch">
              {filters.slice(1).map((item) => (
                <button type="button" key={item.id} className={kind === item.id ? "active" : ""} onClick={() => setKind(item.id as ArtKind)}>{item.label}</button>
              ))}
            </div>}

            <label className="field-label">Название</label>
            <input className="app-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={kindLabels[kind]} maxLength={160} />
            <label className="field-label">Подпись</label>
            <textarea className="app-textarea" value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Автор, сцена или короткий комментарий" maxLength={1200} />

            {!editing && <button className="art-file-picker" type="button" onClick={() => fileRef.current?.click()}>
              <span>{kind === "comic" ? "▥" : "▧"}</span>
              <strong>{selectedFiles.length > 0 ? `${selectedFiles.length} файл(ов) выбрано` : kind === "comic" ? "Выбрать страницы комикса" : "Выбрать изображение"}</strong>
              <small>{kind === "comic" ? "Порядок страниц можно поменять ниже" : "JPG, PNG, WEBP, GIF до 20 МБ"}</small>
            </button>}
            {!editing && <input
              ref={fileRef}
              className="media-hidden-input"
              type="file"
              accept="image/*"
              multiple={kind === "comic"}
              onChange={(event) => {
                setSelectedFiles(Array.from(event.currentTarget.files || []))
                event.currentTarget.value = ""
              }}
            />}

            {selectedFiles.length > 0 && (
              <ol className="art-selected-files">
                {(kind === "comic" ? selectedFiles : selectedFiles.slice(0, 1)).map((file, index, shownFiles) => (
                  <li key={`${file.name}-${file.lastModified}-${index}`}>
                    <span>{index + 1}</span>
                    <strong>{file.name}</strong>
                    {kind === "comic" && (
                      <span className="art-selected-files__actions">
                        <button type="button" aria-label="Переместить страницу выше" disabled={index === 0} onClick={() => moveSelectedFile(index, -1)}>↑</button>
                        <button type="button" aria-label="Переместить страницу ниже" disabled={index === shownFiles.length - 1} onClick={() => moveSelectedFile(index, 1)}>↓</button>
                      </span>
                    )}
                    <button className="art-selected-files__remove" type="button" aria-label={`Убрать ${file.name}`} onClick={() => setSelectedFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}>×</button>
                  </li>
                ))}
              </ol>
            )}

            {error && <div className="auth-error">{error}</div>}
            <button className="sheet-save" type="submit" disabled={uploading || (!editing && selectedFiles.length === 0)}>{uploading ? "Сохраняем…" : editing ? "Сохранить" : "Опубликовать"}</button>
          </form>
        </div>
      )}

      {selected && (
        <div className="art-lightbox" role="dialog" aria-modal="true" aria-label={selected.title}>
          <header>
            <button type="button" onClick={() => setSelected(null)} aria-label="Закрыть">←</button>
            <div><strong>{selected.title || kindLabels[selected.kind]}</strong><small>{kindLabels[selected.kind]}{selectedImages.length > 1 ? ` · ${selectedPage + 1}/${selectedImages.length}` : ""}</small></div>
            {canEdit(selected) ? <button type="button" onClick={() => openComposer(selected.kind, selected)} aria-label="Редактировать">•••</button> : <span />}
          </header>
          <div className="art-lightbox__stage">
            <CampaignImage value={selectedImages[selectedPage] || selected.image_url} alt={`${selected.title}, страница ${selectedPage + 1}`} />
          </div>
          {selectedImages.length > 1 && (
            <div className="art-page-controls">
              <button type="button" onClick={() => setSelectedPage((page) => Math.max(0, page - 1))} disabled={selectedPage === 0}>← Назад</button>
              <span>{selectedPage + 1} / {selectedImages.length}</span>
              <button type="button" onClick={() => setSelectedPage((page) => Math.min(selectedImages.length - 1, page + 1))} disabled={selectedPage === selectedImages.length - 1}>Дальше →</button>
            </div>
          )}
          <footer>
            {selected.caption && <p>{selected.caption}</p>}
            {(canManage || selected.uploaded_by === user.id) && <button className="danger-mini-button" type="button" onClick={() => void deleteSelected()}>Удалить публикацию</button>}
          </footer>
        </div>
      )}

      {artMenu && (
        <ContextActionSheet
          title={artMenu.title || kindLabels[artMenu.kind]}
          subtitle="Долгое нажатие открывает действия с публикацией"
          actions={artActions(artMenu)}
          onClose={() => setArtMenu(null)}
        />
      )}
    </>
  )
}
