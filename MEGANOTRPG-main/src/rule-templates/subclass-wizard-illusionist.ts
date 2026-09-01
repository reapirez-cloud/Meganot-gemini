import type { RuleTemplate, RuleTemplateLevel } from "./types.ts"
import { WIZARD_SUBCLASS_PARENT_CATALOG_KEY, WIZARD_SUBCLASS_UNLOCK_LEVEL, type WizardSubclassPackageValidation } from "./wizardSubclasses.ts"

export const illusionistTemplate: RuleTemplate = {
  id: "template:subclass:wizard-illusionist",
  campaign_id: "",
  kind: "subclass",
  slug: "wizard-illusionist",
  name: "Иллюзионист",
  description: "Иллюзионисты — мастера обмана, создающие невероятно правдоподобные фантомы, чтобы путать чувства и разум своих врагов.",
  version: 1,
  catalog_key: "subclass:wizard:illusionist",
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

export const illusionistLevels: RuleTemplateLevel[] = [
  {
    id: "level:3:wizard-illusionist",
    template_id: illusionistTemplate.id,
    level: 3,
    choices: [
      {
        key: "illusion-savant-spells",
        label: "Заклинания Иллюзии",
        target: "trait",
        options: [],
        options_query: "spell:school=illusion",
        count: 2
      }
    ],
    mechanics: [
      {
        id: "illusion-savant-l3",
        type: "grant",
        target: "trait",
        key: "illusion-savant",
        sourceKey: "illusion-savant-l3-1",
        presentation: {
          authorExplanation: "[PHB 2024] Вы бесплатно добавляете два заклинания школы Иллюзии в свою книгу. Они всегда подготовлены и не идут в счет лимита. При повышении уровня можно заменить одно из них.",
        }
      },
      {
        id: "improved-minor-illusion-l3",
        type: "spell",
        key: "spell:minor-illusion",
        payload: {
          spell: { name: "Малая иллюзия", level: 0, school: "illusion" },
          preparation: { mode: "always_prepared" },
          methods: [{ key: "illusionist-cantrip", kind: "spellcasting" }]
        },
        sourceKey: "improved-minor-illusion-l3-1",
        presentation: {
          authorExplanation: "[PHB 2024] Вы получаете заговор Малая иллюзия. Вы можете накладывать его Бонусным действием, а также можете создавать звук и образ одновременно (и менять их бонусным действием).",
        }
      }
    ]
  },
  {
    id: "level:6:wizard-illusionist",
    template_id: illusionistTemplate.id,
    level: 6,
    choices: [],
    mechanics: [
      {
        id: "malleable-illusions-l6",
        type: "action",
        key: "action:malleable-illusions",
        label: "Изменение иллюзий",
        economy: "bonus_action",
        sourceKey: "malleable-illusions-l6-1",
        presentation: {
          authorExplanation: "[PHB 2024] Вы можете накладывать заклинания Иллюзии без вербальных компонентов. Также вы можете бонусным действием изменить природу активной иллюзии (в рамках её заклинания).",
        }
      }
    ]
  },
  {
    id: "level:10:wizard-illusionist",
    template_id: illusionistTemplate.id,
    level: 10,
    choices: [],
    mechanics: [
      {
        id: "illusory-self-resource-l10",
        type: "resource",
        key: "resource:illusory-self",
        label: "Иллюзорный двойник (использование)",
        max: 1,
        recharge: ["short_rest", "long_rest"]
      },
      {
        id: "illusory-self-l10",
        type: "action",
        key: "action:illusory-self",
        label: "Иллюзорный двойник",
        economy: "reaction",
        resourceCosts: [{ key: "resource:illusory-self", amount: 1 }],
        sourceKey: "illusory-self-l10-1",
        presentation: {
          authorExplanation: "[PHB 2024] Когда по вам попадает атака, вы можете реакцией создать иллюзорного двойника, заставляя атаку промахнуться. После использования вы можете восстановить это свойство коротким/долгим отдыхом ИЛИ потратив ячейку 2+ уровня.",
        }
      }
    ]
  },
  {
    id: "level:14:wizard-illusionist",
    template_id: illusionistTemplate.id,
    level: 14,
    choices: [],
    mechanics: [
      {
        id: "illusory-reality-l14",
        type: "grant",
        target: "trait",
        key: "illusory-reality",
        sourceKey: "illusory-reality-l14-1",
        presentation: {
          authorExplanation: "Когда вы накладываете заклинание Иллюзии 1-го уровня или выше, вы можете сделать один неживой объект, являющийся частью иллюзии, реальным на 1 минуту (он не может наносить урон напрямую).",
        }
      }
    ]
  }
]

export const illusionistPackage: WizardSubclassPackageValidation = {
  template: illusionistTemplate,
  parent: { id: "template:class:wizard", kind: "class", catalog_key: WIZARD_SUBCLASS_PARENT_CATALOG_KEY },
  levels: illusionistLevels,
}
