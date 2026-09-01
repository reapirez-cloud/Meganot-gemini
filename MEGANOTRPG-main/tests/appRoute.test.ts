import assert from "node:assert/strict"
import test from "node:test"

import { mainRouteHash, parseAppRoute } from "../src/lib/appRoute.ts"

test("empty and unknown hashes open the campaign feed", () => {
  assert.deepEqual(parseAppRoute(""), { type: "main", tab: "feed" })
  assert.deepEqual(parseAppRoute("#/unknown"), { type: "main", tab: "feed" })
})

test("main routes are stable deep links", () => {
  assert.deepEqual(parseAppRoute("#/world"), { type: "main", tab: "world" })
  assert.equal(mainRouteHash("characters"), "#/characters")
})

test("character route remembers a chat return target", () => {
  assert.deepEqual(parseAppRoute("#/character/hero-1?from=chat&room=room-7"), {
    type: "character",
    id: "hero-1",
    from: "chat",
    roomId: "room-7",
  })
})
