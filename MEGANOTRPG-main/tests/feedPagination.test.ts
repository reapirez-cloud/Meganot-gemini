import assert from "node:assert/strict"
import test from "node:test"

import {
  compareFeedOrder,
  feedCursorFilter,
} from "../src/lib/feedPagination.ts"

test("feed order uses id as a deterministic tie breaker", () => {
  const items = [
    { published_at: "2026-08-25T12:00:00.000Z", id: "b" },
    { published_at: "2026-08-25T12:00:00.000Z", id: "d" },
    { published_at: "2026-08-25T12:00:01.000Z", id: "a" },
    { published_at: "2026-08-25T12:00:00.000Z", id: "c" },
  ]

  assert.deepEqual(items.sort(compareFeedOrder).map((item) => item.id), [
    "a",
    "d",
    "c",
    "b",
  ])
})

test("feed cursor includes timestamp and id boundary", () => {
  assert.equal(
    feedCursorFilter({
      published_at: "2026-08-25T12:00:00.000Z",
      id: "abc-123",
    }),
    "published_at.lt.2026-08-25T12:00:00.000Z,and(published_at.eq.2026-08-25T12:00:00.000Z,id.lt.abc-123)",
  )
})
