import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { druidReference } from "../src/data/classes/druidReference.ts"

const fixMigration = fs.readFileSync("supabase/migrations/20260829153000_druid_player_text_immersion_fix.sql", "utf8")

const PLAYER_META = /\b(?:2014|2024)\b|эта кампания|в этой кампании|проектн(?:ая|ой|ую|ые|ых)?\s+(?:дикая|базов|форм)|совместимост|верси(?:я|и|ю)\s+20\d\d|MEGANOT|Character Engine|runtime|миграц/i

function visibleDruidText(): string[] {
  return [
    druidReference.tagline,
    druidReference.mechanicalSummary,
    druidReference.authorDescription,
    druidReference.authorComment,
    ...druidReference.features.flatMap((feature) => [
      feature.name,
      feature.mechanics,
      ...(feature.details || []),
      feature.voss || "",
    ]),
    ...druidReference.subclasses.flatMap((subclass) => [
      subclass.name,
      subclass.mechanics,
      subclass.voss,
    ]),
  ]
}

test("Druid player reference contains only game-world rules, never edition or project meta", () => {
  for (const text of visibleDruidText()) {
    assert.doesNotMatch(text, PLAYER_META, `player-facing Druid text leaked implementation/source meta: ${text}`)
  }
})

test("Moon Druid reference states its rules directly", () => {
  const moon = druidReference.subclasses.find((subclass) => subclass.id === "moon")
  assert.ok(moon)
  assert.match(moon.mechanics, /Дик(?:ая|ой)\s+форм/i)
  assert.match(moon.mechanics, /CR/)
  assert.match(moon.mechanics, /Лунн/i)
  assert.doesNotMatch(moon.mechanics, PLAYER_META)

  const wildShape = druidReference.features.find((feature) => feature.name === "Дикая форма")
  assert.ok(wildShape)
  assert.match(wildShape.mechanics, /2 использован/i)
  assert.match(wildShape.mechanics, /HP/)
  assert.doesNotMatch(wildShape.mechanics, PLAYER_META)
})

test("live Druid text remediation is presentation-only and blocks the regression", () => {
  assert.match(fixMigration, /CLASS_WORK_STATUS: druid:text=READY;mechanics=NOT_AUDITED/)
  assert.match(fixMigration, /CLASS_STATUS_LEDGER: src\/rule-templates\/CLASS_WORK_STATUS\.md/)
  assert.match(fixMigration, /PRESENTATION ONLY/)
  assert.match(fixMigration, /Druid player text immersion failed/)
  assert.match(fixMigration, /subclass:druid:moon/)

  // The migration may name forbidden phrases inside its SQL guard. What matters is that
  // the values it writes into player-facing fields are direct game rules.
  const writtenPlayerCopy = [
    ...fixMigration.matchAll(/(?:mechanical_summary|author_description|author_comment)\s*=\s*'([^']*)'/g),
    ...fixMigration.matchAll(/to_jsonb\('([^']*)'::text\)/g),
  ].map((match) => match[1])

  assert.ok(writtenPlayerCopy.length >= 7)
  for (const text of writtenPlayerCopy) assert.doesNotMatch(text, PLAYER_META)

  assert.doesNotMatch(fixMigration, /resourceCosts|grantOperation|payload,mechanic|option_mechanics/)
})
