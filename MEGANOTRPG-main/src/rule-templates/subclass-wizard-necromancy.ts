import type { RuleTemplate, RuleTemplateLevel } from "./types.ts"
import { WIZARD_SUBCLASS_PARENT_CATALOG_KEY, WIZARD_SUBCLASS_UNLOCK_LEVEL, type WizardSubclassPackageValidation } from "./wizardSubclasses.ts"

// ==========================================
// NECROMANCY (Legacy / 2014)
// ==========================================

export const necromancyTemplate: RuleTemplate = {
  id: "template:subclass:wizard-necromancy",
  campaign_id: "",
  kind: "subclass",
  slug: "wizard-necromancy",
  name: "Школа некромантии",
  description: "Волшебники школы Некромантии изучают магию, манипулирующую энергиями жизни и смерти.",
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
          authorExplanation: "Один раз в ход, когда вы убиваете существо заклинанием 1-го уровня или выше, вы восстанавливаете хиты, равные удвоенному уровню заклинания (или утроенному, если это заклинание Некромантии).",
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
          authorExplanation: "Вы добавляете Восстание мертвецов в свою книгу. При его накладывании вы можете поднять дополнительного мертвеца. Созданные существа получают бонус к максимуму хитов (равный уровню волшебника) и бонус к урону (равный бонусу мастерства).",
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
          authorExplanation: "Вы получаете сопротивление к некротическому урону, и ваш максимум хитов больше не может быть уменьшен.",
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
          authorExplanation: "Вы можете действием попытаться подчинить себе нежить (цель совершает спасбросок Харизмы, нежить с высоким Интеллектом получает преимущество или иммунитет).",
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
