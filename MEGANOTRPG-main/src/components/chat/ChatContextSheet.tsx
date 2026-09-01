import { useCallback, useEffect, useMemo, useState } from "react"
import { useAuth } from "../../context/AuthContext"
import { useCharacters } from "../../context/CharacterContext"
import { createEngineCommandContext } from "../../engine-contracts/index.ts"
import { useWorldState } from "../../hooks/useWorldState"
import { oracle } from "../../oracle-engine/runtime.ts"
import { supabase } from "../../lib/supabase"
import { formatCampaignTime } from "../../world-state/time"
import type { DayPeriod } from "../../world-state/types"
import CharacterAvatar from "../characters/CharacterAvatar"
import WorldPositionSheet from "../world/WorldPositionSheet"
import "./ChatContextSheet.css"

type RoomRow = {
  id: string
  title: string
  room_type: "character" | "scene" | "flood"
  character_id: string | null
  location_id: string | null
  campaign_day: number
  day_period: DayPeriod
  room_state: "open" | "gm_only" | "closed"
  scene_state: "active" | "closed"
  open_to_campaign: boolean
  campaign_can_write: boolean
  is_read_only: boolean
}

type RecoveryTrigger = "short_rest" | "long_rest" | "dawn"
type PositionEditor = "location" | "time" | null

type Props = {
  roomId: string
  selectedCharacterId?: string | null
  onRecovery?: (characterId: string, trigger: RecoveryTrigger) => void
  onClose: () => void
  onOpenCharacter: (characterId: string) => void
  onOpenSettings?: () => void
  onChanged?: () => void
}

