import { useEffect, useState } from "react"
import type { FormEvent, ReactNode } from "react"
import type { User } from "@supabase/supabase-js"

import { supabase } from "../../lib/supabase"
import { AuthProvider, type AppProfile } from "../../context/AuthContext"

type Phase =
  | "loading"
  | "profile"
  | "ready"
  | "telegram-required"
  | "error"

type TelegramUser = {
  id: number
  first_name: string
  last_name: string | null
  username: string | null
  photo_url: string | null
}

type TelegramAuthResponse = {
  token_hash?: string
  telegram_user?: TelegramUser
  error?: string
}

function isLocalDevelopment() {
  return (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  )
}

function allowLegacyBrowserSession() {
  return import.meta.env.VITE_ALLOW_LEGACY_BROWSER_SESSION === "true"
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("loading")
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<AppProfile | null>(null)
  const [telegramUser, setTelegramUser] = useState<TelegramUser | null>(null)
  const [error, setError] = useState("")
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void bootstrap()
  }, [])

  async function loadProfile(currentUser: User, suggestedName = "") {
    setUser(currentUser)

    const { data: existingProfile, error: profileError } = await supabase
      .from("profiles")
      .select("user_id, display_name, created_at, updated_at")
      .eq("user_id", currentUser.id)
      .maybeSingle()

    if (profileError) {
      setError(profileError.message)
      setPhase("error")
      return
    }

    if (!existingProfile) {
      if (suggestedName) {
        setName(suggestedName.slice(0, 40))
      }
      setPhase("profile")
      return
    }

    setProfile(existingProfile as AppProfile)
    setPhase("ready")
  }

  async function bootstrapTelegram(initData: string) {
    let response: Response
    try {
      response = await fetch("/api/telegram-auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ initData }),
      })
    } catch {
      setError("Не удалось связаться с сервером авторизации.")
      setPhase("error")
      return
    }

    let payload: TelegramAuthResponse = {}
    try {
      payload = (await response.json()) as TelegramAuthResponse
    } catch {
      // Keep the generic error below.
    }

    if (!response.ok || !payload.token_hash || !payload.telegram_user) {
      setError(payload.error || "Telegram-авторизация не удалась.")
      setPhase("error")
      return
    }

    setTelegramUser(payload.telegram_user)

    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: payload.token_hash,
      type: "email",
    })

    if (verifyError || !data.user) {
      setError(verifyError?.message || "Не удалось открыть сессию Supabase.")
      setPhase("error")
      return
    }

    const suggestedName = [
      payload.telegram_user.first_name,
      payload.telegram_user.last_name,
    ]
      .filter(Boolean)
      .join(" ")

    await loadProfile(data.user, suggestedName)
  }

  async function bootstrapLegacy() {
    const localDevelopment = isLocalDevelopment()
    const legacyAllowed = allowLegacyBrowserSession()

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError) {
      setError(sessionError.message)
      setPhase("error")
      return
    }

    if (session?.user && (localDevelopment || legacyAllowed)) {
      await loadProfile(session.user)
      return
    }

    if (session?.user && !localDevelopment && !legacyAllowed) {
      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" })
      if (signOutError) {
        console.warn("Could not clear legacy browser session:", signOutError.message)
      }
    }

    // Anonymous auth remains available only for npm run dev on localhost.
    if (localDevelopment) {
      const { data, error: anonymousError } =
        await supabase.auth.signInAnonymously({
          options: {
            data: {
              app: "MEGANOTRPG",
              source: "local_development",
            },
          },
        })

      if (anonymousError || !data.user) {
        setError(
          anonymousError?.message ||
            "Не удалось создать локальную тестовую учётную запись.",
        )
        setPhase("error")
        return
      }

      await loadProfile(data.user)
      return
    }

    setUser(null)
    setProfile(null)
    setPhase("telegram-required")
  }

  async function bootstrap() {
    setPhase("loading")
    setError("")

    const webApp = window.Telegram?.WebApp

    if (webApp) {
      webApp.ready()
      webApp.expand()
    }

    const initData = webApp?.initData?.trim() || ""

    if (initData) {
      await bootstrapTelegram(initData)
      return
    }

    await bootstrapLegacy()
  }

  async function createProfile(event: FormEvent) {
    event.preventDefault()

    if (!user || saving) return

    const displayName = name.trim()

    if (displayName.length < 2) {
      setError("Имя должно быть не короче 2 символов.")
      return
    }

    setSaving(true)
    setError("")

    const { data, error: insertError } = await supabase
      .from("profiles")
      .insert({
        user_id: user.id,
        display_name: displayName,
      })
      .select("user_id, display_name, created_at, updated_at")
      .single()

    setSaving(false)

    if (insertError) {
      if (insertError.code === "23505") {
        setError(
          "Такое имя уже занято. Если это твой старый тестовый аккаунт — пока добавь к имени, например, «TG». После переноса Telegram-аккаунта старую запись уберём.",
        )
      } else {
        setError(insertError.message)
      }
      return
    }

    setProfile(data as AppProfile)
    setPhase("ready")
  }

  if (phase === "loading") {
    return (
      <div className="auth-screen">
        <div className="auth-loading">
          <span className="auth-spinner" />
          <div className="auth-muted">
            {window.Telegram?.WebApp?.initData
              ? "Проверяем Telegram…"
              : "Подключаем игрока…"}
          </div>
        </div>
      </div>
    )
  }

  if (phase === "telegram-required") {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-eyebrow">MEGANOTRPG</div>
          <h1 className="auth-title">Открой приложение в Telegram</h1>
          <p className="auth-muted">
            Вход в кампанию подтверждается Telegram Mini App. Открой{" "}
            <strong>@DND_MEGABOTPROPLUS_BOT</strong>{" "}
            и нажми кнопку запуска приложения.
          </p>

          {allowLegacyBrowserSession() && (
            <div className="auth-note">
              Временный legacy-режим браузерных сессий включён настройкой окружения.
            </div>
          )}

          <button
            type="button"
            className="auth-primary"
            onClick={() => void bootstrap()}
          >
            Проверить снова
          </button>
        </div>
      </div>
    )
  }

  if (phase === "error") {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-eyebrow">MEGANOTRPG</div>
          <h1 className="auth-title">Не удалось войти</h1>
          <p className="auth-muted">{error}</p>

          <button
            type="button"
            className="auth-primary"
            onClick={() => void bootstrap()}
          >
            Повторить
          </button>
        </div>
      </div>
    )
  }

  if (phase === "profile") {
    return (
      <div className="auth-screen">
        <form className="auth-card" onSubmit={createProfile}>
          <div className="auth-eyebrow">MEGANOTRPG</div>
          <h1 className="auth-title">Как тебя подписать?</h1>

          <p className="auth-muted">
            {telegramUser
              ? "Telegram уже подтвердил твой аккаунт. Осталось выбрать имя, которое увидят игроки в кампании."
              : "Это локальная тестовая учётная запись."}
          </p>

          {telegramUser?.username && (
            <div className="auth-note">
              Telegram: <strong>@{telegramUser.username}</strong>
            </div>
          )}

          <label className="auth-label" htmlFor="player-name">
            Имя игрока
          </label>

          <input
            id="player-name"
            className="auth-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Например: Виталий"
            minLength={2}
            maxLength={40}
            autoFocus
            autoComplete="nickname"
          />

          {error && <div className="auth-error">{error}</div>}

          <button
            type="submit"
            className="auth-primary"
            disabled={saving || name.trim().length < 2}
          >
            {saving ? "Сохраняем…" : "Войти в кампанию"}
          </button>

          <p className="auth-footnote">
            {telegramUser
              ? "В следующий раз Telegram узнает тебя автоматически."
              : "Локальный режим нужен только для разработки."}
          </p>
        </form>
      </div>
    )
  }

  if (!user || !profile) {
    return null
  }

  return (
    <AuthProvider user={user} profile={profile}>
      {children}
    </AuthProvider>
  )
}
