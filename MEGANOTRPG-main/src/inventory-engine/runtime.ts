import { characterResolutionBus, engineEventBus } from "../engine-runtime/runtimeSignals.ts"
import { supabase } from "../lib/supabase.ts"
import { CheburashkaEngine } from "./engine.ts"
import { SupabaseCheburashkaStorage } from "./supabase.ts"
import { subscribeCheburashkaCharacterChanges } from "./realtime.ts"

export const cheburashka = new CheburashkaEngine(
  new SupabaseCheburashkaStorage(supabase),
  {
    eventPublisher: engineEventBus,
    resolutionRequester: characterResolutionBus,
  },
)

export function watchCheburashkaCharacter(characterId: string): () => void {
  return subscribeCheburashkaCharacterChanges(supabase, characterResolutionBus, characterId)
}
