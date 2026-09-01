import type { RuleTemplate, RuleTemplateLevel } from "./types.ts"
import { WIZARD_SUBCLASS_PARENT_CATALOG_KEY, WIZARD_SUBCLASS_UNLOCK_LEVEL, type WizardSubclassPackageValidation } from "./wizardSubclasses.ts"

export const enchantmentTemplate: RuleTemplate = {
  id: "template:subclass:wizard-enchantment",
  campaign_id: "",
  kind: "subclass",
  slug: "wizard-enchantment",
  name: "Школа Очарования",
  description: "Очарователи манипулируют разумом окружающих, заставляя их подчиняться своей воле, и мастерски плетут социальные иллюзии.",
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
    choices: [
      {
        key: "enchantment-savant-spells",
        label: "Заклинания Очарования",
        target: "trait",
        options: [],
        options_query: "spell:school=enchantment",
        count: 2
      }
    ],
    mechanics: [
      {
        id: "enchantment-savant-l3",
        type: "grant",
        target: "trait",
        key: "enchantment-savant",
        sourceKey: "enchantment-savant-l3-1",
        presentation: {
          authorExplanation: "[PHB 2014] Золото и время, которые вы тратите на копирование заклинания Очарования в свою книгу заклинаний, уменьшаются вдвое.",
        }
      },
      {
        id: "hypnotic-gaze-l3",
        type: "action",
        key: "action:hypnotic-gaze",
        label: "Гипнотический взгляд",
        economy: "action",
        range: { kind: "ranged", normal: 5, unit: "ft" },
        sourceKey: "hypnotic-gaze-l3-1",
        presentation: {
          authorExplanation: "Действием вы можете очаровать существо в пределах 5 футов (спасбросок Мудрости). Завороженная цель обездвижена (Speed 0) и ошеломлена, пока вы поддерживаете эффект действием каждый свой ход (сохраняя дистанцию 5 футов). Завершается, если цель получает урон. После успеха или провала цель иммунна к эффекту до долгого отдыха.",
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
        type: "action",
        key: "action:instinctive-charm",
        label: "Инстинктивное очарование",
        economy: "reaction",
        range: { kind: "ranged", normal: 30, unit: "ft" },
        sourceKey: "instinctive-charm-l6-1",
        presentation: {
          authorExplanation: "Реакцией, когда по вам совершают атаку существом в пределах 30 футов, вы заставляете атакующего выбрать другую случайную цель в пределах его досягаемости (спасбросок Мудрости для отмены). Если атакующий преуспел в спасе, он получает иммунитет на эту способность до долгого отдыха.",
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
          authorExplanation: "Когда вы накладываете заклинание Очарования 1-го уровня или выше, которое выбирает целью только одно существо, вы можете сделать так, чтобы оно нацелилось на второе существо.",
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
          authorExplanation: "Накладывая заклинания Очарования для очарования существ, вы можете заставить одно из существ забыть факт наложения (если оно проваливает спасбросок Интеллекта). Вы также можете заставить его забыть до 1 часа воспоминаний за время, пока оно было очаровано.",
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
