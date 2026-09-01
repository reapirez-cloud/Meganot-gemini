export type ChatAbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha"

export type ChatAbilityOption = {
  id: ChatAbilityKey
  short: string
  name: string
  modifier: number
}

export type ChatCheckOption = {
  id: string
  name: string
  ability: ChatAbilityKey
  modifier: number
  kind: "ability" | "skill" | "save"
  proficient?: boolean
}

export type ChatSpellSlotOption = {
  level: number
  max: number
  remaining: number
}

export type ChatSpellOption = {
  id: string
  name: string
  baseLevel: number
  school: string
  damageOrEffect: string
  check: string
  availableSlotLevels: number[]
  description: string
}

export type ChatActionPrototypeData = {
  abilities: ChatAbilityOption[]
  checks: ChatCheckOption[]
  slots: ChatSpellSlotOption[]
  spells: ChatSpellOption[]
}

export const chatActionPrototypeData: ChatActionPrototypeData = {
  abilities: [
    { id: "str", short: "СИЛ", name: "Сила", modifier: 2 },
    { id: "dex", short: "ЛВК", name: "Ловкость", modifier: 4 },
    { id: "con", short: "ТЕЛ", name: "Телосложение", modifier: 1 },
    { id: "int", short: "ИНТ", name: "Интеллект", modifier: 0 },
    { id: "wis", short: "МДР", name: "Мудрость", modifier: 3 },
    { id: "cha", short: "ХАР", name: "Харизма", modifier: -1 },
  ],
  checks: [
    { id: "dex-base", name: "Ловкость", ability: "dex", modifier: 4, kind: "ability" },
    { id: "acrobatics", name: "Акробатика", ability: "dex", modifier: 6, kind: "skill", proficient: true },
    { id: "sleight", name: "Ловкость рук", ability: "dex", modifier: 4, kind: "skill" },
    { id: "stealth", name: "Скрытность", ability: "dex", modifier: 6, kind: "skill", proficient: true },
    { id: "dex-save", name: "Спасбросок Ловкости", ability: "dex", modifier: 6, kind: "save", proficient: true },

    { id: "str-base", name: "Сила", ability: "str", modifier: 2, kind: "ability" },
    { id: "athletics", name: "Атлетика", ability: "str", modifier: 4, kind: "skill", proficient: true },
    { id: "str-save", name: "Спасбросок Силы", ability: "str", modifier: 2, kind: "save" },

    { id: "con-base", name: "Телосложение", ability: "con", modifier: 1, kind: "ability" },
    { id: "con-save", name: "Спасбросок Телосложения", ability: "con", modifier: 3, kind: "save", proficient: true },

    { id: "int-base", name: "Интеллект", ability: "int", modifier: 0, kind: "ability" },
    { id: "arcana", name: "Магия", ability: "int", modifier: 2, kind: "skill", proficient: true },
    { id: "history", name: "История", ability: "int", modifier: 0, kind: "skill" },
    { id: "investigation", name: "Расследование", ability: "int", modifier: 2, kind: "skill", proficient: true },
    { id: "nature", name: "Природа", ability: "int", modifier: 0, kind: "skill" },
    { id: "religion", name: "Религия", ability: "int", modifier: 0, kind: "skill" },
    { id: "int-save", name: "Спасбросок Интеллекта", ability: "int", modifier: 0, kind: "save" },

    { id: "wis-base", name: "Мудрость", ability: "wis", modifier: 3, kind: "ability" },
    { id: "animal", name: "Уход за животными", ability: "wis", modifier: 3, kind: "skill" },
    { id: "insight", name: "Проницательность", ability: "wis", modifier: 5, kind: "skill", proficient: true },
    { id: "medicine", name: "Медицина", ability: "wis", modifier: 3, kind: "skill" },
    { id: "perception", name: "Восприятие", ability: "wis", modifier: 5, kind: "skill", proficient: true },
    { id: "survival", name: "Выживание", ability: "wis", modifier: 3, kind: "skill" },
    { id: "wis-save", name: "Спасбросок Мудрости", ability: "wis", modifier: 5, kind: "save", proficient: true },

    { id: "cha-base", name: "Харизма", ability: "cha", modifier: -1, kind: "ability" },
    { id: "deception", name: "Обман", ability: "cha", modifier: 1, kind: "skill", proficient: true },
    { id: "intimidation", name: "Запугивание", ability: "cha", modifier: -1, kind: "skill" },
    { id: "performance", name: "Выступление", ability: "cha", modifier: -1, kind: "skill" },
    { id: "persuasion", name: "Убеждение", ability: "cha", modifier: 1, kind: "skill", proficient: true },
    { id: "cha-save", name: "Спасбросок Харизмы", ability: "cha", modifier: -1, kind: "save" },
  ],
  slots: [
    { level: 1, max: 4, remaining: 4 },
    { level: 2, max: 3, remaining: 2 },
    { level: 3, max: 2, remaining: 1 },
    { level: 4, max: 1, remaining: 0 },
  ],
  spells: [
    {
      id: "healing-word-demo",
      name: "Лечащее слово",
      baseLevel: 1,
      school: "Воплощение",
      damageOrEffect: "лечение усиливается",
      check: "Бонусное действие",
      availableSlotLevels: [1, 2, 3, 4],
      description: "Демонстрационная карточка. Позже сюда будет подставляться реальное заклинание из общего справочника и его правила апкаста.",
    },
    {
      id: "shield-demo",
      name: "Щит",
      baseLevel: 1,
      school: "Ограждение",
      damageOrEffect: "+5 КД до начала хода",
      check: "Реакция",
      availableSlotLevels: [1, 2, 3, 4],
      description: "Демонстрационная карточка для проверки компактного списка заклинаний в панели действий.",
    },
    {
      id: "misty-step-demo",
      name: "Туманный шаг",
      baseLevel: 2,
      school: "Вызов",
      damageOrEffect: "телепортация на 30 футов",
      check: "Бонусное действие",
      availableSlotLevels: [2, 3, 4],
      description: "Демонстрационное заклинание второго уровня. Источник данных позже заменится на подготовленные или доступные персонажу заклинания.",
    },
    {
      id: "fireball-demo",
      name: "Огненный шар",
      baseLevel: 3,
      school: "Воплощение",
      damageOrEffect: "8d6 огнём",
      check: "Спасбросок Ловкости",
      availableSlotLevels: [3, 4],
      description: "Демонстрационная карточка третьего уровня. При реальной привязке будет открываться полное описание из Справочника.",
    },
  ],
}

export function signedModifier(value: number) {
  return value >= 0 ? `+${value}` : String(value)
}
