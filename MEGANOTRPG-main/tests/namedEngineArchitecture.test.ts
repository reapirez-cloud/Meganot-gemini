import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { EMPTY_ENGINE_EFFECTS, createEngineCommandContext, type CharacterResolutionRequest } from "../src/engine-contracts/index.ts"
import { MemoryShapoklyakStorage, ShapoklyakEngine, type CharacterEntity } from "../src/entity-engine/index.ts"
import { GenaEngine, MemoryEngineEventPublisher } from "../src/game-engine/index.ts"
import { CheburashkaEngine, MemoryCheburashkaStorage } from "../src/inventory-engine/index.ts"
import { LarisaEngine, MemoryLarisaStorage } from "../src/location-engine/index.ts"
import { OracleEngine, type OracleDependencies } from "../src/oracle-engine/index.ts"
import { TobikEngine, type RollRecipe } from "../src/roll-engine/index.ts"
import type { InventoryItem } from "../src/types/characterSheet.ts"

const campaignId = "campaign-1"
const characterId = "hero-1"
const now = "2026-08-30T12:00:00.000Z"

const hero: CharacterEntity = {
  id: characterId,
  campaign_id: campaignId,
  assigned_user_id: "user-1",
  name: "Вася",
  character_class: "Воин",
  level: 3,
  bio: "",
  avatar_url: null,
  character_type: "pc",
  visibility: "campaign",
  visibility_mode: "always",
  life_state: "alive",
  died_at: null,
  created_by: "gm-1",
  created_at: now,
  updated_at: now,
}

function context(authority: "player" | "gm" = "player", commandId = crypto.randomUUID()) {
  return createEngineCommandContext({
    commandId,
    campaignId,
    requestedBy: authority === "gm" ? "gm-1" : "user-1",
    authority,
    actorCharacterId: characterId,
    occurredAt: now,
    roomId: "room-1",
  })
}

function noOpOwner() {
  return {
    execute: async (command: Record<string, unknown>) => ({
      value: { kind: command.kind },
      events: [],
      effects: EMPTY_ENGINE_EFFECTS,
    }),
  }
}

function oracleWith(input: Partial<OracleDependencies>) {
  return new OracleEngine({
    shapoklyak: input.shapoklyak || noOpOwner(),
    cheburashka: input.cheburashka || noOpOwner(),
    larisa: input.larisa || noOpOwner(),
    chasovoy: input.chasovoy || noOpOwner(),
  } as OracleDependencies)
}

function inventoryItem(input: Partial<InventoryItem> & Pick<InventoryItem, "id" | "name">): InventoryItem {
  return {
    id: input.id,
    character_id: characterId,
    name: input.name,
    quantity: 1,
    weight: null,
    equipped: false,
    category: "other",
    equipment_slot: null,
    image_url: null,
    description: "",
    mechanics: [],
    usage_mode: "none",
    charges_current: null,
    charges_max: null,
    item_state: {},
    version: 1,
    sort_order: 0,
    created_at: now,
    updated_at: now,
    ...input,
  }
}

test("Gena delegates grenade use; Cheburashka owns deletion and directly requests fresh CE resolution", async () => {
  const grenade = inventoryItem({
    id: "grenade-1",
    name: "Граната",
    category: "consumable",
    usage_mode: "quantity",
    mechanics: [{
      id: "grenade-action",
      type: "action",
      key: "throw-grenade",
      label: "Бросить гранату",
      economy: "action",
      damage: [{ key: "blast", damageType: "fire", count: 2, sides: 6 }],
    }],
  })
  const beer = inventoryItem({ id: "beer-1", name: "Бутылка пива" })
  const inventory = new MemoryCheburashkaStorage([grenade, beer])
  const resolutionRequests: CharacterResolutionRequest[] = []
  const eventPublisher = new MemoryEngineEventPublisher()
  const cheburashka = new CheburashkaEngine(inventory, {
    eventPublisher,
    resolutionRequester: { requestCharacterResolution: (request) => { resolutionRequests.push(request) } },
  })
  const gena = new GenaEngine({ cheburashka, tobik: new TobikEngine(), eventPublisher })

  const before = await cheburashka.mechanicalProjection(characterId)
  assert.deepEqual(before.activeItemIds, [grenade.id])
  assert.equal(before.contributions.length, 1)
  assert.equal(before.contributions.some((entry) => entry.source.name === beer.name), false)

  const result = await gena.execute({
    kind: "inventory.use",
    context: context("player", "11111111-1111-4111-8111-111111111111"),
    characterId,
    itemId: grenade.id,
    amount: 1,
    label: "Бросить гранату",
  })

  assert.equal(result.value.engine, "cheburashka")
  assert.equal(await cheburashka.getItem(grenade.id), null)
  assert.equal((await cheburashka.getItem(beer.id))?.name, beer.name)
  assert.deepEqual((await cheburashka.mechanicalProjection(characterId)).contributions, [])
  assert.deepEqual(resolutionRequests.map(({ characterId: id, source, reason }) => ({ id, source, reason })), [{
    id: characterId,
    source: "cheburashka",
    reason: "inventory.consume",
  }])
  assert.equal(eventPublisher.events.some((event) => event.engine === "cheburashka" && event.kind === "inventory.consume"), true)
  assert.equal(eventPublisher.events.some((event) => event.engine === "gena" && event.kind === "inventory.use"), true)
  assert.equal(eventPublisher.events.filter((event) => event.engine === "cheburashka").length, 1)
  assert.equal(eventPublisher.events.filter((event) => event.engine === "gena").length, 1)
})

