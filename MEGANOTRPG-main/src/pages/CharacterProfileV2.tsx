import { useState } from "react"
import type { FormEvent } from "react"

import { useAuth } from "../context/AuthContext.tsx"
import { useCharacters } from "../context/CharacterContext.tsx"
import { useCharacterSheet } from "../hooks/useCharacterSheet.ts"
import { useResolvedCharacterRuntime } from "../hooks/useResolvedCharacterRuntime.ts"
import { uploadCampaignImage } from "../lib/mediaUpload.ts"
import { classReference } from "../data/classReference.ts"
import type { SpellClassKey } from "../lib/spellCatalog.ts"
import type {
  CharacterArt,
  CharacterFeature,
  CharacterSpell,
  CharacterSpellOption,
  DiaryComment,
  DiaryPost,
  InventoryItem,
} from "../types/characterSheet.ts"

import ResolvedCharacterSheet from "../components/characters/ResolvedCharacterSheet.tsx"
import CharacterClassPanel from "../components/characters/CharacterClassPanel.tsx"
import CharacterSpellbook from "../components/characters/CharacterSpellbook.tsx"
import CharacterInventory from "../components/characters/CharacterInventory.tsx"
import CharacterSheetEditor from "../components/characters/CharacterSheetEditor.tsx"
import CharacterResourcesEditor from "../components/characters/CharacterResourcesEditor.tsx"
import InventoryItemEditor from "../components/characters/InventoryItemEditor.tsx"
import SpellEditor from "../components/characters/SpellEditor.tsx"
import FeatureEditor from "../components/characters/FeatureEditor.tsx"
import ImageUploadField from "../components/common/ImageUploadField.tsx"
import CampaignImage from "../components/common/CampaignImage.tsx"
import ReferenceGuide from "../components/reference/ReferenceGuide.tsx"
import ContextActionSheet, { type ContextAction } from "../components/common/ContextActionSheet.tsx"
import { useLongPressItem } from "../hooks/useLongPressItem.ts"

type Props = { characterId: string; onBack: () => void; embedded?: boolean }
type Tab = "sheet" | "class" | "spells" | "inventory" | "diary" | "arts"
type InventoryMode = "inventory" | "equipment"
type Editor =
  | { type: "avatar" }
  | { type: "sheet" }
  | { type: "resources" }
  | { type: "inventory"; item: InventoryItem | null }
  | { type: "spell"; spell: CharacterSpell | null }
  | { type: "spell-option"; option: CharacterSpellOption | null }
  | { type: "feature"; feature: CharacterFeature | null }
  | null

type ReferenceTarget =
  | { section: "classes"; classId: SpellClassKey | null }
  | { section: "spells" }
  | null

type DiaryMenu =
  | { type: "post"; item: DiaryPost }
  | { type: "comment"; item: DiaryComment }

type ArtMenu = { item: CharacterArt }

function normalizeClass(value: string): string {
  return value.trim().toLocaleLowerCase("ru-RU").replace(/[._-]+/g, " ").replace(/\s+/g, " ")
}

