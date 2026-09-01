import assert from "node:assert/strict"
import test from "node:test"

import { horizontalCaretHitsBoundary } from "../src/lib/textInputFocusGuard.ts"

test("right arrow is contained only at the right text edge", () => {
  assert.equal(horizontalCaretHitsBoundary("ArrowRight", 5, 2, 2), false)
  assert.equal(horizontalCaretHitsBoundary("ArrowRight", 5, 5, 5), true)
})

test("left arrow is contained only at the left text edge", () => {
  assert.equal(horizontalCaretHitsBoundary("ArrowLeft", 5, 3, 3), false)
  assert.equal(horizontalCaretHitsBoundary("ArrowLeft", 5, 0, 0), true)
})

test("active selections stay native", () => {
  assert.equal(horizontalCaretHitsBoundary("ArrowRight", 5, 2, 5), false)
  assert.equal(horizontalCaretHitsBoundary("ArrowLeft", 5, 0, 3), false)
})
