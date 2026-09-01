import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const chatsPath = new URL("../src/pages/Chats.tsx", import.meta.url)
const uploadPath = new URL("../src/components/common/ImageUploadField.tsx", import.meta.url)
const cropperPath = new URL("../src/components/common/WideImageCropper.tsx", import.meta.url)
const previewStylesPath = new URL("../src/chat-preview-v4.css", import.meta.url)

test("chat and scene artwork uses a deliberate wide preview crop", async () => {
  const chats = await readFile(chatsPath, "utf8")
  const upload = await readFile(uploadPath, "utf8")
  const cropper = await readFile(cropperPath, "utf8")

  assert.match(chats, /folder="chat-previews"/)
  assert.match(upload, /folder === "chat-previews" \? "wide"/)
  assert.match(upload, /WideImageCropper/)
  assert.match(cropper, /OUTPUT_WIDTH = 1600/)
  assert.match(cropper, /OUTPUT_HEIGHT = 900/)
  assert.match(cropper, /aspect-ratio|Выбери кадр/)
})

test("room list keeps a visual preview without sacrificing readable message text", async () => {
  const styles = await readFile(previewStylesPath, "utf8")

  assert.match(styles, /grid-template-columns:118px minmax\(0,1fr\) auto/)
  assert.match(styles, /\.chat-v3__avatar\{width:118px;height:72px/)
  assert.match(styles, /-webkit-line-clamp:2/)
  assert.match(styles, /white-space:normal/)
})
