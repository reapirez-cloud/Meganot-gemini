import type { RuleTemplate, RuleTemplateLevel } from "./types.ts"
import { WIZARD_SUBCLASS_PARENT_CATALOG_KEY, WIZARD_SUBCLASS_UNLOCK_LEVEL, type WizardSubclassPackageValidation } from "./wizardSubclasses.ts"

// ==========================================
// NECROMANCY (Legacy - 2014 Compatible)
// ==========================================

export const necromancyTemplate: RuleTemplate = {
  id: "template:subclass:wizard-necromancy",
  campaign_id: "",
  kind: "subclass",
  slug: "wizard-necromancy",
  name: "Школа некромантии",
  description: "Волшебники школы Некромантии изучают космические силы жизни, смерти и нежизни, поднимая мёртвых и вытягивая чужую жизненную силу.",
  version: 1,
  catalog_key: "subclass:wizard:necromancy",
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

export const necromancyLevels: RuleTemplateLevel[] = [
  {
    id: "level:3:wizard-necromancy",
    template_id: necromancyTemplate.id,
    level: 3,
    choices: [],
    mechanics: [
      {
        id: "necromancy-savant-l3",
        type: "grant",
        target: "trait",
        key: "necromancy-savant",
        sourceKey: "necromancy-savant-l3-1",
        presentation: {
          authorExplanation: "Время и стоимость копирования заклинаний Некромантии в вашу книгу уменьшены вдвое.",
        }
      },
      {
        id: "grim-harvest-l3",
        type: "grant",
        target: "trait",
        key: "grim-harvest",
        sourceKey: "grim-harvest-l3-1",
        presentation: {
          authorExplanation: "Раз в ход, когда вы убиваете одно или более существ заклинанием 1-го уровня или выше, вы восстанавливаете хиты, равные удвоенному уровню заклинания (утроенному, если это некромантия). Не работает на нежить и конструктов.",
        }
      }
    ]
  },
  {
    id: "level:6:wizard-necromancy",
    template_id: necromancyTemplate.id,
    level: 6,
    choices: [],
    mechanics: [
      {
        id: "undead-thralls-l6",
        type: "grant",
        target: "trait",
        key: "undead-thralls",
        sourceKey: "undead-thralls-l6-1",
        presentation: {
          authorExplanation: "Вы добавляете Восстание мертвецов в книгу заклинаний. При его накладывании вы создаёте на одного мертвеца больше, и созданная нежить получает бонус к макс. хитам (равный вашему уровню волшебника) и к урону (равный бонусу мастерства).",
        }
      }
    ]
  },
  {
    id: "level:10:wizard-necromancy",
    template_id: necromancyTemplate.id,
    level: 10,
    choices: [],
    mechanics: [
      {
        id: "inured-to-undeath-l10",
        type: "grant",
        target: "trait",
        key: "inured-to-undeath",
        sourceKey: "inured-to-undeath-l10-1",
        presentation: {
          authorExplanation: "Вы получаете сопротивление к некротическому урону, и ваш максимум хитов не может быть уменьшен.",
        }
      }
    ]
  },
  {
    id: "level:14:wizard-necromancy",
    template_id: necromancyTemplate.id,
    level: 14,
    choices: [],
    mechanics: [
      {
        id: "command-undead-l14",
        type: "grant",
        target: "trait",
        key: "command-undead",
        sourceKey: "command-undead-l14-1",
        presentation: {
          authorExplanation: "Действием вы можете попытаться взять под контроль нежить в пределах 60 футов. Она должна преуспеть в спасброске Харизмы. Нежить с Интеллектом 8+ получает преимущество. Умная нежить (12+) повторяет спасбросок каждый час.",
        }
      }
    ]
  }
]

export const necromancyPackage: WizardSubclassPackageValidation = {
  template: necromancyTemplate,
  parent: { id: "template:class:wizard", kind: "class", catalog_key: WIZARD_SUBCLASS_PARENT_CATALOG_KEY },
  levels: necromancyLevels,
}
