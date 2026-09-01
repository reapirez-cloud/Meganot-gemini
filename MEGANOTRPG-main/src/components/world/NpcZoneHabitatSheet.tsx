import type { Character } from "../../context/CharacterContext"
import { zonePathLabel, type NpcHabitatZone } from "../../lib/npcZoneHabitats"
import CharacterAvatar from "../characters/CharacterAvatar"

type SharedProps = {
  selectedIds: Set<string>
  savingKey: string
  onClose: () => void
  onToggle: (id: string, next: boolean) => void
}

export function NpcHabitatZonesSheet({
  npc,
  zones,
  selectedIds,
  savingKey,
  onClose,
  onToggle,
}: SharedProps & { npc: Character; zones: NpcHabitatZone[] }) {
  return <div className="sheet-backdrop npc-habitat-backdrop" onMouseDown={onClose}>
    <section className="bottom-sheet npc-habitat-sheet" onMouseDown={(event) => event.stopPropagation()}>
      <div className="sheet-handle"/>
      <header className="npc-habitat-head">
        <div><span>Обычные места</span><h3>Отправить в зону</h3><p>{npc.name} не перемещается туда сейчас. Ты отмечаешь, где этого NPC обычно можно встретить.</p></div>
        <button type="button" onClick={onClose} aria-label="Закрыть">×</button>
      </header>
      <div className="npc-habitat-list">
        {zones.map((zone) => {
          const selected = selectedIds.has(zone.id)
          const busy = savingKey === `${npc.id}:${zone.id}`
          return <button type="button" className={selected ? "is-selected" : ""} key={zone.id} aria-pressed={selected} disabled={Boolean(savingKey)} onClick={() => onToggle(zone.id, !selected)}>
            <span className="npc-habitat-zone-icon">◇</span>
            <span><strong>{zone.name}</strong><small>{zonePathLabel(zones, zone.id)}</small></span>
            <i>{busy ? "…" : selected ? "✓" : "＋"}</i>
          </button>
        })}
        {!zones.length && <div className="npc-habitat-empty"><span>◇</span><strong>Нет активных зон</strong><p>Сначала создай зону мира.</p></div>}
      </div>
    </section>
  </div>
}

export function ZoneHabitatNpcsSheet({
  zoneName,
  npcs,
  selectedIds,
  savingKey,
  onClose,
  onToggle,
}: SharedProps & { zoneName: string; npcs: Character[] }) {
  return <div className="sheet-backdrop npc-habitat-backdrop" onMouseDown={onClose}>
    <section className="bottom-sheet npc-habitat-sheet" onMouseDown={(event) => event.stopPropagation()}>
      <div className="sheet-handle"/>
      <header className="npc-habitat-head">
        <div><span>Обитатели зоны</span><h3>{zoneName}</h3><p>Это список тех, кого обычно можно встретить здесь. Он не меняет текущую позицию NPC.</p></div>
        <button type="button" onClick={onClose} aria-label="Закрыть">×</button>
      </header>
      <div className="npc-habitat-list npc-habitat-list--characters">
        {npcs.map((npc) => {
          const selected = selectedIds.has(npc.id)
          const busy = savingKey.startsWith(`${npc.id}:`)
          return <button type="button" className={selected ? "is-selected" : ""} key={npc.id} aria-pressed={selected} disabled={Boolean(savingKey)} onClick={() => onToggle(npc.id, !selected)}>
            <CharacterAvatar character={npc} size="small"/>
            <span><strong>{npc.name}</strong><small>{npc.character_class || "NPC"}</small></span>
            <i>{busy ? "…" : selected ? "✓" : "＋"}</i>
          </button>
        })}
        {!npcs.length && <div className="npc-habitat-empty"><span>◇</span><strong>NPC ещё нет</strong><p>Создай NPC в панели кампании.</p></div>}
      </div>
    </section>
  </div>
}
