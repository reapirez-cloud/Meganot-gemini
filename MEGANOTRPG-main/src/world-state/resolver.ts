import { compareWorldTime } from "./time.ts"
import type { CharacterWorldState, PresenceCharacter, SceneWorldState, WorldPosition } from "./types.ts"

export function sameWorldPosition(a: WorldPosition | null | undefined, b: WorldPosition | null | undefined): boolean {
  return Boolean(a && b && a.location_id && b.location_id && a.location_id === b.location_id && a.campaign_day === b.campaign_day && a.day_period === b.day_period)
}

export function sameLocation(a: WorldPosition | null | undefined, b: WorldPosition | null | undefined): boolean {
  return Boolean(a?.location_id && b?.location_id && a.location_id === b.location_id)
}

export function resolveNearbyCharacters(subjectId: string, states: CharacterWorldState[], characters: Array<Omit<PresenceCharacter, "state">>): PresenceCharacter[] {
  const subject = states.find((state) => state.character_id === subjectId)
  if (!subject?.location_id) return []
  const stateMap = new Map(states.map((state) => [state.character_id, state]))
  return characters
    .filter((character) => character.id !== subjectId)
    .map((character) => ({ ...character, state: stateMap.get(character.id) }))
    .filter((character): character is PresenceCharacter => Boolean(character.state && sameWorldPosition(subject, character.state)))
}

export function resolveOtherTimeCharacters(subjectId: string, states: CharacterWorldState[], characters: Array<Omit<PresenceCharacter, "state">>): Array<PresenceCharacter & { relation: "earlier" | "later" }> {
  const subject = states.find((state) => state.character_id === subjectId)
  if (!subject?.location_id) return []
  const stateMap = new Map(states.map((state) => [state.character_id, state]))
  return characters
    .filter((character) => character.id !== subjectId)
    .map((character) => ({ ...character, state: stateMap.get(character.id) }))
    .filter((character): character is PresenceCharacter => Boolean(character.state && sameLocation(subject, character.state) && !sameWorldPosition(subject, character.state)))
    .map((character) => ({ ...character, relation: compareWorldTime(character.state, subject) < 0 ? "earlier" as const : "later" as const }))
    .sort((a, b) => Math.abs(compareWorldTime(a.state, subject)) - Math.abs(compareWorldTime(b.state, subject)))
}

export function resolveScenesAtPosition(position: WorldPosition | null | undefined, scenes: SceneWorldState[]): SceneWorldState[] {
  if (!position?.location_id) return []
  return scenes.filter((scene) => scene.scene_state === "active" && scene.room_state !== "closed" && sameWorldPosition(position, scene))
}

export function resolveCharactersAtLocation(locationId: string, states: CharacterWorldState[], characters: Array<Omit<PresenceCharacter, "state">>): PresenceCharacter[] {
  const stateMap = new Map(states.map((state) => [state.character_id, state]))
  return characters
    .map((character) => ({ ...character, state: stateMap.get(character.id) }))
    .filter((character): character is PresenceCharacter => Boolean(character.state?.location_id === locationId))
}
