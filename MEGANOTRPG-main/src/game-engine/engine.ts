import {
  EMPTY_ENGINE_EFFECTS,
  EngineCommandError,
  mergeEngineEffects,
  type EngineCommandResult,
  type EngineEvent,
  type EngineEventPublisher,
} from "../engine-contracts/index.ts"
import type { CheburashkaEngine } from "../inventory-engine/index.ts"
import type { TobikPort } from "../roll-engine/index.ts"
import type { GenaCommand, GenaCommandResult, GenaDelegatedValue } from "./types.ts"

export type GenaDependencies = {
  cheburashka: Pick<CheburashkaEngine, "execute">
  tobik: TobikPort
  eventPublisher?: EngineEventPublisher
}

function sessionEvent(command: GenaCommand, delegatedTo: GenaDelegatedValue["engine"]): EngineEvent {
  return {
    commandId: command.context.commandId,
    engine: "gena",
    kind: command.kind,
    campaignId: command.context.campaignId,
    aggregateType: "session",
    aggregateId: command.context.roomId || command.context.campaignId,
    occurredAt: command.context.occurredAt,
    visibility: "campaign",
    actorCharacterId: command.context.actorCharacterId,
    payload: { commandKind: command.kind, delegatedTo },
  }
}

export class GenaEngine {
  private readonly dependencies: GenaDependencies

  constructor(dependencies: GenaDependencies) { this.dependencies = dependencies }

  async execute(command: GenaCommand): Promise<GenaCommandResult> {
    if (command.context.authority === "gm") {
      throw new EngineCommandError(
        "gena.gm_forbidden",
        "GM imperative commands must use Oracle instead of GENA",
      )
    }

    let delegated: EngineCommandResult<GenaDelegatedValue>

    if (command.kind === "session.declare") {
      delegated = {
        value: { engine: "none", declaration: { label: command.label, payload: command.payload ?? {} } },
        events: [],
        effects: EMPTY_ENGINE_EFFECTS,
      }
    } else if (command.kind === "inventory.use") {
      const result = await this.dependencies.cheburashka.execute({
        kind: "inventory.consume",
        context: command.context,
        characterId: command.characterId,
        itemId: command.itemId,
        amount: command.amount ?? 1,
      })
      delegated = { value: { engine: "cheburashka", mutation: result.value }, events: result.events, effects: result.effects }
    } else if (command.kind === "inventory.transfer") {
      const result = await this.dependencies.cheburashka.execute({
        kind: "inventory.transfer",
        context: command.context,
        fromCharacterId: command.fromCharacterId,
        toCharacterId: command.toCharacterId,
        itemId: command.itemId,
        amount: command.amount,
      })
      delegated = { value: { engine: "cheburashka", mutation: result.value }, events: result.events, effects: result.effects }
    } else {
      const roll = this.dependencies.tobik.execute(command.request)
      const tobikEvent: EngineEvent = {
        commandId: command.context.commandId,
        engine: "tobik",
        kind: "roll.resolved",
        campaignId: command.context.campaignId,
        aggregateType: "roll",
        aggregateId: command.context.commandId,
        occurredAt: command.context.occurredAt,
        visibility: "campaign",
        actorCharacterId: command.context.actorCharacterId,
        payload: { label: command.label, result: roll },
      }
      delegated = { value: { engine: "tobik", result: roll }, events: [tobikEvent], effects: EMPTY_ENGINE_EFFECTS }
    }

    const genaEvent = sessionEvent(command, delegated.value.engine)
    const events = [...delegated.events, genaEvent]
    // The owning domain engine already published its own event. GENA publishes
    // only the session-level orchestration event and returns both for correlation.
    await this.dependencies.eventPublisher?.publishEngineEvents([genaEvent])
    return {
      value: delegated.value,
      events,
      effects: mergeEngineEffects(delegated.effects),
    }
  }
}
