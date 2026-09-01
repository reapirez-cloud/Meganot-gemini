import type { RuleTemplate, RuleTemplateLevel } from "./types.ts"
import { WIZARD_SUBCLASS_PARENT_CATALOG_KEY, WIZARD_SUBCLASS_UNLOCK_LEVEL, type WizardSubclassPackageValidation } from "./wizardSubclasses.ts"

// ==========================================
// EVOKER (PHB 2024)
// ==========================================

export const evokerTemplate: RuleTemplate = {
  id: "template:subclass:wizard-evoker",
  campaign_id: "",
  kind: "subclass",
  slug: "wizard-evoker",
  name: "Эвокер",
  description: "Волшебники школы Воплощения фокусируются на создании магической энергии и разрушении.",
  version: 1,
  catalog_key: "subclass:wizard:evoker",
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

export const evokerLevels: RuleTemplateLevel[] = [
  {
    id: "level:3:wizard-evoker",
    template_id: evokerTemplate.id,
    level: 3,
    choices: [],
    mechanics: [
      {
        id: "evocation-savant-l3",
        type: "grant",
        target: "trait",
        key: "evocation-savant",
        sourceKey: "evocation-savant-l3-1",
        presentation: {
          authorExplanation: "Время и стоимость копирования заклинаний Воплощения в вашу книгу уменьшены вдвое.",
        }
      },
      {
        id: "sculpt-spells-l3",
        type: "grant",
        target: "trait",
        key: "sculpt-spells",
        sourceKey: "sculpt-spells-l3-1",
        presentation: {
          authorExplanation: "При накладывании заклинания Воплощения, действующего по площади, вы можете выбрать до 1 + уровень заклинания существ. Они автоматически преуспевают в спасброске и не получают урона.",
        }
      }
    ]
  },
  {
    id: "level:6:wizard-evoker",
    template_id: evokerTemplate.id,
    level: 6,
    choices: [],
    mechanics: [
      {
        id: "potent-cantrip-l6",
        type: "grant",
        target: "trait",
        key: "potent-cantrip",
        sourceKey: "potent-cantrip-l6-1",
        presentation: {
          authorExplanation: "Ваши заговоры, требующие спасброска, наносят половину урона даже при успехе цели (но без дополнительных эффектов).",
        }
      }
    ]
  },
  {
    id: "level:10:wizard-evoker",
    template_id: evokerTemplate.id,
    level: 10,
    choices: [],
    mechanics: [
      {
        id: "empowered-evocation-l10",
        type: "grant",
        target: "trait",
        key: "empowered-evocation",
        sourceKey: "empowered-evocation-l10-1",
        presentation: {
          authorExplanation: "Вы добавляете модификатор Интеллекта к одному броску урона от любого вашего заклинания Воплощения.",
        }
      }
    ]
  },
  {
    id: "level:14:wizard-evoker",
    template_id: evokerTemplate.id,
    level: 14,
    choices: [],
    mechanics: [
      {
        id: "overchannel-l14",
        type: "grant",
        target: "trait",
        key: "overchannel",
        sourceKey: "overchannel-l14-1",
        presentation: {
          authorExplanation: "При накладывании заклинания волшебника 1–5 уровней, наносящего урон, вы можете максимизировать урон. Первое использование безопасно, каждое последующее до долгого отдыха наносит вам некротический урон.",
        }
      }
    ]
  }
]

export const evokerPackage: WizardSubclassPackageValidation = {
  template: evokerTemplate,
  parent: { id: "template:class:wizard", kind: "class", catalog_key: WIZARD_SUBCLASS_PARENT_CATALOG_KEY },
  levels: evokerLevels,
}
