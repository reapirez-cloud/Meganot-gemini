import type { CharacterContribution } from "../character-engine/index.ts"
import type { EngineCommandContext } from "../engine-contracts/index.ts"
import type {
  EquipmentSlot,
  InventoryInput,
  InventoryItem,
} from "../types/characterSheet.ts"

export type CheburashkaCommand =
  | {
      kind: "inventory.create"
      context: EngineCommandContext
      characterId: string
      input: InventoryInput
    }
  | {
      kind: "inventory.update"
      context: EngineCommandContext
      characterId: string
      itemId: string
      input: InventoryInput
    }
  | {
      kind: "inventory.remove"
      context: EngineCommandContext
      characterId: string
      itemId: string
    }
  | {
      kind: "inventory.set_equipped"
      context: EngineCommandContext
      characterId: string
      itemId: string
      equipped: boolean
      equipmentSlot: EquipmentSlot | null
    }
  | {
      kind: "inventory.consume"
      context: EngineCommandContext
      characterId: string
      itemId: string
      amount: number
    }
  | {
      kind: "inventory.transfer"
      context: EngineCommandContext
      fromCharacterId: string
      toCharacterId: string
      itemId: string
      amount: number
    }

export type InventoryMutation = {
  kind: CheburashkaCommand["kind"]
  itemId: string
  affectedCharacterIds: string[]
  before: InventoryItem | null
  after: InventoryItem | null
  destinationItem?: InventoryItem | null
}

export type InventoryMechanicalProjection = {
  characterId: string
  /** Debug/invalidation fingerprint only; not canonical inventory state. */
  revision: string
  activeItemIds: string[]
  contributions: CharacterContribution[]
}

export interface CheburashkaStorage {
  listCharacterItems(characterId: string): Promise<InventoryItem[]>
  getItem(itemId: string): Promise<InventoryItem | null>
  execute(command: CheburashkaCommand): Promise<InventoryMutation>
}

