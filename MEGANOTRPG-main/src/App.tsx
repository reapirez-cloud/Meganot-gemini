import { useState } from "react"
import type { MainTab } from "./components/app/BottomNav"
import BottomNav from "./components/app/BottomNav"
import TopBar from "./components/app/TopBar"
import AuthGate from "./components/auth/AuthGate"
import World from "./pages/World"
import Characters from "./pages/Characters"
import Chats from "./pages/Chats"
import Feed from "./pages/Feed"
import CharacterProfileV2 from "./pages/CharacterProfileV2"
import ChatRoom from "./pages/ChatRoom"
import GmWorkspace from "./pages/GmWorkspace"
import { CharacterProvider } from "./context/CharacterContext"
import NotificationsSheet from "./components/app/NotificationsSheet"
import ReferenceGuide from "./components/reference/ReferenceGuide"

function AppShell() {
  const [tab, setTab] = useState<MainTab>("characters")
  const [characterId, setCharacterId] = useState<string | null>(null)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [referenceOpen, setReferenceOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  
  if (characterId) {
    return <CharacterProfileV2 characterId={characterId} onBack={() => setCharacterId(null)} />
  }
  
  if (roomId) {
    return <ChatRoom roomId={roomId} onBack={() => setRoomId(null)} onOpenCharacter={setCharacterId} />
  }

  let content = null
  let title = "МЕГА НЕ РПГ"
  if (tab === "world") {
    content = <World />
    title = "Мир"
  }
  if (tab === "characters") {
    content = <Characters onOpenCharacter={setCharacterId} />
    title = "Персонажи"
  }
  if (tab === "chats") {
    content = <Chats onOpenRoom={setRoomId} />
    title = "Чаты"
  }
  if (tab === "feed") {
    content = <Feed onOpenCharacter={setCharacterId} onOpenGallery={() => {}} />
    title = "Лента"
  }
  if (tab === "me") {
    content = <GmWorkspace onOpenCharacter={setCharacterId} onOpenRoom={setRoomId} />
    title = "Мастерская"
  }
  
  return (
    <div className="app-shell">
      <TopBar title={title} onOpenReference={() => setReferenceOpen(true)} onOpenNotifications={() => setNotificationsOpen(true)} />
      <main className="app-main">{content}</main>
      <BottomNav active={tab} onChange={setTab} />
      
      {referenceOpen && (
        <ReferenceGuide canManage={false} character={null} onClose={() => setReferenceOpen(false)} />
      )}
      
      {notificationsOpen && (
        <NotificationsSheet items={[]} loading={false} error={null} onMarkRead={async () => {}} onOpenFeed={() => {}} onClose={() => setNotificationsOpen(false)} />
      )}
    </div>
  )
}

export default function App() {
  return (
    <AuthGate>
      <CharacterProvider>
        <AppShell />
      </CharacterProvider>
    </AuthGate>
  )
}
