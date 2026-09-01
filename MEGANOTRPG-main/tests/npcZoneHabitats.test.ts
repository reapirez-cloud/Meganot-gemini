import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { zonePathLabel, type NpcHabitatZone } from "../src/lib/npcZoneHabitats.ts"

const migration = fs.readFileSync("supabase/migrations/20260828123000_location_npc_habitats.sql", "utf8")
const world = fs.readFileSync("src/pages/World.tsx", "utf8")
const workspace = fs.readFileSync("src/pages/GmWorkspace.tsx", "utf8")
const hook = fs.readFileSync("src/hooks/useNpcZoneHabitats.ts", "utf8")
const larisaStorage = fs.readFileSync("src/location-engine/supabase.ts", "utf8")

function functionBody(sql: string, name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}`)
  assert.notEqual(start, -1, `${name} must exist`)
  const end = sql.indexOf("$function$;", start)
  assert.notEqual(end, -1, `${name} body must close`)
  return sql.slice(start, end)
}

test("NPC habitats are stored independently from live world position", () => {
  assert.match(migration, /create table if not exists public\.location_npc_habitats/)
  const body = functionBody(migration, "set_npc_zone_habitat")
  assert.match(body, /insert into public\.location_npc_habitats/)
  assert.match(body, /delete from public\.location_npc_habitats/)
  assert.doesNotMatch(body, /character_world_state/)
  assert.doesNotMatch(body, /set_character_world_position/)
})

test("habitat mutation is limited to NPCs and campaign managers", () => {
  const body = functionBody(migration, "set_npc_zone_habitat")
  assert.match(body, /v_character_type <> 'npc'/)
  assert.match(body, /private\.can_manage_campaign/)
  assert.match(body, /private\.can_manage_character/)
})

test("GM can attach NPCs from both NPC and zone surfaces through Oracle and Larisa", () => {
  assert.match(workspace, /label: "Обычные зоны"/)
  assert.match(workspace, /setZoneNpcTarget\(characterMenu\)/)
  assert.match(workspace, /NpcHabitatZonesSheet/)
  assert.match(world, /Обитатели зоны/)
  assert.match(world, /Обычно здесь/)
  assert.match(world, /ZoneHabitatNpcsSheet/)
  assert.match(hook, /oracle\.world\.setNpcHabitat/)
  assert.doesNotMatch(hook, /rpc\("set_npc_zone_habitat"/)
  assert.match(larisaStorage, /rpc\("set_npc_zone_habitat"/)
})

test("usual inhabitants stay visually separate from live presence", () => {
  assert.match(world, /Это привычные места NPC, а не их текущая позиция в сцене\./)
  assert.match(world, /<small>Сейчас здесь<\/small><h3>Живое состояние зоны<\/h3>/)
})

test("zone picker renders a readable nested path", () => {
  const zones: NpcHabitatZone[] = [
    { id: "city", name: "Город", parent_location_id: null, lifecycle_state: "active", sort_order: 0 },
    { id: "market", name: "Рынок", parent_location_id: "city", lifecycle_state: "active", sort_order: 1 },
    { id: "cellar", name: "Подвал", parent_location_id: "market", lifecycle_state: "active", sort_order: 2 },
  ]
  assert.equal(zonePathLabel(zones, "cellar"), "Город › Рынок › Подвал")
})