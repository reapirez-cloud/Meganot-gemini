import assert from "node:assert/strict"
import { readdir } from "node:fs/promises"
import test from "node:test"

const migrationsDir = new URL("../supabase/migrations/", import.meta.url)

// These versions are the immutable history already applied in production.
// New migrations are expected and are allowed, but the production baseline
// must never be deleted, renamed, or replaced with another timestamp.
const productionBaseline = [
  "20260824083149_create_app_test.sql",
  "20260824143843_create_realtime_chat_vertical_slice.sql",
  "20260824151018_auth_profiles_and_campaign_membership.sql",
  "20260824151048_lock_down_trigger_functions.sql",
  "20260824152307_characters_active_identity.sql",
  "20260824152340_backfill_message_characters.sql",
  "20260824152631_tighten_character_updates.sql",
  "20260824153903_add_world_hub_content.sql",
  "20260824160135_world_hierarchy_and_gm_character_assignment.sql",
  "20260824162637_campaign_owner_permissions_and_editing.sql",
  "20260824164425_character_sheet_inventory_spells_diary.sql",
  "20260824170232_character_inventory_categories_equipment_and_spell_toggle.sql",
  "20260824171039_fix_profile_join_after_character_assignment_model.sql",
  "20260824180110_telegram_roles_and_role_chat_identity.sql",
  "20260824182446_restore_authenticated_character_assignment_updates.sql",
  "20260824183108_add_campaign_media_storage_and_gallery.sql",
  "20260824183516_allow_common_jpg_mime_in_campaign_media.sql",
  "20260824185006_chat_rooms_permissions_dice_spells_rest.sql",
  "20260824185109_normalize_spell_cast_defaults.sql",
  "20260824192124_tighten_player_permissions_and_manager_deletes.sql",
  "20260824192337_validate_player_equipment_slots.sql",
  "20260825000215_active_character_social_visibility.sql",
  "20260825001159_chat_message_edit_delete_actions.sql",
  "20260825072526_access_storage_stabilization.sql",
  "20260825072537_social_feed.sql",
  "20260825072546_chat_experience.sql",
  "20260825072557_privilege_hardening.sql",
  "20260825072600_campaign_media_paths.sql",
  "20260825072843_performance_policy_cleanup.sql",
  "20260825073542_make_campaign_media_private.sql",
  "20260825090028_roles_gm_workspace_gallery.sql",
  "20260825104504_private_gm_content_and_character_assignment.sql",
  "20260825131836_audit_hardening.sql",
  "20260825143246_spell_catalog.sql",
].sort()

async function repositoryMigrations() {
  return (await readdir(migrationsDir))
    .filter((name) => name.endsWith(".sql"))
    .sort()
}

function migrationVersion(name: string) {
  const match = name.match(/^(\d{14})_[a-z0-9_]+\.sql$/)
  assert.ok(match, `Invalid migration filename: ${name}`)
  return match[1]
}

test("repository preserves the applied production Supabase baseline", async () => {
  const actual = new Set(await repositoryMigrations())
  for (const expected of productionBaseline) {
    assert.ok(actual.has(expected), `Missing production migration: ${expected}`)
  }
})

test("new migrations only extend the production history", async () => {
  const actual = await repositoryMigrations()
  const baseline = new Set(productionBaseline)
  const latestProductionVersion = migrationVersion(productionBaseline.at(-1)!)
  const versions = actual.map(migrationVersion)

  assert.equal(new Set(versions).size, versions.length, "Migration versions must be unique")

  for (const name of actual.filter((migration) => !baseline.has(migration))) {
    assert.ok(
      migrationVersion(name) > latestProductionVersion,
      `New migration must be newer than production baseline: ${name}`,
    )
  }
})
