import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import type { ReactNode, FormEvent } from "react"

import { createEngineCommandContext } from "../engine-contracts/index.ts"
import { shapoklyak } from "../entity-engine/runtime.ts"
import type { CharacterEntity } from "../entity-engine/index.ts"
import { supabase } from "../lib/supabase"
import { oracle } from "../oracle-engine/runtime.ts"
import { useAuth } from "./AuthContext"

export type Character = CharacterEntity

export type CampaignMember = {
  campaign_id: string
  user_id: string
  role: "gm" | "player"
  is_owner: boolean
  active_character_id: string | null
  display_name: string
  telegram_user_id: string | null
  telegram_username: string | null
}

export type CharacterInput = {
  name: string
  character_class: string
  level: number
  bio: string
  avatar_url: string | null
  assigned_user_id: string | null
  character_type?: "pc" | "npc"
  visibility?: "campaign" | "private"
}

export type CampaignInfoInput = {
  title: string
  summary: string
  rules_summary: string
  cover_url: string | null
}

type Result = { ok: boolean; error?: string }

type CharacterContextValue = {
  campaignId: string
  campaignTitle: string
  campaignSummary: string
  campaignRulesSummary: string
  campaignCoverUrl: string | null
  characters: Character[]
  members: CampaignMember[]
  myCharacters: Character[]
  activeCharacter: Character | null
  myMember: CampaignMember | null
  isGm: boolean
  isOwner: boolean
  canManage: boolean
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  joinCampaign: (code: string) => Promise<Result>
  createInvite: () => Promise<Result & { code?: string }>
  setMemberRole: (userId: string, role: "gm" | "player") => Promise<Result>
  updateCampaignInfo: (input: CampaignInfoInput) => Promise<Result>
  createCharacter: (input: CharacterInput) => Promise<Result>
  updateCharacter: (characterId: string, input: CharacterInput) => Promise<Result>
  deleteCharacter: (characterId: string) => Promise<Result>
  updateOwnCharacterAvatar: (characterId: string, avatarUrl: string) => Promise<Result>
  setActiveForMember: (userId: string, characterId: string | null) => Promise<Result>
}

const CharacterContext = createContext<CharacterContextValue | null>(null)

