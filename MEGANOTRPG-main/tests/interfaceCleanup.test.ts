import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const app = fs.readFileSync("src/App.tsx", "utf8")
const workspace = fs.readFileSync("src/pages/GmWorkspace.tsx", "utf8")
const world = fs.readFileSync("src/pages/World.tsx", "utf8")
const worldEditor = fs.readFileSync("src/components/world/WorldEditor.tsx", "utf8")

test("GM workspace no longer mounts the obsolete rule-template manager", () => {
  assert.doesNotMatch(app, /RuleTemplateManager/)
  assert.match(app, /canManage&&<GmWorkspace/)
})

test("GM can assign and reassign a PC directly from its workspace card", () => {
  assert.match(workspace, /Назначить игрока/)
  assert.match(workspace, /Сменить игрока/)
  assert.match(workspace, /id="character-assignment-player"/)
  assert.match(workspace, /assigned_user_id: nextUserId/)
  assert.match(workspace, /updateCharacter\(assignmentTarget\.id/)
  assert.match(workspace, /setActiveForMember\(previousUserId, null\)/)
  assert.doesNotMatch(workspace, /from\("characters"\).*assigned_user_id/s)
})

test("private material folders have unified long-press rename and safe delete actions", () => {
  assert.match(workspace, /useLongPressItem/)
  assert.match(workspace, /ContextActionSheet/)
  assert.match(workspace, /Переименовать/)
  assert.match(workspace, /gm_workspace_folders"\)\.delete\(\)/)
  assert.match(workspace, /перейдут в «Без папки»/)
  assert.doesNotMatch(workspace, /window\.prompt/)
})

test("World separates zone previews from focused zone details", () => {
  assert.match(world, /world-zone-card/)
  assert.match(world, /← Все зоны/)
  assert.match(world, /Подробное описание/)
  assert.match(world, /aria-expanded=\{expanded\}/)
  assert.doesNotMatch(world, /world-location-tree/)
})

test("World exposes section and transition management through the standard action sheet", () => {
  assert.match(world, /ContextActionSheet/)
  assert.match(world, /location-section-edit/)
  assert.match(world, /location-link-edit/)
  assert.match(world, /location_sections/)
  assert.match(world, /location_links/)
  assert.match(world, /Вернуть из архива/)
})

test("zone editor distinguishes the card preview from the full description", () => {
  assert.match(worldEditor, /Превью зоны/)
  assert.match(worldEditor, /Подробное описание/)
  assert.match(worldEditor, /world-editor-textarea--location/)
})