export default function ChatContextSheet({ roomId, selectedCharacterId = null, onRecovery, onClose, onOpenCharacter, onOpenSettings, onChanged }: Props) {
  const { user } = useAuth()
  const { characters, canManage, campaignId } = useCharacters()
  const [room, setRoom] = useState<RoomRow | null>(null)
  const [participants, setParticipants] = useState<string[]>([])
  const [editingPosition, setEditingPosition] = useState<PositionEditor>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const subjectCharacterId = room?.room_type === "character" ? room.character_id : null
  const world = useWorldState(subjectCharacterId)

  const loadRoom = useCallback(async () => {
    const { data, error: roomError } = await supabase.from("chat_rooms").select("id,title,room_type,character_id,location_id,campaign_day,day_period,room_state,scene_state,open_to_campaign,campaign_can_write,is_read_only").eq("id", roomId).maybeSingle()
    if (roomError || !data) { setError(roomError?.message || "Комната недоступна."); return }
    setRoom(data as RoomRow)
    if (data.room_type === "scene") {
      const { data: rows } = await supabase.from("scene_participants").select("character_id").eq("room_id", roomId)
      setParticipants((rows || []).map((row) => row.character_id))
    } else setParticipants([])
  }, [roomId])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) void loadRoom() })
    return () => { cancelled = true }
  }, [loadRoom])

  const character = useMemo(() => room?.character_id ? characters.find((item) => item.id === room.character_id) || null : null, [characters, room])
  const selectedCharacter = useMemo(() => selectedCharacterId ? characters.find((item) => item.id === selectedCharacterId) || null : null, [characters, selectedCharacterId])
  const recoveryCharacter = room?.room_type === "character" ? character : selectedCharacter
  const sceneParticipants = useMemo(() => participants.map((id) => characters.find((item) => item.id === id)).filter(Boolean), [characters, participants])
  const roomPosition = room ? { location_id: room.location_id, campaign_day: room.campaign_day || 1, day_period: room.day_period || "day" as DayPeriod } : null
  const contextPosition = room?.room_type === "character" ? (world.currentState || roomPosition) : roomPosition
  const contextLocation = world.locations.find((location) => location.id === contextPosition?.location_id) || null

  async function setRoomState(state: "open" | "gm_only" | "closed") {
    setBusy(true); setError("")
    const { error: rpcError } = await supabase.rpc("set_chat_room_state", { p_room_id: roomId, p_state: state })
    setBusy(false)
    if (rpcError) { setError(rpcError.message); return }
    await loadRoom(); onChanged?.()
  }

  async function setAccess(canRead: boolean, canWrite: boolean) {
    setBusy(true); setError("")
    const { error: rpcError } = await supabase.rpc("set_chat_room_campaign_access", { p_room_id: roomId, p_can_read: canRead, p_can_write: canWrite })
    setBusy(false)
    if (rpcError) { setError(rpcError.message); return }
    await loadRoom(); onChanged?.()
  }

  async function savePosition(locationId: string | null, campaignDay: number, dayPeriod: DayPeriod) {
    if (!room) return { ok: false, error: "Комната не найдена." }
    if (room.room_type === "character" && room.character_id) return world.setCharacterPosition(room.character_id, locationId, campaignDay, dayPeriod)
    if (room.room_type === "scene") return world.setScenePosition(room.id, locationId, campaignDay, dayPeriod)
    return { ok: false, error: "У Флуда нет игровой позиции." }
  }

  async function syncParticipants() {
    if (!room || room.room_type !== "scene") return
    setBusy(true); setError("")
    const result = await world.syncScene(room.id, true, true)
    setBusy(false)
    if (!result.ok) { setError(result.error || "Не удалось синхронизировать участников."); return }
    onChanged?.()
  }

  async function recover(trigger: RecoveryTrigger) {
    if (!canManage || !campaignId || !recoveryCharacter || busy) return
    setBusy(true)
    setError("")
    try {
      await oracle.characters.recover(
        createEngineCommandContext({
          campaignId,
          requestedBy: user.id,
          authority: "gm",
          actorCharacterId: recoveryCharacter.id,
        }),
        recoveryCharacter.id,
        trigger,
      )
      onRecovery?.(recoveryCharacter.id, trigger)
      if (trigger === "long_rest") onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось выполнить восстановление персонажа.")
    } finally {
      setBusy(false)
    }
  }

  if (!room) return <div className="soft-sheet-backdrop" onMouseDown={onClose}><section className="soft-sheet context-sheet" onMouseDown={(event) => event.stopPropagation()}><div className="soft-sheet__handle"/><div className="context-loading">{error || "Загружаем контекст…"}</div></section></div>

  const stateLabel = room.is_read_only ? "Только чтение" : room.room_state === "gm_only" ? "Только ГМ пишет" : room.room_state === "closed" ? "Закрыт" : "Открыт"
  const accessLabel = room.open_to_campaign
    ? room.campaign_can_write ? "Все читают и пишут" : "Все игроки читают"
    : "Скрыт от остальных игроков"

  return (
    <>
      <div className="soft-sheet-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}>
        <section className="soft-sheet context-sheet" role="dialog" aria-modal="true">
          <div className="soft-sheet__handle" />
          <header className="soft-sheet__header"><div><small>Игровой контекст</small><h2>{room.title}</h2></div><button type="button" className="soft-sheet__close" onClick={onClose}>×</button></header>

          {room.room_type === "character" && character && (
            <button className="context-identity" type="button" onClick={() => onOpenCharacter(character.id)}><CharacterAvatar character={character} size="medium"/><span><small>Персонаж</small><strong>{character.name}</strong><em>{character.character_class} · {character.level} ур.</em></span><b>›</b></button>
          )}

          <div className="context-grid">
            <button type="button" className="context-row" onClick={() => {
              if (canManage && room.room_type !== "flood") { setEditingPosition("location"); return }
              if (contextLocation) window.location.hash = "#/world"
            }}><span className="context-row__icon">◈</span><span><small>Локация</small><strong>{contextLocation?.name || "Не задана"}</strong></span>{(canManage || contextLocation) && <b>›</b>}</button>
            <button type="button" className="context-row" onClick={() => canManage && room.room_type !== "flood" && setEditingPosition("time")}><span className="context-row__icon">◷</span><span><small>День и время</small><strong>{contextPosition ? formatCampaignTime(contextPosition) : "Не задано"}</strong></span>{canManage && room.room_type !== "flood" && <b>›</b>}</button>
          </div>

          {room.room_type === "character" && world.activeScenes.length > 0 && <section className="context-section"><h3>Сейчас здесь</h3>{world.activeScenes.map((scene) => <button key={scene.room_id} type="button" className="context-scene" onClick={() => { window.location.hash = `#/chat/${scene.room_id}` }}><span>✦</span><div><small>Активная сцена</small><strong>{scene.title}</strong></div><b>›</b></button>)}</section>}

          {room.room_type === "character" && <section className="context-section"><h3>Рядом сейчас</h3>{world.nearby.length ? <div className="context-people">{world.nearby.map((person) => <button type="button" key={person.id} onClick={() => onOpenCharacter(person.id)}><CharacterAvatar character={person} size="small"/><span>{person.name}</span></button>)}</div> : <p className="context-empty">Никого из известных персонажей в этой точке времени.</p>}{world.otherTimes.length > 0 && <div className="context-other-time"><small>В этой локации, но в другое время</small>{world.otherTimes.map((person) => <span key={person.id}>{person.name} · {person.relation === "earlier" ? "раньше" : "позже"}</span>)}</div>}</section>}

          {room.room_type === "scene" && <section className="context-section"><h3>Участники</h3>{sceneParticipants.length ? <div className="context-people">{sceneParticipants.map((person) => person && <button type="button" key={person.id} onClick={() => onOpenCharacter(person.id)}><CharacterAvatar character={person} size="small"/><span>{person.name}</span></button>)}</div> : <p className="context-empty">Участники ещё не выбраны.</p>}</section>}

          {canManage && room.room_type !== "flood" && <section className="gm-context-actions">
            <h3>Игровые действия ГМ</h3>
            <div className="gm-context-recovery">
              <div className="gm-context-recovery__target">
                <span>☾</span>
                <div><small>Отдых и восстановление</small><strong>{recoveryCharacter?.name || "Выбери персонажа в «От лица»"}</strong></div>
              </div>
              <div className="gm-context-recovery__grid">
                <button type="button" disabled={busy || !recoveryCharacter} onClick={() => void recover("short_rest")}>◷ Короткий отдых</button>
                <button type="button" disabled={busy || !recoveryCharacter} onClick={() => void recover("long_rest")}>☾ Долгий отдых</button>
                <button type="button" disabled={busy || !recoveryCharacter} onClick={() => void recover("dawn")}>☀ Рассвет</button>
              </div>
              <p>{room.room_type === "character" ? "Действие применяется к владельцу этой личной истории." : "В сцене действие применяется к выбранному персонажу «От лица»."}</p>
            </div>
            <div className="gm-context-actions__grid">
              {room.room_type === "scene" && <button type="button" disabled={busy} onClick={() => void syncParticipants()}>⇄ Синхронизировать участников</button>}
              <button type="button" className={room.open_to_campaign && room.campaign_can_write ? "is-active" : ""} aria-pressed={room.open_to_campaign && room.campaign_can_write} disabled={busy} onClick={() => void setAccess(true, true)}>Читать и писать всем</button>
              <button type="button" disabled={busy} onClick={() => void setRoomState("gm_only")}>Только ГМ пишет</button>
              <button type="button" className={room.open_to_campaign && !room.campaign_can_write ? "is-active" : ""} aria-pressed={room.open_to_campaign && !room.campaign_can_write} disabled={busy} onClick={() => void setAccess(true, false)}>Читать всем</button>
              <button type="button" className={!room.open_to_campaign ? "is-active is-danger" : "is-danger"} aria-pressed={!room.open_to_campaign} disabled={busy} onClick={() => void setAccess(false, false)}>Скрыть от игроков</button>
              <button type="button" disabled={busy} className="is-danger" onClick={() => void setRoomState("closed")}>Закрыть чат</button>
            </div>
          </section>}

          <section className="context-section context-room-state"><div><small>Состояние комнаты</small><strong>{stateLabel}</strong><em>{accessLabel}</em></div>{canManage && <button type="button" onClick={onOpenSettings}>Управление</button>}</section>

          {error && <div className="sheet-error">{error}</div>}
        </section>
      </div>

      {editingPosition && contextPosition && <WorldPositionSheet
        title={room.room_type === "character" ? character?.name || room.title : room.title}
        position={contextPosition}
        locations={world.locations}
        intent={editingPosition === "time" ? "edit-time" : room.room_type === "character" ? "move-character" : "edit-location"}
        onClose={() => setEditingPosition(null)}
        onSave={async (locationId, campaignDay, dayPeriod) => {
          const result = await savePosition(locationId, campaignDay, dayPeriod)
          if (result.ok) { await loadRoom(); onChanged?.() }
          return result
        }}
      />}
    </>
  )
}
