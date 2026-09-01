export type NpcHabitatZone = {
  id: string
  name: string
  parent_location_id: string | null
  lifecycle_state: "active" | "archived"
  sort_order: number
}

export function zonePathLabel(zones: NpcHabitatZone[], zoneId: string): string {
  const byId = new Map(zones.map((zone) => [zone.id, zone]))
  const names: string[] = []
  const seen = new Set<string>()
  let current = byId.get(zoneId) || null
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    names.unshift(current.name)
    current = current.parent_location_id ? byId.get(current.parent_location_id) || null : null
  }
  return names.join(" › ")
}
