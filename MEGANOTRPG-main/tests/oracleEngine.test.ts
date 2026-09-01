import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  EMPTY_ENGINE_EFFECTS,
  createEngineCommandContext,
} from "../src/engine-contracts/index.ts"
import { OracleEngine, type OracleDependencies } from "../src/oracle-engine/index.ts"

const campaignId = "campaign-oracle"
const now = "2026-08-30T20:00:00.000Z"

function context(authority: "player" | "gm" | "system" = "gm", commandId = crypto.randomUUID()) {
  return createEngineCommandContext({
    commandId,
    campaignId,
    requestedBy: authority === "player" ? "player-1" : "gm-1",
    authority,
    occurredAt: now,
  })
}

function recordingOracle() {
  const calls: Array<{ owner: string; command: Record<string, unknown> }> = []
  const owner = (name: string) => ({
    execute: async (command: Record<string, unknown>) => {
      calls.push({ owner: name, command })
      return {
        value: { kind: command.kind },
        events: [],
        effects: EMPTY_ENGINE_EFFECTS,
      }
    },
  })

  const dependencies = {
    shapoklyak: owner("shapoklyak"),
    cheburashka: owner("cheburashka"),
    larisa: owner("larisa"),
    chasovoy: owner("chasovoy"),
  } as unknown as OracleDependencies

  return { oracle: new OracleEngine(dependencies), calls }
}

test("Oracle turns GM declarations into direct owner commands without Gena", async () => {
  const { oracle, calls } = recordingOracle()
  const gm = context("gm", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")

  await oracle.inventory.consume(gm, "hero-1", "grenade-1", 4)
  await oracle.characters.setHp(gm, "hero-1", 3, { maxHp: 40 })
  await oracle.world.moveCharacter(gm, "hero-1", "hole-1", 7, "night")
  await oracle.definitions.create(gm, {
    kind: "item",
    scope: "campaign",
    slug: "sticky-mine",
    name: "Мина-липучка",
  })

  assert.deepEqual(calls.map(({ owner, command }) => ({ owner, kind: command.kind })), [
    { owner: "cheburashka", kind: "inventory.consume" },
    { owner: "shapoklyak", kind: "entity.set_hp" },
    { owner: "larisa", kind: "world.set_character_position" },
    { owner: "chasovoy", kind: "definition.create" },
  ])
  assert.equal(calls.every(({ command }) => command.context === gm), true)
})

test("Oracle rejects non-GM authority before touching a domain owner", () => {
  const { oracle, calls } = recordingOracle()

  assert.throws(
    () => oracle.characters.setHp(context("player"), "hero-1", 1),
    /Oracle only accepts GM or system authority/,
  )
  assert.deepEqual(calls, [])
})

test("Oracle source contract cannot depend on Gena or game-engine", () => {
  const source = fs.readFileSync("src/oracle-engine/engine.ts", "utf8")
  const contract = fs.readFileSync("docs/ORACLE_ENGINE_CONTRACT.md", "utf8")

  assert.doesNotMatch(source, /game-engine/)
  assert.doesNotMatch(source, /GenaEngine/)
  assert.match(contract, /Oracle must never depend on Gena/)
  assert.match(contract, /GM declares the new reality/)
  assert.match(contract, /Oracle stores nothing/)
})
