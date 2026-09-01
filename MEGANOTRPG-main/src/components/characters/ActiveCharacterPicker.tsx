import { useAuth } from "../../context/AuthContext"
import { useCharacters } from "../../context/CharacterContext"
import CharacterAvatar from "./CharacterAvatar"

type Props = {
  compact?: boolean
}

/**
 * Read-only active character badge.
 *
 * Active character selection is GM-controlled now, so players no longer
 * switch characters from this component.
 */
export default function ActiveCharacterPicker({ compact = false }: Props) {
  const { profile } = useAuth()
  const { activeCharacter } = useCharacters()

  const label = activeCharacter
    ? `${activeCharacter.name} (${profile.display_name})`
    : "GM ещё не назначил персонажа"

  return (
    <div
      className={`active-character-chip ${compact ? "active-character-chip--compact" : ""}`}
      aria-label="Активный персонаж"
    >
      <CharacterAvatar character={activeCharacter} size="small" />

      <span>
        <small>Активный</small>
        <strong>{label}</strong>
      </span>
    </div>
  )
}
