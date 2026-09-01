import assert from "node:assert/strict"
import test from "node:test"

import { campaignMediaPath, isExternalMedia } from "../src/lib/mediaPath.ts"

test("keeps campaign-scoped and legacy object paths", () => {
  assert.equal(
    campaignMediaPath("campaign-id/user-id/feed/image.webp"),
    "campaign-id/user-id/feed/image.webp",
  )
  assert.equal(
    campaignMediaPath("user-id/avatars/old.png"),
    "user-id/avatars/old.png",
  )
})

test("extracts paths from old public Supabase URLs", () => {
  assert.equal(
    campaignMediaPath(
      "https://example.supabase.co/storage/v1/object/public/campaign-media/user-id/gallery/a%20b.jpg",
    ),
    "user-id/gallery/a b.jpg",
  )
})

test("leaves unrelated external artwork URLs alone", () => {
  assert.equal(campaignMediaPath("https://images.example/art.jpg"), null)
  assert.equal(isExternalMedia("https://images.example/art.jpg"), true)
})
