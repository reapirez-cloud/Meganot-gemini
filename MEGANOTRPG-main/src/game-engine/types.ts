import type { EngineCommandContext, EngineCommandResult } from "../engine-contracts/index.ts"
import type { InventoryMutation } from "../inventory-engine/index.ts"
import type { RollExecutionResult, TobikRollRequest } from "../roll-engine/index.ts"

/** GENA answers normal gameplay questions. Imperative GM state changes belong to Oracle. */
export type GenaCommand =
  | { kind: "session.declare"; context: EngineCommandContext; label: string; payload?: Record<string, unknown> }
  | { kind: "inventory.use"; context: EngineCommandContext; characterId: string; itemId: string; amount?: number; label: string }
  | { kind: "inventory.transfer"; context: EngineCommandContext; fromCharacterId: string; toCharacterId: string; itemId: string; amount: number }
  | { kind: "roll.request"; context: EngineCommandContext; label: string; request: TobikRollRequest }

export type GenaDelegatedValue =
  | { engine: "none"; declaration: { label: string; payload: Record<string, unknown> } }
  | { engine: "cheburashka"; mutation: InventoryMutation }
  | { engine: "tobik"; result: RollExecutionResult }

export type GenaCommandResult = EngineCommandResult<GenaDelegatedValue>
