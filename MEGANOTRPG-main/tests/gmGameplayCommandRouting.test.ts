import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { CharacterResolutionRequest, CharacterResolutionRequester } from "../src/engine-contracts/index.ts"
import { SupabaseGenaSessionGateway } from "../src/game-engine/supabase.ts"

function fakeClient(calls: Array<{ name: string; args: Record<string, unknown> }>): SupabaseClient {
  return {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args })
      return { data: null, error: null }
    },
  } as unknown as SupabaseClient
}

function resolutionRecorder(requests: CharacterResolutionRequest[]): CharacterResolutionRequester {
  return {
    requestCharacterResolution(request) {
      requests.push(request)
    },
  }
}

test("Gena owns normal-play short rest, long rest and dawn recovery then invalidates CE read model", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  const resolutions: CharacterResolutionRequest[] = []
  const gateway = new SupabaseGenaSessionGateway(fakeClient(calls), resolutionRecorder(resolutions))

  await gateway.recoverCharacter({ characterId: "hero-1", trigger: "short_rest", commandId: "rest-short" })
  await gateway.recoverCharacter({ characterId: "hero-1", trigger: "long_rest", commandId: "rest-long" })
  await gateway.recoverCharacter({ characterId: "hero-1", trigger: "dawn", commandId: "rest-dawn" })

  assert.deepEqual(calls.map((entry) => entry.name), [
    "grant_character_short_rest",
    "grant_character_long_rest",
    "recover_character_resources",
  ])
  assert.deepEqual(calls[2]?.args, { p_character_id: "hero-1", p_trigger: "dawn" })
  assert.deepEqual(resolutions.map((entry) => ({
    source: entry.source,
    reason: entry.reason,
    commandId: entry.commandId,
  })), [
    { source: "gena", reason: "character.recovery.short_rest", commandId: "rest-short" },
    { source: "gena", reason: "character.recovery.long_rest", commandId: "rest-long" },
    { source: "gena", reason: "character.recovery.dawn", commandId: "rest-dawn" },
  ])
})

test("GM character frame routes imperative character changes and recovery through Oracle", () => {
  const frame = fs.readFileSync("src/components/characters/CharacterGameFrame.tsx", "utf8")

  assert.match(frame, /oracle\.characters\.setLifeState/)
  assert.match(frame, /oracle\.characters\.recover/)
  assert.match(frame, /createEngineCommandContext\(\{/)
  assert.match(frame, /authority: "gm"/)

  assert.doesNotMatch(frame, /genaSession/)
  assert.doesNotMatch(frame, /supabase\.rpc\("set_character_life_state"/)
  assert.doesNotMatch(frame, /supabase\.rpc\("grant_character_short_rest"/)
  assert.doesNotMatch(frame, /supabase\.rpc\("grant_character_long_rest"/)
  assert.doesNotMatch(frame, /supabase\.rpc\("recover_character_resources"/)
})

test("production Gena gateway shares the character resolution bus", () => {
  const runtime = fs.readFileSync("src/game-engine/runtime.ts", "utf8")
  assert.match(runtime, /new SupabaseGenaSessionGateway\(supabase, characterResolutionBus\)/)
})