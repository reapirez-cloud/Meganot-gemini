import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

function source(path: string) {
  return fs.readFileSync(path, "utf8")
}

test("template and resource loaders coalesce overlapping reloads", () => {
  const templates = source("src/hooks/useCharacterTemplateRegistry.ts")
  const resources = source("src/hooks/useCharacterResourceStates.ts")

  for (const hook of [templates, resources]) {
    assert.match(hook, /activeLoadRef/)
    assert.match(hook, /loadTokenRef/)
    assert.match(hook, /if \(active\?\.characterId === characterId\) return active\.promise/)
  }
})

test("character route has exactly one non-null source-loader owner", () => {
  const runtime = source("src/hooks/useResolvedCharacterRuntime.ts")
  const frame = source("src/components/characters/CharacterGameFrame.tsx")
  const profile = source("src/pages/CharacterProfileV2.tsx")

  assert.equal((runtime.match(/useCharacterTemplateRegistry\(characterId\)/g) || []).length, 1)
  assert.equal((runtime.match(/useCharacterResourceStates\(characterId\)/g) || []).length, 1)
  assert.match(runtime, /useOwnedResolvedCharacterRuntime\(shared \? null : character\)/)
  assert.doesNotMatch(frame, /useCharacterTemplateRegistry|useCharacterResourceStates/)
  assert.doesNotMatch(profile, /useCharacterTemplateRegistry|useCharacterResourceStates/)
})
