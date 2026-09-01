import type { Character } from "../../context/CharacterContext"
import CampaignImage from "../common/CampaignImage"

type Props = {
  character: Pick<Character, "name" | "avatar_url"> | null
  size?: "small" | "medium" | "large"
}

export default function CharacterAvatar({ character, size = "medium" }: Props) {
  const className = `character-avatar character-avatar--${size}`

  if (character?.avatar_url) {
    return (
      <div className={className} aria-label={character.name}>
        <CampaignImage
          value={character.avatar_url}
          alt=""
          fallback={character.name.trim().slice(0, 1).toUpperCase() || "?"}
        />
      </div>
    )
  }

  return (
    <div className={`${className} character-avatar--fallback`}>
      {character?.name?.trim().slice(0, 1).toUpperCase() || "?"}
    </div>
  )
}
