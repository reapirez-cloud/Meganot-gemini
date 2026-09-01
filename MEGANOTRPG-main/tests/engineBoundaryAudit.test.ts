import assert from "node:assert/strict"
import test from "node:test"

import {
  ENGINE_ARCHITECTURE,
  assertEngineArchitecture,
  createEngineCommandContext,
  validateEngineArchitecture,
} from "../src/engine-contracts/index.ts"
import { GenaEngine } from "../src/game-engine/index.ts"
import { CheburashkaEngine, MemoryCheburashkaStorage } from "../src/inventory-engine/index.ts"
import { TobikEngine } from "../src/roll-engine/index.ts"
import type { InventoryItem } from "../src/types/characterSheet.ts"

const campaignId = "campaign-engine-audit"
const now = "2026-08-30T18:00:00.000Z"

function context(authority: "player" | "gm" | "system", actorCharacterId: string | null) {
  return createEngineCommandContext({
    campaignId,
    requestedBy: authority === "player" ? "player-1" : "gm-1",
    authority,
    actorCharacterId,
    roomId: "room-engine-audit",
    occurredAt: now,
  })
}

function item(id: string, characterId: string, quantity = 2): InventoryItem {
  return {
    id,
    character_id: characterId,
    name: "Audit potion",
    quantity,
    weight: null,
    equipped: false,
    category: "consumable",
    equipment_slot: null,
    image_url: null,
    description: "",
    mechanics: [],
    usage_mode: "quantity",
    charges_current: null,
    charges_max: null,
    item_state: {},
    version: 1,
    sort_order: 0,
    created_at: now,
    updated_at: now,
  }
}

test("named-engine architecture has one auditable storage/control topology", () => {
  assert.deepEqual(validateEngineArchitecture(), [])
  assert.doesNotThrow(() => assertEngineArchitecture())

  assert.equal(ENGINE_ARCHITECTURE.ce.persistence, "none")
  assert.equal(ENGINE_ARCHITECTURE.oracle.persistence, "none")
  assert.equal(ENGINE_ARCHITECTURE.tobik.persistence, "none")
  assert.equal(ENGINE_ARCHITECTURE.gena.persistence, "session")

  assert.equal(ENGINE_ARCHITECTURE.shapoklyak.persistence, "canonical")
  assert.equal(ENGINE_ARCHITECTURE.cheburashka.persistence, "canonical")
  assert.equal(ENGINE_ARCHITECTURE.larisa.persistence, "canonical")
  assert.equal(ENGINE_ARCHITECTURE.chasovoy.persistence, "canonical")

  assert.deepEqual(ENGINE_ARCHITECTURE.oracle.commands, [
    "shapoklyak",
    "cheburashka",
    "larisa",
    "chasovoy",
  ])
  assert.equal((ENGINE_ARCHITECTURE.oracle.commands as readonly string[]).includes("gena"), false)
  assert.deepEqual(ENGINE_ARCHITECTURE.ce.commands, [])
  assert.deepEqual(ENGINE_ARCHITECTURE.ce.publishes, [])
})

test("GENA rejects GM authority before any gameplay owner mutation", async () => {
  const potion = item("potion-1", "hero-1")
  const cheburashka = new CheburashkaEngine(new MemoryCheburashkaStorage([potion]))
  const gena = new GenaEngine({ cheburashka, tobik: new TobikEngine() })

  await assert.rejects(
    () => gena.execute({
      kind: "inventory.use",
      context: context("gm", "hero-1"),
      characterId: "hero-1",
      itemId: potion.id,
      amount: 1,
      label: "GM tried gameplay path",
    }),
    /GM imperative commands must use Oracle instead of GENA/,
  )

  assert.equal((await cheburashka.getItem(potion.id))?.quantity, 2)
})

test("player inventory commands cannot mutate another actor character inventory", async () => {
  const foreignPotion = item("potion-foreign", "hero-2")
  const cheburashka = new CheburashkaEngine(new MemoryCheburashkaStorage([foreignPotion]))

  await assert.rejects(
    () => cheburashka.execute({
      kind: "inventory.consume",
      context: context("player", "hero-1"),
      characterId: "hero-2",
      itemId: foreignPotion.id,
      amount: 1,
    }),
    /active actor character/,
  )

  await assert.rejects(
    () => cheburashka.execute({
      kind: "inventory.transfer",
      context: context("player", "hero-1"),
      fromCharacterId: "hero-2",
      toCharacterId: "hero-1",
      itemId: foreignPotion.id,
      amount: 1,
    }),
    /active actor character/,
  )

  assert.equal((await cheburashka.getItem(foreignPotion.id))?.quantity, 2)
  assert.equal((await cheburashka.getItem(foreignPotion.id))?.character_id, "hero-2")
})
