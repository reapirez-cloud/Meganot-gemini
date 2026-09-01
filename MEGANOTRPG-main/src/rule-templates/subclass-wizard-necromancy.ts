import type { RuleTemplate, RuleTemplateLevel } from "./types.ts"
import { WIZARD_SUBCLASS_PARENT_CATALOG_KEY, WIZARD_SUBCLASS_UNLOCK_LEVEL, type WizardSubclassPackageValidation } from "./wizardSubclasses.ts"

export const necromancyTemplate: RuleTemplate = {
  id: "template:subclass:wizard-necromancy",
  campaign_id: "",
  kind: "subclass",
  slug: "wizard-necromancy",
  name: "Некромант",
  description: "Некроманты изучают магию жизни и смерти, управляя жизненной энергией и поднимая мертвых себе в услужение.",
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
    choices: [
      {
        key: "necromancy-savant-spells",
        label: "Заклинания Некромантии",
        target: "trait",
        options: [],
        options_query: "spell:school=necromancy",
        count: 2
      }
    ],
    mechanics: [
      {
        id: "necromancy-savant-l3",
        type: "grant",
        target: "trait",
        key: "necromancy-savant",
        sourceKey: "necromancy-savant-l3-1",
        presentation: {
          authorExplanation: "[PHB 2014] Золото и время, которые вы тратите на копирование заклинания Некромантии в свою книгу заклинаний, уменьшаются вдвое.",
        }
      },
      {
        id: "grim-harvest-l3",
        type: "grant",
        target: "trait",
        key: "grim-harvest",
        sourceKey: "grim-harvest-l3-1",
        presentation: {
          authorExplanation: "Раз в ход, когда вы убиваете одно или несколько существ заклинанием 1-го уровня или выше, вы восстанавливаете хиты, равные удвоенному уровню заклинания (или утроенному, если это заклинание Некромантии). Это не работает на конструктов и нежить.",
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
          authorExplanation: "Вы получаете заклинание Восставший труп (Animate Dead). При его касте вы можете выбрать дополнительную цель. Ваша созданная нежить получает бонус к максимуму хитов, равный вашему уровню волшебника, и добавляет ваш бонус мастерства к своим броскам урона оружием.",
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
          authorExplanation: "Вы получаете сопротивление некротическому урону, и максимум ваших хитов не может быть уменьшен никакими эффектами.",
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
          authorExplanation: "Действием вы можете попытаться взять под контроль нежить в 60 футах. Цель делает спасбросок Харизмы. Нежить с Интеллектом 8+ получает преимущество на спасбросок, а если Интеллект 12+, то цель может повторять спасбросок каждый час. Провал дает вам постоянный контроль над ней.",
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
