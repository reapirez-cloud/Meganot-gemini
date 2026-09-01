import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const migration = readFileSync("supabase/migrations/20260827130000_restore_chat_visibility_and_events.sql", "utf8")
const actionSheet = readFileSync("src/components/chat/ChatActionSheet.tsx", "utf8")
const chatRoom = readFileSync("src/pages/ChatRoom.tsx", "utf8")
const contextSheet = readFileSync("src/components/chat/ChatContextSheet.tsx", "utf8")

test("structured rolls and attachment-only messages may have an empty text body", () => {
  assert.match(migration, /attachment_url\s+is\s+not\s+null\s+or\s+event_kind\s+is\s+not\s+null/i)
  assert.match(migration, /event_kind\s+is\s+null\s+or\s+event_payload\s+is\s+not\s+null/i)
})

test("character and scene rooms are readable by campaign members unless the GM hides them", () => {
  assert.match(migration, /room_type\s+in\s*\(\s*'scene'\s*,\s*'character'\s*\)/i)
  assert.match(migration, /r\.open_to_campaign\s*=\s*true/i)
  assert.match(migration, /private\.can_view_character\(r\.character_id,\s*p_user_id\)/i)
  assert.match(migration, /alter\s+column\s+open_to_campaign\s+set\s+default\s+true/i)
  assert.match(migration, /'character'[\s\S]*v_character\.id,[\s\S]*true,[\s\S]*false/i)
})

test("free dice use the v3 chat hook instead of bypassing runtime resources and errors", () => {
  assert.doesNotMatch(actionSheet, /send_chat_roll_v2/i)
  assert.match(actionSheet, /await\s+onFreeRoll\(/)
  assert.match(chatRoom, /onFreeRoll=\{freeRoll\}/)
  assert.match(chatRoom, /chat\.sendRoll\(\{[\s\S]*rollD20:\s*false[\s\S]*diceSides:/)
})

test("GM chat access controls expose both public and hidden states", () => {
  assert.match(contextSheet, /setAccess\(true,\s*false\)[\s\S]*Читать всем/)
  assert.match(contextSheet, /setAccess\(false,\s*false\)[\s\S]*Скрыть от игроков/)
})
