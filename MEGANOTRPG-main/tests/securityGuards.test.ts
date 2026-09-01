import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const permissionMigrationPath = new URL(
  "../supabase/migrations/20260825104504_private_gm_content_and_character_assignment.sql",
  import.meta.url,
)
const auditMigrationPath = new URL(
  "../supabase/migrations/20260825131836_audit_hardening.sql",
  import.meta.url,
)
const telegramAuthPath = new URL("../api/telegram-auth.mjs", import.meta.url)

async function permissionSql() {
  return readFile(permissionMigrationPath, "utf8")
}

test("players only see campaign PCs while they are active", async () => {
  const sql = await permissionSql()
  assert.match(
    sql,
    /c\.character_type = 'pc'[\s\S]*active_member\.active_character_id = c\.id/,
  )
})

test("private characters stay creator-only even between managers", async () => {
  const sql = await permissionSql()
  assert.match(sql, /c\.visibility = 'private'[\s\S]*c\.created_by = p_user_id/)
  assert.match(
    sql,
    /c\.visibility <> 'private'[\s\S]*private\.can_manage_campaign/,
  )
})

test("character creation remains a GM or owner operation", async () => {
  const sql = await permissionSql()
  assert.match(
    sql,
    /if not private\.can_manage_campaign\(p_campaign_id, auth\.uid\(\)\) then[\s\S]*Only GM or owner can create characters/,
  )
})

test("non-managers cannot change assignment, level, type, or visibility", async () => {
  const sql = await permissionSql()
  const playerBranch = sql.match(
    /if not v_can_manage_character then([\s\S]*?)return;\s*end if;/,
  )?.[1]

  assert.ok(playerBranch, "player update branch must exist")
  assert.match(playerBranch, /set name = trim\(p_name\)/)
  assert.match(playerBranch, /bio = trim/)
  assert.match(playerBranch, /avatar_url =/)
  assert.doesNotMatch(playerBranch, /assigned_user_id\s*=/)
  assert.doesNotMatch(playerBranch, /level\s*=/)
  assert.doesNotMatch(playerBranch, /character_type\s*=/)
  assert.doesNotMatch(playerBranch, /visibility\s*=/)
})

test("GM workspaces are isolated to the workspace owner", async () => {
  const sql = await permissionSql()
  assert.match(
    sql,
    /actor\.user_id = p_user_id[\s\S]*actor\.user_id = p_workspace_user_id/,
  )
  assert.match(sql, /v_parts\[3\] = 'gm-private'/)
  assert.match(sql, /v_owner_id = auth\.uid\(\)/)
})

test("game room position allocation is serialized in the database", async () => {
  const sql = await readFile(auditMigrationPath, "utf8")
  assert.match(sql, /pg_advisory_xact_lock/)
  assert.match(sql, /coalesce\(max\(r\.position\), 0\) \+ 10/)
  assert.match(sql, /private\.can_manage_campaign\(p_campaign_id, auth\.uid\(\)\)/)
})

test("Telegram authentication has a short replay window and no project fallback", async () => {
  const source = await readFile(telegramAuthPath, "utf8")
  assert.match(source, /MAX_INIT_DATA_AGE_SECONDS = 10 \* 60/)
  assert.doesNotMatch(source, /FALLBACK_SUPABASE_URL/)
  assert.match(source, /timingSafeEqual/)
  assert.match(source, /RATE_LIMIT = 30/)
})
