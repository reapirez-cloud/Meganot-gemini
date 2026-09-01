import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const world = fs.readFileSync("src/pages/World.tsx", "utf8")
const map = fs.readFileSync("src/components/world/WorldMapView.tsx", "utf8")
const styles = fs.readFileSync("src/world-map.css", "utf8")

test("World exposes a top-level LORE and MAP switch without replacing existing location lore", () => {
  assert.match(world, /world-mode-nav/)
  assert.match(world, />ЛОР<\/button>/)
  assert.match(world, />КАРТА<\/button>/)
  assert.match(world, /<WorldMapView/)
  assert.match(world, /setViewMode\("lore"\)/)
  assert.match(world, /openLocationFromMap/)
  assert.match(world, /Подробное описание/)
})

test("map keeps hierarchy vertical while authored links remain explicit arrows", () => {
  assert.match(map, /sectionLocation/)
  assert.match(map, /for \(const link of links\)/)
  assert.match(map, /link\.target_location_id/)
  assert.match(map, /childrenByParent/)
  assert.match(map, /walk\(child, \[\.\.\.ancestors, location\]\)/)
  assert.match(map, /world-map-parentage/)
  assert.match(map, /ancestors\.map\(\(ancestor\) => ancestor\.name\)\.join\(" › "\)/)
  assert.match(map, /world-map-route__arrow">→/)
  assert.match(map, /onOpen\(route\.target\)/)
  assert.doesNotMatch(map, /kind: "child"/)
  assert.doesNotMatch(map, /label: "Подзона"/)
})

test("map stays mobile-first with narrow location panels, ancestry and optional previews", () => {
  assert.match(map, /location\.image_url \? <CampaignImage/)
  assert.match(styles, /\.world-map-node\.is-nested/)
  assert.match(styles, /margin-left: calc\(var\(--map-depth\) \* 12px\)/)
  assert.match(styles, /\.world-map-parentage/)
  assert.match(styles, /\.world-map-routes__rail/)
  assert.match(styles, /overflow-x: auto/)
  assert.match(styles, /world-map-card__image/)
  assert.doesNotMatch(styles, /world-map-route--child/)
  assert.doesNotMatch(map, /canvas/i)
})
