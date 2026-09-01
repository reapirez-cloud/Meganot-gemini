import { characterResolutionBus, CharacterResolutionBus } from "./characterResolutionBus.ts"
import { engineEventBus, EngineEventBus } from "./engineEventBus.ts"

/**
 * Connect cross-engine runtime signals without creating domain-engine imports.
 * Chasovoy deliberately does not know which characters reference a changed
 * definition, so definition changes conservatively invalidate mounted character
 * resolvers for the whole campaign. Every resolver still assembles fresh owner
 * state before calling CE.
 */
export function wireEngineRuntimeSignals(
  events: EngineEventBus,
  resolutions: CharacterResolutionBus,
): () => void {
  return events.subscribeEngine("chasovoy", (event) => {
    resolutions.requestCampaignResolution({
      campaignId: event.campaignId,
      source: "chasovoy",
      reason: event.kind,
      commandId: event.commandId,
    })
  })
}

wireEngineRuntimeSignals(engineEventBus, characterResolutionBus)

export { characterResolutionBus, engineEventBus }
