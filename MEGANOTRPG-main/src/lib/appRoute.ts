import type { MainTab } from "../components/app/BottomNav"

export type AppRoute =
  | { type: "main"; tab: MainTab }
  | { type: "chat"; id: string }
  | {
      type: "character"
      id: string
      from: "feed" | "characters" | "chat" | "me"
      roomId?: string
    }
  | { type: "gallery" }

export function parseAppRoute(hash: string): AppRoute {
  const raw = hash.replace(/^#\/?/, "")
  const [path, query = ""] = raw.split("?")
  const parts = path.split("/").filter(Boolean)

  if (parts[0] === "chat" && parts[1]) return { type: "chat", id: parts[1] }

  if (parts[0] === "character" && parts[1]) {
    const params = new URLSearchParams(query)
    const fromValue = params.get("from")
    const from =
      fromValue === "chat" || fromValue === "characters" || fromValue === "me"
        ? fromValue
        : "feed"
    return {
      type: "character",
      id: parts[1],
      from,
      roomId: params.get("room") || undefined,
    }
  }

  if (parts[0] === "gallery") return { type: "gallery" }

  const tab = parts[0]
  if (
    tab === "chats" ||
    tab === "world" ||
    tab === "characters" ||
    tab === "me"
  ) {
    return { type: "main", tab }
  }

  return { type: "main", tab: "feed" }
}

export function mainRouteHash(tab: MainTab) {
  return `#/${tab}`
}
