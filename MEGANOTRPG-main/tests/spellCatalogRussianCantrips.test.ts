import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const migrationUrls = [
  new URL("../supabase/migrations/20260825155232_ru_cantrips_voss_part_1.sql", import.meta.url),
  new URL("../supabase/migrations/20260825155305_ru_cantrips_voss_part_2.sql", import.meta.url),
  new URL("../supabase/migrations/20260825155338_ru_cantrips_voss_part_3.sql", import.meta.url),
]

const expectedCantrips = [
  "acid-splash", "chill-touch", "dancing-lights", "druidcraft", "eldritch-blast",
  "elementalism", "fire-bolt", "guidance", "light", "mage-hand", "mending", "message",
  "minor-illusion", "poison-spray", "prestidigitation", "produce-flame", "ray-of-frost",
  "resistance", "sacred-flame", "shillelagh", "shocking-grasp", "sorcerous-burst",
  "spare-the-dying", "starry-wisp", "thaumaturgy", "true-strike", "vicious-mockery",
]

async function migrationText() {
  return (await Promise.all(migrationUrls.map((url) => readFile(url, "utf8")))).join("\n")
}

test("all 27 SRD cantrips receive Russian Voss cards", async () => {
  const sql = await migrationText()
  for (const slug of expectedCantrips) {
    assert.match(sql, new RegExp(`where slug='${slug}'`), `Missing Russian cantrip: ${slug}`)
  }

  assert.equal((sql.match(/where slug='/g) || []).length, expectedCantrips.length)
  assert.equal((sql.match(/author_description=/g) || []).length, expectedCantrips.length)
  assert.equal((sql.match(/author_comment=/g) || []).length, expectedCantrips.length)
  assert.doesNotMatch(sql, /components=array\[[^\]]*'[VSM]'/)
})
