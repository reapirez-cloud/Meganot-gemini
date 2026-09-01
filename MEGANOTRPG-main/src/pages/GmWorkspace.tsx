import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { FormEvent } from "react"
import { useAuth } from "../context/AuthContext"
import { useCharacters, type Character } from "../context/CharacterContext"
import { useNpcZoneHabitats } from "../hooks/useNpcZoneHabitats"
import CharacterAvatar from "../components/characters/CharacterAvatar"
import CharacterCreationWizard, { type CharacterWizardTarget } from "../components/characters/CharacterCreationWizard"
import ContextActionSheet from "../components/common/ContextActionSheet"
import type { ContextAction } from "../components/common/ContextActionSheet"
import { NpcHabitatZonesSheet } from "../components/world/NpcZoneHabitatSheet"
import GmItemLibrary from "../components/gm/GmItemLibrary"
import GmMembersPanel from "../components/gm/GmMembersPanel"
import GmZoneManager from "../components/gm/GmZoneManager"
import { useLongPressItem } from "../hooks/useLongPressItem"
import { supabase } from "../lib/supabase"
import { deleteCampaignMediaObject, uploadCampaignFile } from "../lib/mediaUpload"
import { resolveCampaignMediaUrl } from "../lib/campaignMedia"

type Props = { onOpenCharacter: (id: string) => void; onOpenRoom: (id: string) => void }
type Tab = "characters" | "members" | "items" | "zones" | "materials"
type CharacterKind = "pc" | "npc"
type FileRow = { id: string; folder_id: string | null; kind: "note" | "upload"; title: string; body: string; file_url: string | null; original_name: string | null; mime_type: string | null; updated_at: string }
type FolderRow = { id: string; name: string; sort_order: number }

function MaterialLink({ value, label }: { value: string; label: string }) {
  const [href, setHref] = useState<string | null>(null)
  useEffect(() => {
    let cancel = false
    void resolveCampaignMediaUrl(value).then((url) => { if (!cancel) setHref(url) })
    return () => { cancel = true }
  }, [value])
  return href ? <a className="control-file-link" href={href} target="_blank" rel="noreferrer">Открыть {label} ↗</a> : <span className="control-file-link">Готовим ссылку…</span>
}

