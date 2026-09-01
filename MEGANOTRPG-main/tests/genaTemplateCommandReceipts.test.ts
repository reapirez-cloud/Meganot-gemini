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
      return { data: 42, error: null }
    },
  } as unknown as SupabaseClient
}

function recorder(requests: CharacterResolutionRequest[]): CharacterResolutionRequester {
  return {
    requestCharacterResolution(request) {
      requests.push(request)
    },
  }
}

test("GENA template action, roll and spell carry the same command id into receipt RPC and runtime invalidation", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  const resolutions: CharacterResolutionRequest[] = []
  const gateway = new SupabaseGenaSessionGateway(fakeClient(calls), recorder(resolutions))

  await gateway.sendTemplateAction({
    roomId: "room-1",
    characterId: "hero-1",
    mechanicId: "fighter.action-surge",
    label: "Всплеск действий",
    commandId: "11111111-1111-4111-8111-111111111111",
  })
  await gateway.sendTemplateRoll({
    roomId: "room-1",
    characterId: "hero-1",
    mechanicId: "fighter.second-wind",
    label: "Второе дыхание",
    kind: "healing",
    diceCount: 1,
    diceSides: 10,
    commandId: "22222222-2222-4222-8222-222222222222",
  })
  await gateway.sendTemplateSpell({
    roomId: "room-1",
    characterId: "hero-1",
    mechanicId: "cleric.channel-divinity",
    methodKey: "divine-spark",
    label: "Божественная искра",
    commandId: "33333333-3333-4333-8333-333333333333",
  })

  assert.deepEqual(calls.map((entry) => entry.name), [
    "send_chat_template_action_v2",
    "send_chat_template_roll_v2",
    "send_chat_template_spell_v2",
  ])
  assert.deepEqual(calls.map((entry) => entry.args.p_command_id), [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333",
  ])
  assert.deepEqual(resolutions.map((entry) => ({ reason: entry.reason, commandId: entry.commandId })), [
    { reason: "template.action", commandId: "11111111-1111-4111-8111-111111111111" },
    { reason: "template.roll", commandId: "22222222-2222-4222-8222-222222222222" },
    { reason: "template.spell", commandId: "33333333-3333-4333-8333-333333333333" },
  ])
})

test("template gameplay receipt migration locks retries and fingerprints the complete command", () => {
  const migration = fs.readFileSync("supabase/migrations/20260830155543_gena_template_command_receipts.sql", "utf8")

  assert.match(migration, /send_chat_template_action_v2/)
  assert.match(migration, /send_chat_template_roll_v2/)
  assert.match(migration, /send_chat_template_spell_v2/)
  assert.equal((migration.match(/pg_advisory_xact_lock/g) || []).length, 3)
  assert.equal((migration.match(/engine_command_receipts/g) || []).length >= 6, true)
  assert.equal((migration.match(/'fingerprint'/g) || []).length >= 6, true)
  assert.match(migration, /use_character_template_resource_action/)
  assert.match(migration, /use_character_template_spell_v1/)
  assert.match(migration, /send_chat_roll_v3/)
  assert.match(migration, /grant execute on function public\.send_chat_template_action_v2/)
  assert.match(migration, /grant execute on function public\.send_chat_template_roll_v2/)
  assert.match(migration, /grant execute on function public\.send_chat_template_spell_v2/)
})

test("authenticated clients cannot bypass receipt-aware GENA template RPCs", () => {
  const migration = fs.readFileSync("supabase/migrations/20260830160402_harden_gena_template_runtime.sql", "utf8")

  assert.match(migration, /revoke execute on function public\.use_character_template_resource_action\(uuid,text,text\) from authenticated/)
  assert.match(migration, /revoke execute on function public\.use_character_template_spell_v1\(uuid,text,text,text\) from authenticated/)
  assert.match(migration, /revoke execute on function public\.send_chat_template_action_v1\(uuid,uuid,text,text,text,jsonb\) from authenticated/)
  assert.match(migration, /revoke execute on function public\.send_chat_template_roll_v1\(uuid,uuid,text,text,text,text,integer,boolean,integer,integer,integer\) from authenticated/)
  assert.match(migration, /revoke execute on function public\.send_chat_template_spell_v1\(uuid,uuid,text,text,text,text,jsonb\) from authenticated/)

  assert.match(migration, /grant execute on function public\.send_chat_template_action_v2\(uuid,uuid,text,text,text,jsonb,uuid\) to authenticated/)
  assert.match(migration, /grant execute on function public\.send_chat_template_roll_v2\(uuid,uuid,text,text,text,text,integer,boolean,integer,integer,integer,uuid\) to authenticated/)
  assert.match(migration, /grant execute on function public\.send_chat_template_spell_v2\(uuid,uuid,text,text,text,text,jsonb,uuid\) to authenticated/)

  assert.match(migration, /engine_command_receipts_created_by_idx/)
  assert.match(migration, /private\.can_view_location\(location_id, \(select auth\.uid\(\)\)\)/)
  assert.match(migration, /private\.can_view_character\(npc_character_id, \(select auth\.uid\(\)\)\)/)
})
