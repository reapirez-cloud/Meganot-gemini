import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { createEngineCommandContext, type CharacterResolutionRequest } from "../src/engine-contracts/index.ts"
import { MemoryShapoklyakStorage, ShapoklyakEngine, type CharacterEntity } from "../src/entity-engine/index.ts"

const now = "2026-08-30T20:00:00.000Z"
const hero: CharacterEntity = {
  id: "hero-closure",
  campaign_id: "campaign-closure",
  assigned_user_id: "player-1",
  name: "Герой",
  character_class: "",
  level: 1,
  bio: "",
  avatar_url: null,
  character_type: "pc",
  visibility: "campaign",
  visibility_mode: "always",
  life_state: "alive",
  died_at: null,
  created_by: "gm-1",
  created_at: now,
  updated_at: now,
}

function context(authority: "player" | "gm") {
  return createEngineCommandContext({
    campaignId: hero.campaign_id,
    requestedBy: authority === "gm" ? "gm-1" : "player-1",
    authority,
    actorCharacterId: hero.id,
    occurredAt: now,
  })
}

test("Shapoklyak owns template assignment, suppression and fresh character resolution", async () => {
  const requests: CharacterResolutionRequest[] = []
  const engine = new ShapoklyakEngine(new MemoryShapoklyakStorage([hero]), {
    resolutionRequester: { requestCharacterResolution: (request) => { requests.push(request) } },
  })

  await assert.rejects(() => engine.execute({
    kind: "entity.assign_template",
    context: context("player"),
    characterId: hero.id,
    input: { templateId: "fighter-template", templateLevel: 5, selectedChoices: {} },
  }), /Only GM authority/)

  const assigned = await engine.execute({
    kind: "entity.assign_template",
    context: context("gm"),
    characterId: hero.id,
    input: { templateId: "fighter-template", templateLevel: 5, selectedChoices: { style: "defense" } },
  })

  assert.equal(assigned.value.kind, "entity.assign_template")
  assert.deepEqual(assigned.effects.resolveCharacterIds, [hero.id])
  assert.equal(requests.at(-1)?.reason, "entity.assign_template")

  const suppressed = await engine.execute({
    kind: "entity.set_source_suppressed",
    context: context("gm"),
    characterId: hero.id,
    sourceId: "template:fighter-template",
    suppressed: true,
  })
  assert.deepEqual(suppressed.effects.resolveCharacterIds, [hero.id])
  assert.equal(suppressed.value.details?.suppressed, true)
  assert.equal(requests.at(-1)?.reason, "entity.set_source_suppressed")

  const assignmentId = String(assigned.value.details?.assignmentId)
  const removed = await engine.execute({
    kind: "entity.remove_template_assignment",
    context: context("gm"),
    characterId: hero.id,
    assignmentId,
  })
  assert.equal(removed.value.kind, "entity.remove_template_assignment")
  assert.equal(requests.at(-1)?.reason, "entity.remove_template_assignment")
})

test("GM template UI cannot bypass Oracle and atomic owner RPC is the persistence boundary", () => {
  const frame = fs.readFileSync("src/components/characters/CharacterGameFrame.tsx", "utf8")
  const oracle = fs.readFileSync("src/oracle-engine/engine.ts", "utf8")
  const storage = fs.readFileSync("src/entity-engine/supabase.ts", "utf8")
  const migration = fs.readFileSync("supabase/migrations/20260830050000_shapoklyak_template_assignment_owner.sql", "utf8")

  assert.match(frame, /oracle\.characters\.assignTemplate/)
  assert.match(frame, /oracle\.characters\.removeTemplateAssignment/)
  assert.doesNotMatch(frame, /assign_character_template_v2/)
  assert.doesNotMatch(frame, /apply_class_template_sheet_profile/)
  assert.doesNotMatch(frame, /remove_character_template_assignment_v2/)

  assert.match(oracle, /entity\.assign_template/)
  assert.match(oracle, /entity\.remove_template_assignment/)
  assert.match(storage, /set_character_template_assignment_owner_v1/)
  assert.match(storage, /remove_character_template_assignment_owner_v1/)
  assert.match(migration, /set_character_template_assignment_owner_v1/)
  assert.match(migration, /assign_character_template_v2/)
  assert.match(migration, /apply_class_template_sheet_profile/)
})

