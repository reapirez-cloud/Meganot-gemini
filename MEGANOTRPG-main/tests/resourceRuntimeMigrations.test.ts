import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const runtimeMigration = new URL("../supabase/migrations/20260827124000_resource_runtime_and_template_hierarchy.sql", import.meta.url)
const hardeningMigration = new URL("../supabase/migrations/20260827124100_resource_runtime_hardening.sql", import.meta.url)

test("resource runtime migrations create persistent state and atomic chat RPCs", async () => {
  const sql = `${await readFile(runtimeMigration, "utf8")}\n${await readFile(hardeningMigration, "utf8")}`
  assert.match(sql, /create table if not exists public\.character_resource_states/i)
  assert.match(sql, /alter table public\.character_resource_states enable row level security/i)
  assert.match(sql, /create or replace function private\.consume_character_resource_costs/i)
  assert.match(sql, /create or replace function public\.send_chat_roll_v3/i)
  assert.match(sql, /create or replace function public\.send_chat_event_v3/i)
  assert.match(sql, /perform private\.consume_character_resource_costs/i)
  assert.match(sql, /spell_slot_/i)
  assert.match(sql, /create or replace function public\.recover_character_resources/i)
  assert.match(sql, /create or replace function public\.grant_character_short_rest/i)
  assert.match(sql, /character_sheets/i)
  assert.match(sql, /supabase_realtime/i)
})

test("template hierarchy supports race/subrace and class/subclass with dependent cleanup", async () => {
  const sql = `${await readFile(runtimeMigration, "utf8")}\n${await readFile(hardeningMigration, "utf8")}`
  assert.match(sql, /kind in \('race','subrace','class','subclass'\)/i)
  assert.match(sql, /parent_template_id uuid references public\.rule_templates/i)
  assert.match(sql, /Subrace parent must be a race/i)
  assert.match(sql, /Subclass parent must be a class/i)
  assert.match(sql, /assign_character_template_v2/i)
  assert.match(sql, /Parent class level is below subclass unlock level/i)
  assert.match(sql, /cleanup_child_template_assignments/i)
})
