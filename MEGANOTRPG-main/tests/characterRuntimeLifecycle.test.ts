import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  clearCharacterTemplateBundles,
  registerCharacterTemplateBundles,
  subscribeCharacterTemplateBundles,
} from "../src/rule-templates/registry.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"

function source(path: string) {
  return fs.readFileSync(path, "utf8")
}

function minimalBundle(name = "Воин"): CharacterTemplateBundle {
  return {
    assignment: {
      id: "assignment-1",
      character_id: "hero-runtime",
      template_id: "fighter-template",
      template_level: 5,
      selected_choices: {},
      assigned_at: "2026-08-30T20:00:00.000Z",
      updated_at: "2026-08-30T20:00:00.000Z",
    },
    template: {
      id: "fighter-template",
      campaign_id: "campaign-runtime",
      kind: "class",
      slug: "fighter",
      name,
      description: "",
      version: 1,
      mechanics: [],
      choices: [],
      parent_template_id: null,
      unlock_level: 1,
      catalog_key: null,
      catalog_revision: null,
      source_kind: "custom",
      source_label: "",
      is_builtin: false,
      mechanical_summary: "",
      author_description: "",
      author_comment: "",
      rules_meta: {},
      is_active: true,
      created_by: "gm-runtime",
      created_at: "2026-08-30T20:00:00.000Z",
      updated_at: "2026-08-30T20:00:00.000Z",
    },
    levels: [],
  }
}

test("template registry publishes only semantic changes", () => {
  const characterId = "hero-runtime"
  clearCharacterTemplateBundles(characterId)
  let notifications = 0
  const unsubscribe = subscribeCharacterTemplateBundles(characterId, () => { notifications += 1 })

  const first = minimalBundle()
  assert.equal(registerCharacterTemplateBundles(characterId, [first]), true)
  assert.equal(notifications, 1)

  const sameValueDifferentObject = structuredClone(first)
  assert.equal(registerCharacterTemplateBundles(characterId, [sameValueDifferentObject]), false)
  assert.equal(notifications, 1, "equal template reload must not fan out another registry invalidation")

  const changed = minimalBundle("Воин — обновлён")
  assert.equal(registerCharacterTemplateBundles(characterId, [changed]), true)
  assert.equal(notifications, 2)

  unsubscribe()
  clearCharacterTemplateBundles(characterId)
})

