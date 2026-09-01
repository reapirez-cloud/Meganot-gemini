import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { createEngineCommandContext, type CharacterResolutionRequest, type EngineEvent } from "../src/engine-contracts/index.ts"
import { CharacterResolutionBus } from "../src/engine-runtime/characterResolutionBus.ts"
import { EngineEventBus } from "../src/engine-runtime/engineEventBus.ts"
import { wireEngineRuntimeSignals } from "../src/engine-runtime/runtimeSignals.ts"
import { CheburashkaEngine, MemoryCheburashkaStorage } from "../src/inventory-engine/index.ts"
import type { InventoryItem } from "../src/types/characterSheet.ts"

function event(overrides: Partial<EngineEvent> = {}): EngineEvent {
  return {
    commandId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    engine: "shapoklyak",
    kind: "entity.update",
    campaignId: "campaign-1",
    aggregateType: "character",
    aggregateId: "hero-1",
    occurredAt: "2026-08-30T20:00:00.000Z",
    visibility: "gm",
    payload: {},
    ...overrides,
  }
}

test("engine event bus exposes one owner event globally, by engine and by campaign", () => {
  const bus = new EngineEventBus()
  const all: string[] = []
  const owner: string[] = []
  const campaign: string[] = []

  bus.subscribe((value) => { all.push(value.kind) })
  bus.subscribeEngine("cheburashka", (value) => { owner.push(value.kind) })
  bus.subscribeCampaign("campaign-1", (value) => { campaign.push(value.kind) })

  bus.publishEngineEvents([event({ engine: "cheburashka", kind: "inventory.remove", aggregateType: "inventory" })])

  assert.deepEqual(all, ["inventory.remove"])
  assert.deepEqual(owner, ["inventory.remove"])
  assert.deepEqual(campaign, ["inventory.remove"])
})

test("character resolution bus keeps direct and campaign invalidation separate", () => {
  const bus = new CharacterResolutionBus()
  const characterReasons: string[] = []
  const campaignReasons: string[] = []

  bus.subscribe("hero-1", (request) => { characterReasons.push(request.reason) })
  bus.subscribeCampaign("campaign-1", (request) => { campaignReasons.push(request.reason) })

  bus.requestCharacterResolution({
    characterId: "hero-1",
    source: "cheburashka",
    reason: "inventory.set_equipped",
    commandId: "command-1",
  })
  bus.requestCampaignResolution({
    campaignId: "campaign-1",
    source: "chasovoy",
    reason: "definition.revise",
    commandId: "command-2",
  })

  assert.deepEqual(characterReasons, ["inventory.set_equipped"])
  assert.deepEqual(campaignReasons, ["definition.revise"])
})

test("Chasovoy definition events invalidate campaign resolvers without knowing characters", () => {
  const events = new EngineEventBus()
  const resolutions = new CharacterResolutionBus()
  const requests: Array<{ campaignId: string; source: string; reason: string; commandId: string }> = []
  const disconnect = wireEngineRuntimeSignals(events, resolutions)
  resolutions.subscribeCampaign("campaign-1", (request) => { requests.push(request) })

  events.publishEngineEvents([event({
    engine: "chasovoy",
    kind: "definition.revise",
    aggregateType: "definition",
    aggregateId: "definition-1",
  })])
  disconnect()

  assert.deepEqual(requests, [{
    campaignId: "campaign-1",
    source: "chasovoy",
    reason: "definition.revise",
    commandId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  }])
})

test("Cheburashka removal drops the mechanical projection and requests a fresh character resolve", async () => {
  const item: InventoryItem = {
    id: "item-shield",
    character_id: "hero-1",
    name: "Тестовый щит",
    quantity: 1,
    weight: 6,
    equipped: true,
    category: "equipment",
    equipment_slot: "off_hand",
    image_url: null,
    description: "",
    mechanics: [{
      id: "shield-ac",
      type: "numeric",
      activation: "equipped",
      target: "combat.ac",
      operation: "ADD",
      value: 2,
    }],
    usage_mode: "none",
    charges_current: null,
    charges_max: null,
    item_state: {},
    version: 1,
    sort_order: 0,
    created_at: "2026-08-30T20:00:00.000Z",
    updated_at: "2026-08-30T20:00:00.000Z",
  }
  const storage = new MemoryCheburashkaStorage([item])
  const requests: CharacterResolutionRequest[] = []
  const cheburashka = new CheburashkaEngine(storage, {
    resolutionRequester: { requestCharacterResolution: (request) => { requests.push(request) } },
  })

  const before = await cheburashka.mechanicalProjection("hero-1")
  assert.equal(before.contributions.length, 1)
  assert.deepEqual(before.activeItemIds, ["item-shield"])

  const context = createEngineCommandContext({
    campaignId: "campaign-1",
    requestedBy: "gm-1",
    authority: "gm",
    actorCharacterId: "hero-1",
    occurredAt: "2026-08-30T20:01:00.000Z",
  })
  const removed = await cheburashka.execute({
    kind: "inventory.remove",
    context,
    characterId: "hero-1",
    itemId: "item-shield",
  })

  assert.deepEqual(removed.effects.resolveCharacterIds, ["hero-1"])
  assert.equal(requests.at(-1)?.source, "cheburashka")
  assert.equal(requests.at(-1)?.reason, "inventory.remove")
  assert.equal(requests.at(-1)?.commandId, context.commandId)

  const after = await cheburashka.mechanicalProjection("hero-1")
  assert.equal(after.contributions.length, 0)
  assert.deepEqual(after.activeItemIds, [])
  assert.notEqual(after.revision, before.revision)
})

test("production runtime graph shares signals without cross-importing domain engines", () => {
  const entityRuntime = fs.readFileSync("src/entity-engine/runtime.ts", "utf8")
  const inventoryRuntime = fs.readFileSync("src/inventory-engine/runtime.ts", "utf8")
  const locationRuntime = fs.readFileSync("src/location-engine/runtime.ts", "utf8")
  const referenceRuntime = fs.readFileSync("src/reference-engine/runtime.ts", "utf8")
  const gameRuntime = fs.readFileSync("src/game-engine/runtime.ts", "utf8")
  const compositionRoot = fs.readFileSync("src/engine-runtime/runtime.ts", "utf8")
  const oracle = fs.readFileSync("src/oracle-engine/engine.ts", "utf8")

  assert.match(entityRuntime, /eventPublisher: engineEventBus/)
  assert.match(entityRuntime, /resolutionRequester: characterResolutionBus/)
  assert.match(inventoryRuntime, /eventPublisher: engineEventBus/)
  assert.match(inventoryRuntime, /resolutionRequester: characterResolutionBus/)
  assert.match(locationRuntime, /engineEventBus/)
  assert.match(referenceRuntime, /eventPublisher: engineEventBus/)
  assert.match(gameRuntime, /eventPublisher: engineEventBus/)

  for (const name of ["ce", "gena", "tobik", "cheburashka", "shapoklyak", "larisa", "chasovoy", "oracle"]) {
    assert.match(compositionRoot, new RegExp(`\\b${name}\\b`))
  }

  assert.doesNotMatch(oracle, /game-engine/)
  assert.doesNotMatch(oracle, /GenaEngine/)
})