export function CharacterProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [campaignId, setCampaignId] = useState("")
  const [campaignTitle, setCampaignTitle] = useState("")
  const [campaignSummary, setCampaignSummary] = useState("")
  const [campaignRulesSummary, setCampaignRulesSummary] = useState("")
  const [campaignCoverUrl, setCampaignCoverUrl] = useState<string | null>(null)
  const [characters, setCharacters] = useState<Character[]>([])
  const [members, setMembers] = useState<CampaignMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [needsInvite, setNeedsInvite] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data: ownMemberships, error: membershipError } = await supabase
      .from("campaign_members")
      .select("campaign_id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })

    if (membershipError) {
      setError(membershipError.message)
      setLoading(false)
      return
    }

    if (!ownMemberships?.length) {
      setCampaignId("")
      setCampaignTitle("")
      setCampaignSummary("")
      setCampaignRulesSummary("")
      setCampaignCoverUrl(null)
      setCharacters([])
      setMembers([])
      setNeedsInvite(true)
      setLoading(false)
      return
    }

    const rememberedCampaignId =
      window.localStorage.getItem("meganotrpg:v1:campaign-id") ||
      window.localStorage.getItem("meganotrpg:campaign-id")
    const selectedMembership =
      ownMemberships.find(
        (membership) => membership.campaign_id === rememberedCampaignId,
      ) ?? ownMemberships[0]

    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, title, summary, rules_summary, cover_url")
      .eq("id", selectedMembership.campaign_id)
      .single()

    if (campaignError || !campaign) {
      setError(campaignError?.message || "Кампания не найдена")
      setLoading(false)
      return
    }

    setCampaignId(campaign.id)
    setCampaignTitle(campaign.title)
    setCampaignSummary(campaign.summary || "")
    setCampaignRulesSummary(campaign.rules_summary || "")
    setCampaignCoverUrl(campaign.cover_url || null)
    setNeedsInvite(false)
    window.localStorage.setItem("meganotrpg:v1:campaign-id", campaign.id)

    const [characterResult, memberResult] = await Promise.all([
      supabase
        .from("characters")
        .select(
          "id, campaign_id, assigned_user_id, name, character_class, level, bio, avatar_url, character_type, visibility, created_by, created_at, updated_at",
        )
        .eq("campaign_id", campaign.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("campaign_members")
        .select("campaign_id, user_id, role, is_owner, active_character_id")
        .eq("campaign_id", campaign.id)
        .order("created_at", { ascending: true }),
    ])

    const firstCoreError = characterResult.error || memberResult.error
    if (firstCoreError) {
      setError(firstCoreError.message)
      setLoading(false)
      return
    }

    const rawMembers = (memberResult.data || []) as Array<{
      campaign_id: string
      user_id: string
      role: string
      is_owner: boolean
      active_character_id: string | null
    }>
    const memberUserIds = rawMembers.map((member) => member.user_id)

    const [profileResult, telegramResult] = memberUserIds.length
      ? await Promise.all([
          supabase
            .from("profiles")
            .select("user_id, display_name")
            .in("user_id", memberUserIds),
          supabase
            .from("telegram_identities")
            .select("user_id, telegram_user_id, username")
            .in("user_id", memberUserIds),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
        ]

    const directoryError = profileResult.error || telegramResult.error
    if (directoryError) {
      setError(directoryError.message)
      setLoading(false)
      return
    }

    const profileMap = new Map(
      (profileResult.data || []).map(
        (profile: { user_id: string; display_name: string }) => [
          profile.user_id,
          profile.display_name,
        ],
      ),
    )

    const telegramMap = new Map(
      (telegramResult.data || []).map(
        (identity: {
          user_id: string
          telegram_user_id: string | number
          username: string | null
        }) => [
          identity.user_id,
          {
            telegram_user_id: String(identity.telegram_user_id),
            telegram_username: identity.username || null,
          },
        ],
      ),
    )

    const nextMembers = rawMembers.map((member) => {
      const telegram = telegramMap.get(member.user_id)
      return {
        ...member,
        role: member.role === "gm" ? "gm" : "player",
        is_owner: Boolean(member.is_owner),
        display_name: profileMap.get(member.user_id) || "Игрок",
        telegram_user_id: telegram?.telegram_user_id || null,
        telegram_username: telegram?.telegram_username || null,
      }
    }) as CampaignMember[]

    setCharacters((characterResult.data || []) as Character[])
    setMembers(nextMembers)
    setLoading(false)
  }, [user.id])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) void load() })
    return () => { cancelled = true }
  }, [load])

  const myMember = useMemo(
    () => members.find((member) => member.user_id === user.id) ?? null,
    [members, user.id],
  )

  const myCharacters = useMemo(
    () =>
      characters.filter(
        (character) =>
          character.assigned_user_id === user.id &&
          character.character_type === "pc",
      ),
    [characters, user.id],
  )

  const activeCharacter = useMemo(() => {
    if (!myMember?.active_character_id) return null

    return (
      characters.find(
        (character) =>
          character.id === myMember.active_character_id &&
          character.assigned_user_id === user.id &&
          character.character_type === "pc",
      ) ?? null
    )
  }, [characters, myMember, user.id])

  const isGm = myMember?.role === "gm"
  const isOwner = myMember?.is_owner === true
  const canManage = isGm || isOwner
  const gmContext = useCallback((targetCampaignId = campaignId) => createEngineCommandContext({
    campaignId: targetCampaignId,
    requestedBy: user.id,
    authority: "gm",
  }), [campaignId, user.id])

  const joinCampaign = useCallback(
    async (code: string): Promise<Result> => {
      const cleaned = code.trim()
      if (!cleaned) return { ok: false, error: "Введи код приглашения." }

      const { data, error: joinError } = await supabase.rpc(
        "join_campaign_by_invite",
        { p_code: cleaned },
      )

      if (joinError) return { ok: false, error: joinError.message }
      if (typeof data === "string") {
        window.localStorage.setItem("meganotrpg:v1:campaign-id", data)
      }
      await load()
      return { ok: true }
    },
    [load],
  )

  const createInvite = useCallback(async (): Promise<Result & { code?: string }> => {
    if (!campaignId) return { ok: false, error: "Кампания ещё не загружена." }
    const { data, error: inviteError } = await supabase.rpc(
      "create_campaign_invite",
      {
        p_campaign_id: campaignId,
        p_max_uses: 20,
        p_expires_days: 30,
      },
    )
    if (inviteError) return { ok: false, error: inviteError.message }
    return { ok: true, code: String(data) }
  }, [campaignId])

  const setMemberRole = useCallback(
    async (userId: string, role: "gm" | "player"): Promise<Result> => {
      const { error: roleError } = await supabase.rpc("set_campaign_member_role", {
        p_campaign_id: campaignId,
        p_user_id: userId,
        p_role: role,
      })

      if (roleError) return { ok: false, error: roleError.message }
      await load()
      return { ok: true }
    },
    [campaignId, load],
  )

  const updateCampaignInfo = useCallback(
    async (input: CampaignInfoInput): Promise<Result> => {
      const cleaned = input.title.trim()
      if (!campaignId || !cleaned) {
        return { ok: false, error: "Нужно название кампании." }
      }

      const { error: updateError } = await supabase
        .from("campaigns")
        .update({
          title: cleaned,
          summary: input.summary.trim(),
          rules_summary: input.rules_summary.trim(),
          cover_url: input.cover_url?.trim() || null,
        })
        .eq("id", campaignId)

      if (updateError) return { ok: false, error: updateError.message }
      setCampaignTitle(cleaned)
      setCampaignSummary(input.summary.trim())
      setCampaignRulesSummary(input.rules_summary.trim())
      setCampaignCoverUrl(input.cover_url?.trim() || null)
      return { ok: true }
    },
    [campaignId],
  )

  const createCharacter = useCallback(
    async (input: CharacterInput): Promise<Result> => {
      if (!campaignId) return { ok: false, error: "Кампания ещё не загружена." }
      if (!canManage) return { ok: false, error: "Персонажей создаёт и назначает ГМ или владелец." }

      try {
        await oracle.characters.create(gmContext(), {
          name: input.name.trim(),
          character_class: input.character_class.trim() || "Персонаж",
          level: input.level,
          bio: input.bio.trim(),
          avatar_url: input.avatar_url?.trim() || null,
          assigned_user_id: input.assigned_user_id,
          character_type: input.character_type || "pc",
          visibility: input.visibility || "campaign",
        })
      } catch (reason) {
        return { ok: false, error: reason instanceof Error ? reason.message : "Не удалось создать персонажа." }
      }

      await load()
      return { ok: true }
    },
    [campaignId, canManage, gmContext, load],
  )

  const updateCharacter = useCallback(
    async (characterId: string, input: CharacterInput): Promise<Result> => {
      if (!canManage) return { ok: false, error: "Полное состояние персонажа изменяет только ГМ или владелец." }
      const character = characters.find((item) => item.id === characterId)
      if (!character) return { ok: false, error: "Персонаж не найден." }

      try {
        await oracle.characters.update(gmContext(character.campaign_id), characterId, {
          name: input.name.trim(),
          character_class: input.character_class.trim() || "Персонаж",
          level: input.level,
          bio: input.bio.trim(),
          avatar_url: input.avatar_url?.trim() || null,
          assigned_user_id: input.assigned_user_id,
          character_type: input.character_type || character.character_type,
          visibility: input.visibility || character.visibility,
        })
      } catch (reason) {
        return { ok: false, error: reason instanceof Error ? reason.message : "Не удалось обновить персонажа." }
      }
      await load()
      return { ok: true }
    },
    [canManage, characters, gmContext, load],
  )

  const updateOwnCharacterAvatar = useCallback(
    async (characterId: string, avatarUrl: string): Promise<Result> => {
      const character = characters.find((item) => item.id === characterId)
      if (!character) return { ok: false, error: "Персонаж не найден." }
      const cleaned = avatarUrl.trim() || null

      try {
        if (canManage) {
          await oracle.characters.setAvatar(gmContext(character.campaign_id), characterId, cleaned)
        } else {
          if (character.assigned_user_id !== user.id || character.character_type !== "pc") {
            return { ok: false, error: "Можно менять портрет только своего выданного персонажа." }
          }
          await shapoklyak.execute({
            kind: "entity.set_avatar",
            context: createEngineCommandContext({
              campaignId: character.campaign_id,
              requestedBy: user.id,
              authority: "player",
              actorCharacterId: characterId,
            }),
            characterId,
            avatarUrl: cleaned,
          })
        }
      } catch (reason) {
        return { ok: false, error: reason instanceof Error ? reason.message : "Не удалось сохранить портрет." }
      }

      setCharacters((current) => current.map((item) => item.id === characterId
        ? { ...item, avatar_url: cleaned, updated_at: new Date().toISOString() }
        : item))
      return { ok: true }
    },
    [canManage, characters, gmContext, user.id],
  )

  const deleteCharacter = useCallback(
    async (characterId: string): Promise<Result> => {
      if (!canManage) return { ok: false, error: "Удалять персонажей может только ГМ или владелец." }
      const character = characters.find((item) => item.id === characterId)
      if (!character) return { ok: false, error: "Персонаж не найден." }
      try {
        await oracle.characters.delete(gmContext(character.campaign_id), characterId)
      } catch (reason) {
        return { ok: false, error: reason instanceof Error ? reason.message : "Не удалось удалить персонажа." }
      }
      setCharacters((current) => current.filter((item) => item.id !== characterId))
      setMembers((current) => current.map((member) => member.active_character_id === characterId
        ? { ...member, active_character_id: null }
        : member))
      return { ok: true }
    },
    [canManage, characters, gmContext],
  )

  const setActiveForMember = useCallback(
    async (userId: string, characterId: string | null): Promise<Result> => {
      if (!campaignId) return { ok: false, error: "Кампания ещё не загружена." }

      const character = characterId
        ? characters.find((item) =>
            item.id === characterId &&
            item.assigned_user_id === userId &&
            item.campaign_id === campaignId &&
            item.character_type === "pc")
        : null

      if (characterId && !character) {
        return { ok: false, error: "Сначала прикрепи этого персонажа к выбранному игроку." }
      }
      if (!canManage && userId !== user.id) {
        return { ok: false, error: "Игрок может менять только своего активного персонажа." }
      }

      try {
        if (canManage) {
          await oracle.characters.setActive(gmContext(), userId, characterId)
        } else {
          await shapoklyak.execute({
            kind: "entity.set_active",
            context: createEngineCommandContext({
              campaignId,
              requestedBy: user.id,
              authority: "player",
              actorCharacterId: characterId,
            }),
            userId,
            characterId,
          })
        }
      } catch (reason) {
        return { ok: false, error: reason instanceof Error ? reason.message : "Не удалось выбрать активного персонажа." }
      }
      setMembers((current) => current.map((member) => member.user_id === userId
        ? { ...member, active_character_id: characterId }
        : member))
      return { ok: true }
    },
    [campaignId, canManage, characters, gmContext, user.id],
  )

  if (loading) {
    return (
      <div className="auth-screen">
        <div className="auth-loading">
          <span className="auth-spinner" />
          <div className="auth-muted">Загружаем кампанию…</div>
        </div>
      </div>
    )
  }

  if (error && !campaignId) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-eyebrow">MEGANOTRPG</div>
          <h1 className="auth-title">Не удалось загрузить кампанию</h1>
          <p className="auth-muted">{error}</p>
          <button className="auth-primary" type="button" onClick={() => void load()}>
            Повторить
          </button>
        </div>
      </div>
    )
  }

  if (needsInvite) {
    return <JoinCampaign onJoin={joinCampaign} />
  }

  return (
    <CharacterContext.Provider
      value={{
        campaignId,
        campaignTitle,
        campaignSummary,
        campaignRulesSummary,
        campaignCoverUrl,
        characters,
        members,
        myCharacters,
        activeCharacter,
        myMember,
        isGm,
        isOwner,
        canManage,
        loading,
        error,
        refresh: load,
        joinCampaign,
        createInvite,
        setMemberRole,
        updateCampaignInfo,
        createCharacter,
        updateCharacter,
        deleteCharacter,
        updateOwnCharacterAvatar,
        setActiveForMember,
      }}
    >
      {children}
    </CharacterContext.Provider>
  )
}

