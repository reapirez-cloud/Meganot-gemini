import { characterResolutionBus, engineEventBus } from "../engine-runtime/runtimeSignals.ts"
import { cheburashka } from "../inventory-engine/runtime.ts"
import { supabase } from "../lib/supabase.ts"
import { tobik } from "../roll-engine/index.ts"
import { GenaEngine } from "./engine.ts"
import { SupabaseGenaSessionGateway } from "./supabase.ts"

/** In-process gameplay orchestrator for normal gameplay contracts only. */
export const gena = new GenaEngine({
  cheburashka,
  tobik,
  eventPublisher: engineEventBus,
})

/** Server-transaction gameplay gateway for durable player actions. */
export const genaSession = new SupabaseGenaSessionGateway(supabase, characterResolutionBus)