function classReferenceId(value: string): SpellClassKey | null {
  const aliases: Record<string, SpellClassKey> = {
    клирик: "cleric",
    жрец: "cleric",
  }
  const wanted = normalizeClass(value)
  if (aliases[wanted]) return aliases[wanted]
  const match = classReference.find((entry) =>
    [entry.id, entry.name, entry.nameEn].some((candidate) => normalizeClass(candidate) === wanted),
  )
  return match?.id ?? null
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

export default function CharacterProfileV2({ characterId, onBack, embedded = false }: Props) {
  const { user } = useAuth()
  const {
    characters,
    members,
    campaignId,
    canManage,
    refresh,
    updateOwnCharacterAvatar,
  } = useCharacters()
  const data = useCharacterSheet(characterId, campaignId)
  const character = characters.find((item) => item.id === characterId) ?? null
  const runtime = useResolvedCharacterRuntime(character)

  const [tab, setTab] = useState<Tab>("sheet")
  const [inventoryMode, setInventoryMode] = useState<InventoryMode>("inventory")
  const [editor, setEditor] = useState<Editor>(null)
  const [reference, setReference] = useState<ReferenceTarget>(null)
  const [spellLevelFilter, setSpellLevelFilter] = useState<number | null>(null)
  const [spellActionId, setSpellActionId] = useState<string | null>(null)
  const [spellError, setSpellError] = useState("")
  const [avatarUrl, setAvatarUrl] = useState("")
  const [avatarSaving, setAvatarSaving] = useState(false)
  const [avatarError, setAvatarError] = useState("")

  const [diaryDraft, setDiaryDraft] = useState("")
  const [diaryFile, setDiaryFile] = useState<File | null>(null)
  const [diaryPublishing, setDiaryPublishing] = useState(false)
  const [diaryError, setDiaryError] = useState("")
  const [openComments, setOpenComments] = useState<string | null>(null)
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [diaryMenu, setDiaryMenu] = useState<DiaryMenu | null>(null)
  const [editingPost, setEditingPost] = useState<DiaryPost | null>(null)
  const [editingPostBody, setEditingPostBody] = useState("")
  const [postSaving, setPostSaving] = useState(false)
  const bindDiaryLongPress = useLongPressItem<DiaryMenu>((target) => setDiaryMenu(target))

  const [artUploading, setArtUploading] = useState(false)
  const [artError, setArtError] = useState("")
  const [selectedArt, setSelectedArt] = useState<CharacterArt | null>(null)
  const [artMenu, setArtMenu] = useState<ArtMenu | null>(null)
  const [editingArt, setEditingArt] = useState<CharacterArt | null>(null)
  const [artTitle, setArtTitle] = useState("")
  const [artCaption, setArtCaption] = useState("")
  const [artSaving, setArtSaving] = useState(false)
  const bindArtLongPress = useLongPressItem<ArtMenu>((target) => setArtMenu(target))

  if (!character) {
    return (
      <div className="screen">
        {!embedded && <header className="screen-header"><button className="icon-button" type="button" onClick={onBack}>←</button><h1 className="screen-header__title">Персонаж</h1><span /></header>}
        <div className="center-state">Персонаж не найден или у тебя нет доступа.</div>
      </div>
    )
  }

  const currentCharacter = character
  const member = currentCharacter.assigned_user_id
    ? members.find((item) => item.user_id === currentCharacter.assigned_user_id)
    : null
  const active = member?.active_character_id === currentCharacter.id
  const isAssignedPlayer = currentCharacter.assigned_user_id === user.id
  const canEditAvatar = canManage || isAssignedPlayer
  const sheet = data.sheet
  const resolved = runtime.snapshot
  const canChooseSpells = canManage || Boolean(
    isAssignedPlayer && sheet?.spellcasting_enabled && sheet.spell_change_unlocked,
  )
  const canUseInventory = canManage || isAssignedPlayer
  const canWriteDiary = canManage || isAssignedPlayer
  const classId = classReferenceId(currentCharacter.character_class)

  const learnedNames = new Set(data.spells.map((spell) => spell.name.trim().toLocaleLowerCase("ru-RU")))
  const availableOptions = data.spellOptions.filter((option) =>
    !learnedNames.has(option.name.trim().toLocaleLowerCase("ru-RU")),
  )
  const visibleOptions = canManage ? data.spellOptions : availableOptions
  // Transitional visibility until class/species adapters become the source of spell access.
  // Once they do, contract.spells/methods alone will decide whether this panel exists.
  const magicSectionVisible = Boolean(
    resolved && (
      resolved.contract.spells.length > 0 ||
      resolved.spellcastingAbility ||
      sheet?.spellcasting_enabled ||
      data.spellOptions.length > 0
    ),
  )

  async function saveAvatar(event: FormEvent) {
    event.preventDefault()
    setAvatarSaving(true)
    setAvatarError("")
    const result = await updateOwnCharacterAvatar(currentCharacter.id, avatarUrl)
    setAvatarSaving(false)
    if (!result.ok) {
      setAvatarError(result.error || "Не удалось сохранить арт.")
      return
    }
    await refresh()
    setEditor(null)
  }

  async function learnSpell(option: CharacterSpellOption) {
    setSpellActionId(`learn:${option.id}`)
    setSpellError("")
    const result = await data.learnSpell(option.id)
    setSpellActionId(null)
    if (!result.ok) setSpellError(result.error || "Не удалось добавить заклинание.")
  }

  async function togglePrepared(spell: CharacterSpell) {
    setSpellActionId(`prepare:${spell.id}`)
    setSpellError("")
    const result = await data.setSpellPrepared(spell.id, !spell.prepared)
    setSpellActionId(null)
    if (!result.ok) setSpellError(result.error || "Не удалось изменить подготовку.")
  }

  async function forgetSpell(spell: CharacterSpell) {
    if (!window.confirm(`Убрать «${spell.name}» из изученных заклинаний?`)) return
    setSpellActionId(`forget:${spell.id}`)
    setSpellError("")
    const result = await data.deleteSpell(spell.id)
    setSpellActionId(null)
    if (!result.ok) setSpellError(result.error || "Не удалось убрать заклинание.")
  }

  async function publishDiary(event: FormEvent) {
    event.preventDefault()
    if (!diaryDraft.trim() && !diaryFile) return
    setDiaryPublishing(true)
    setDiaryError("")
    let mediaUrl: string | null = null
    if (diaryFile) {
      const upload = await uploadCampaignImage(diaryFile, "character-diary", campaignId)
      if (!upload.ok) {
        setDiaryPublishing(false)
        setDiaryError(upload.error)
        return
      }
      mediaUrl = upload.url
    }
    const result = await data.addDiaryPost(diaryDraft, mediaUrl)
    setDiaryPublishing(false)
    if (!result.ok) {
      setDiaryError(result.error || "Не удалось опубликовать запись.")
      return
    }
    setDiaryDraft("")
    setDiaryFile(null)
  }

  async function addComment(postId: string) {
    const body = commentDrafts[postId]?.trim()
    if (!body) return
    const result = await data.addComment(postId, body)
    if (!result.ok) {
      setDiaryError(result.error || "Не удалось добавить комментарий.")
      return
    }
    setCommentDrafts((current) => ({ ...current, [postId]: "" }))
  }

  function commentsFor(postId: string): DiaryComment[] {
    return data.comments.filter((comment) => comment.post_id === postId)
  }

  function authorName(userId: string): string {
    return members.find((item) => item.user_id === userId)?.display_name || "Игрок"
  }

  async function saveEditedPost(event: FormEvent) {
    event.preventDefault()
    if (!editingPost) return
    setPostSaving(true)
    const result = await data.updateDiaryPost(editingPost.id, editingPostBody)
    setPostSaving(false)
    if (!result.ok) {
      setDiaryError(result.error || "Не удалось сохранить запись.")
      return
    }
    setEditingPost(null)
  }

  async function deletePost(post: DiaryPost) {
    if (!window.confirm("Удалить эту запись из дневника?")) return
    const result = await data.deleteDiaryPost(post.id)
    if (!result.ok) setDiaryError(result.error || "Не удалось удалить запись.")
  }

  async function deleteComment(comment: DiaryComment) {
    if (!window.confirm("Удалить комментарий?")) return
    const result = await data.deleteComment(comment.id)
    if (!result.ok) setDiaryError(result.error || "Не удалось удалить комментарий.")
  }

  function diaryActions(target: DiaryMenu): ContextAction[] {
    if (target.type === "comment") {
      const own = target.item.created_by === user.id
      return [
        { id: "copy", label: "Копировать", detail: "Текст комментария", icon: "▣", onSelect: () => navigator.clipboard?.writeText(target.item.body) },
        ...((canManage || own) ? [{ id: "delete", label: "Удалить", detail: "Удалить комментарий", icon: "×", danger: true, onSelect: () => deleteComment(target.item) } satisfies ContextAction] : []),
      ]
    }
    const own = target.item.created_by === user.id
    return [
      { id: "comments", label: openComments === target.item.id ? "Скрыть комментарии" : "Комментарии", detail: `${commentsFor(target.item.id).length}`, icon: "◯", onSelect: () => setOpenComments(openComments === target.item.id ? null : target.item.id) },
      ...(target.item.body ? [{ id: "copy", label: "Копировать", detail: "Текст записи", icon: "▣", onSelect: () => navigator.clipboard?.writeText(target.item.body) } satisfies ContextAction] : []),
      ...((canManage || own) ? [
        { id: "edit", label: "Редактировать", detail: "Изменить текст", icon: "✎", onSelect: () => { setEditingPostBody(target.item.body); setEditingPost(target.item) } } satisfies ContextAction,
        { id: "delete", label: "Удалить", detail: "Удалить запись", icon: "×", danger: true, onSelect: () => deletePost(target.item) } satisfies ContextAction,
      ] : []),
    ]
  }

  async function uploadArt(file: File | null) {
    if (!file) return
    setArtUploading(true)
    setArtError("")
    const upload = await uploadCampaignImage(file, "character-art", campaignId)
    if (!upload.ok) {
      setArtUploading(false)
      setArtError(upload.error)
      return
    }
    const title = file.name.replace(/\.[^.]+$/, "").slice(0, 120) || currentCharacter.name
    const result = await data.addArt(title, upload.url)
    setArtUploading(false)
    if (!result.ok) setArtError(result.error || "Не удалось добавить арт.")
  }

  function openArtEditor(art: CharacterArt) {
    setArtTitle(art.title)
    setArtCaption(art.caption)
    setEditingArt(art)
    setSelectedArt(null)
  }

  async function saveArt(event: FormEvent) {
    event.preventDefault()
    if (!editingArt) return
    setArtSaving(true)
    const result = await data.updateArt(editingArt.id, artTitle, artCaption)
    setArtSaving(false)
    if (!result.ok) {
      setArtError(result.error || "Не удалось сохранить арт.")
      return
    }
    setEditingArt(null)
  }

  async function deleteArt(art: CharacterArt) {
    if (!window.confirm(`Удалить арт «${art.title || currentCharacter.name}»?`)) return
    const result = await data.deleteArt(art.id)
    if (!result.ok) {
      setArtError(result.error || "Не удалось удалить арт.")
      return
    }
    setSelectedArt(null)
  }

  function artActions(target: ArtMenu): ContextAction[] {
    const art = target.item
    const editable = canManage || art.uploaded_by === user.id
    return [
      { id: "open", label: "Открыть арт", detail: "Посмотреть целиком", icon: "↗", onSelect: () => setSelectedArt(art) },
      ...(editable ? [
        { id: "edit", label: "Редактировать", detail: "Название и подпись", icon: "✎", onSelect: () => openArtEditor(art) } satisfies ContextAction,
        { id: "delete", label: "Удалить арт", detail: "Удалить из галереи", icon: "×", danger: true, onSelect: () => deleteArt(art) } satisfies ContextAction,
      ] : []),
    ]
  }

  const fullName = member ? `${currentCharacter.name} (${member.display_name})` : currentCharacter.name
  const runtimeTab = tab === "sheet" || tab === "class" || tab === "spells"
  const runtimePanelState = !resolved
    ? <div className="center-state">
        {runtime.error
          ? <><span>CE не смог собрать персонажа: {runtime.error}</span><button className="section-link" type="button" onClick={runtime.refresh}>Повторить</button></>
          : <><span className="status-spinner" /><span>Собираем механику персонажа…</span></>}
      </div>
    : runtime.error
      ? <div className="auth-error">CE показывает последний доступный расчёт: {runtime.error} <button className="section-link" type="button" onClick={runtime.refresh}>Повторить</button></div>
      : null

  return (
    <div className={`screen character-profile-screen character-profile-v2 ${embedded ? "character-profile-screen--embedded" : ""}`}>
      {!embedded && <header className="screen-header"><button className="icon-button" type="button" onClick={onBack} aria-label="Назад">←</button><h1 className="screen-header__title">{fullName}</h1><span /></header>}

      <div className="profile-scroll character-profile-scroll profile-v3">
        <section className="profile-v3__hero">
          <button
            className="profile-v3__portrait"
            type="button"
            onClick={canEditAvatar ? () => { setAvatarUrl(currentCharacter.avatar_url || ""); setAvatarError(""); setEditor({ type: "avatar" }) } : undefined}
            aria-label={canEditAvatar ? "Изменить портрет" : `Портрет ${currentCharacter.name}`}
          >
            {currentCharacter.avatar_url
              ? <CampaignImage value={currentCharacter.avatar_url} alt={`Портрет ${currentCharacter.name}`} />
              : <span>{currentCharacter.name.slice(0, 1).toUpperCase()}</span>}
            {canEditAvatar && <i aria-hidden="true">✎</i>}
          </button>
          <div className="profile-v3__identity">
            <div className="profile-v3__name-row">
              <div>
                <span>Персонаж</span>
                <h2>{currentCharacter.name}</h2>
              </div>
              {active && <span className="profile-v3__active">Активен</span>}
            </div>
            {member && <p>Игрок · {member.display_name}</p>}
            <button className="profile-v3__class" type="button" onClick={() => setTab("class")}>
              <span><strong>{currentCharacter.character_class || "Класс не указан"}</strong><small>{currentCharacter.level} уровень · открыть класс</small></span>
              <i aria-hidden="true">›</i>
            </button>
            {currentCharacter.bio && <p className="profile-v3__bio">{currentCharacter.bio}</p>}
          </div>
          <button className="profile-v3__reference" type="button" onClick={() => setReference({ section: "classes", classId })}>
            <span aria-hidden="true">⌘</span>
            <span><strong>Справочник</strong><small>Классы и правила</small></span>
          </button>
        </section>

        <nav className="profile-v3__tabs" aria-label="Разделы персонажа">
          <button className={tab === "sheet" ? "is-active" : ""} type="button" onClick={() => setTab("sheet")}><span aria-hidden="true">◈</span>Лист</button>
          <button className={tab === "class" ? "is-active" : ""} type="button" onClick={() => setTab("class")}><span aria-hidden="true">◇</span>Класс</button>
          {(magicSectionVisible || canManage) && <button className={tab === "spells" ? "is-active" : ""} type="button" onClick={() => setTab("spells")}><span aria-hidden="true">✦</span>Магия</button>}
          <button className={tab === "inventory" ? "is-active" : ""} type="button" onClick={() => setTab("inventory")}><span aria-hidden="true">▣</span>Вещи</button>
          <button className={tab === "diary" ? "is-active" : ""} type="button" onClick={() => setTab("diary")}><span aria-hidden="true">≡</span>Дневник</button>
          <button className={tab === "arts" ? "is-active" : ""} type="button" onClick={() => setTab("arts")}><span aria-hidden="true">◇</span>Арты</button>
        </nav>

        {data.loading && <div className="center-state"><span className="status-spinner" /><span>Загружаем данные персонажа…</span></div>}
        {data.error && <div className="auth-error">{data.error}</div>}
        {!data.loading && runtimeTab && runtimePanelState}

        {!data.loading && tab === "sheet" && sheet && resolved && (
          <ResolvedCharacterSheet
            input={resolved.input}
            contract={resolved.contract}
            narrative={sheet}
            characterClass={currentCharacter.character_class}
            spellcastingAbility={resolved.spellcastingAbility}
            canManage={canManage}
            features={data.features}
            onEditSheet={() => setEditor({ type: "sheet" })}
            onEditResources={() => setEditor({ type: "resources" })}
            onAddFeature={() => setEditor({ type: "feature", feature: null })}
            onEditFeature={(feature) => setEditor({ type: "feature", feature })}
            onDeleteFeature={data.deleteFeature}
            onOpenClassReference={() => setReference({ section: "classes", classId })}
            onOpenSpells={(level) => {
              setSpellLevelFilter(level ?? null)
              setTab("spells")
            }}
          />
        )}

        {!data.loading && tab === "class" && resolved && (
          <CharacterClassPanel
            characterId={characterId}
            contract={resolved.contract}
            onOpenReference={() => setReference({ section: "classes", classId })}
          />
        )}

        {!data.loading && tab === "spells" && sheet && resolved && (
          <CharacterSpellbook
            sheet={sheet}
            contract={resolved.contract}
            spellcastingAbility={resolved.spellcastingAbility}
            spells={data.spells}
            options={visibleOptions}
            canManage={canManage}
            canChooseSpells={canChooseSpells}
            selectedLevel={spellLevelFilter}
            actionId={spellActionId}
            error={spellError}
            onSelectedLevelChange={setSpellLevelFilter}
            onOpenReference={() => setReference({ section: "spells" })}
            onEditResources={() => setEditor({ type: "resources" })}
            onEnableMagic={() => void data.setSpellcastingEnabled(true)}
            onDisableMagic={() => void data.setSpellcastingEnabled(false)}
            onAddOption={() => setEditor({ type: "spell-option", option: null })}
            onEditOption={(option) => setEditor({ type: "spell-option", option })}
            onLearn={(option) => void learnSpell(option)}
            onTogglePrepared={(spell) => void togglePrepared(spell)}
            onForget={(spell) => void forgetSpell(spell)}
            onEditSpell={(spell) => setEditor({ type: "spell", spell })}
          />
        )}

        {!data.loading && tab === "inventory" && (
          <section className="v2-inventory-wrap">
            <div className="v2-subtabs"><button className={inventoryMode === "inventory" ? "v2-subtab v2-subtab--active" : "v2-subtab"} type="button" onClick={() => setInventoryMode("inventory")}>Предметы</button><button className={inventoryMode === "equipment" ? "v2-subtab v2-subtab--active" : "v2-subtab"} type="button" onClick={() => setInventoryMode("equipment")}>Экипировка</button></div>
            <CharacterInventory mode={inventoryMode} items={data.inventory} canManage={canManage} canEquip={canUseInventory} onCreate={() => setEditor({ type: "inventory", item: null })} onEdit={(item) => setEditor({ type: "inventory", item })} onDelete={data.deleteInventoryItem} onSetEquipped={data.setInventoryEquipped} />
          </section>
        )}

        {!data.loading && tab === "diary" && (
          <section className="character-tab-section v2-diary">
            <div className="section-head"><div><h3 className="section-title">Дневник</h3><p className="item-meta">Записи персонажа видны тем, кому доступен персонаж</p></div></div>
            {canWriteDiary && <form className="v2-diary-compose surface" onSubmit={publishDiary}><textarea value={diaryDraft} onChange={(event) => setDiaryDraft(event.target.value)} placeholder={`Что записывает ${currentCharacter.name}?`} /><div><label className="section-link">{diaryFile ? diaryFile.name : "+ Изображение"}<input type="file" accept="image/*" onChange={(event) => setDiaryFile(event.target.files?.[0] || null)} /></label><button type="submit" disabled={diaryPublishing || (!diaryDraft.trim() && !diaryFile)}>{diaryPublishing ? "Публикуем…" : "Записать"}</button></div></form>}
            {diaryError && <div className="auth-error">{diaryError}</div>}
            <div className="v2-diary-list">{data.posts.map((post) => <article className="v2-diary-post surface" key={post.id} {...bindDiaryLongPress({ type: "post", item: post })} style={{ touchAction: "pan-y" }}><div className="v2-diary-post__meta"><strong>{authorName(post.created_by)}</strong><span>{formatTime(post.created_at)}</span></div>{post.body && <p>{post.body}</p>}{post.media_url && <CampaignImage value={post.media_url} alt="Иллюстрация записи" />}<button className="v2-comments-toggle" type="button" onClick={() => setOpenComments(openComments === post.id ? null : post.id)}>Комментарии · {commentsFor(post.id).length}</button>{openComments === post.id && <div className="v2-comments">{commentsFor(post.id).map((comment) => <div className="v2-comment" key={comment.id} {...bindDiaryLongPress({ type: "comment", item: comment })} style={{ touchAction: "pan-y" }}><span><strong>{authorName(comment.created_by)}</strong><small>{formatTime(comment.created_at)}</small></span><p>{comment.body}</p></div>)}{canWriteDiary && <div className="v2-comment-compose"><input value={commentDrafts[post.id] || ""} onChange={(event) => setCommentDrafts((current) => ({ ...current, [post.id]: event.target.value }))} placeholder="Комментарий" /><button type="button" onClick={() => void addComment(post.id)}>Отправить</button></div>}</div>}</article>)}</div>
            {data.posts.length === 0 && <div className="character-empty surface">В дневнике пока пусто.</div>}
          </section>
        )}

        {!data.loading && tab === "arts" && (
          <section className="character-tab-section">
            <div className="section-head"><div><h3 className="section-title">Галерея персонажа</h3><p className="item-meta">Портреты, сцены и памятные моменты</p></div>{(canManage || isAssignedPlayer) && <label className="section-link character-art-upload">{artUploading ? "Загрузка…" : "+ Арт"}<input type="file" accept="image/*" disabled={artUploading} onChange={(event) => { void uploadArt(event.target.files?.[0] || null); event.currentTarget.value = "" }} /></label>}</div>
            {artError && <div className="auth-error">{artError}</div>}
            <div className="character-art-grid">{data.arts.map((art) => <button type="button" key={art.id} aria-label={art.title} onClick={() => setSelectedArt(art)} {...bindArtLongPress({ item: art })} style={{ touchAction: "pan-y" }}><CampaignImage value={art.image_url} alt={art.title} loading="lazy" /></button>)}</div>
            {data.arts.length === 0 && <div className="character-empty surface">У персонажа пока нет артов.</div>}
          </section>
        )}
      </div>

      {editor?.type === "avatar" && canEditAvatar && <div className="sheet-backdrop" onMouseDown={() => setEditor(null)}><form className="bottom-sheet compact-editor-sheet" onSubmit={saveAvatar} onMouseDown={(event) => event.stopPropagation()}><div className="sheet-handle" /><div className="character-editor-head"><div><h3 className="sheet-title">Портрет персонажа</h3><p className="sheet-copy">Выбери изображение, затем сам настрой квадрат кадра.</p></div><button className="sheet-close" type="button" onClick={() => setEditor(null)}>×</button></div><ImageUploadField value={avatarUrl} onChange={setAvatarUrl} folder="character-avatars" campaignId={campaignId} label="Изображение персонажа" hint="После выбора перемести и увеличь изображение внутри квадрата." crop="square" />{avatarError && <div className="auth-error">{avatarError}</div>}<button className="sheet-save" type="submit" disabled={avatarSaving}>{avatarSaving ? "Сохраняем…" : "Сохранить портрет"}</button></form></div>}
      {editor?.type === "sheet" && sheet && canManage && <CharacterSheetEditor sheet={sheet} systemEditable onClose={() => setEditor(null)} onSave={data.updateSheet} />}
      {editor?.type === "resources" && sheet && canManage && <CharacterResourcesEditor sheet={sheet} onClose={() => setEditor(null)} onSave={data.updateSheet} />}
      {editor?.type === "inventory" && canManage && <InventoryItemEditor item={editor.item} campaignId={campaignId} onClose={() => setEditor(null)} onSave={(input) => editor.item ? data.updateInventoryItem(editor.item.id, input) : data.addInventoryItem(input)} onDelete={editor.item ? () => data.deleteInventoryItem(editor.item!.id) : undefined} />}
      {editor?.type === "spell" && canManage && <SpellEditor spell={editor.spell} onClose={() => setEditor(null)} onSave={(input) => editor.spell ? data.updateSpell(editor.spell.id, input) : data.addSpell(input)} onDelete={editor.spell ? () => data.deleteSpell(editor.spell!.id) : undefined} />}
      {editor?.type === "spell-option" && canManage && <SpellEditor spell={editor.option} purpose="option" onClose={() => setEditor(null)} onSave={(input) => editor.option ? data.updateSpellOption(editor.option.id, input) : data.addSpellOption(input)} onDelete={editor.option ? () => data.deleteSpellOption(editor.option!.id) : undefined} />}
      {editor?.type === "feature" && canManage && <FeatureEditor feature={editor.feature} onClose={() => setEditor(null)} onSave={(input) => editor.feature ? data.updateFeature(editor.feature.id, input) : data.addFeature(input)} onDelete={editor.feature ? () => data.deleteFeature(editor.feature!.id) : undefined} />}

      {editingPost && <div className="sheet-backdrop" onMouseDown={() => setEditingPost(null)}><form className="bottom-sheet compact-editor-sheet" onSubmit={saveEditedPost} onMouseDown={(event) => event.stopPropagation()}><div className="sheet-handle" /><div className="character-editor-head"><div><h3 className="sheet-title">Редактировать запись</h3><p className="sheet-copy">Дневник персонажа</p></div><button className="sheet-close" type="button" onClick={() => setEditingPost(null)}>×</button></div><label className="editor-label">Текст<textarea value={editingPostBody} onChange={(event) => setEditingPostBody(event.target.value)} /></label><button className="sheet-save" type="submit" disabled={postSaving}>{postSaving ? "Сохраняем…" : "Сохранить"}</button></form></div>}

      {selectedArt && <div className="sheet-backdrop" onMouseDown={() => setSelectedArt(null)}><div className="bottom-sheet art-viewer-sheet" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-handle" /><div className="character-editor-head"><div><h3 className="sheet-title">{selectedArt.title || currentCharacter.name}</h3><p className="sheet-copy">Галерея персонажа</p></div><button className="sheet-close" type="button" onClick={() => setSelectedArt(null)}>×</button></div><CampaignImage className="art-viewer-image" value={selectedArt.image_url} alt={selectedArt.title} />{selectedArt.caption && <p className="sheet-copy">{selectedArt.caption}</p>}{(canManage || selectedArt.uploaded_by === user.id) && <div className="spell-card__actions"><button className="inline-edit-button" type="button" onClick={() => openArtEditor(selectedArt)}>✎ Редактировать</button><button className="danger-mini-button" type="button" onClick={() => void deleteArt(selectedArt)}>Удалить</button></div>}</div></div>}

      {editingArt && <div className="sheet-backdrop" onMouseDown={() => setEditingArt(null)}><form className="bottom-sheet compact-editor-sheet" onSubmit={saveArt} onMouseDown={(event) => event.stopPropagation()}><div className="sheet-handle" /><div className="character-editor-head"><div><h3 className="sheet-title">Редактировать арт</h3><p className="sheet-copy">Название и подпись</p></div><button className="sheet-close" type="button" onClick={() => setEditingArt(null)}>×</button></div><label className="editor-label">Название<input value={artTitle} onChange={(event) => setArtTitle(event.target.value)} /></label><label className="editor-label">Подпись<textarea value={artCaption} onChange={(event) => setArtCaption(event.target.value)} /></label><button className="sheet-save" type="submit" disabled={artSaving}>{artSaving ? "Сохраняем…" : "Сохранить"}</button></form></div>}

      {diaryMenu && <ContextActionSheet title={diaryMenu.type === "post" ? "Запись дневника" : "Комментарий"} subtitle="Долгое нажатие открывает действия" actions={diaryActions(diaryMenu)} onClose={() => setDiaryMenu(null)} />}
      {artMenu && <ContextActionSheet title={artMenu.item.title || currentCharacter.name} subtitle="Долгое нажатие открывает действия с артом" actions={artActions(artMenu)} onClose={() => setArtMenu(null)} />}

      {reference && <ReferenceGuide key={`${reference.section}:${reference.section === "classes" ? reference.classId || "all" : "spells"}`} character={{ id: currentCharacter.id, name: currentCharacter.name, character_class: currentCharacter.character_class }} canManage={canManage} onClose={() => setReference(null)} onCharacterChanged={data.reload} initialSection={reference.section} initialClassId={reference.section === "classes" ? reference.classId : null} />}
    </div>
  )
}
