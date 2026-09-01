import { useCallback, useEffect, useMemo, useState } from "react"
import "./App.css"
import "./auth.css"
import "./character-system.css"
import "./character-sheet.css"
import "./character-equipment.css"
import "./character-engine-sheet.css"
import "./world.css"
import "./npc-zone-habitats.css"
import "./chat-v11.css"
import "./social.css"
import "./gm-workspace.css"
import "./spell-reference.css"
import "./reference-guide.css"
import "./reference-druid.css"
import "./reference-catalog.css"
import "./character-profile-v3.css"
import "./ui-v2.css"
import "./game-context-v3.css"
import "./rule-templates.css"
import "./rule-template-levels.css"
import "./resource-runtime.css"
import "./chat-release-fixes.css"
import "./spell-slot-clarity.css"
import "./creation-wizard.css"
import "./character-sheet-modules.css"

import BottomNav from "./components/app/BottomNav"
import NotificationsSheet from "./components/app/NotificationsSheet"
import TopBar from "./components/app/TopBar"
import AuthGate from "./components/auth/AuthGate"
import CharacterGameFrame from "./components/characters/CharacterGameFrame"
import ReferenceGuide from "./components/reference/ReferenceGuide"
import { CharacterProvider, useCharacters } from "./context/CharacterContext"
import { useNotifications } from "./hooks/useNotifications"
import { mainRouteHash, parseAppRoute, type AppRoute } from "./lib/appRoute"
import Art from "./pages/Art"
import CharacterProfileV2 from "./pages/CharacterProfileV2"
import Characters from "./pages/Characters"
import ChatRoom from "./pages/ChatRoom"
import Chats from "./pages/Chats"
import Feed from "./pages/Feed"
import GmWorkspace from "./pages/GmWorkspace"
import World from "./pages/World"

function Workspace(){
  const{campaignId,activeCharacter,myCharacters,canManage}=useCharacters();const notifications=useNotifications(campaignId);const[route,setRoute]=useState<AppRoute>(()=>parseAppRoute(window.location.hash));const[notificationsOpen,setNotificationsOpen]=useState(false);const[referenceOpen,setReferenceOpen]=useState(false);const[characterRefreshKey,setCharacterRefreshKey]=useState(0)
  useEffect(()=>{if(!window.location.hash)window.history.replaceState(null,"","#/feed");const update=()=>setRoute(parseAppRoute(window.location.hash));window.addEventListener("hashchange",update);return()=>window.removeEventListener("hashchange",update)},[])
  const navigate=useCallback((hash:string,replace=false)=>{if(window.location.hash===hash)return;if(replace)window.history.replaceState(null,"",hash);else window.location.hash=hash;setRoute(parseAppRoute(hash))},[])
  const goBack=useCallback(()=>{if(route.type==="chat")navigate("#/chats");else if(route.type==="gallery")navigate("#/feed");else if(route.type==="character"&&route.from==="chat"&&route.roomId)navigate(`#/chat/${route.roomId}`);else if(route.type==="character")navigate(route.from==="chat"?"#/chats":mainRouteHash(route.from))},[navigate,route])
  useEffect(()=>{const back=window.Telegram?.WebApp?.BackButton;if(!back)return;if(route.type==="main")back.hide();else{back.show();back.onClick(goBack)}return()=>back.offClick(goBack)},[goBack,route.type])
  const title=useMemo(()=>{if(route.type!=="main")return"";if(route.tab==="feed")return"Хроника";if(route.tab==="chats")return"Чаты";if(route.tab==="world")return"Мир";if(route.tab==="characters")return"Персонажи";return canManage?"Управление":"Мой персонаж"},[canManage,route])
  if(route.type==="chat")return <div className="app-shell"><ChatRoom roomId={route.id} onBack={goBack} onOpenCharacter={(id)=>navigate(`#/character/${id}?from=chat&room=${route.id}`)}/></div>
  if(route.type==="character")return <div className="app-shell"><CharacterGameFrame characterId={route.id}><CharacterProfileV2 characterId={route.id} onBack={goBack}/></CharacterGameFrame></div>
  if(route.type==="gallery")return <div className="app-shell"><div className="screen"><header className="screen-header"><button className="icon-button" type="button" onClick={goBack} aria-label="Назад">←</button><h1 className="screen-header__title">Арты и комиксы</h1><span/></header><main className="app-content app-content--overlay"><Art/></main></div></div>
  return <div className="app-shell"><TopBar title={title} unreadCount={notifications.unreadCount} onOpenReference={()=>setReferenceOpen(true)} onOpenNotifications={()=>setNotificationsOpen(true)}/><main className="app-content">
    {route.tab==="feed"&&<Feed onOpenCharacter={(id)=>navigate(`#/character/${id}?from=feed`)} onOpenGallery={()=>navigate("#/gallery")}/>} {route.tab==="chats"&&<Chats onOpenRoom={(id)=>navigate(`#/chat/${id}`)}/>} {route.tab==="world"&&<World/>} {route.tab==="characters"&&<Characters onOpenCharacter={(id)=>navigate(`#/character/${id}?from=characters`)}/>} 
    {route.tab==="me"&&canManage&&<GmWorkspace onOpenCharacter={(id)=>navigate(`#/character/${id}?from=me`)} onOpenRoom={(id)=>navigate(`#/chat/${id}`)}/>}
    {route.tab==="me"&&!canManage&&activeCharacter&&<CharacterGameFrame characterId={activeCharacter.id}><CharacterProfileV2 key={`${activeCharacter.id}:${characterRefreshKey}`} characterId={activeCharacter.id} onBack={()=>navigate("#/feed")} embedded/></CharacterGameFrame>}
    {route.tab==="me"&&!canManage&&!activeCharacter&&<section className="me-empty surface"><span>◇</span><h2>{myCharacters.length?"Нет активного персонажа":"Персонаж ещё не назначен"}</h2><p>{myCharacters.length?"Активного героя выбирает ГМ в панели кампании.":"ГМ выдаст тебе персонажа — создавать героев игрок сам не может."}</p><button type="button" onClick={()=>navigate("#/characters")}>Открыть персонажей</button></section>}
  </main>
  {notificationsOpen&&<NotificationsSheet items={notifications.items} loading={notifications.loading} error={notifications.error} onClose={()=>setNotificationsOpen(false)} onMarkRead={notifications.markAllRead} onOpenFeed={()=>navigate("#/feed")}/>} {referenceOpen&&<ReferenceGuide campaignId={campaignId} character={activeCharacter?{id:activeCharacter.id,name:activeCharacter.name,character_class:activeCharacter.character_class}:null} canManage={canManage} onClose={()=>setReferenceOpen(false)} onCharacterChanged={()=>setCharacterRefreshKey((c)=>c+1)}/>} 
  <BottomNav active={route.tab} onChange={(tab)=>navigate(mainRouteHash(tab))} meLabel={canManage?"Панель":"Я"}/></div>
}
function AppContent(){return <CharacterProvider><Workspace/></CharacterProvider>}
export default function App(){return <AuthGate><AppContent/></AuthGate>}
