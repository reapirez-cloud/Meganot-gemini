import type { RuleTemplate, RuleTemplateLevel } from "./types.ts"
import { WIZARD_SUBCLASS_PARENT_CATALOG_KEY, WIZARD_SUBCLASS_UNLOCK_LEVEL, type WizardSubclassPackageValidation } from "./wizardSubclasses.ts"

// ==========================================
// DIVINER (PHB 2024)
// ==========================================

export const divinerTemplate: RuleTemplate = {
  id: "template:subclass:wizard-diviner",
  campaign_id: "",
  kind: "subclass",
  slug: "wizard-diviner",
  name: "Прорицатель",
  description: "Волшебники школы Прорицания раздвигают пелену времени и пространства, узнавая скрытое и предвидя события.",
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
    choices: [],
    mechanics: [
      {
        id: "divination-savant-l3",
        type: "grant",
        target: "trait",
        key: "divination-savant",
        sourceKey: "divination-savant-l3-1",
        presentation: {
          authorExplanation: "Время и стоимость копирования заклинаний Прорицания в вашу книгу уменьшены вдвое.",
        }
      },
      {
        id: "portent-l3",
        type: "grant",
        target: "trait",
        key: "portent",
        sourceKey: "portent-l3-1",
        presentation: {
          authorExplanation: "После каждого долгого отдыха вы бросаете 2к20. Вы можете заменить любой бросок атаки, спасбросок или проверку характеристики на один из этих результатов (использовав его) до броска кубика.",
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
          authorExplanation: "При накладывании заклинания Прорицания 2+ уровня вы восстанавливаете потраченную ячейку заклинаний, уровень которой ниже, чем уровень наложенного заклинания.",
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
        id: "the-third-eye-l10",
        type: "grant",
        target: "trait",
        key: "the-third-eye",
        sourceKey: "the-third-eye-l10-1",
        presentation: {
          authorExplanation: "Действием вы увеличиваете своё восприятие: тёмное зрение до 120 футов, эфирное зрение, чтение любых языков или невидимость. До короткого или долгого отдыха.",
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
        type: "grant",
        target: "trait",
        key: "greater-portent",
        sourceKey: "greater-portent-l14-1",
        presentation: {
          authorExplanation: "Знамение (Portent) теперь даёт вам 3 кубика к20 вместо 2 после долгого отдыха.",
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
