import type { RuleTemplate, RuleTemplateLevel } from "./types.ts"
import { WIZARD_SUBCLASS_PARENT_CATALOG_KEY, WIZARD_SUBCLASS_UNLOCK_LEVEL, type WizardSubclassPackageValidation } from "./wizardSubclasses.ts"

export const evokerTemplate: RuleTemplate = {
  id: "template:subclass:wizard-evoker",
  campaign_id: "",
  kind: "subclass",
  slug: "wizard-evoker",
  name: "Эвокер",
  description: "Эвокеры (Воплотители) фокусируются на магической энергии, создающей мощные стихийные эффекты — лед, пламя, гром, молнии и кислоту.",
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
    choices: [
      {
        key: "evocation-savant-spells",
        label: "Заклинания Воплощения",
        target: "trait",
        options: [],
        options_query: "spell:school=evocation",
        count: 2
      }
    ],
    mechanics: [
      {
        id: "evocation-savant-l3",
        type: "grant",
        target: "trait",
        key: "evocation-savant",
        sourceKey: "evocation-savant-l3-1",
        presentation: {
          authorExplanation: "[PHB 2024] Вы бесплатно добавляете два заклинания школы Воплощения в свою книгу. Эти заклинания всегда считаются подготовленными и не идут в счет лимита. При повышении уровня волшебника вы можете заменить одно из этих заклинаний на другое заклинание Воплощения.",
        }
      },
      {
        id: "sculpt-spells-l3",
        type: "grant",
        target: "trait",
        key: "sculpt-spells",
        sourceKey: "sculpt-spells-l3-1",
        presentation: {
          authorExplanation: "Создавая область эффекта заклинания Воплощения, вы можете выбрать количество существ (до 1 + уровень заклинания), которые автоматически преуспеют в спасброске и не получат урон.",
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
          authorExplanation: "[PHB 2024] Если вы промахиваетесь по существу броском атаки заговора или оно успешно проходит спасбросок от него, цель получает половину урона (но не подвергается дополнительным эффектам).",
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
          authorExplanation: "Вы можете добавить свой модификатор Интеллекта к одному броску урона любого заклинания Воплощения, которое вы накладываете.",
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
          authorExplanation: "При накладывании заклинания Воплощения 1-5 уровня, вы можете нанести им максимальный урон. Первое использование безопасно, каждое последующее до долгого отдыха наносит вам некротический урон (2d12 за уровень заклинания), игнорирующий сопротивления и иммунитеты.",
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
