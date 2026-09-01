import assert from "node:assert/strict"
import test from "node:test"

import { buildLocationHierarchy, locationAncestorIds } from "../src/lib/worldHierarchy.ts"

const locations = [
  { id: "city", parent_location_id: null, name: "Город" },
  { id: "tavern", parent_location_id: "city", name: "Таверна" },
  { id: "cellar", parent_location_id: "tavern", name: "Подвал" },
  { id: "forest", parent_location_id: null, name: "Лес" },
]

test("world locations are grouped into roots, locations and nested sublocations", () => {
  const tree = buildLocationHierarchy(locations)

  assert.deepEqual(tree.map((node) => node.location.id), ["city", "forest"])
  assert.deepEqual(tree[0]?.children.map((node) => node.location.id), ["tavern"])
  assert.deepEqual(tree[0]?.children[0]?.children.map((node) => node.location.id), ["cellar"])
})

test("world breadcrumb contains every ancestor in navigation order", () => {
  assert.deepEqual(locationAncestorIds(locations, "cellar"), ["city", "tavern"])
  assert.deepEqual(locationAncestorIds(locations, "city"), [])
})

test("orphaned locations stay visible at the root instead of disappearing", () => {
  const tree = buildLocationHierarchy([{ id: "ruin", parent_location_id: "missing", name: "Руины" }])
  assert.equal(tree[0]?.location.id, "ruin")
})
