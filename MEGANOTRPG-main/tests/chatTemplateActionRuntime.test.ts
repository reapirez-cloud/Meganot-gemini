import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const sql = fs.readFileSync("supabase/migrations/20260830013000_class_chat_template_action_runtime.sql", "utf8")
const receiptSql = fs.readFileSync("supabase/migrations/20260830155543_gena_template_command_receipts.sql", "utf8")
const chatHook = fs.readFileSync("src/hooks/useChatMessages.ts", "utf8")
const genaGateway = fs.readFileSync("src/game-engine/supabase.ts", "utf8")
const chatRoom = fs.readFileSync("src/pages/ChatRoom.tsx", "utf8")

function indexOfOrFail(value: string) {
  const index = sql.indexOf(value)
  assert.ok(index >= 0, `missing ${value}`)
  return index
}

test("class chat action executes the server template mechanic before posting the event", () => {
  const actionStart = indexOfOrFail("create or replace function public.send_chat_template_action_v1")
  const rollStart = indexOfOrFail("create or replace function public.send_chat_template_roll_v1")
  const actionBody = sql.slice(actionStart, rollStart)
  assert.ok(actionBody.indexOf("public.use_character_template_resource_action") < actionBody.indexOf("public.send_chat_event_v3"))
  assert.match(actionBody, /'templateMechanicId',trim\(p_mechanic_id\)/)
  assert.match(actionBody, /public\.send_chat_event_v3\([\s\S]*?'\[\]'::jsonb[\s\S]*?\)/)
})

test("class chat roll executes the same server template mechanic before rolling", () => {
  const rollStart = indexOfOrFail("create or replace function public.send_chat_template_roll_v1")
  const rollBody = sql.slice(rollStart)
  assert.ok(rollBody.indexOf("public.use_character_template_resource_action") < rollBody.indexOf("public.send_chat_roll_v3"))
  assert.match(rollBody, /public\.send_chat_roll_v3\([\s\S]*?'\[\]'::jsonb[\s\S]*?\)/)
})

test("class chat wrapper delegates spending exactly once", () => {
  const occurrences = [...sql.matchAll(/private\.consume_character_resource_costs/g)]
  assert.equal(occurrences.length, 0, "wrapper must not duplicate the canonical template action spender")
  assert.match(sql, /same PostgreSQL transaction/i)
})

test("Gena gateway owns receipt-aware authoritative template RPCs and the chat hook delegates", () => {
  assert.match(genaGateway, /send_chat_template_action_v2/)
  assert.match(genaGateway, /send_chat_template_roll_v2/)
  assert.doesNotMatch(genaGateway, /send_chat_template_action_v1/)
  assert.doesNotMatch(genaGateway, /send_chat_template_roll_v1/)
  assert.match(genaGateway, /p_command_id:\s*commandId/)
  assert.match(genaGateway, /p_mechanic_id:\s*command\.mechanicId/)
  assert.match(genaGateway, /p_option_key:\s*command\.optionKey \?\? null/)
  assert.match(receiptSql, /send_chat_template_action_v2/)
  assert.match(receiptSql, /send_chat_template_roll_v2/)
  assert.match(receiptSql, /engine_command_receipts/)
  assert.match(chatHook, /genaSession\.sendTemplateAction/)
  assert.match(chatHook, /genaSession\.sendTemplateRoll/)
})

test("ChatRoom routes CE template actions through template RPCs instead of client resource costs", () => {
  assert.match(chatRoom, /templateMechanicIdForChatAction\(action\)/)
  assert.match(chatRoom, /chat\.sendTemplateRoll/)
  assert.match(chatRoom, /chat\.sendTemplateAction/)
  const templateBranch = chatRoom.slice(chatRoom.indexOf("if (mechanicId)"), chatRoom.indexOf("const contract = resolved.contract"))
  assert.doesNotMatch(templateBranch, /resourceCostInputs/)
})
