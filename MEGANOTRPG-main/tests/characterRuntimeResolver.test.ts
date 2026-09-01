import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  CharacterRuntimeResolveError,
  CharacterRuntimeResolver,
  type CharacterRuntimeDataSource,
} from "../src/engine-runtime/characterRuntimeResolver.ts"

const EMPTY_PROJECTION = {
  characterId: "hero-1",
  revision: "empty",
  activeItemIds: [],
  contributions: [],
}

function missingSheetSource(): CharacterRuntimeDataSource {
  return {
    async loadCore() {
      return {
        sheet: null,
        inventoryProjection: EMPTY_PROJECTION,
        spells: [],
        features: [],
        preparationSession: null,
        preparationRecords: [],
        wizardSpellbookCatalogIds: [],
      }
    },
    async loadCatalog() {
      return { rows: [], warnings: [] }
    },
  }
}

const input = {
  character: {
    id: "hero-1",
    campaign_id: "campaign-1",
    name: "Hero",
    level: 1,
  },
  templateBundles: [],
  resourceState: {},
  suppressedSourceIds: [],
}

test("character runtime resolver terminates missing-sheet reads with an explicit error", async () => {
  const resolver = new CharacterRuntimeResolver(missingSheetSource(), { timeoutMs: 100 })

  await assert.rejects(
    resolver.resolve(input),
    (reason: unknown) => reason instanceof CharacterRuntimeResolveError && reason.code === "missing_sheet",
  )
})

test("character runtime resolver converts a hung owner read into timeout instead of infinite loading", async () => {
  const source: CharacterRuntimeDataSource = {
    loadCore: async () => await new Promise(() => {}),
    async loadCatalog() {
      return { rows: [], warnings: [] }
    },
  }
  const resolver = new CharacterRuntimeResolver(source, { timeoutMs: 20 })

  await assert.rejects(
    resolver.resolve(input),
    (reason: unknown) => reason instanceof CharacterRuntimeResolveError && reason.code === "timeout",
  )
})

test("character runtime resolver is the single CE assembly boundary for chat", () => {
  const chatAdapter = fs.readFileSync("src/hooks/useResolvedChatActor.ts", "utf8")
  const sharedHook = fs.readFileSync("src/hooks/useResolvedCharacterRuntime.ts", "utf8")
  const resolver = fs.readFileSync("src/engine-runtime/characterRuntimeResolver.ts", "utf8")
  const productionSource = fs.readFileSync("src/engine-runtime/supabaseCharacterRuntimeSource.ts", "utf8")
  const compositionRoot = fs.readFileSync("src/engine-runtime/runtime.ts", "utf8")

  assert.match(chatAdapter, /useResolvedCharacterRuntime/)
  assert.doesNotMatch(chatAdapter, /supabase/)
  assert.doesNotMatch(chatAdapter, /resolveLegacyCharacterEngineView/)
  assert.match(sharedHook, /characterRuntimeResolver\.resolve/)
  assert.match(sharedHook, /"idle" \| "loading" \| "ready" \| "stale" \| "error"/)
  assert.match(resolver, /DEFAULT_CHARACTER_RUNTIME_TIMEOUT_MS/)
  assert.doesNotMatch(resolver, /\.rpc\(/)
  assert.match(productionSource, /cheburashka\.mechanicalProjection/)
  assert.doesNotMatch(productionSource, /\.rpc\(/)
  assert.match(compositionRoot, /characterRuntime: characterRuntimeResolver/)
})
