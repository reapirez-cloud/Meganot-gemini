import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const chatRoom = fs.readFileSync("src/pages/ChatRoom.tsx", "utf8")
const preparationCard = fs.readFileSync("src/components/chat/ChatPreparationCard.tsx", "utf8")
const preparationHook = fs.readFileSync("src/hooks/useChatPreparation.ts", "utf8")
const runtimeSource = fs.readFileSync("src/engine-runtime/supabaseCharacterRuntimeSource.ts", "utf8")
const genaPreparationSql = fs.readFileSync("supabase/migrations/20260830185520_guard_gena_v2_daily_preparation.sql", "utf8")

test("CE runtime reads the server-authoritative post-rest state instead of inventing preparation locally", () => {
  assert.match(runtimeSource, /from\("character_preparation_sessions"\)/)
  assert.match(runtimeSource, /from\("character_preparation_records"\)/)
  assert.match(runtimeSource, /preparationSession: preparationResult\.data/)
  assert.match(runtimeSource, /preparationRecords: \(preparationRecordsResult\.data \|\| \[\]\)/)
})

test("personal chat mounts long-rest preparation for its room character instead of the current speaker", () => {
  assert.match(chatRoom, /if \(roomType === "character"\) return roomCharacter/)
  assert.match(chatRoom, /return actors\.selected\?\.character \|\| null/)
  assert.match(chatRoom, /useChatPreparation\(preparationCharacter\)/)
  assert.match(chatRoom, /<ChatPreparationCard/)
  assert.match(chatRoom, /characterId=\{preparationCharacter\.id\}/)
  assert.match(chatRoom, /model=\{preparation\.model\}/)
  assert.match(chatRoom, /spells=\{preparation\.spells\}/)
  assert.match(chatRoom, /preparationRuntime\.refresh\(\)/)
  assert.match(chatRoom, /resolved\.refresh\(\)/)
  assert.match(chatRoom, /preparationGeneration/)
})

test("chat preparation stays realtime and closes only through the server-authored session", () => {
  assert.match(preparationHook, /table: "character_preparation_sessions"/)
  assert.match(preparationHook, /table: "character_preparation_records"/)
  assert.match(preparationHook, /table: "character_spells"/)
  assert.match(preparationCard, /model\.session\?\.is_open/)
  assert.match(preparationCard, /Первый отправленный текст закроет это окно/)
  assert.match(preparationCard, /Броски, способности и заклинания окно не закрывают/)
})

test("GENA v2 preserves receipt replay and gates new daily class or subclass actions before spending resources", () => {
  for (const functionName of ["send_chat_template_action_v2", "send_chat_template_roll_v2"]) {
    const start = genaPreparationSql.indexOf(`function public.${functionName}`)
    assert.ok(start >= 0, `${functionName} must be authored in the migration`)
    const nextFunction = genaPreparationSql.indexOf("create or replace function public.", start + 1)
    const body = genaPreparationSql.slice(start, nextFunction >= 0 ? nextFunction : undefined)
    assert.match(body, /engine_command_receipts/)
    assert.match(body, /if found then/)
    assert.match(body, /assert_character_template_preparation_action/)
    assert.match(body, /use_character_template_resource_action/)
    assert.ok(
      body.indexOf("assert_character_template_preparation_action") < body.indexOf("use_character_template_resource_action"),
      `${functionName} must gate the selected daily mode before resource spending`,
    )
  }
})