export default function GmWorkspace({ onOpenCharacter }: Props) {
  const { user } = useAuth()
  const { campaignId, campaignTitle, characters, members, refresh, updateCharacter, deleteCharacter, setActiveForMember } = useCharacters()
  const habitats = useNpcZoneHabitats()

  const [tab, setTab] = useState<Tab>("characters")
  const [characterKind, setCharacterKind] = useState<CharacterKind>("pc")
  const [query, setQuery] = useState("")
  const [editor, setEditor] = useState<CharacterWizardTarget | null>(null)
  const [characterMenu, setCharacterMenu] = useState<Character | null>(null)
  const [assignmentTarget, setAssignmentTarget] = useState<Character | null>(null)
  const [assignmentUserId, setAssignmentUserId] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<Character | null>(null)
  const [zoneNpcTarget, setZoneNpcTarget] = useState<Character | null>(null)

  const [folders, setFolders] = useState<FolderRow[]>([])
  const [files, setFiles] = useState<FileRow[]>([])
  const [folder, setFolder] = useState("all")
  const [noteOpen, setNoteOpen] = useState<FileRow | null | "new">(null)
  const [noteTitle, setNoteTitle] = useState("")
  const [noteBody, setNoteBody] = useState("")
  const [folderEditor, setFolderEditor] = useState<FolderRow | "new" | null>(null)
  const [folderName, setFolderName] = useState("")
  const [folderMenu, setFolderMenu] = useState<FolderRow | null>(null)
  const [folderDeleteTarget, setFolderDeleteTarget] = useState<FolderRow | null>(null)
  const [materialCreateMenu, setMaterialCreateMenu] = useState(false)
  const [fileMenu, setFileMenu] = useState<FileRow | null>(null)
  const uploadRef = useRef<HTMLInputElement | null>(null)

  const activeIds = useMemo(() => new Set(members.map((member) => member.active_character_id).filter(Boolean)), [members])
  const characterCounts = useMemo(() => ({
    pc: characters.filter((character) => character.character_type === "pc").length,
    npc: characters.filter((character) => character.character_type === "npc").length,
  }), [characters])
  const visibleCharacters = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ru-RU")
    return characters
      .filter((character) => character.character_type === characterKind)
      .filter((character) => !needle || `${character.name} ${character.character_class} ${character.bio}`.toLocaleLowerCase("ru-RU").includes(needle))
      .sort((left, right) => left.name.localeCompare(right.name, "ru"))
  }, [characterKind, characters, query])

  const loadMaterials = useCallback(async () => {
    const [folderResult, fileResult] = await Promise.all([
      supabase.from("gm_workspace_folders").select("id,name,sort_order").eq("campaign_id", campaignId).eq("workspace_user_id", user.id).order("sort_order"),
      supabase.from("gm_workspace_files").select("id,folder_id,kind,title,body,file_url,original_name,mime_type,updated_at").eq("campaign_id", campaignId).eq("workspace_user_id", user.id).order("updated_at", { ascending: false }),
    ])
    if (folderResult.error || fileResult.error) { setError((folderResult.error || fileResult.error)!.message); return }
    setFolders((folderResult.data || []) as FolderRow[])
    setFiles((fileResult.data || []) as FileRow[])
  }, [campaignId, user.id])

  useEffect(() => {
    if (tab !== "materials") return
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) void loadMaterials() })
    return () => { cancelled = true }
  }, [loadMaterials, tab])

  const openFolderMenu = useCallback((item: FolderRow) => setFolderMenu(item), [])
  const bindFolderLongPress = useLongPressItem(openFolderMenu)
  const visibleFiles = folder === "all" ? files : folder === "root" ? files.filter((file) => !file.folder_id) : files.filter((file) => file.folder_id === folder)

  function createChar(kind: CharacterKind) { setError(""); setEditor({ mode: "create", type: kind }) }
  function editChar(character: Character) { setError(""); setEditor({ mode: "edit", character }) }
  function openAssignment(character: Character) {
    if (character.character_type !== "pc") return
    setError("")
    setAssignmentTarget(character)
    setAssignmentUserId(character.assigned_user_id || "")
  }

  async function saveAssignment(event: FormEvent) {
    event.preventDefault()
    if (!assignmentTarget) return
    const nextUserId = assignmentUserId || null
    const previousUserId = assignmentTarget.assigned_user_id
    if (nextUserId === previousUserId) { setAssignmentTarget(null); return }

    const previousMember = previousUserId ? members.find((member) => member.user_id === previousUserId) : null
    const previousWasActive = previousMember?.active_character_id === assignmentTarget.id
    setSaving(true)
    setError("")

    if (previousWasActive && previousUserId) {
      const clearActive = await setActiveForMember(previousUserId, null)
      if (!clearActive.ok) {
        setSaving(false)
        setError(clearActive.error || "Не удалось снять прежнего активного персонажа.")
        return
      }
    }

    const result = await updateCharacter(assignmentTarget.id, {
      name: assignmentTarget.name,
      character_class: assignmentTarget.character_class,
      level: assignmentTarget.level,
      bio: assignmentTarget.bio,
      avatar_url: assignmentTarget.avatar_url,
      assigned_user_id: nextUserId,
      character_type: "pc",
      visibility: assignmentTarget.visibility,
    })

    if (!result.ok) {
      if (previousWasActive && previousUserId) void setActiveForMember(previousUserId, assignmentTarget.id)
      setSaving(false)
      setError(result.error || "Не удалось назначить персонажа игроку.")
      return
    }

    setSaving(false)
    setAssignmentTarget(null)
  }

  async function removeCharacter() {
    if (!deleteTarget) return
    setSaving(true)
    const result = await deleteCharacter(deleteTarget.id)
    setSaving(false)
    if (!result.ok) { setError(result.error || "Не удалось удалить персонажа."); return }
    if (deleteTarget.avatar_url) void deleteCampaignMediaObject(deleteTarget.avatar_url)
    setDeleteTarget(null)
  }

  async function toggleActive(character: Character) {
    if (!character.assigned_user_id) return
    const active = activeIds.has(character.id)
    const result = await setActiveForMember(character.assigned_user_id, active ? null : character.id)
    if (!result.ok) setError(result.error || "Не удалось изменить активность.")
  }

  async function toggleNpcHabitat(npc: Character, zoneId: string, attached: boolean) {
    const result = await habitats.setAttached(npc.id, zoneId, attached)
    if (!result.ok) setError(result.error || "Не удалось изменить обычную зону NPC.")
  }

  async function saveNote(event: FormEvent) {
    event.preventDefault()
    if (!noteOpen || !noteTitle.trim()) return
    setSaving(true)
    const payload = { campaign_id: campaignId, workspace_user_id: user.id, folder_id: folder !== "all" && folder !== "root" ? folder : null, created_by: user.id, kind: "note", title: noteTitle.trim(), body: noteBody.trim(), updated_at: new Date().toISOString() }
    const result = noteOpen === "new" ? await supabase.from("gm_workspace_files").insert(payload) : await supabase.from("gm_workspace_files").update(payload).eq("id", noteOpen.id)
    setSaving(false)
    if (result.error) { setError(result.error.message); return }
    setNoteOpen(null)
    await loadMaterials()
  }

  async function uploadFile(file: File | null) {
    if (!file) return
    setSaving(true)
    const upload = await uploadCampaignFile(file, "gm-private", campaignId)
    if (!upload.ok) { setSaving(false); setError(upload.error); return }
    const { error: uploadError } = await supabase.from("gm_workspace_files").insert({ campaign_id: campaignId, workspace_user_id: user.id, folder_id: folder !== "all" && folder !== "root" ? folder : null, created_by: user.id, kind: "upload", title: file.name.replace(/\.[^.]+$/, ""), file_url: upload.url, original_name: file.name, mime_type: file.type || null })
    setSaving(false)
    if (uploadError) { await deleteCampaignMediaObject(upload.url); setError(uploadError.message); return }
    await loadMaterials()
  }

  async function deleteFile(file: FileRow) {
    const { error: deleteError } = await supabase.from("gm_workspace_files").delete().eq("id", file.id)
    if (deleteError) { setError(deleteError.message); return }
    if (file.file_url) void deleteCampaignMediaObject(file.file_url)
    setFileMenu(null)
    await loadMaterials()
  }

  function editFolder(target: FolderRow | "new") {
    setFolderName(target === "new" ? "" : target.name)
    setFolderEditor(target)
    setError("")
  }

  async function saveFolder(event: FormEvent) {
    event.preventDefault()
    if (!folderEditor || !folderName.trim()) return
    setSaving(true)
    const request = folderEditor === "new"
      ? supabase.from("gm_workspace_folders").insert({ campaign_id: campaignId, workspace_user_id: user.id, name: folderName.trim() })
      : supabase.from("gm_workspace_folders").update({ name: folderName.trim() }).eq("id", folderEditor.id).eq("campaign_id", campaignId).eq("workspace_user_id", user.id)
    const { error: folderError } = await request
    setSaving(false)
    if (folderError) { setError(folderError.message); return }
    setFolderEditor(null)
    await loadMaterials()
  }

  async function deleteFolder() {
    if (!folderDeleteTarget) return
    setSaving(true)
    const { error: folderError } = await supabase.from("gm_workspace_folders").delete().eq("id", folderDeleteTarget.id).eq("campaign_id", campaignId).eq("workspace_user_id", user.id)
    setSaving(false)
    if (folderError) { setError(folderError.message); return }
    if (folder === folderDeleteTarget.id) setFolder("root")
    setFolderDeleteTarget(null)
    await loadMaterials()
  }

  const characterActions: ContextAction[] = characterMenu ? [
    { id: "open", icon: "↗", label: "Открыть лист", detail: "Перейти к полному листу персонажа", onSelect: () => onOpenCharacter(characterMenu.id) },
    { id: "edit", icon: "✎", label: "Редактировать", detail: "Имя, тип, класс, видимость и основные данные", onSelect: () => editChar(characterMenu) },
    ...(characterMenu.character_type === "pc" ? [{ id: "assign", icon: "◎", label: characterMenu.assigned_user_id ? "Сменить игрока" : "Назначить игрока", detail: "Выдать или снять доступ к этому PC", onSelect: () => openAssignment(characterMenu) } satisfies ContextAction] : []),
    ...(characterMenu.character_type === "pc" && characterMenu.assigned_user_id ? [{ id: "active", icon: "◇", label: activeIds.has(characterMenu.id) ? "Убрать из активных" : "Сделать активным", detail: "Активный PC используется игроком в приложении", onSelect: () => void toggleActive(characterMenu) } satisfies ContextAction] : []),
    ...(characterMenu.character_type === "npc" ? [{ id: "zones", icon: "⌖", label: "Обычные зоны", detail: "Где этот NPC обычно может находиться", onSelect: () => setZoneNpcTarget(characterMenu) } satisfies ContextAction] : []),
    { id: "delete", icon: "×", label: "Удалить", detail: "Удалить персонажа и связанные данные", danger: true, onSelect: () => setDeleteTarget(characterMenu) },
  ] : []

  const folderActions: ContextAction[] = folderMenu ? [
    { id: "open", icon: "▤", label: "Открыть папку", detail: "Показать её заметки и файлы", onSelect: () => setFolder(folderMenu.id) },
    { id: "rename", icon: "✎", label: "Переименовать", detail: "Изменить название папки", onSelect: () => editFolder(folderMenu) },
    { id: "delete", icon: "×", label: "Удалить папку", detail: "Материалы останутся без папки", danger: true, onSelect: () => setFolderDeleteTarget(folderMenu) },
  ] : []

  const materialCreateActions: ContextAction[] = [
    { id: "note", icon: "✎", label: "Новая заметка", detail: "Личная запись по сюжету, NPC или идее", onSelect: () => { setNoteTitle(""); setNoteBody(""); setNoteOpen("new") } },
    { id: "folder", icon: "▤", label: "Новая папка", detail: "Разложить личные материалы по темам", onSelect: () => editFolder("new") },
    { id: "upload", icon: "⇧", label: "Загрузить файл", detail: "Документ или другой приватный материал", onSelect: () => uploadRef.current?.click() },
  ]

  const fileActions: ContextAction[] = fileMenu ? [
    ...(fileMenu.kind === "note" ? [{ id: "edit", icon: "✎", label: "Редактировать", detail: "Изменить название или текст", onSelect: () => { setNoteTitle(fileMenu.title); setNoteBody(fileMenu.body); setNoteOpen(fileMenu) } } satisfies ContextAction] : []),
    { id: "delete", icon: "×", label: "Удалить", detail: "Удалить этот материал", danger: true, onSelect: () => void deleteFile(fileMenu) },
  ] : []

  const tabs: Array<[Tab, string]> = [
    ["characters", "Персонажи"],
    ["members", "Участники"],
    ["items", "Предметы"],
    ["zones", "Зоны"],
    ["materials", "Материалы"],
  ]

  return <>
    <div className="gm-cabinet">
      <header className="gm-cabinet-head"><span>Кабинет ГМ</span><h2>{campaignTitle}</h2></header>

      <nav className="gm-primary-nav gm-primary-nav--five" role="tablist" aria-label="Разделы кабинета ГМ">
        {tabs.map(([id, label]) => <button type="button" role="tab" aria-selected={tab === id} className={tab === id ? "is-active" : ""} key={id} onClick={() => { setTab(id); setError("") }}>{label}</button>)}
      </nav>

      {error && <div className="auth-error">{error}</div>}

      {tab === "characters" && <section className="gm-section" aria-label="Персонажи">
        <div className="gm-subrail gm-subrail--two gm-character-kind" role="tablist" aria-label="Тип персонажа">
          <button type="button" role="tab" aria-selected={characterKind === "pc"} className={characterKind === "pc" ? "is-active" : ""} onClick={() => setCharacterKind("pc")}><span>PC</span><small>{characterCounts.pc}</small></button>
          <button type="button" role="tab" aria-selected={characterKind === "npc"} className={characterKind === "npc" ? "is-active" : ""} onClick={() => setCharacterKind("npc")}><span>NPC</span><small>{characterCounts.npc}</small></button>
        </div>

        <div className="gm-list-tools">
          <label className="gm-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={characterKind === "pc" ? "Найти PC" : "Найти NPC"}/></label>
          <button className="gm-add-button" type="button" onClick={() => createChar(characterKind)} aria-label={characterKind === "pc" ? "Создать PC" : "Создать NPC"}>＋</button>
        </div>

        {habitats.error && <div className="auth-error">{habitats.error}</div>}

        <div className="gm-clean-list gm-character-list">
          {visibleCharacters.map((character) => {
            const member = character.assigned_user_id ? members.find((item) => item.user_id === character.assigned_user_id) : null
            const habitatCount = character.character_type === "npc" ? habitats.zonesForNpc(character.id).length : 0
            const meta = character.character_type === "pc"
              ? `${character.character_class || "Без класса"} · ${character.level} ур. · ${member?.display_name || "не назначен"}`
              : `${character.character_class || "Без класса"} · ${character.level} ур.${habitatCount ? ` · зон: ${habitatCount}` : ""}`
            return <article className="gm-clean-row gm-character-row" key={character.id}>
              <button className="gm-clean-row__main" type="button" onClick={() => onOpenCharacter(character.id)}>
                <CharacterAvatar character={character} size="small"/>
                <span className="gm-row-copy"><strong>{character.name}{character.visibility === "private" && <i>Только я</i>}</strong><small>{meta}</small></span>
              </button>
              <button className="gm-row-more" type="button" onClick={() => setCharacterMenu(character)} aria-label={`Действия с персонажем ${character.name}`}>•••</button>
            </article>
          })}
          {!visibleCharacters.length && <div className="gm-empty"><span>{characterKind === "pc" ? "PC" : "NPC"}</span><strong>{query.trim() ? "Ничего не найдено" : characterKind === "pc" ? "PC пока нет" : "NPC пока нет"}</strong><p>{query.trim() ? "Измени запрос." : `Нажми +, чтобы создать ${characterKind === "pc" ? "персонажа игрока" : "NPC"}.`}</p></div>}
        </div>
      </section>}

      {tab === "members" && <GmMembersPanel/>}
      {tab === "items" && <GmItemLibrary/>}
      {tab === "zones" && <GmZoneManager/>}

      {tab === "materials" && <section className="gm-section" aria-label="Личные материалы">
        <input ref={uploadRef} className="media-hidden-input" type="file" onChange={(event) => { void uploadFile(event.target.files?.[0] || null); event.currentTarget.value = "" }}/>
        <div className="gm-material-nav">
          <div className="control-filter-rail gm-folder-rail-v2"><button className={folder === "all" ? "is-active" : ""} type="button" onClick={() => setFolder("all")}>Все</button><button className={folder === "root" ? "is-active" : ""} type="button" onClick={() => setFolder("root")}>Без папки</button>{folders.map((item) => <button className={folder === item.id ? "is-active" : ""} type="button" key={item.id} onClick={() => setFolder(item.id)} aria-label={`${item.name}. Удерживайте для действий`} {...bindFolderLongPress(item)}>{item.name}</button>)}</div>
          <button className="gm-add-button" type="button" onClick={() => setMaterialCreateMenu(true)} aria-label="Добавить материал">＋</button>
        </div>
        {folders.length > 0 && <p className="control-folder-hint">Удерживай папку, чтобы переименовать или удалить её.</p>}

        <div className="gm-clean-list gm-material-list">
          {visibleFiles.map((file) => <article className="gm-clean-row gm-material-row" key={file.id}>
            <button className="gm-clean-row__main" type="button" onClick={() => { if (file.kind === "note") { setNoteTitle(file.title); setNoteBody(file.body); setNoteOpen(file) } }}>
              <span className="gm-row-mark" aria-hidden="true">{file.kind === "note" ? "✎" : "▧"}</span>
              <span className="gm-row-copy"><strong>{file.title}</strong><small>{new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(file.updated_at))}</small>{file.kind === "note" && file.body && <p>{file.body}</p>}{file.kind === "upload" && file.file_url && <MaterialLink value={file.file_url} label={file.original_name || "файл"}/>}</span>
            </button>
            <button className="gm-row-more" type="button" onClick={() => setFileMenu(file)} aria-label={`Действия с материалом ${file.title}`}>•••</button>
          </article>)}
          {!visibleFiles.length && <div className="gm-empty"><span>▤</span><strong>Здесь пока пусто</strong><p>Заметки, папки и файлы этого раздела видишь только ты.</p></div>}
        </div>
      </section>}
    </div>

    {editor && <CharacterCreationWizard target={editor} campaignId={campaignId} members={members} updateCharacter={updateCharacter} onClose={() => setEditor(null)} onSaved={async (characterId, openCharacter) => { await refresh(); setEditor(null); if (openCharacter) onOpenCharacter(characterId) }}/>} 

    {characterMenu && <ContextActionSheet title={characterMenu.name} subtitle={characterMenu.character_type === "pc" ? "Персонаж игрока" : "NPC"} actions={characterActions} onClose={() => setCharacterMenu(null)}/>} 

    {assignmentTarget && <div className="sheet-backdrop" onMouseDown={() => { if (!saving) setAssignmentTarget(null) }}><form className="bottom-sheet v2-editor-sheet gm-short-sheet" onSubmit={saveAssignment} onMouseDown={(event) => event.stopPropagation()}><div className="sheet-handle"/><header className="v2-sheet-head"><div><span>Доступ к PC</span><h3>{assignmentTarget.name}</h3><p>Выбери игрока, которому принадлежит этот персонаж.</p></div><button type="button" onClick={() => setAssignmentTarget(null)} disabled={saving}>×</button></header><section className="v2-form-section"><label className="field-label" htmlFor="character-assignment-player">Игрок</label><select id="character-assignment-player" className="app-select" value={assignmentUserId} onChange={(event) => setAssignmentUserId(event.target.value)} disabled={saving}><option value="">Никому</option>{members.map((member) => <option key={member.user_id} value={member.user_id}>{member.display_name}{member.telegram_username ? ` · @${member.telegram_username}` : member.is_owner ? " · владелец" : member.role === "gm" ? " · ГМ" : ""}</option>)}</select><p className="control-field-help">Если этот PC был активным у прежнего игрока, активный выбор будет снят перед передачей.</p></section><button className="v2-primary-button v2-full-button" type="submit" disabled={saving || assignmentUserId === (assignmentTarget.assigned_user_id || "")}>{saving ? "Назначаем…" : assignmentUserId ? "Сохранить назначение" : "Снять назначение"}</button></form></div>}

    {zoneNpcTarget && <NpcHabitatZonesSheet npc={zoneNpcTarget} zones={habitats.activeZones} selectedIds={new Set(habitats.zonesForNpc(zoneNpcTarget.id))} savingKey={habitats.savingKey} onClose={() => setZoneNpcTarget(null)} onToggle={(zoneId, next) => { void toggleNpcHabitat(zoneNpcTarget, zoneId, next) }}/>} 

    {deleteTarget && <div className="sheet-backdrop" onMouseDown={() => setDeleteTarget(null)}><section className="bottom-sheet v2-confirm" onMouseDown={(event) => event.stopPropagation()}><div className="sheet-handle"/><span className="v2-confirm-icon">×</span><h3>Удалить «{deleteTarget.name}»?</h3><p>Лист, инвентарь, дневник и связанные данные будут удалены.</p><div><button type="button" onClick={() => setDeleteTarget(null)}>Отмена</button><button className="is-danger" type="button" onClick={() => void removeCharacter()} disabled={saving}>Удалить</button></div></section></div>}

    {noteOpen && <div className="sheet-backdrop" onMouseDown={() => setNoteOpen(null)}><form className="bottom-sheet v2-editor-sheet" onSubmit={saveNote} onMouseDown={(event) => event.stopPropagation()}><div className="sheet-handle"/><header className="v2-sheet-head"><div><span>Материалы</span><h3>{noteOpen === "new" ? "Новая заметка" : "Редактировать заметку"}</h3><p>Эту запись видишь только ты.</p></div><button type="button" onClick={() => setNoteOpen(null)}>×</button></header><section className="v2-form-section"><label className="field-label">Название</label><input className="app-input" value={noteTitle} onChange={(event) => setNoteTitle(event.target.value)} autoFocus/><label className="field-label">Текст</label><textarea className="app-textarea control-note-text" value={noteBody} onChange={(event) => setNoteBody(event.target.value)}/></section><button className="v2-primary-button v2-full-button" type="submit" disabled={saving || !noteTitle.trim()}>Сохранить</button></form></div>}

    {folderEditor && <div className="sheet-backdrop" onMouseDown={() => setFolderEditor(null)}><form className="bottom-sheet v2-editor-sheet" onSubmit={saveFolder} onMouseDown={(event) => event.stopPropagation()}><div className="sheet-handle"/><header className="v2-sheet-head"><div><span>Материалы</span><h3>{folderEditor === "new" ? "Новая папка" : "Переименовать папку"}</h3><p>Папки видишь только ты.</p></div><button type="button" onClick={() => setFolderEditor(null)}>×</button></header><section className="v2-form-section"><label className="field-label" htmlFor="folder-name">Название</label><input id="folder-name" className="app-input" value={folderName} onChange={(event) => setFolderName(event.target.value)} maxLength={80} autoFocus/></section><button className="v2-primary-button v2-full-button" type="submit" disabled={saving || !folderName.trim()}>{saving ? "Сохраняем…" : "Сохранить"}</button></form></div>}

    {folderMenu && <ContextActionSheet title={folderMenu.name} subtitle="Действия с папкой" actions={folderActions} onClose={() => setFolderMenu(null)}/>} 
    {materialCreateMenu && <ContextActionSheet title="Добавить материал" subtitle="Личное рабочее пространство ГМ" actions={materialCreateActions} onClose={() => setMaterialCreateMenu(false)}/>} 
    {fileMenu && <ContextActionSheet title={fileMenu.title} subtitle={fileMenu.kind === "note" ? "Личная заметка" : "Личный файл"} actions={fileActions} onClose={() => setFileMenu(null)}/>} 

    {folderDeleteTarget && <div className="sheet-backdrop" onMouseDown={() => setFolderDeleteTarget(null)}><section className="bottom-sheet v2-confirm" role="dialog" aria-modal="true" aria-label={`Удалить папку ${folderDeleteTarget.name}`} onMouseDown={(event) => event.stopPropagation()}><div className="sheet-handle"/><span className="v2-confirm-icon">×</span><h3>Удалить «{folderDeleteTarget.name}»?</h3><p>Заметки и файлы не пропадут — они перейдут в «Без папки».</p><div><button type="button" onClick={() => setFolderDeleteTarget(null)}>Отмена</button><button className="is-danger" type="button" onClick={() => void deleteFolder()} disabled={saving}>{saving ? "Удаляем…" : "Удалить"}</button></div></section></div>}
  </>
}
