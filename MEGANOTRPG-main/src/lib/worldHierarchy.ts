export type LocationHierarchyItem = {
  id: string
  parent_location_id: string | null
}

export type LocationHierarchyNode<T extends LocationHierarchyItem> = {
  location: T
  children: LocationHierarchyNode<T>[]
}

export function buildLocationHierarchy<T extends LocationHierarchyItem>(locations: T[]): LocationHierarchyNode<T>[] {
  const nodes = new Map<string, LocationHierarchyNode<T>>()
  for (const location of locations) nodes.set(location.id, { location, children: [] })

  const roots: LocationHierarchyNode<T>[] = []
  for (const location of locations) {
    const node = nodes.get(location.id)!
    const parent = location.parent_location_id ? nodes.get(location.parent_location_id) : null
    if (!parent || parent === node) roots.push(node)
    else parent.children.push(node)
  }

  return roots
}

export function locationAncestorIds<T extends LocationHierarchyItem>(locations: T[], locationId: string | null): string[] {
  if (!locationId) return []
  const byId = new Map(locations.map((location) => [location.id, location]))
  const result: string[] = []
  const visited = new Set<string>()
  let current = byId.get(locationId)

  while (current?.parent_location_id && !visited.has(current.parent_location_id)) {
    visited.add(current.parent_location_id)
    result.unshift(current.parent_location_id)
    current = byId.get(current.parent_location_id)
  }

  return result
}
