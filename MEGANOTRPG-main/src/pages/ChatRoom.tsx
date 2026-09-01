import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { FormEvent } from "react"
import type { ResolvedAction, ResolvedSpell } from "../character-engine/index.ts"
import { supabase } from "../lib/supabase"
import { resourceCostInputs } from "../lib/resourceRuntime"
import { inventoryItemIdFromSourceId } from "../inventory-engine/index.ts"
import { useAuth } from "../context/AuthContext"
import { useCharacters } from "../context/CharacterContext"
import { useChatMessages } from "../hooks/useChatMessages"
import { useChatActors } from "../hooks/useChatActors"
import { useChatPreparation } from "../hooks/useChatPreparation"
import { useResolvedChatActor } from "../hooks/useResolvedChatActor"
import { useResolvedCharacterRuntime } from "../hooks/useResolvedCharacterRuntime"
import { useLongPressItem } from "../hooks/useLongPressItem"
import CharacterAvatar from "../components/characters/CharacterAvatar"
import ChatActionSheet, { type FreeDiceRequest } from "../components/chat/ChatActionSheet"
import ChatActorPicker from "../components/chat/ChatActorPicker"
import ChatRoomSettings from "../components/chat/ChatRoomSettings"
import ChatMessageActions from "../components/chat/ChatMessageActions"
import ChatContextSheet from "../components/chat/ChatContextSheet"
import ChatPreparationCard from "../components/chat/ChatPreparationCard"
import ChatSpellDetailSheet from "../components/chat/ChatSpellDetailSheet"
import {
  templateMechanicIdForChatAction,
  templateMechanicIdForSpellAccess,
  templatePaymentOptionKeyForChatAction,
} from "../components/chat/chatTemplateActionRoute.ts"
import type { ChatEventPayload, ChatMessage, RoomState, RoomType } from "../types/chat"
import { uploadCampaignImage } from "../lib/mediaUpload"
import CampaignImage from "../components/common/CampaignImage"
import "../game-story-v2.css"

type Props = { roomId: string; onBack: () => void; onOpenCharacter: (characterId: string) => void }
type MessageCharacter = { id: string; name: string; avatar_url: string | null }
type SpellEventTarget = { spellKey: string; label: string }

const formatTime = (value: string) => new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(value))
const numberValue = (value: unknown) => typeof value === "number" ? value : Number(value) || 0
const textValue = (value: unknown) => typeof value === "string" ? value : ""

function withinGroup(a: ChatMessage | undefined, b: ChatMessage) {
  if (!a) return false
  return a.user_id === b.user_id && a.character_id === b.character_id && a.author_name === b.author_name && new Date(b.created_at).getTime() - new Date(a.created_at).getTime() < 5 * 60 * 1000
}

function ChatEventCard({ message, onOpenSpell }: { message: ChatMessage; onOpenSpell: (target: SpellEventTarget) => void }) {
  const payload = (message.event_payload || {}) as ChatEventPayload
  const label = textValue(payload.label) || "Игровое действие"
  if (message.event_kind === "roll") {
    const hasD20 = Boolean(payload.rollD20)
    const d20 = numberValue(payload.d20)
    const modifier = numberValue(payload.modifier)
    const total = numberValue(payload.total)
    const effect = payload.effect && typeof payload.effect === "object" && !Array.isArray(payload.effect) ? payload.effect as Record<string, unknown> : null
    const rolls = effect && Array.isArray(effect.rolls) ? effect.rolls.map(numberValue) : []
    return <div className="chat-event chat-event--roll"><span className="chat-event__icon">◈</span><div className="chat-event__copy"><small>{textValue(payload.kind) || "Бросок"}</small><strong>{label}</strong>{hasD20 && <span>d20 <b>{d20}</b> {modifier >= 0 ? "+" : "−"} {Math.abs(modifier)} <em>= {total}</em></span>}{effect && <span>{numberValue(effect.count)}d{numberValue(effect.sides)} [{rolls.join(", ")}] {numberValue(effect.modifier) >= 0 ? "+" : "−"} {Math.abs(numberValue(effect.modifier))} <em>= {numberValue(effect.total)}</em></span>}</div></div>
  }
  if (message.event_kind === "spell") {
    return <button type="button" className="chat-event chat-event--spell chat-event--interactive" onClick={() => onOpenSpell({ spellKey: textValue(payload.spellKey), label })}><span className="chat-event__icon">✧</span><div className="chat-event__copy"><small>Заклинание</small><strong>{label}</strong>{textValue(payload.detail) && <span>{textValue(payload.detail)}</span>}</div></button>
  }
  return <div className={`chat-event chat-event--${message.event_kind}`}><span className="chat-event__icon">⚔</span><div className="chat-event__copy"><small>Действие</small><strong>{label}</strong>{textValue(payload.detail) && <span>{textValue(payload.detail)}</span>}</div></div>
}

