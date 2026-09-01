import { useMemo, useState } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import "./App.css"

import { resolveCharacterContract, type CharacterContribution, type CharacterEngineInput } from "./character-engine/index.ts"
import ChatActionSheet from "./components/chat/ChatActionSheet.tsx"

const classSource = { id: "template:class:monk:v1:base", name: "Монах", sourceType: "class_template" }
const staffSource = { id: "item:staff-fire", name: "Посох Огня", sourceType: "inventory_item" }
const swordSource = { id: "item:longsword", name: "Длинный меч", sourceType: "inventory_item" }

const contributions: CharacterContribution[] = [
  {
    id: "preview-ki",
    kind: "grant",
    operation: "GRANT",
    target: "resource",
    key: "ki",
    payload: { max: 5, initial: "full", label: "Ци", recharge: { triggers: ["short_rest", "long_rest"], restore: "full" } },
    source: classSource,
  },
  {
    id: "preview-flurry",
    kind: "grant",
    operation: "GRANT",
    target: "action",
    key: "flurry-of-blows",
    payload: { label: "Шквал ударов", economy: "bonus_action", resourceCosts: [{ key: "ki", amount: 1 }], tags: ["feature"] },
    source: classSource,
  },
  {
    id: "preview-sword",
    kind: "grant",
    operation: "GRANT",
    target: "action",
    key: "longsword",
    payload: {
      label: "Длинный меч",
      economy: "action",
      range: { kind: "melee", reach: 5, unit: "фт" },
      attack: { bonus: { kind: "add", terms: [{ kind: "reference", key: "abilities.strength.modifier" }, { kind: "reference", key: "core.proficiencyBonus" }] } },
      damage: [{ key: "slash", type: "рубящий", dice: { count: 1, sides: 8 }, modifier: { kind: "reference", key: "abilities.strength.modifier" } }],
      tags: ["weapon"],
    },
    source: swordSource,
  },
  {
    id: "preview-staff-charges",
    kind: "grant",
    operation: "GRANT",
    target: "resource",
    key: "staff_fire_charges",
    payload: { max: 10, initial: "full", label: "Заряды посоха", recharge: { triggers: ["dawn"], restore: "amount", amount: 3 } },
    source: staffSource,
  },
  {
    id: "preview-staff-wave",
    kind: "grant",
    operation: "GRANT",
    target: "action",
    key: "fire-wave",
    payload: {
      label: "Огненная волна",
      economy: "action",
      range: { kind: "area", shape: "cone", size: 15, unit: "фт" },
      damage: [{ key: "fire", type: "огонь", dice: { count: 3, sides: 6 } }],
      resourceCosts: [{ key: "staff_fire_charges", amount: 2 }],
      tags: ["magic_item", "unique"],
    },
    source: staffSource,
  },
  {
    id: "preview-staff-fireball",
    kind: "grant",
    operation: "GRANT",
    target: "spell",
    key: "fireball",
    variantKey: "staff-fireball",
    payload: {
      spell: { name: "Огненный шар", level: 3, school: "Воплощение" },
      preparation: { mode: "not_required" },
      methods: [{ key: "staff", kind: "item", requiresPrepared: false, resourceOptions: [{ key: "staff-cast", castLevel: 3, costs: [{ key: "staff_fire_charges", amount: 3 }] }] }],
    },
    source: staffSource,
  },
]

const input: CharacterEngineInput = {
  base: {
    id: "preview-action-character",
    name: "Ниель",
    level: 5,
    abilities: { strength: 14, dexterity: 18, constitution: 14, intelligence: 10, wisdom: 16, charisma: 10 },
    baseMaxHp: 38,
    baseSpeed: 40,
    skillProficiencies: { acrobatics: 1, athletics: 1, perception: 1, stealth: 2 },
    savingThrowProficiencies: { strength: 1, dexterity: 1 },
  },
  state: {
    currentHp: 31,
    tempHp: 0,
    resources: { ki: { current: 3 }, staff_fire_charges: { current: 4 } },
  },
  contributions,
}

export function Preview() {
  const [open, setOpen] = useState(true)
  const [lastAction, setLastAction] = useState("Интерфейс открыт в демонстрационном режиме")
  const contract = useMemo(() => resolveCharacterContract(input), [])

  return <main className="action-preview-page">
    <div className="action-preview-shell">
      <div className="action-preview-copy"><span>MEGANOT RPG · UI Preview</span><h1>Action Sheet v3</h1><p>Пять игровых разделов: свободные кубы, атаки, магия, класс и уникальные источники. В демо Ци осталось 3/5, у Посоха Огня — 4/10 зарядов.</p></div>
      <button className="action-preview-open" type="button" onClick={() => setOpen(true)}>Открыть игровые действия</button>
      <p className="action-preview-copy">{lastAction}</p>
    </div>
    {open && <ChatActionSheet
      characterName="Ниель · Монах 5"
      contract={contract}
      onClose={() => setOpen(false)}
      onFreeRoll={async ({ count, sides, modifier }) => setLastAction(`Свободный бросок: ${count}d${sides}${modifier >= 0 ? "+" : ""}${modifier}`)}
      onCheck={async (label, modifier) => setLastAction(`${label}: d20 ${modifier >= 0 ? "+" : ""}${modifier}`)}
      onAction={async (action) => setLastAction(`Действие: ${action.label || action.key}`)}
      onSpell={async (spell) => setLastAction(`Заклинание: ${spell.identity.name}`)}
    />}
  </main>
}

createRoot(document.getElementById("root")!).render(<Preview />)
