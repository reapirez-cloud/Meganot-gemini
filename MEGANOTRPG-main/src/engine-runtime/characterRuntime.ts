import { CharacterRuntimeResolver } from "./characterRuntimeResolver.ts"
import { supabaseCharacterRuntimeDataSource } from "./supabaseCharacterRuntimeSource.ts"

/** Shared application read-model resolver for Chat, Sheet and Revolver. */
export const characterRuntimeResolver = new CharacterRuntimeResolver(
  supabaseCharacterRuntimeDataSource,
)
