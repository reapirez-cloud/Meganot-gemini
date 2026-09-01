import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { resolveCharacter, type BaseCharacter, type CharacterState } from "../src/character-engine/index.ts"
import { inventoryMechanicContributions } from "../src/lib/characterMechanics.ts"
import type { InventoryItem } from "../src/types/characterSheet.ts"

const editor = fs.readFileSync("src/components/characters/InventoryItemEditor.tsx", "utf8")
const inventory = fs.readFileSync("src/components/characters/CharacterInventory.tsx", "utf8")
const chat = fs.readFileSync("src/components/chat/ChatActionSheet.tsx", "utf8")
const chatModel = fs.readFileSync("src/components/chat/chatActionModel.ts", "utf8")
const room = fs.readFileSync("src/pages/ChatRoom.tsx", "utf8")

test("curse editor exposes two independent player disclosure controls", () => {
  assert.match(editor, /Показывать игроку, что проклятие есть/)
  assert.match(editor, /Показывать, что делает проклятие/)
  assert.match(editor, /showCurseToPlayer/)
  assert.match(editor, /showCurseEffectToPlayer/)
  assert.match(editor, /curseEffect: true/)
})

test("hidden curse mechanics still resolve in Character Engine", () => {
  const item = {
    id: "cursed-ring",
    name: "Кольцо",
    category: "equipment",
    equipment_slot: "ring",
    equipped: true,
    mechanics: [{
      id: "curse-ac",
      type: "numeric",
      target: "combat.ac",
      operation: "ADD",
      value: -2,
      activation: "equipped",
      curseEffect: true,
    }],
  } as unknown as InventoryItem

  const contributions = inventoryMechanicContributions([item])
  assert.equal(contributions.length, 1)
  assert.equal(contributions[0]?.source.visibility, "private")

  const base: BaseCharacter = {
    id: "hero",
    name: "Hero",
    level: 1,
    abilities: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
    baseMaxHp: 10,
    baseSpeed: 30,
  }
  const state: CharacterState = { currentHp: 10, tempHp: 0 }
  const resolved = resolveCharacter(base, state, contributions)
  assert.equal(resolved.combat.ac.value, 8)
})

test("player inventory and chat filter hidden curse disclosure while managers can include it", () => {
  assert.match(inventory, /playerVisibleItemMechanics\(item, canManage\)/)
  assert.match(inventory, /curse\.showCurseToPlayer/)
  assert.match(inventory, /curse\.showCurseEffectToPlayer/)
  assert.match(chat, /includePrivateSources/)
  assert.match(chatModel, /visibleSpell/)
  assert.match(chatModel, /source\.visibility !== "private"/)
  assert.match(room, /includePrivateSources=\{canManage\}/)
})