test("Frame + Profile lifecycle cannot be keyed by source revisions", () => {
  const frame = source("src/components/characters/CharacterGameFrame.tsx")
  const profile = source("src/pages/CharacterProfileV2.tsx")

  assert.doesNotMatch(frame, /cloneElement|isValidElement/)
  assert.doesNotMatch(frame, /assigned\.revision|runtime\.revision/)
  assert.doesNotMatch(frame, /key\s*:\s*`\$\{characterId\}/)
  assert.match(frame, /<CharacterRuntimeProvider value=\{sharedRuntime\}>/)
  assert.match(frame, /\{children\}/)
  assert.match(frame, /const sharedRuntime = useResolvedCharacterRuntime\(character\)/)
  assert.match(profile, /const runtime = useResolvedCharacterRuntime\(character\)/)
})

test("mount-loop regression chain stays bounded under registry refresh", () => {
  const characterId = "hero-lifecycle"
  clearCharacterTemplateBundles(characterId)

  let assignedRevision = 0
  let profileMounts = 1
  const stableProfileIdentity = characterId
  let currentProfileIdentity = stableProfileIdentity

  const unsubscribe = subscribeCharacterTemplateBundles(characterId, () => {
    assignedRevision += 1
    const nextProfileIdentity = stableProfileIdentity
    if (nextProfileIdentity !== currentProfileIdentity) {
      profileMounts += 1
      currentProfileIdentity = nextProfileIdentity
    }
  })

  const bundle = minimalBundle()
  registerCharacterTemplateBundles(characterId, [bundle])
  registerCharacterTemplateBundles(characterId, [structuredClone(bundle)])

  assert.equal(assignedRevision, 1, "duplicate template load must be bounded")
  assert.equal(profileMounts, 1, "registry refresh must not remount CharacterProfileV2")

  unsubscribe()
  clearCharacterTemplateBundles(characterId)
})

test("one runtime owns template and resource loaders for the character route", () => {
  const runtime = source("src/hooks/useResolvedCharacterRuntime.ts")
  const frame = source("src/components/characters/CharacterGameFrame.tsx")
  const templateHook = source("src/hooks/useCharacterTemplateRegistry.ts")

  assert.equal((runtime.match(/useCharacterTemplateRegistry\(characterId\)/g) || []).length, 1)
  assert.equal((runtime.match(/useCharacterResourceStates\(characterId\)/g) || []).length, 1)
  assert.doesNotMatch(frame, /useCharacterTemplateRegistry|useCharacterResourceStates/)
  assert.match(runtime, /const owned = useOwnedResolvedCharacterRuntime\(shared \? null : character\)/)
  assert.match(runtime, /return shared \|\| owned/)

  assert.match(templateHook, /registerCharacterTemplateBundles/)
  assert.doesNotMatch(templateHook, /subscribeCharacterTemplateBundles/)
})

test("resource reconciliation is semantic, single-flight and reload-coalesced", () => {
  const runtime = source("src/hooks/useResolvedCharacterRuntime.ts")
  const resources = source("src/hooks/useCharacterResourceStates.ts")

  assert.match(runtime, /stableJson\(row\.recharge\) !== stableJson\(item\.recharge\)/)
  assert.match(runtime, /resourceSyncInFlightRef\.current === syncKey/)
  assert.match(resources, /activeLoadRef/)
  assert.match(resources, /if \(active\?\.characterId === characterId\) return active\.promise/)
  assert.match(resources, /loadTokenRef/)
})

test("Class Sheet and Spells consume the resolved contract while CE failure stays local", () => {
  const profile = source("src/pages/CharacterProfileV2.tsx")

  assert.doesNotMatch(profile, /runtimeBlocking/)
  assert.match(profile, /const runtimeTab = tab === "sheet" \|\| tab === "class" \|\| tab === "spells"/)
  assert.match(profile, /runtime\.refresh/)
  assert.match(profile, /<ResolvedCharacterSheet[\s\S]*?contract=\{resolved\.contract\}/)
  assert.match(profile, /<CharacterClassPanel[\s\S]*?contract=\{resolved\.contract\}/)
  assert.match(profile, /<CharacterSpellbook[\s\S]*?contract=\{resolved\.contract\}/)
  assert.match(profile, /tab === "inventory"/)
  assert.match(profile, /tab === "diary"/)
  assert.match(profile, /tab === "arts"/)
})

test("player My Character and manager character routes use the same runtime frame", () => {
  const app = source("src/App.tsx")

  assert.match(app, /route\.type==="character"[\s\S]*?<CharacterGameFrame characterId=\{route\.id\}>[\s\S]*?<CharacterProfileV2 characterId=\{route\.id\}/)
  assert.match(app, /route\.tab==="me"&&!canManage&&activeCharacter&&<CharacterGameFrame characterId=\{activeCharacter\.id\}>[\s\S]*?<CharacterProfileV2[\s\S]*?embedded/)
  assert.match(app, /route\.tab==="me"&&canManage&&<GmWorkspace[\s\S]*?onOpenCharacter=/)
})

test("Chat and revolver remain on the same resolved runtime contract", () => {
  const alias = source("src/hooks/useResolvedChatActor.ts")
  const chat = source("src/pages/ChatRoom.tsx")
  const revolver = source("src/components/chat/ChatActionSheet.tsx")

  assert.match(alias, /useResolvedCharacterRuntime as useResolvedChatActor/)
  assert.match(chat, /useResolvedChatActor/)
  assert.match(chat, /contract=\{resolved\.contract\}/)
  assert.doesNotMatch(revolver, /resolveLegacyCharacterEngineView|useResolvedCharacterRuntime/)
})
