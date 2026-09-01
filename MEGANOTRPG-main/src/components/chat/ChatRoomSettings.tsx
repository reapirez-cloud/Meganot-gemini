import { useEffect, useMemo, useState } from "react"

import { supabase } from "../../lib/supabase"
import type {
  CampaignMember,
  Character,
} from "../../context/CharacterContext"
import CharacterAvatar from "../characters/CharacterAvatar"
import type { ChatRoomMember } from "../../types/chat"

type AccessState = Record<
  string,
  {
    can_read: boolean
    can_write: boolean
  }
>

type Props = {
  roomId: string
  roomTitle: string
  members: CampaignMember[]
  characters: Character[]
  onClose: () => void
  onSaved: (title: string) => void
}

export default function ChatRoomSettings({
  roomId,
  roomTitle,
  members,
  characters,
  onClose,
  onSaved,
}: Props) {
  const [title, setTitle] = useState(roomTitle)
  const [access, setAccess] = useState<AccessState>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [restingId, setRestingId] = useState<string | null>(null)
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")

  const playerMembers = useMemo(
    () => members.filter((member) => !member.is_owner && member.role !== "gm"),
    [members],
  )

  useEffect(() => {
    let cancelled = false

    void supabase
      .from("chat_room_members")
      .select("room_id, user_id, can_read, can_write")
      .eq("room_id", roomId)
      .then(({ data, error: loadError }) => {
        if (cancelled) return

        if (loadError) {
          setError(loadError.message)
          setLoading(false)
          return
        }

        const next: AccessState = {}
        for (const row of (data || []) as ChatRoomMember[]) {
          next[row.user_id] = {
            can_read: row.can_read,
            can_write: row.can_write,
          }
        }

        setAccess(next)
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [roomId])

  function permission(userId: string) {
    return access[userId] || { can_read: false, can_write: false }
  }

  function setRead(userId: string, value: boolean) {
    setAccess((current) => ({
      ...current,
      [userId]: {
        can_read: value,
        can_write: value ? current[userId]?.can_write || false : false,
      },
    }))
  }

  function setWrite(userId: string, value: boolean) {
    setAccess((current) => ({
      ...current,
      [userId]: {
        can_read: value ? true : current[userId]?.can_read || false,
        can_write: value,
      },
    }))
  }

  const allowedUserIds = useMemo(() => {
    const ids = new Set<string>()

    for (const member of members) {
      if (member.is_owner || member.role === "gm") {
        ids.add(member.user_id)
        continue
      }

      const state = access[member.user_id]
      if (state?.can_read || state?.can_write) ids.add(member.user_id)
    }

    return ids
  }, [access, members])

  const roomCharacters = useMemo(
    () =>
      characters.filter(
        (character) =>
          character.assigned_user_id &&
          allowedUserIds.has(character.assigned_user_id),
      ),
    [allowedUserIds, characters],
  )

  async function save() {
    const cleanedTitle = title.trim()
    if (!cleanedTitle) {
      setError("Укажи название игрового чата.")
      return
    }

    setSaving(true)
    setError("")
    setNotice("")

    const { error: titleError } = await supabase
      .from("chat_rooms")
      .update({ title: cleanedTitle })
      .eq("id", roomId)

    if (titleError) {
      setSaving(false)
      setError(titleError.message)
      return
    }

    const playerIds = playerMembers.map((member) => member.user_id)
    if (playerIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("chat_room_members")
        .delete()
        .eq("room_id", roomId)
        .in("user_id", playerIds)

      if (deleteError) {
        setSaving(false)
        setError(deleteError.message)
        return
      }
    }

    const rows: Array<{
      room_id: string
      user_id: string
      can_read: boolean
      can_write: boolean
      updated_at: string
    }> = []

    for (const member of playerMembers) {
      const state = permission(member.user_id)
      if (!state.can_read && !state.can_write) continue

      rows.push({
        room_id: roomId,
        user_id: member.user_id,
        can_read: state.can_read || state.can_write,
        can_write: state.can_write,
        updated_at: new Date().toISOString(),
      })
    }

    if (rows.length > 0) {
      const { error: upsertError } = await supabase
        .from("chat_room_members")
        .upsert(rows, { onConflict: "room_id,user_id" })

      if (upsertError) {
        setSaving(false)
        setError(upsertError.message)
        return
      }
    }

    setSaving(false)
    setNotice("Настройки сохранены.")
    onSaved(cleanedTitle)
  }

  async function longRest(character: Character) {
    setRestingId(character.id)
    setError("")
    setNotice("")

    const { error: restError } = await supabase.rpc(
      "grant_character_long_rest",
      {
        p_character_id: character.id,
      },
    )

    setRestingId(null)

    if (restError) {
      setError(restError.message)
      return
    }

    setNotice(`${character.name}: HP и ячейки восстановлены.`)
  }

  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <div
        className="bottom-sheet room-settings-sheet"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="character-editor-head">
          <div>
            <h3 className="sheet-title">Настройки игрового чата</h3>
            <p className="sheet-copy">
              ГМ решает, кто видит комнату и кто может в неё писать.
            </p>
          </div>
          <button className="sheet-close" type="button" onClick={onClose}>
            ×
          </button>
        </div>

        <label className="field-label" htmlFor="room-settings-title">
          Название
        </label>
        <input
          id="room-settings-title"
          className="app-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={100}
        />

        <section className="room-settings-section">
          <div className="room-settings-section__head">
            <div>
              <strong>Игроки</strong>
              <small>«Писать» автоматически включает чтение</small>
            </div>
          </div>

          {loading && (
            <div className="chat-action-empty">Загружаем доступы…</div>
          )}

          {!loading && playerMembers.length === 0 && (
            <div className="chat-action-empty">
              Пока нет обычных игроков. Владелец и ГМ имеют доступ всегда.
            </div>
          )}

          <div className="room-member-access-list">
            {playerMembers.map((member) => {
              const state = permission(member.user_id)
              const memberCharacter = characters.find(
                (character) =>
                  character.assigned_user_id === member.user_id &&
                  character.id === member.active_character_id,
              )

              return (
                <div className="room-member-access-row" key={member.user_id}>
                  <CharacterAvatar character={memberCharacter || null} size="small" />
                  <div className="room-member-access-row__copy">
                    <strong>{member.display_name}</strong>
                    <small>
                      {memberCharacter
                        ? memberCharacter.name
                        : "Активный персонаж не назначен"}
                    </small>
                  </div>

                  <label className="room-access-toggle">
                    <span>Читать</span>
                    <input
                      type="checkbox"
                      checked={state.can_read}
                      onChange={(event) =>
                        setRead(member.user_id, event.target.checked)
                      }
                    />
                  </label>

                  <label className="room-access-toggle">
                    <span>Писать</span>
                    <input
                      type="checkbox"
                      checked={state.can_write}
                      onChange={(event) =>
                        setWrite(member.user_id, event.target.checked)
                      }
                    />
                  </label>
                </div>
              )
            })}
          </div>
        </section>

        <section className="room-settings-section">
          <div className="room-settings-section__head">
            <div>
              <strong>Долгий отдых</strong>
              <small>ГМ восстанавливает персонажу HP и все ячейки</small>
            </div>
          </div>

          {roomCharacters.length === 0 && (
            <div className="chat-action-empty">
              В этой комнате пока нет персонажей игроков.
            </div>
          )}

          <div className="room-rest-list">
            {roomCharacters.map((character) => {
              const member = members.find(
                (item) => item.user_id === character.assigned_user_id,
              )

              return (
                <div className="room-rest-row" key={character.id}>
                  <CharacterAvatar character={character} size="small" />
                  <div>
                    <strong>{character.name}</strong>
                    <small>{member?.display_name || "Игрок"}</small>
                  </div>
                  <button
                    type="button"
                    disabled={restingId === character.id}
                    onClick={() => void longRest(character)}
                  >
                    {restingId === character.id ? "Отдых…" : "Дать отдых"}
                  </button>
                </div>
              )
            })}
          </div>
        </section>

        {notice && <div className="chat-settings-notice">{notice}</div>}
        {error && <div className="auth-error">{error}</div>}

        <button className="sheet-save" type="button" disabled={saving} onClick={() => void save()}>
          {saving ? "Сохраняем…" : "Сохранить настройки"}
        </button>
      </div>
    </div>
  )
}
