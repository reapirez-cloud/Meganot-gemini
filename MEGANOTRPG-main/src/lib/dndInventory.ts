import type { EquipmentSlot, InventoryCategory } from "../types/characterSheet"

export const inventoryCategories: Array<{
  value: InventoryCategory
  label: string
  short: string
  order: number
}> = [
  { value: "equipment", label: "Экипировка", short: "Экип.", order: 10 },
  { value: "consumable", label: "Расходники", short: "Расход.", order: 20 },
  { value: "tool", label: "Инструменты", short: "Инстр.", order: 30 },
  { value: "book", label: "Книги", short: "Книги", order: 40 },
  { value: "trinket", label: "Безделушки", short: "Бездел.", order: 50 },
  { value: "quest", label: "Квестовые", short: "Квест", order: 60 },
  { value: "material", label: "Материалы", short: "Матер.", order: 70 },
  { value: "currency", label: "Деньги и ценности", short: "Ценности", order: 80 },
  { value: "container", label: "Сумки и контейнеры", short: "Сумки", order: 90 },
  { value: "other", label: "Прочее", short: "Прочее", order: 100 },
]

export const equipmentSlots: Array<{
  value: EquipmentSlot
  label: string
  short: string
  order: number
}> = [
  { value: "head", label: "Голова", short: "Голова", order: 10 },
  { value: "neck", label: "Шея", short: "Шея", order: 20 },
  { value: "shoulders", label: "Плечи / плащ", short: "Плечи", order: 30 },
  { value: "chest", label: "Тело / броня", short: "Тело", order: 40 },
  { value: "back", label: "Спина", short: "Спина", order: 50 },
  { value: "main_hand", label: "Основная рука", short: "Рука", order: 60 },
  { value: "off_hand", label: "Вторая рука", short: "2-я рука", order: 70 },
  { value: "two_hands", label: "Две руки", short: "2 руки", order: 80 },
  { value: "hands", label: "Кисти / перчатки", short: "Кисти", order: 90 },
  { value: "wrists", label: "Запястья", short: "Запястья", order: 100 },
  { value: "waist", label: "Пояс", short: "Пояс", order: 110 },
  { value: "legs", label: "Ноги", short: "Ноги", order: 120 },
  { value: "feet", label: "Ступни / обувь", short: "Обувь", order: 130 },
  { value: "ring_left", label: "Кольцо I", short: "Кольцо I", order: 140 },
  { value: "ring_right", label: "Кольцо II", short: "Кольцо II", order: 150 },
  { value: "ammo", label: "Боеприпасы / колчан", short: "Боепр.", order: 160 },
  { value: "other", label: "Другой слот", short: "Другое", order: 170 },
]

export function categoryLabel(category: InventoryCategory) {
  return inventoryCategories.find((item) => item.value === category)?.label || "Прочее"
}

export function categoryShort(category: InventoryCategory) {
  return inventoryCategories.find((item) => item.value === category)?.short || "Прочее"
}

export function categoryOrder(category: InventoryCategory) {
  return inventoryCategories.find((item) => item.value === category)?.order ?? 999
}

export function slotLabel(slot: EquipmentSlot | null) {
  if (!slot) return "Слот не выбран"
  return equipmentSlots.find((item) => item.value === slot)?.label || "Другой слот"
}

export function slotShort(slot: EquipmentSlot | null) {
  if (!slot) return "Без слота"
  return equipmentSlots.find((item) => item.value === slot)?.short || "Другое"
}

export function slotOrder(slot: EquipmentSlot | null) {
  if (!slot) return 999
  return equipmentSlots.find((item) => item.value === slot)?.order ?? 999
}
