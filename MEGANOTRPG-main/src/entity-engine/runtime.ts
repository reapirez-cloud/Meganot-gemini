import { characterResolutionBus, engineEventBus } from "../engine-runtime/runtimeSignals.ts"
import { supabase } from "../lib/supabase.ts"
import { ShapoklyakEngine } from "./engine.ts"
import { SupabaseShapoklyakStorage } from "./supabase.ts"

export const shapoklyak = new ShapoklyakEngine(
  new SupabaseShapoklyakStorage(supabase),
  {
    eventPublisher: engineEventBus,
    resolutionRequester: characterResolutionBus,
  },
)