test("legacy template helpers are sealed behind the Shapoklyak owner facade", () => {
  const migration = fs.readFileSync("supabase/migrations/20260830160706_seal_shapoklyak_template_helpers.sql", "utf8")

  assert.match(migration, /revoke execute on function public\.assign_character_template\(uuid,uuid,integer,jsonb\) from authenticated/)
  assert.match(migration, /revoke execute on function public\.assign_character_template_v2\(uuid,uuid,integer,jsonb\) from authenticated/)
  assert.match(migration, /revoke execute on function public\.apply_class_template_sheet_profile\(uuid,uuid,integer\) from authenticated/)
  assert.match(migration, /revoke execute on function public\.remove_character_template_assignment_v2\(uuid,uuid\) from authenticated/)
  assert.match(migration, /grant execute on function public\.set_character_template_assignment_owner_v1\(uuid,uuid,integer,jsonb\) to authenticated/)
  assert.match(migration, /grant execute on function public\.remove_character_template_assignment_owner_v1\(uuid,uuid\) to authenticated/)
})

test("Sheet Chat and action revolver consume one shared resolved character runtime", () => {
  const profile = fs.readFileSync("src/pages/CharacterProfileV2.tsx", "utf8")
  const chatAlias = fs.readFileSync("src/hooks/useResolvedChatActor.ts", "utf8")
  const chatRoom = fs.readFileSync("src/pages/ChatRoom.tsx", "utf8")
  const actionSheet = fs.readFileSync("src/components/chat/ChatActionSheet.tsx", "utf8")
  const runtimeResolver = fs.readFileSync("src/engine-runtime/characterRuntimeResolver.ts", "utf8")

  assert.match(profile, /useResolvedCharacterRuntime/)
  assert.doesNotMatch(profile, /resolveLegacyCharacterEngineView/)
  assert.match(chatAlias, /useResolvedCharacterRuntime as useResolvedChatActor/)
  assert.match(chatRoom, /useResolvedChatActor/)
  assert.match(chatRoom, /contract=\{resolved\.contract\}/)
  assert.doesNotMatch(actionSheet, /resolveLegacyCharacterEngineView/)
  assert.doesNotMatch(actionSheet, /useResolvedCharacterRuntime/)
  assert.match(runtimeResolver, /resolveLegacyCharacterEngineView/)
})

test("engine closure contract is explicit", () => {
  const closure = fs.readFileSync("docs/ENGINE_CLOSURE_DEFINITION.md", "utf8")
  assert.match(closure, /CLOSED/)
  assert.match(closure, /Build, Lint and Tests/)
  assert.match(closure, /Oracle must never depend on GENA/)
  assert.match(closure, /indefinite loading/)
})

test("canonical engine documents stay marked as closed stable boundaries", () => {
  const canonicalContracts = [
    "docs/ENGINE_CLOSURE_DEFINITION.md",
    "docs/ENGINE_ROADMAP.md",
    "docs/ENGINE_CONTRACTS.md",
    "docs/ENGINE_RUNTIME_INTEGRATION.md",
    "docs/CHARACTER_ENGINE_CONTRACT.md",
    "docs/CHASOVOY_ENGINE_CONTRACT.md",
    "docs/ORACLE_ENGINE_CONTRACT.md",
  ]

  for (const path of canonicalContracts) {
    const contract = fs.readFileSync(path, "utf8")
    assert.match(contract, /Status: \*\*CLOSED — STABLE BOUNDARY ON `dev`\*\*/, path)
    assert.doesNotMatch(contract, /CLOSURE CANDIDATE/, path)
  }
})
