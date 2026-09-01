import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const permissionMigrationPath = new URL(
  "../supabase/migrations/20260826090000_spell_change_window_and_character_editor_permissions.sql",
  import.meta.url,
)
const artRlsMigrationPath = new URL(
  "../supabase/migrations/20260826090100_fix_art_insert_returning_rls.sql",
  import.meta.url,
)

test("spell changes require the GM long-rest window for assigned players", async () => {
  const sql = await readFile(permissionMigrationPath, "utf8")

  assert.match(sql, /spell_change_unlocked boolean not null default false/)
  assert.match(sql, /private\.can_manage_character\(p_character_id, p_user_id\)/)
  assert.match(sql, /cs\.spellcasting_enabled = true/)
  assert.match(sql, /cs\.spell_change_unlocked = true/)
  assert.match(sql, /set_character_spell_change_access/)
  assert.match(sql, /Spell changes are locked\. GM must grant access after a long rest/)
})

test("full character and sheet editors are manager-only", async () => {
  const sql = await readFile(permissionMigrationPath, "utf8")

  assert.match(
    sql,
    /update_campaign_character[\s\S]*if not private\.can_manage_character\(p_character_id, auth\.uid\(\)\) then[\s\S]*Only GM or owner can edit the character/,
  )
  assert.match(
    sql,
    /update_character_narrative[\s\S]*if not private\.can_manage_character\(p_character_id, auth\.uid\(\)\) then[\s\S]*Only GM or owner can edit the character sheet/,
  )
  assert.match(
    sql,
    /set_my_character_avatar[\s\S]*if not private\.can_manage_character\(p_character_id, auth\.uid\(\)\) then/,
  )
})

test("players can attach art only to their own assigned character", async () => {
  const sql = await readFile(permissionMigrationPath, "utf8")

  assert.match(sql, /character_id is null[\s\S]*private\.can_manage_campaign\(campaign_id\)/)
  assert.match(sql, /private\.is_assigned_character\(character_id\)/)
  assert.match(sql, /private\.can_manage_character\(character_id\)/)
})

test("art read RLS is row-local so insert returning can read a fresh row", async () => {
  const sql = await readFile(artRlsMigrationPath, "utf8")

  assert.match(sql, /private\.is_campaign_member\(campaign_id\)/)
  assert.match(sql, /private\.can_view_character\(character_id\)/)
  assert.doesNotMatch(sql, /can_view_art_item/)
})
