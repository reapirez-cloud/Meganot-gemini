const CLIENT_KEY = "meganotrpg_client_id"
const AUTHOR_KEY = "meganotrpg_demo_author"

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }

  return "00000000-0000-4000-8000-" + Math.random().toString(16).slice(2).padEnd(12, "0").slice(0, 12)
}

export function getClientId() {
  const existing = localStorage.getItem(CLIENT_KEY)
  if (existing) return existing

  const created = makeId()
  localStorage.setItem(CLIENT_KEY, created)
  return created
}

export function getDemoAuthorName() {
  return localStorage.getItem(AUTHOR_KEY) || "Вильям Кидд"
}

export function setDemoAuthorName(name: string) {
  const cleaned = name.trim().slice(0, 80)
  if (!cleaned) return
  localStorage.setItem(AUTHOR_KEY, cleaned)
}
