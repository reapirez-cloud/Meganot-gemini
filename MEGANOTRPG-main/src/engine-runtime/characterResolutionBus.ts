import type {
  CharacterResolutionRequest,
  CharacterResolutionRequester,
  EngineName,
} from "../engine-contracts/index.ts"

export type CharacterResolutionListener = (request: CharacterResolutionRequest) => void
export type CampaignResolutionRequest = {
  campaignId: string
  source: Exclude<EngineName, "ce">
  reason: string
  commandId: string
}
export type CampaignResolutionListener = (request: CampaignResolutionRequest) => void

/**
 * Ephemeral invalidation only. This bus stores no character or CE result.
 * Canonical facts remain in their owning engines and every listener must build
 * a fresh snapshot before invoking CE.
 */
export class CharacterResolutionBus implements CharacterResolutionRequester {
  private readonly listeners = new Map<string, Set<CharacterResolutionListener>>()
  private readonly campaignListeners = new Map<string, Set<CampaignResolutionListener>>()

  requestCharacterResolution(request: CharacterResolutionRequest): void {
    for (const listener of this.listeners.get(request.characterId) ?? []) listener(request)
  }

  requestCampaignResolution(request: CampaignResolutionRequest): void {
    for (const listener of this.campaignListeners.get(request.campaignId) ?? []) listener(request)
  }

  subscribe(characterId: string, listener: CharacterResolutionListener): () => void {
    const current = this.listeners.get(characterId) ?? new Set<CharacterResolutionListener>()
    current.add(listener)
    this.listeners.set(characterId, current)
    return () => {
      current.delete(listener)
      if (current.size === 0) this.listeners.delete(characterId)
    }
  }

  subscribeCampaign(campaignId: string, listener: CampaignResolutionListener): () => void {
    if (!campaignId) throw new Error("Campaign id is required for character-resolution subscription")
    const current = this.campaignListeners.get(campaignId) ?? new Set<CampaignResolutionListener>()
    current.add(listener)
    this.campaignListeners.set(campaignId, current)
    return () => {
      current.delete(listener)
      if (current.size === 0) this.campaignListeners.delete(campaignId)
    }
  }
}

export const characterResolutionBus = new CharacterResolutionBus()
