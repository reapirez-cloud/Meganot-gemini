import assert from "node:assert/strict"
import { readdir, readFile } from "node:fs/promises"
import test from "node:test"

import {
  CHARACTER_ENGINE_STATUS,
  CHARACTER_ENGINE_VERSION,
  CHARACTER_ENGINE_VERSION_INFO,
  RESOLVED_CHARACTER_CONTRACT_VERSION,
  ResolvedCharacterContractError,
  explainCharacter,
  resolveCharacterContract,
  validateResolvedCharacterContract,
  type CharacterEngineInput,
  type ResolvedCharacterContract,
} from "../src/character-engine/index.ts"

const minimalInput: CharacterEngineInput = {
  base: {
    id: "v1-smoke",
    name: "V1 Smoke",
    level: 1,
    abilities: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
    },
    baseMaxHp: 8,
    baseSpeed: 30,
  },
  state: { currentHp: 8, tempHp: 0 },
  contributions: [],
}

test("Character Engine declares stable semantic v1 independently from the app package", () => {
  assert.equal(CHARACTER_ENGINE_VERSION, "1.0.0")
  assert.equal(CHARACTER_ENGINE_STATUS, "stable")
  assert.deepEqual(CHARACTER_ENGINE_VERSION_INFO, {
    version: "1.0.0",
    status: "stable",
  })
})

test("canonical v1 contract is stamped with engine and contract versions", () => {
  const contract = resolveCharacterContract(minimalInput)

  assert.equal(contract.engineVersion, CHARACTER_ENGINE_VERSION)
  assert.equal(contract.contractVersion, RESOLVED_CHARACTER_CONTRACT_VERSION)
  assert.equal(contract.id, "v1-smoke")
  assert.deepEqual(contract.resources, [])
  assert.deepEqual(contract.actions, [])
  assert.deepEqual(contract.spells, [])
})

test("v1 contract validator rejects output from an unsupported engine version", () => {
  const contract = resolveCharacterContract(minimalInput)
  const malformed = structuredClone(contract) as ResolvedCharacterContract
  ;(malformed as { engineVersion: string }).engineVersion = "2.0.0"

  assert.throws(
    () => validateResolvedCharacterContract(malformed),
    ResolvedCharacterContractError,
  )
})

test("v1 public entry point resolves and explains without an adapter or renderer", () => {
  const input: CharacterEngineInput = {
    ...minimalInput,
    contributions: [
      {
        id: "v1-wisdom",
        kind: "numeric",
        target: "abilities.wisdom",
        operation: "ADD",
        value: 2,
        source: { id: "v1-source", name: "Standalone source", sourceType: "anything" },
      },
    ],
  }

  const contract = resolveCharacterContract(input)
  const explanation = explainCharacter(input, {
    kind: "number",
    target: "abilities.wisdom",
  })

  assert.equal(contract.abilities.wisdom.value, 12)
  assert.equal(explanation.value, 12)
  assert.match(explanation.summary, /Standalone source/)
})

test("every Character Engine TypeScript module imports only other standalone engine modules", async () => {
  const engineDirectory = new URL("../src/character-engine/", import.meta.url)
  const filenames = (await readdir(engineDirectory))
    .filter((filename) => filename.endsWith(".ts"))
    .sort()

  assert.ok(filenames.length > 0)

  const violations: string[] = []
  const importPattern = /(?:from\s+|import\s*\()\s*["']([^"']+)["']/g

  for (const filename of filenames) {
    const source = await readFile(new URL(filename, engineDirectory), "utf8")
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1]!
      if (!specifier.startsWith("./")) {
        violations.push(`${filename} -> ${specifier}`)
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Character Engine v1 must stay standalone; forbidden imports: ${violations.join(", ")}`,
  )
})

test("standalone engine modules do not import app infrastructure packages", async () => {
  const engineDirectory = new URL("../src/character-engine/", import.meta.url)
  const filenames = (await readdir(engineDirectory)).filter((filename) => filename.endsWith(".ts"))
  const forbiddenSpecifiers = [
    { label: "@supabase", pattern: /["']@supabase\// },
    { label: "react", pattern: /["']react["'/]/ },
    { label: "react-dom", pattern: /["']react-dom["'/]/ },
    { label: "vite", pattern: /["']vite["'/]/ },
  ]
  const violations: string[] = []

  for (const filename of filenames) {
    const source = await readFile(new URL(filename, engineDirectory), "utf8")
    for (const forbidden of forbiddenSpecifiers) {
      if (forbidden.pattern.test(source)) violations.push(`${filename}:${forbidden.label}`)
    }
  }

  assert.deepEqual(violations, [])
})
