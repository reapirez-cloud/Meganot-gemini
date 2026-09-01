import type { ReactNode } from "react"

export type MainTab = "feed" | "chats" | "world" | "characters" | "me"

type Props = {
  active: MainTab
  onChange: (tab: MainTab) => void
  meLabel?: string
}

function WorldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/>
      <path d="M3.5 12h17M12 3c2.3 2.4 3.5 5.4 3.5 9S14.3 18.6 12 21M12 3C9.7 5.4 8.5 8.4 8.5 12s1.2 6.6 3.5 9" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  )
}

function FeedIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m4 10 8-6 8 6v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1v-9Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
    </svg>
  )
}

function MeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8"/>
      <path d="M4.5 21c.7-4.2 3.2-6.5 7.5-6.5s6.8 2.3 7.5 6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  )
}

function ChatsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 5.5A3.5 3.5 0 0 1 7.5 2h9A3.5 3.5 0 0 1 20 5.5v7a3.5 3.5 0 0 1-3.5 3.5H10l-4.5 4v-4A3.5 3.5 0 0 1 4 13V5.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
      <path d="M8 7.5h8M8 11h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  )
}

function CharactersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.8"/>
      <path d="M3.8 19c.5-3.2 2.3-5 5.2-5s4.7 1.8 5.2 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      <circle cx="17.4" cy="9" r="2.2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M15.8 14.5c2.6-.2 4.2 1.2 4.6 3.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

const items: Array<{ id: MainTab; label: string; icon: ReactNode }> = [
  { id: "feed", label: "Лента", icon: <FeedIcon /> },
  { id: "chats", label: "Чаты", icon: <ChatsIcon /> },
  { id: "world", label: "Мир", icon: <WorldIcon /> },
  { id: "characters", label: "Персонажи", icon: <CharactersIcon /> },
  { id: "me", label: "Я", icon: <MeIcon /> },
]

export default function BottomNav({ active, onChange, meLabel = "Я" }: Props) {
  return (
    <nav className="bottom-nav" aria-label="Основная навигация">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`bottom-nav__item ${active === item.id ? "bottom-nav__item--active" : ""}`}
          onClick={() => onChange(item.id)}
        >
          {item.icon}
          <span>{item.id === "me" ? meLabel : item.label}</span>
        </button>
      ))}
    </nav>
  )
}
