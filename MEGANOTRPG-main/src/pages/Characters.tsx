import { useEffect, useMemo, useState } from "react"
import { useCharacters } from "../context/CharacterContext"
import CharacterAvatar from "../components/characters/CharacterAvatar"
import { supabase } from "../lib/supabase"

type Props = { onOpenCharacter: (id: string) => void }
type LifeMap = Record<string, "alive" | "dead">

function RosterCard({ character, note, dead, onOpen }: { key?: string | number; character: { id: string; name: string; avatar_url: string | null; character_class: string; level: number; bio: string }; note?: string; dead?: boolean; onOpen: () => void }) {
  const meta = [character.character_class, `${character.level} уровень`, note, dead ? "мёртв" : ""].filter(Boolean).join(" · ")
  return <button type="button" className={`character-roster-card ${dead ? "is-dead" : ""}`} onClick={onOpen}><CharacterAvatar character={character} size="large"/><span><strong>{character.name}{dead && <i className="roster-dead-badge">† Мёртв</i>}</strong><small>{meta}</small>{character.bio && <p>{character.bio}</p>}</span><em>›</em></button>
}

export default function Characters({ onOpenCharacter }: Props) {
  const { characters, members, myCharacters, activeCharacter, canManage } = useCharacters()
  const [life, setLife] = useState<LifeMap>({})

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      if (!characters.length) { setLife({}); return }
      void supabase.from("characters").select("id,life_state").in("id", characters.map((item) => item.id)).then(({ data }) => {
        if (cancelled || !data) return
        setLife(Object.fromEntries(data.map((row) => [row.id, row.life_state === "dead" ? "dead" : "alive"])) as LifeMap)
      })
    })
    return () => { cancelled = true }
  }, [characters])

  const mine = useMemo(() => [...myCharacters].sort((a, b) => Number(b.id === activeCharacter?.id) - Number(a.id === activeCharacter?.id)), [activeCharacter?.id, myCharacters])
  const otherPlayers = useMemo(() => members
    .filter((member) => member.active_character_id && member.active_character_id !== activeCharacter?.id)
    .map((member) => ({ member, character: characters.find((character) => character.id === member.active_character_id && character.character_type === "pc") }))
    .filter((entry): entry is { member: (typeof members)[number]; character: (typeof characters)[number] } => Boolean(entry.character)), [activeCharacter?.id, characters, members])
  const knownNpcs = useMemo(() => characters.filter((character) => character.character_type === "npc").sort((a, b) => a.name.localeCompare(b.name, "ru")), [characters])

  return <div className="characters-v3">
    <header className="characters-v3-head"><span>Персонажи</span><h2>Кого знает ваш герой</h2><p>Игровые персонажи видны всегда, NPC появляются здесь только после открытия. Неизвестные персонажи не раскрываются даже как скрытые карточки.</p></header>

    <section className="roster-section roster-section--mine"><div className="roster-section__head"><div><small>Мой персонаж</small><h3>{activeCharacter ? "Сейчас в игре" : "Назначенные герои"}</h3></div></div><div className="characters-v2-grid">{mine.map((character) => <RosterCard key={character.id} character={character} dead={life[character.id] === "dead"} note={character.id === activeCharacter?.id ? "активный" : undefined} onOpen={() => onOpenCharacter(character.id)} />)}{!mine.length && <div className="v2-empty-state"><span>◇</span><strong>Персонаж ещё не назначен</strong><p>ГМ выдаст героя и сделает его активным.</p></div>}</div></section>

    <section className="roster-section"><div className="roster-section__head"><div><small>Другие персонажи игроков</small><h3>Активные герои</h3></div><span>{otherPlayers.length}</span></div><div className="characters-v2-grid">{otherPlayers.map(({ character, member }) => <RosterCard key={character.id} character={character} dead={life[character.id] === "dead"} note={member.display_name} onOpen={() => onOpenCharacter(character.id)} />)}{!otherPlayers.length && <p className="roster-empty">Сейчас других активных героев нет.</p>}</div></section>

    <section className="roster-section"><div className="roster-section__head"><div><small>{canManage ? "NPC кампании" : "Известные мне"}</small><h3>{canManage ? "Персонажи мира" : "Встреченные персонажи"}</h3></div><span>{knownNpcs.length}</span></div><div className="characters-v2-grid">{knownNpcs.map((character) => <RosterCard key={character.id} character={character} dead={life[character.id] === "dead"} onOpen={() => onOpenCharacter(character.id)} />)}{!knownNpcs.length && <div className="known-npc-empty"><span>◌</span><div><strong>Пока никого</strong><p>{canManage ? "Созданные NPC будут доступны в панели управления." : "NPC появится здесь после того, как ГМ действительно заговорит от его лица, либо если он отмечен как видимый всегда."}</p></div></div>}</div></section>
  </div>
}