test("item charges remain Cheburashka state and only the projection crosses into CE assembly", async () => {
  const wand = inventoryItem({
    id: "wand-1",
    name: "Жезл",
    usage_mode: "charges",
    charges_current: 3,
    charges_max: 3,
    mechanics: [
      { id: "wand-ac", type: "numeric", target: "combat.ac", operation: "ADD", value: 1 },
      { id: "wand-action", type: "action", key: "wand-bolt", label: "Разряд жезла", economy: "action" },
    ],
  })
  const inventory = new MemoryCheburashkaStorage([wand])
  const cheburashka = new CheburashkaEngine(inventory)

  await cheburashka.execute({
    kind: "inventory.consume",
    context: context("player"),
    characterId,
    itemId: wand.id,
    amount: 2,
  })

  assert.equal((await cheburashka.getItem(wand.id))?.charges_current, 1)
  const projection = await cheburashka.mechanicalProjection(characterId)
  assert.equal(projection.contributions.length, 2)
  assert.equal("charges_current" in projection, false)
  assert.equal("items" in projection, false)

  await cheburashka.execute({
    kind: "inventory.consume",
    context: context("player"),
    characterId,
    itemId: wand.id,
    amount: 1,
  })
  const depletedProjection = await cheburashka.mechanicalProjection(characterId)
  assert.equal(depletedProjection.contributions.length, 1)
  assert.equal(depletedProjection.contributions[0]?.kind, "numeric")
})

test("rolls never apply HP; only Oracle can deliver the GM HP declaration to Shapoklyak", async () => {
  const resolutionRequests: CharacterResolutionRequest[] = []
  const shapoklyak = new ShapoklyakEngine(new MemoryShapoklyakStorage([hero]), {
    resolutionRequester: { requestCharacterResolution: (request) => { resolutionRequests.push(request) } },
  })
  const gena = new GenaEngine({
    cheburashka: new CheburashkaEngine(new MemoryCheburashkaStorage()),
    tobik: new TobikEngine(),
  })
  const oracle = oracleWith({ shapoklyak })
  const damageRoll: RollRecipe = {
    key: "damage",
    name: "Урон",
    interaction: "roll",
    sequences: [{
      key: "damage",
      resolution: { kind: "none" },
      effects: [{ key: "damage", kind: "damage", dice: { count: 1, sides: 6 } }],
    }],
  }

  const roll = await gena.execute({
    kind: "roll.request",
    context: context("player"),
    label: "Урон гранаты",
    request: { recipe: damageRoll, context: { characterLevel: 3 } },
  })
  assert.equal(roll.value.engine, "tobik")
  assert.deepEqual(roll.effects.resolveCharacterIds, [])
  assert.deepEqual(resolutionRequests, [])

  assert.throws(
    () => oracle.characters.setHp(context("player"), characterId, 7),
    /Oracle only accepts GM or system authority/,
  )

  await assert.rejects(() => shapoklyak.execute({
    kind: "entity.set_hp",
    context: context("player"),
    characterId,
    currentHp: 7,
  }), /Only GM authority/)

  await oracle.characters.setHp(context("gm"), characterId, 7)
  assert.deepEqual(resolutionRequests.map(({ source, reason }) => ({ source, reason })), [{
    source: "shapoklyak",
    reason: "entity.set_hp",
  }])
})

test("Larisa stores descriptive position/time through Oracle without creating CE effects", async () => {
  const storage = new MemoryLarisaStorage({
    characterStates: [],
    locations: [{ id: "warehouse", name: "Склад стражи", parent_location_id: null, image_url: null, visibility_mode: "discover", lifecycle_state: "active" }],
    scenes: [],
    sceneParticipants: [],
  })
  const larisa = new LarisaEngine(storage)
  const oracle = oracleWith({ larisa })
  const result = await oracle.world.moveCharacter(context("gm"), characterId, "warehouse", 12, "evening")

  assert.equal(result.value.kind, "world.set_character_position")
  assert.deepEqual(result.effects.resolveCharacterIds, [])
  const state = (await larisa.loadCampaignSnapshot(campaignId)).characterStates[0]
  assert.equal(state?.location_id, "warehouse")
  assert.equal(state?.campaign_day, 12)
  assert.equal(state?.day_period, "evening")
})

test("repository contract makes engine storage and direct communication auditable", () => {
  const contract = fs.readFileSync("docs/ENGINE_CONTRACTS.md", "utf8")
  const migration = fs.readFileSync("supabase/migrations/20260830030000_named_engine_runtime_foundation.sql", "utf8")
  const chatRoom = fs.readFileSync("src/pages/ChatRoom.tsx", "utf8")
  const adapter = fs.readFileSync("src/lib/legacyCharacterEngineAdapter.ts", "utf8")
  const inventoryRuntime = fs.readFileSync("src/inventory-engine/runtime.ts", "utf8")

  assert.match(contract, /CE stores nothing between calls/)
  assert.match(contract, /owning engine calls the resolution\s+requester directly/)
  assert.match(contract, /never the backpack/)
  assert.match(migration, /create or replace function public\.consume_inventory_item_v1/)
  assert.match(migration, /create or replace function public\.send_chat_inventory_roll_v1/)
  assert.match(migration, /create or replace function public\.set_character_hp_v1/)
  assert.match(chatRoom, /chat\.useInventoryItem/)
  assert.match(chatRoom, /inventoryItemIdFromSourceId/)
  assert.match(inventoryRuntime, /subscribeCheburashkaCharacterChanges/)
  assert.match(inventoryRuntime, /characterResolutionBus/)
  assert.doesNotMatch(adapter, /inventoryRegistry/)
  assert.doesNotMatch(adapter, /inventory\?:\s*InventoryItem/)
})