function JoinCampaign({
  onJoin,
}: {
  onJoin: (code: string) => Promise<Result>
}) {
  const [code, setCode] = useState("")
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState("")

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (joining) return
    setJoining(true)
    setJoinError("")
    const result = await onJoin(code)
    setJoining(false)
    if (!result.ok) {
      setJoinError(
        result.error === "Telegram account required"
          ? "Приглашение можно принять только внутри Telegram Mini App."
          : result.error || "Не удалось принять приглашение.",
      )
    }
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-eyebrow">MEGANOTRPG</div>
        <h1 className="auth-title">Войти в кампанию</h1>
        <p className="auth-muted">
          Попроси владельца или ГМ прислать код приглашения. Он действует 30
          дней и не открывает доступ посторонним.
        </p>
        <label className="auth-label" htmlFor="campaign-invite-code">
          Код приглашения
        </label>
        <input
          id="campaign-invite-code"
          className="auth-input auth-input--code"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="Например: A1B2C3D4E5F6"
          maxLength={32}
          autoCapitalize="characters"
          autoComplete="off"
          autoFocus
        />
        {joinError && <div className="auth-error">{joinError}</div>}
        <button
          className="auth-primary"
          type="submit"
          disabled={joining || !code.trim()}
        >
          {joining ? "Проверяем…" : "Присоединиться"}
        </button>
      </form>
    </div>
  )
}

// The provider and its hook intentionally share this private context.
// oxlint-disable-next-line react/only-export-components
export function useCharacters() {
  const value = useContext(CharacterContext)
  if (!value) {
    throw new Error("useCharacters must be used inside CharacterProvider")
  }
  return value
}