function roomTypeLabel(roomType: RoomType, readOnly: boolean, roomState: RoomState) {
  if (readOnly && roomType === "character") return "мёртв · только чтение"
  if (roomState === "closed") return "закрыт"
  if (roomState === "gm_only") return "только ГМ пишет"
  if (readOnly) return "только чтение"
  if (roomType === "character") return "персонаж"
  if (roomType === "scene") return "сцена"
  return "флуд"
}

export default function ChatRoom({ roomId, onBack, onOpenCharacter }: Props) {
  const { user } = useAuth()
  const { characters, members, canManage, campaignId, refresh: refreshCharacters } = useCharacters()
  const actors = useChatActors()
  const resolved = useResolvedChatActor(actors.selected?.character || null)
  const [roomTitle, setRoomTitle] = useState("Чат")
  const [roomType, setRoomType] = useState<RoomType>("scene")
  const [roomState, setRoomState] = useState<RoomState>("open")
  const [roomReadOnly, setRoomReadOnly] = useState(false)
  const [roomCharacterId, setRoomCharacterId] = useState<string | null>(null)
  const [roomAccessLoaded, setRoomAccessLoaded] = useState(false)
  const [canWriteRoom, setCanWriteRoom] = useState(false)
  const [draft, setDraft] = useState("")
  const [actionsOpen, setActionsOpen] = useState(false)
  const [actorOpen, setActorOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [contextOpen, setContextOpen] = useState(false)
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null)
  const [selectedSpellEvent, setSelectedSpellEvent] = useState<SpellEventTarget | null>(null)
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [attachmentError, setAttachmentError] = useState("")
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const [showNewMessages, setShowNewMessages] = useState(false)
  const [messageCharacters, setMessageCharacters] = useState<MessageCharacter[]>([])
  const messageListRef = useRef<HTMLDivElement | null>(null)
  const attachmentRef = useRef<HTMLInputElement | null>(null)
  const nearBottomRef = useRef(true)
  const initialScrollDoneRef = useRef(false)
  const previousLastMessageIdRef = useRef<number | null>(null)
  const chat = useChatMessages(roomId)
  const { loading: chatLoading, markRead: markChatRead, messages: chatMessages } = chat
  const characterById = useMemo(() => {
    const map = new Map<string, MessageCharacter>()
    for (const character of characters) map.set(character.id, character)
    for (const character of messageCharacters) map.set(character.id, character)
    return map
  }, [characters, messageCharacters])
  const roomCharacter = useMemo(
    () => roomCharacterId ? characters.find((character) => character.id === roomCharacterId) || null : null,
    [characters, roomCharacterId],
  )
  const preparationCharacter = useMemo(() => {
    if (!roomAccessLoaded) return null
    if (roomType === "character") return roomCharacter
    return actors.selected?.character || null
  }, [actors.selected?.character, roomAccessLoaded, roomCharacter, roomType])
  const preparationRuntimeCharacter = preparationCharacter && preparationCharacter.id !== actors.selected?.characterId
    ? preparationCharacter
    : null
  const preparationRuntime = useResolvedCharacterRuntime(preparationRuntimeCharacter)
  const preparation = useChatPreparation(preparationCharacter)
  const preparationGeneration = preparation.model.session?.is_open && preparation.model.tasks.length
    ? preparation.model.session.generation
    : null
  const bindMessageLongPress = useLongPressItem<ChatMessage>((message) => setSelectedMessage(message))

  useEffect(() => {
    if (preparationGeneration == null) return
    requestAnimationFrame(() => {
      const list = messageListRef.current
      if (list) list.scrollTop = list.scrollHeight
    })
  }, [preparationGeneration])

  const loadRoomAccess = useCallback(async () => {
    const { data: room, error: roomError } = await supabase.from("chat_rooms").select("id,title,category,room_type,character_id,open_to_campaign,campaign_can_write,is_read_only,room_state").eq("id", roomId).maybeSingle()
    if (roomError || !room) return
    const nextType: RoomType = room.room_type === "character" || room.room_type === "flood" ? room.room_type : "scene"
    const nextState: RoomState = room.room_state === "closed" || room.room_state === "gm_only" ? room.room_state : "open"
    const hardReadOnly = Boolean(room.is_read_only)
    setRoomTitle(room.title)
    setRoomType(nextType)
    setRoomState(nextState)
    setRoomReadOnly(hardReadOnly)
    setRoomCharacterId(room.character_id || null)
    setRoomAccessLoaded(true)
    if (hardReadOnly || nextState === "closed") { setCanWriteRoom(false); return }
    if (canManage) { setCanWriteRoom(true); return }
    if (nextState === "gm_only") { setCanWriteRoom(false); return }
    if (nextType === "flood") { setCanWriteRoom(true); return }
    if (nextType === "scene" && room.open_to_campaign && room.campaign_can_write) { setCanWriteRoom(true); return }
    if (nextType === "character" && room.character_id) {
      const character = characters.find((item) => item.id === room.character_id)
      if (character?.assigned_user_id === user.id) { setCanWriteRoom(true); return }
    }
    const { data: access } = await supabase.from("chat_room_members").select("can_write").eq("room_id", roomId).eq("user_id", user.id).maybeSingle()
    setCanWriteRoom(Boolean(access?.can_write))
  }, [canManage, characters, roomId, user.id])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) void loadRoomAccess() })
    return () => { cancelled = true }
  }, [loadRoomAccess])

  useEffect(() => {
    const ids = [...new Set(chatMessages.map((message) => message.character_id).filter((id): id is string => Boolean(id)))].filter((id) => !characterById.has(id))
    if (!ids.length) return
    let cancelled = false
    const timer = window.setTimeout(() => void (async () => {
      const { data } = await supabase.from("characters").select("id,name,avatar_url").in("id", ids)
      if (cancelled || !data?.length) return
      setMessageCharacters((current) => {
        const map = new Map(current.map((entry) => [entry.id, entry]))
        for (const entry of data as MessageCharacter[]) map.set(entry.id, entry)
        return [...map.values()]
      })
      void refreshCharacters()
    })(), 60)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [characterById, chatMessages, refreshCharacters])

  useEffect(() => {
    initialScrollDoneRef.current = false
    previousLastMessageIdRef.current = null
    nearBottomRef.current = true
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setShowNewMessages(false)
      setRoomAccessLoaded(false)
      setRoomCharacterId(null)
      setSelectedSpellEvent(null)
    })
    return () => { cancelled = true }
  }, [roomId])

  useEffect(() => {
    if (chatLoading) return
    const last = chatMessages[chatMessages.length - 1] || null
    const id = last?.id ?? null
    if (!initialScrollDoneRef.current) {
      initialScrollDoneRef.current = true; previousLastMessageIdRef.current = id
      requestAnimationFrame(() => { if (messageListRef.current) messageListRef.current.scrollTop = messageListRef.current.scrollHeight })
      if (id != null) void markChatRead(id)
      return
    }
    const previous = previousLastMessageIdRef.current
    previousLastMessageIdRef.current = id
    if (id == null || previous === id) return
    const follow = nearBottomRef.current || last?.user_id === user.id
    if (follow) {
      setShowNewMessages(false)
      requestAnimationFrame(() => { if (messageListRef.current) messageListRef.current.scrollTop = messageListRef.current.scrollHeight })
      void markChatRead(id)
    } else setShowNewMessages(true)
  }, [chatLoading, chatMessages, markChatRead, user.id])

  function onScroll() {
    const list = messageListRef.current
    if (!list) return
    const near = list.scrollHeight - list.scrollTop - list.clientHeight < 120
    nearBottomRef.current = near
    if (near) { setShowNewMessages(false); const id = chat.messages[chat.messages.length - 1]?.id; if (id != null) void chat.markRead(id) }
  }

  async function loadOlder() {
    const list = messageListRef.current
    const height = list?.scrollHeight || 0
    const top = list?.scrollTop || 0
    const count = await chat.loadOlder()
    if (!count || !list) return
    requestAnimationFrame(() => requestAnimationFrame(() => { if (messageListRef.current) messageListRef.current.scrollTop = top + (messageListRef.current.scrollHeight - height) }))
  }

  function jumpLatest() {
    if (messageListRef.current) messageListRef.current.scrollTop = messageListRef.current.scrollHeight
    nearBottomRef.current = true; setShowNewMessages(false)
    const id = chat.messages[chat.messages.length - 1]?.id
    if (id != null) void chat.markRead(id)
  }

  function refreshRecoveredCharacter(characterId: string) {
    if (preparationCharacter?.id === characterId) preparation.refresh()
    if (preparationRuntimeCharacter?.id === characterId) preparationRuntime.refresh()
    if (actors.selected?.characterId === characterId) resolved.refresh()
  }

  const canSend = canWriteRoom && !roomReadOnly && roomState !== "closed" && Boolean(actors.selected)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!canSend) return
    setAttachmentError("")
    let url: string | null = null
    if (attachmentFile) {
      setUploadingAttachment(true)
      const upload = await uploadCampaignImage(attachmentFile, "chat", campaignId)
      setUploadingAttachment(false)
      if (!upload.ok) { setAttachmentError(upload.error); return }
      url = upload.url
    }
    const sent = await chat.sendMessage(draft, url, actors.selected?.characterId || null)
    if (sent) { setDraft(""); setAttachmentFile(null) }
  }

  async function rollCheck(label: string, modifier: number, kind: "ability" | "skill" | "save") {
    const sent = await chat.sendRoll({ characterId: actors.selected?.characterId || null, label, modifier, kind, rollD20: true })
    if (sent) setActionsOpen(false)
  }

  async function freeRoll(request: FreeDiceRequest) {
    const modifier = request.modifier ? `${request.modifier > 0 ? "+" : ""}${request.modifier}` : ""
    const sent = await chat.sendRoll({
      characterId: actors.selected?.characterId || null,
      label: `${request.count}d${request.sides}${modifier}`,
      kind: "Свободный бросок",
      rollD20: false,
      diceCount: request.count,
      diceSides: request.sides,
      diceModifier: request.modifier,
    })
    if (!sent) throw new Error("Не удалось выполнить бросок. Проверь доступ к комнате и попробуй снова.")
    return true
  }

  async function runAction(action: ResolvedAction) {
    const characterId = actors.selected?.characterId || null
    if (!characterId) throw new Error("Для классового действия нужен выбранный персонаж.")

    const damage = action.damage[0]
    const mechanicId = templateMechanicIdForChatAction(action)
    if (mechanicId) {
      const optionKey = templatePaymentOptionKeyForChatAction(action)
      if (optionKey === null) throw new Error("У действия несколько способов оплаты. Сначала нужно выбрать расход ресурса.")
      const common = {
        characterId,
        mechanicId,
        ...(optionKey ? { optionKey } : {}),
        label: action.label || action.key,
      }
      const sent = action.attack || damage?.dice
        ? await chat.sendTemplateRoll({
            ...common,
            kind: "action",
            modifier: action.attack?.bonus.value || 0,
            rollD20: Boolean(action.attack),
            diceCount: damage?.dice?.count || 0,
            diceSides: damage?.dice?.sides || 0,
            diceModifier: damage?.modifier.value || 0,
          })
        : await chat.sendTemplateAction({ ...common, payload: { detail: action.economy } })
      if (sent) { resolved.refresh(); setActionsOpen(false) }
      return
    }

    const inventoryItemId = action.sources
      .filter((ref) => ref.source.sourceType === "inventory_item")
      .map((ref) => inventoryItemIdFromSourceId(ref.source.id))
      .find((itemId): itemId is string => Boolean(itemId))

    if (inventoryItemId) {
      const contract = resolved.contract
      const costs = contract ? resourceCostInputs(contract, action.resourceCosts) : []
      const sent = await chat.useInventoryItem({
        characterId,
        itemId: inventoryItemId,
        label: action.label || action.key,
        kind: "action",
        modifier: action.attack?.bonus.value || 0,
        rollD20: Boolean(action.attack),
        diceCount: damage?.dice?.count || 0,
        diceSides: damage?.dice?.sides || 0,
        diceModifier: damage?.modifier.value || 0,
        resourceCosts: costs,
        payload: { detail: action.economy },
      })
      if (sent) setActionsOpen(false)
      return
    }

    const contract = resolved.contract
    const costs = contract ? resourceCostInputs(contract, action.resourceCosts) : []
    const sent = action.attack || damage?.dice
      ? await chat.sendRoll({ characterId, label: action.label || action.key, kind: "action", modifier: action.attack?.bonus.value || 0, rollD20: Boolean(action.attack), diceCount: damage?.dice?.count || 0, diceSides: damage?.dice?.sides || 0, diceModifier: damage?.modifier.value || 0, resourceCosts: costs })
      : await chat.sendEvent(characterId, "action", action.label || action.key, { detail: action.economy }, costs)
    if (sent) { resolved.refresh(); setActionsOpen(false) }
  }

  async function castSpell(spell: ResolvedSpell) {
    const characterId = actors.selected?.characterId || null
    if (!characterId) throw new Error("Для заклинания нужен выбранный персонаж.")

    const access = spell.accesses.find((item) => item.available) || spell.accesses[0]
    const method = access?.methods.find((item) => item.available) || access?.methods[0]
    const option = method?.resourceOptions.find((item) => item.available) || method?.resourceOptions[0]
    if (!access || !method) throw new Error("У заклинания нет доступного способа сотворения.")

    const detail = [spell.identity.level ? `${spell.identity.level} уровень` : "Кантрип", option?.castLevel && option.castLevel !== spell.identity.level ? `ячейка ${option.castLevel} ур.` : "", method.attackBonus ? `атака ${method.attackBonus.value >= 0 ? "+" : ""}${method.attackBonus.value}` : "", method.saveDc ? `СЛ ${method.saveDc.value}` : ""].filter(Boolean).join(" · ")
    const mechanicId = templateMechanicIdForSpellAccess(access)
    if (mechanicId) {
      const sent = await chat.sendTemplateSpell({
        characterId,
        mechanicId,
        methodKey: method.key,
        ...(option ? { optionKey: option.key } : {}),
        label: spell.identity.name,
        payload: { detail, spellKey: spell.key },
      })
      if (sent) { resolved.refresh(); setActionsOpen(false) }
      return
    }

    const contract = resolved.contract
    const costs = contract && option ? resourceCostInputs(contract, option.costs) : []
    const sent = await chat.sendEvent(characterId, "spell", spell.identity.name, { detail, spellKey: spell.key }, costs)
    if (sent) { resolved.refresh(); setActionsOpen(false) }
  }

  const realtimeLabel = chat.realtime === "live" ? "онлайн" : chat.realtime === "connecting" ? "подключение" : "офлайн"
  const closed = roomReadOnly || roomState === "closed"

  return <div className="screen chat-v2-screen">
    <header className="screen-header chat-v11-header">
      <button className="icon-button" type="button" onClick={onBack} aria-label="Назад">‹</button>
      <div className="room-heading"><h1 className="screen-header__title">{roomTitle}</h1><div className={`live-state live-state--${chat.realtime}`}><span />{realtimeLabel} · {roomTypeLabel(roomType, roomReadOnly, roomState)}</div></div>
      {roomType !== "flood" ? <button className="chat-context-button" type="button" onClick={() => setContextOpen(true)} aria-label="Игровой контекст">◇</button> : <span />}
    </header>

    {closed && <div className="chat-closed-banner"><span>{roomReadOnly ? "†" : "◇"}</span><div><strong>{roomReadOnly ? "История завершена" : "Комната закрыта"}</strong><small>История сохранена и доступна для чтения.</small></div></div>}
    {roomState === "gm_only" && !roomReadOnly && <div className="chat-mode-banner"><span>◇</span><div><strong>Режим ГМ</strong><small>Игроки могут читать, новые сообщения отправляет только ГМ.</small></div></div>}

    <div ref={messageListRef} className="message-list message-list--v2" onScroll={onScroll}>
      {chat.loading && <div className="chat-state">Загружаем сообщения…</div>}
      {!chat.loading && chat.hasOlder && <button className="chat-load-older" type="button" onClick={() => void loadOlder()} disabled={chat.loadingOlder}>{chat.loadingOlder ? "Загружаем…" : "Более ранние"}</button>}
      {!chat.loading && !chat.messages.length && <div className="chat-state">Здесь пока пусто.</div>}
      {chat.messages.map((message, index) => {
        const own = message.user_id === user.id
        const grouped = withinGroup(chat.messages[index - 1], message)
        const linked = message.character_id ? characterById.get(message.character_id) || null : null
        const avatar = linked || { name: message.author_name, avatar_url: message.author_avatar_url }
        return <div {...bindMessageLongPress(message)} className={`message-row message-row--v2 ${own ? "message-row--self" : ""} ${grouped ? "message-row--grouped" : ""}`} key={message.id} style={{ touchAction: "pan-y" }}>
          {!own && !grouped && (linked ? <button className="message-avatar-button" type="button" onClick={() => onOpenCharacter(linked.id)}><CharacterAvatar character={avatar} size="small" /></button> : <CharacterAvatar character={avatar} size="small" />)}
          {!own && grouped && <span className="message-avatar-spacer" />}
          <article className={`message message-v2 ${own ? "message--self" : ""}`}>
            {!grouped && (linked ? <button className="message-v2-author" type="button" onClick={() => onOpenCharacter(linked.id)}>{message.author_name}</button> : <div className="message-v2-author">{message.author_name}</div>)}
            {message.attachment_url && <CampaignImage className="message__attachment" value={message.attachment_url} alt="Вложение" loading="lazy" />}
            {message.event_kind ? <ChatEventCard message={message} onOpenSpell={setSelectedSpellEvent} /> : message.body && <p className="message__text">{message.body}</p>}
            <div className="message__time">{formatTime(message.created_at)}{message.edited_at ? " · изм." : ""}</div>
          </article>
          {own && !grouped && (linked ? <button className="message-avatar-button" type="button" onClick={() => onOpenCharacter(linked.id)}><CharacterAvatar character={avatar} size="small" /></button> : <CharacterAvatar character={avatar} size="small" />)}
          {own && grouped && <span className="message-avatar-spacer" />}
        </div>
      })}
      {preparationCharacter && <ChatPreparationCard
        roomId={roomId}
        characterId={preparationCharacter.id}
        model={preparation.model}
        spells={preparation.spells}
        onChanged={() => {
          preparation.refresh()
          if (preparationRuntimeCharacter?.id === preparationCharacter.id) preparationRuntime.refresh()
          if (actors.selected?.characterId === preparationCharacter.id) resolved.refresh()
        }}
      />}
      {preparation.error && <div className="chat-error">Подготовка: {preparation.error}</div>}
      {chat.error && <div className="chat-error">{chat.error}</div>}
    </div>

    {showNewMessages && <button className="chat-v2-new" type="button" onClick={jumpLatest}>Новые сообщения ↓</button>}
    {attachmentFile && <div className="chat-attachment-preview"><span>▧ {attachmentFile.name}</span><button type="button" onClick={() => setAttachmentFile(null)}>Убрать</button></div>}
    {attachmentError && <div className="chat-error chat-attachment-error">{attachmentError}</div>}

    {!closed && <form className="chat-v2-composer" onSubmit={submit}>
      <button className="chat-v2-actor" type="button" onClick={() => setActorOpen(true)} disabled={!actors.actors.length} aria-label="Выбрать личность"><CharacterAvatar character={actors.selected?.character || { name: actors.selected?.label || "?", avatar_url: actors.selected?.avatar_url || null }} size="small" /><span>⌄</span></button>
      <button className="chat-v2-tool" type="button" onClick={() => setActionsOpen(true)} disabled={!canWriteRoom} aria-label="Действия">＋</button>
      <button className="chat-v2-tool" type="button" onClick={() => attachmentRef.current?.click()} disabled={!canSend || uploadingAttachment} aria-label="Изображение">▧</button>
      <input ref={attachmentRef} className="media-hidden-input" type="file" accept="image/*" onChange={(event) => { setAttachmentFile(event.target.files?.[0] || null); event.currentTarget.value = "" }} />
      <input className="composer__input" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={canWriteRoom ? (actors.selected ? `От лица ${actors.selected.label}…` : "Нет доступной личности") : "Комната доступна только для чтения"} maxLength={4000} disabled={!canSend} />
      <button className="send-button" type="submit" disabled={!canSend || (!draft.trim() && !attachmentFile) || chat.sending || uploadingAttachment} aria-label="Отправить">➤</button>
    </form>}

    {actionsOpen && <ChatActionSheet characterName={actors.selected?.character?.name || null} contract={resolved.contract} loading={resolved.loading} includePrivateSources={canManage} onClose={() => setActionsOpen(false)} onFreeRoll={freeRoll} onCheck={rollCheck} onAction={runAction} onSpell={castSpell} />}
    {actorOpen && <ChatActorPicker actors={actors.actors} selected={actors.selected} onSelect={actors.selectActor} onClose={() => setActorOpen(false)} />}
    {contextOpen && <ChatContextSheet roomId={roomId} selectedCharacterId={actors.selected?.characterId || null} onRecovery={refreshRecoveredCharacter} onClose={() => setContextOpen(false)} onOpenCharacter={onOpenCharacter} onOpenSettings={() => { setContextOpen(false); setSettingsOpen(true) }} onChanged={() => void loadRoomAccess()} />}
    {settingsOpen && <ChatRoomSettings roomId={roomId} roomTitle={roomTitle} members={members} characters={characters} onClose={() => setSettingsOpen(false)} onSaved={(nextTitle) => { setRoomTitle(nextTitle); void loadRoomAccess() }} />}
    {selectedMessage && <ChatMessageActions message={selectedMessage} characterId={selectedMessage.character_id} own={selectedMessage.user_id === user.id} canManage={canManage} onOpenCharacter={onOpenCharacter} onClose={() => setSelectedMessage(null)} onEdit={chat.editMessage} onDelete={chat.deleteMessage} />}
    {selectedSpellEvent && <ChatSpellDetailSheet spellKey={selectedSpellEvent.spellKey} label={selectedSpellEvent.label} onClose={() => setSelectedSpellEvent(null)} />}
  </div>
}
