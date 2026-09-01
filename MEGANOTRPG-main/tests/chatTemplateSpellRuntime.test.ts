import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const sql = fs.readFileSync("supabase/migrations/20260830020000_class_chat_template_spell_runtime.sql", "utf8")
const receiptSql = fs.readFileSync("supabase/migrations/20260830155543_gena_template_command_receipts.sql", "utf8")
const chatHook = fs.readFileSync("src/hooks/useChatMessages.ts", "utf8")
const genaGateway = fs.readFileSync("src/game-engine/supabase.ts", "utf8")
const chatRoom = fs.readFileSync("src/pages/ChatRoom.tsx", "utf8")

function before(value: string, left: string, right: string) {
  const leftIndex = value.indexOf(left)
  const rightIndex = value.indexOf(right)
  assert.ok(leftIndex >= 0, `missing ${left}`)
  assert.ok(rightIndex >= 0, `missing ${right}`)
  assert.ok(leftIndex < rightIndex, `${left} must run before ${right}`)
}

test("template spell runtime revalidates assignment level choices and suppression", () => {
  assert.match(sql, /t\.kind in \('class','subclass'\)/)
  assert.match(sql, /when t\.kind='subclass' then greatest\(1,coalesce\(parent\.template_level,1\)\)/)
  assert.match(sql, /option_mechanics_by_level/)
  assert.match(sql, /g\.level_key::integer<=o\.effective_level/)
  assert.match(sql, /character_source_suppressions/)
  assert.match(sql, /coalesce\(v_mechanic->>'type',''\)<>'spell'/)
})

test("template spell runtime spends only the selected authored method option", () => {
  assert.match(sql, /value->>'key'=trim\(p_method_key\)/)
  assert.match(sql, /value->>'key'=coalesce\(p_option_key,''\)/)
  assert.match(sql, /private\.consume_character_resource_costs\(p_character_id,v_costs,auth\.uid\(\)\)/)
})

test("template spell chat wrapper validates and spends before posting", () => {
  const wrapper = sql.slice(sql.indexOf("create or replace function public.send_chat_template_spell_v1"))
  before(wrapper, "public.use_character_template_spell_v1", "public.send_chat_event_v3")
  assert.match(wrapper, /'templateMechanicId',trim\(p_mechanic_id\)/)
  assert.match(wrapper, /'templateMethodKey',trim\(p_method_key\)/)
  assert.match(wrapper, /'\[\]'::jsonb/)
})

test("Gena gateway and ChatRoom use receipt-aware authoritative class spell RPC", () => {
  assert.match(genaGateway, /send_chat_template_spell_v2/)
  assert.doesNotMatch(genaGateway, /send_chat_template_spell_v1/)
  assert.match(genaGateway, /p_command_id:\s*commandId/)
  assert.match(genaGateway, /p_method_key:\s*command\.methodKey/)
  assert.match(receiptSql, /send_chat_template_spell_v2/)
  assert.match(receiptSql, /engine_command_receipts/)
  assert.match(chatHook, /genaSession\.sendTemplateSpell/)
  assert.match(chatRoom, /templateMechanicIdForSpellAccess\(access\)/)
  assert.match(chatRoom, /chat\.sendTemplateSpell/)
})
