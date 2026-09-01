import assert from "node:assert/strict"
import test from "node:test"

import { assertPersistentResourceRecharge } from "../src/lib/persistentResourcePolicy.ts"

test("persistent CE ledger accepts only rest or dawn recovery", () => {
  assert.doesNotThrow(() => assertPersistentResourceRecharge({ triggers: ["short_rest"], restore: "full" }))
  assert.doesNotThrow(() => assertPersistentResourceRecharge({ triggers: ["long_rest"], restore: "full" }))
  assert.doesNotThrow(() => assertPersistentResourceRecharge({ triggers: ["dawn"], restore: "amount", amount: 1 }))
  assert.doesNotThrow(() => assertPersistentResourceRecharge({
    rules: [
      { trigger: "short_rest", restore: "amount", amount: 1 },
      { trigger: "long_rest", restore: "full" },
    ],
  }))
})

test("manual and never do not become persistent CE counters", () => {
  assert.throws(
    () => assertPersistentResourceRecharge({ triggers: ["manual"], restore: "full" } as never),
    /short_rest, long_rest, or dawn/,
  )
  assert.throws(
    () => assertPersistentResourceRecharge({ triggers: ["never"], restore: "full" } as never),
    /short_rest, long_rest, or dawn/,
  )
})

test("empty recovery schedules are rejected instead of creating GM bookkeeping counters", () => {
  assert.throws(
    () => assertPersistentResourceRecharge({ rules: [] }),
    /must not be empty/,
  )
})
