import type { RuleTemplate, RuleTemplateLevel } from "./types.ts"
import { WIZARD_SUBCLASS_PARENT_CATALOG_KEY, WIZARD_SUBCLASS_UNLOCK_LEVEL, type WizardSubclassPackageValidation } from "./wizardSubclasses.ts"

// ==========================================
// ENCHANTMENT (Legacy / 2014)
// ==========================================

export const enchantmentTemplate: RuleTemplate = {
  id: "template:subclass:wizard-enchantment",
  campaign_id: "",
  kind: "subclass",
  slug: "wizard-enchantment",
  name: "Школа очарования",
  description: "Волшебники школы Очарования манипулируют разумом, заставляя других выполнять их волю и подчиняться их приказам.",
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
          authorExplanation: "Действием вы можете очаровать существо в 5 футах от вас, заставляя его стоять на месте в прострации. Эффект длится до конца вашего следующего хода, но вы можете поддерживать его каждый свой ход.",
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
          authorExplanation: "Реакцией на атаку по вам от существа в пределах 30 футов, вы можете заставить атакующего перенаправить атаку на другое существо в пределах его досягаемости.",
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
          authorExplanation: "При накладывании заклинания Очарования с уровнем от 1, нацеленного на одно существо, вы можете нацелить его на второе существо.",
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
          authorExplanation: "Вы можете заставить существо забыть то время, когда оно было очаровано вами (и изменить его воспоминания).",
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
