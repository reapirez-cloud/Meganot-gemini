import type { RuleTemplate, RuleTemplateLevel } from "./types.ts"
import { WIZARD_SUBCLASS_PARENT_CATALOG_KEY, WIZARD_SUBCLASS_UNLOCK_LEVEL, type WizardSubclassPackageValidation } from "./wizardSubclasses.ts"

export const conjurationTemplate: RuleTemplate = {
  id: "template:subclass:wizard-conjuration",
  campaign_id: "",
  kind: "subclass",
  slug: "wizard-conjuration",
  name: "Школа Вызова",
  description: "Призыватели специализируются на заклинаниях, которые создают предметы и существ из ничего или перемещают их в пространстве.",
  version: 1,
  catalog_key: "subclass:wizard:conjuration",
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

export const conjurationLevels: RuleTemplateLevel[] = [
  {
    id: "level:3:wizard-conjuration",
    template_id: conjurationTemplate.id,
    level: 3,
    choices: [
      {
        key: "conjuration-savant-spells",
        label: "Заклинания Вызова",
        target: "trait",
        options: [],
        options_query: "spell:school=conjuration",
        count: 2
      }
    ],
    mechanics: [
      {
        id: "conjuration-savant-l3",
        type: "grant",
        target: "trait",
        key: "conjuration-savant",
        sourceKey: "conjuration-savant-l3-1",
        presentation: {
          authorExplanation: "[PHB 2014] Золото и время, которые вы тратите на копирование заклинания Вызова в свою книгу заклинаний, уменьшаются вдвое.",
        }
      },
      {
        id: "minor-conjuration-l3",
        type: "action",
        key: "action:minor-conjuration",
        label: "Малый вызов",
        economy: "action",
        sourceKey: "minor-conjuration-l3-1",
        presentation: {
          authorExplanation: "Действием вы можете призвать неодушевленный предмет не больше 3 футов и не тяжелее 10 фунтов в вашей руке или на земле. Объект излучает тусклый свет (5 футов) и исчезает через 1 час, при получении урона или если вы используете это умение снова.",
        }
      }
    ]
  },
  {
    id: "level:6:wizard-conjuration",
    template_id: conjurationTemplate.id,
    level: 6,
    choices: [],
    mechanics: [
      {
        id: "benign-transposition-l6",
        type: "action",
        key: "action:benign-transposition",
        label: "Безвредное перемещение",
        economy: "bonus_action",
        range: { kind: "ranged", normal: 30, unit: "ft" },
        resourceCosts: [{ key: "resource:benign-transposition", amount: 1 }],
        sourceKey: "benign-transposition-l6-1",
        presentation: {
          authorExplanation: "Действием вы можете телепортироваться на 30 футов в свободное видимое пространство. Альтернативно, вы можете поменяться местами с согласным существом Малого или Среднего размера. Это умение восстанавливается после долгого отдыха или после наложения заклинания Вызова 1-го уровня и выше.",
        }
      },
      {
        id: "benign-transposition-resource-l6",
        type: "resource",
        key: "resource:benign-transposition",
        label: "Безвредное перемещение (использование)",
        max: 1,
        recharge: ["long_rest"]
      }
    ]
  },
  {
    id: "level:10:wizard-conjuration",
    template_id: conjurationTemplate.id,
    level: 10,
    choices: [],
    mechanics: [
      {
        id: "focused-conjuration-l10",
        type: "grant",
        target: "trait",
        key: "focused-conjuration",
        sourceKey: "focused-conjuration-l10-1",
        presentation: {
          authorExplanation: "Пока вы концентрируетесь на заклинании Вызова, получение урона не может нарушить вашу концентрацию на этом заклинании.",
        }
      }
    ]
  },
  {
    id: "level:14:wizard-conjuration",
    template_id: conjurationTemplate.id,
    level: 14,
    choices: [],
    mechanics: [
      {
        id: "durable-summons-l14",
        type: "grant",
        target: "trait",
        key: "durable-summons",
        sourceKey: "durable-summons-l14-1",
        presentation: {
          authorExplanation: "Любое существо, которое вы призываете или создаете с помощью заклинания Вызова, получает 30 временных хитов.",
        }
      }
    ]
  }
]

export const conjurationPackage: WizardSubclassPackageValidation = {
  template: conjurationTemplate,
  parent: { id: "template:class:wizard", kind: "class", catalog_key: WIZARD_SUBCLASS_PARENT_CATALOG_KEY },
  levels: conjurationLevels,
}
