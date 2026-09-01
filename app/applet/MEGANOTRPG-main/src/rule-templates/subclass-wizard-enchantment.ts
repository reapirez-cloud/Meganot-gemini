import type { RuleTemplate, RuleTemplateLevel } from "./types.ts"
import { WIZARD_SUBCLASS_PARENT_CATALOG_KEY, WIZARD_SUBCLASS_UNLOCK_LEVEL, type WizardSubclassPackageValidation } from "./wizardSubclasses.ts"

// ==========================================
// ENCHANTMENT (Legacy - 2014 Compatible)
// ==========================================

export const enchantmentTemplate: RuleTemplate = {
  id: "template:subclass:wizard-enchantment",
  campaign_id: "",
  kind: "subclass",
  slug: "wizard-enchantment",
  name: "Школа очарования",
  description: "Волшебники школы Очарования подчиняют чужую волю, стирают память и заставляют существ подчиняться их капризам.",
  version: 1,
  catalog_key: "subclass:wizard:enchantment",
  parent_template_id: "template:class:wizard",
  unlock_level: WIZARD_SUBCLASS_UNLOCK_LEVEL,
  is_builtin: true,
  mechanics: [],
  choices: [],
  is_active: true,
  created_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

export const enchantmentLevels: RuleTemplateLevel[] = [
  {
    id: "level:3:wizard-enchantment",
    template_id: enchantmentTemplate.id,
    level: 3,
    choices: [],
    mechanics: [
      {
        id: "enchantment-savant-l3",
        type: "grant",
        target: "trait",
        key: "enchantment-savant",
        sourceKey: "enchantment-savant-l3-1",
        presentation: {
          authorExplanation: "Время и стоимость копирования заклинаний Очарования в вашу книгу уменьшены вдвое.",
        }
      },
      {
        id: "hypnotic-gaze-l3",
        type: "grant",
        target: "trait",
        key: "hypnotic-gaze",
        sourceKey: "hypnotic-gaze-l3-1",
        presentation: {
          authorExplanation: "Действием вы можете заворожить существо в 5 футах (спасбросок Мудрости). Очарованное существо не может двигаться и действовать. Эффект длится, пока вы поддерживаете его действием каждый ход.",
        }
      }
    ]
  },
  {
    id: "level:6:wizard-enchantment",
    template_id: enchantmentTemplate.id,
    level: 6,
    choices: [],
    mechanics: [
      {
        id: "instinctive-charm-l6",
        type: "grant",
        target: "trait",
        key: "instinctive-charm",
        sourceKey: "instinctive-charm-l6-1",
        presentation: {
          authorExplanation: "Когда существо атакует вас в пределах 30 футов, вы можете реакцией заставить его атаковать другое существо по вашему выбору (спасбросок Мудрости). Не работает, если существо невосприимчиво к очарованию.",
        }
      }
    ]
  },
  {
    id: "level:10:wizard-enchantment",
    template_id: enchantmentTemplate.id,
    level: 10,
    choices: [],
    mechanics: [
      {
        id: "split-enchantment-l10",
        type: "grant",
        target: "trait",
        key: "split-enchantment",
        sourceKey: "split-enchantment-l10-1",
        presentation: {
          authorExplanation: "Накладывая заклинание Очарования 1-го уровня или выше, нацеленное только на одно существо, вы можете нацелить его на второе существо в радиусе действия.",
        }
      }
    ]
  },
  {
    id: "level:14:wizard-enchantment",
    template_id: enchantmentTemplate.id,
    level: 14,
    choices: [],
    mechanics: [
      {
        id: "alter-memories-l14",
        type: "grant",
        target: "trait",
        key: "alter-memories",
        sourceKey: "alter-memories-l14-1",
        presentation: {
          authorExplanation: "Когда действие вашего заклинания Очарования заканчивается, вы можете заставить существо забыть всё время, пока оно было очаровано, или изменить его воспоминания о происходящем (спасбросок Интеллекта).",
        }
      }
    ]
  }
]

export const enchantmentPackage: WizardSubclassPackageValidation = {
  template: enchantmentTemplate,
  parent: { id: "template:class:wizard", kind: "class", catalog_key: WIZARD_SUBCLASS_PARENT_CATALOG_KEY },
  levels: enchantmentLevels,
}
