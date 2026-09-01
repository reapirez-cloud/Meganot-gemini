import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const sql = readFileSync("supabase/migrations/20260827123000_free_dice_any_sides.sql", "utf8")

test("free dice RPC accepts arbitrary safe die sizes instead of a hardcoded dice list", () => {
  assert.match(sql, /p_dice_sides\s*<\s*2\s+or\s+p_dice_sides\s*>\s*1000/i)
  assert.doesNotMatch(sql, /p_dice_sides\s+not\s+in\s*\(\s*4\s*,\s*6\s*,\s*8/i)
})

test("free dice remain server rolled, bounded and cannot create an empty roll", () => {
  assert.match(sql, /p_dice_count\s*>\s*40/i)
  assert.match(sql, /not\s+p_roll_d20\s+and\s+p_dice_count\s*=\s*0/i)
  assert.match(sql, /floor\s*\(\s*random\(\)\s*\*\s*p_dice_sides\s*\+\s*1\s*\)/i)
  assert.match(sql, /event_kind\s*,\s*event_payload/i)
})
