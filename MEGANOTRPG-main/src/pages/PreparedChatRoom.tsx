import ChatPreparationCard from "../components/chat/ChatPreparationCard.tsx"
import { useChatActors } from "../hooks/useChatActors.ts"
import { useChatPreparation } from "../hooks/useChatPreparation.ts"
import ChatRoom from "./ChatRoom.tsx"
import "./PreparedChatRoom.css"

type Props = {
  roomId: string
  onBack: () => void
  onOpenCharacter: (characterId: string) => void
}

export default function PreparedChatRoom(props: Props) {
  const actors = useChatActors()
  const character = actors.selected?.character || null
  const preparation = useChatPreparation(character)

  return <div className="prepared-chat-room">
    <ChatRoom {...props} />
    {character && preparation.model.session?.is_open && preparation.model.tasks.length > 0 && <div className="prepared-chat-room__overlay">
      <ChatPreparationCard
        roomId={props.roomId}
        characterId={character.id}
        model={preparation.model}
        spells={preparation.spells}
        onChanged={preparation.refresh}
      />
      {preparation.error && <div className="prepared-chat-room__error">{preparation.error}</div>}
    </div>}
  </div>
}
