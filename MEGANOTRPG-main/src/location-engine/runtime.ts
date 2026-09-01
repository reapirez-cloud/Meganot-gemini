import { engineEventBus } from "../engine-runtime/runtimeSignals.ts"
import { supabase } from "../lib/supabase.ts"
import { LarisaEngine } from "./engine.ts"
import { SupabaseLarisaStorage } from "./supabase.ts"

export const larisa = new LarisaEngine(
  new SupabaseLarisaStorage(supabase),
  engineEventBus,
)
