import assert from "node:assert/strict"
import { readdir, readFile } from "node:fs/promises"
import test from "node:test"

const migrationsDir = new URL("../supabase/migrations/", import.meta.url)

async function latestPolicyDefinition(policyName: string) {
  const files = (await readdir(migrationsDir))
    .filter((name) => name.endsWith(".sql"))
    .sort()

  const definitions: string[] = []
  const escaped = policyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const pattern = new RegExp(`create\\s+policy\\s+${escaped}\\b[\\s\\S]*?;`, "gi")

  for (const file of files) {
    const sql = await readFile(new URL(file, migrationsDir), "utf8")
    definitions.push(...Array.from(sql.matchAll(pattern)).map((match) => match[0]))
  }

  assert.ok(definitions.length > 0, `Policy ${policyName} must exist in migrations`)
  return definitions.at(-1)!
}

const isolatedReadPolicies = [
  ["world_sections_member_read", "world_sections"],
  ["world_articles_member_read", "world_articles"],
  ["campaign_updates_member_read", "campaign_updates"],
] as const

test("campaign read policies are bound to the campaign of the exact row", async () => {
  for (const [policyName, tableName] of isolatedReadPolicies) {
    const definition = await latestPolicyDefinition(policyName)

    assert.match(
      definition,
      new RegExp(`private\\.is_campaign_member\\(${tableName}\\.campaign_id\\)`),
      `${policyName} must check membership against ${tableName}.campaign_id`,
    )
    assert.doesNotMatch(
      definition,
      /cm\.campaign_id\s*=\s*cm\.campaign_id/i,
      `${policyName} must never accept membership in an unrelated campaign`,
    )
  }
})
