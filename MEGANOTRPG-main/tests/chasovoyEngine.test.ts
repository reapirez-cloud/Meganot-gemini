import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { createEngineCommandContext } from "../src/engine-contracts/index.ts"
import { MemoryEngineEventPublisher } from "../src/game-engine/index.ts"
import { ChasovoyEngine, MemoryChasovoyStorage } from "../src/reference-engine/index.ts"

const campaignId = "campaign-1"
const now = "2026-08-30T12:00:00.000Z"

function context(authority: "player" | "gm" | "system" = "gm", targetCampaign = campaignId) {
  return createEngineCommandContext({ campaignId: targetCampaign, requestedBy: authority === "player" ? "player-1" : "gm-1", authority, occurredAt: now })
}

test("Chasovoy owns one canonical definition while runtime instance state stays elsewhere", async () => {
  const publisher = new MemoryEngineEventPublisher()
  const chasovoy = new ChasovoyEngine(new MemoryChasovoyStorage(), { eventPublisher: publisher })
  const created = await chasovoy.execute({
    kind: "definition.create",
    context: context(),
    input: {
      kind: "item",
      scope: "campaign",
      slug: "ash-blade",
      name: "Клинок Пепла",
      summary: "Редкий клинок.",
      mechanics: [{ type: "numeric", target: "combat.attack", operation: "ADD", value: 1 }],
      data: { usageMode: "charges", chargesMax: 3 },
    },
  })

  assert.equal(created.value.after.kind, "item")
  assert.equal(created.value.after.revision, 1)
  assert.deepEqual(created.effects.resolveCharacterIds, [])
  assert.equal(publisher.events[0]?.engine, "chasovoy")
  assert.equal(publisher.events[0]?.aggregateType, "definition")

  const serialized = JSON.stringify(created.value.after)
  assert.doesNotMatch(serialized, /character_id|characterId|charges_current|equipped|quantity|prepared/)
})

test("duplicate canonical slug is rejected in the same scope", async () => {
  const chasovoy = new ChasovoyEngine(new MemoryChasovoyStorage())
  const command = {
    kind: "definition.create" as const,
    context: context(),
    input: { kind: "spell" as const, scope: "campaign" as const, slug: "fireball", name: "Огненный шар" },
  }
  await chasovoy.execute(command)
  await assert.rejects(() => chasovoy.execute({ ...command, context: context() }), /already exists/)

  const otherCampaign = new ChasovoyEngine(new MemoryChasovoyStorage())
  const created = await otherCampaign.execute({ ...command, context: context("gm", "campaign-2") })
  assert.equal(created.value.after.campaignId, "campaign-2")
})

test("revision keeps identity and historical revision remains addressable", async () => {
  const chasovoy = new ChasovoyEngine(new MemoryChasovoyStorage())
  const created = await chasovoy.execute({
    kind: "definition.create",
    context: context(),
    input: { kind: "feature", scope: "campaign", slug: "second-wind", name: "Второе дыхание", summary: "v1" },
  })
  const id = created.value.after.id
  const revised = await chasovoy.execute({
    kind: "definition.revise",
    context: context(),
    definitionId: id,
    input: { name: "Второе дыхание", summary: "v2" },
  })
  assert.equal(revised.value.after.id, id)
  assert.equal(revised.value.after.revision, 2)
  assert.equal((await chasovoy.getDefinition({ id, revision: 1 }))?.summary, "v1")
  assert.equal((await chasovoy.getDefinition({ id }))?.summary, "v2")
})

test("players cannot author definitions and campaign GMs cannot mutate system definitions", async () => {
  const storage = new MemoryChasovoyStorage()
  const chasovoy = new ChasovoyEngine(storage)
  await assert.rejects(() => chasovoy.execute({
    kind: "definition.create",
    context: context("player"),
    input: { kind: "item", scope: "campaign", slug: "rope", name: "Верёвка" },
  }), /GM or system authority/)

  const systemCreated = await chasovoy.execute({
    kind: "definition.create",
    context: context("system"),
    input: { kind: "spell", scope: "system", slug: "fireball", name: "Fireball" },
  })
  await assert.rejects(() => chasovoy.execute({
    kind: "definition.archive",
    context: context("gm"),
    definitionId: systemCreated.value.after.id,
  }), /system authority/)
})

test("repository contract assigns reusable item definitions to Chasovoy, not Cheburashka", () => {
  const contract = fs.readFileSync("docs/ENGINE_CONTRACTS.md", "utf8")
  const chasovoy = fs.readFileSync("docs/CHASOVOY_ENGINE_CONTRACT.md", "utf8")
  const migration = fs.readFileSync("supabase/migrations/20260830040000_chasovoy_reference_engine_foundation.sql", "utf8")
  assert.match(contract, /CHASOVOY[\s\S]*reusable canonical definitions/)
  assert.match(contract, /CHEBURASHKA[\s\S]*item instances/)
  assert.match(chasovoy, /never “what does Vasya currently have\?”/)
  assert.match(migration, /reference_definitions_campaign_slug_unique/)
  assert.match(migration, /definition_id uuid references public\.reference_definitions/)
})
