import type { RuleTemplate, RuleTemplateLevel } from "./types.ts"
import { WIZARD_SUBCLASS_PARENT_CATALOG_KEY, WIZARD_SUBCLASS_UNLOCK_LEVEL, type WizardSubclassPackageValidation } from "./wizardSubclasses.ts"

export const divinerTemplate: RuleTemplate = {
  id: "template:subclass:wizard-diviner",
  campaign_id: "",
  kind: "subclass",
  slug: "wizard-diviner",
  name: "Прорицатель",
  description: "Прорицатели раздвигают границы пространства и времени, используя свою магию, чтобы прозревать сокрытое и предвидеть грядущее.",
  version: 1,
  catalog_key: "subclass:wizard:diviner",
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

export const divinerLevels: RuleTemplateLevel[] = [
  {
    id: "level:3:wizard-diviner",
    template_id: divinerTemplate.id,
    level: 3,
    choices: [
      {
        key: "divination-savant-spells",
        label: "Заклинания Прорицания",
        target: "trait",
        options: [],
        options_query: "spell:school=divination",
        count: 2
      }
    ],
    mechanics: [
      {
        id: "divination-savant-l3",
        type: "grant",
        target: "trait",
        key: "divination-savant",
        sourceKey: "divination-savant-l3-1",
        presentation: {
          authorExplanation: "[PHB 2024] Вы бесплатно добавляете два заклинания школы Прорицания в свою книгу. Они всегда подготовлены и не идут в счет лимита. При повышении уровня можно заменить одно из них.",
        }
      },
      {
        id: "portent-l3",
        type: "resource",
        key: "resource:portent",
        label: "Кубики Знамения",
        max: 2,
        recharge: ["long_rest"],
        sourceKey: "portent-l3-1",
        presentation: {
          authorExplanation: "После долгого отдыха вы кидаете 2к20 и записываете результаты. До следующего отдыха вы можете заменить любой бросок атаки, спасбросок или проверку характеристики (свой или чужой) одним из этих результатов до совершения броска.",
        }
      }
    ]
  },
  {
    id: "level:6:wizard-diviner",
    template_id: divinerTemplate.id,
    level: 6,
    choices: [],
    mechanics: [
      {
        id: "expert-divination-l6",
        type: "grant",
        target: "trait",
        key: "expert-divination",
        sourceKey: "expert-divination-l6-1",
        presentation: {
          authorExplanation: "Когда вы накладываете заклинание Прорицания 2-го уровня или выше (тратя ячейку), вы восстанавливаете одну потраченную ячейку заклинаний, уровень которой ниже наложенного заклинания (максимум 5-й уровень).",
        }
      }
    ]
  },
  {
    id: "level:10:wizard-diviner",
    template_id: divinerTemplate.id,
    level: 10,
    choices: [],
    mechanics: [
      {
        id: "third-eye-resource-l10",
        type: "resource",
        key: "resource:third-eye",
        label: "Третий глаз (использование)",
        max: 1,
        recharge: ["short_rest", "long_rest"]
      },
      {
        id: "third-eye-l10",
        type: "action",
        key: "action:third-eye",
        label: "Третий глаз",
        economy: "bonus_action",
        resourceCosts: [{ key: "resource:third-eye", amount: 1 }],
        sourceKey: "third-eye-l10-1",
        presentation: {
          authorExplanation: "[PHB 2024] Бонусным действием вы можете наложить заклинание Видение невидимого (See Invisibility) без использования ячейки. Кроме того, вы можете бонусным действием получить Темное зрение (120 футов) или Понимание языков до конца следующего отдыха.",
        }
      }
    ]
  },
  {
    id: "level:14:wizard-diviner",
    template_id: divinerTemplate.id,
    level: 14,
    choices: [],
    mechanics: [
      {
        id: "greater-portent-l14",
        type: "resource",
        grantOperation: "REPLACE",
        key: "resource:portent",
        label: "Кубики Знамения (Великое)",
        max: 3,
        recharge: ["long_rest"],
        sourceKey: "greater-portent-l14-1",
        presentation: {
          authorExplanation: "Ваше Знамение становится сильнее: теперь после долгого отдыха вы кидаете 3к20 вместо двух.",
        }
      }
    ]
  }
]

export const divinerPackage: WizardSubclassPackageValidation = {
  template: divinerTemplate,
  parent: { id: "template:class:wizard", kind: "class", catalog_key: WIZARD_SUBCLASS_PARENT_CATALOG_KEY },
  levels: divinerLevels,
}
