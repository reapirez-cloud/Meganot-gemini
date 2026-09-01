import type { RuleTemplate, RuleTemplateLevel } from "./types.ts"
import { WIZARD_SUBCLASS_PARENT_CATALOG_KEY, WIZARD_SUBCLASS_UNLOCK_LEVEL, type WizardSubclassPackageValidation } from "./wizardSubclasses.ts"

// ==========================================
// ILLUSIONIST (PHB 2024)
// ==========================================

export const illusionistTemplate: RuleTemplate = {
  id: "template:subclass:wizard-illusionist",
  campaign_id: "",
  kind: "subclass",
  slug: "wizard-illusionist",
  name: "Иллюзионист",
  description: "Волшебники школы Иллюзии искривляют реальность, создавая обманы разума и фантомы.",
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
    choices: [],
    mechanics: [
      {
        id: "illusion-savant-l3",
        type: "grant",
        target: "trait",
        key: "illusion-savant",
        sourceKey: "illusion-savant-l3-1",
        presentation: {
          authorExplanation: "Время и стоимость копирования заклинаний Иллюзии в вашу книгу уменьшены вдвое.",
        }
      },
      {
        id: "improved-minor-illusion-l3",
        type: "grant",
        target: "trait",
        key: "improved-minor-illusion",
        sourceKey: "improved-minor-illusion-l3-1",
        presentation: {
          authorExplanation: "Вы изучаете заговор Малая иллюзия (если его нет). При накладывании вы можете создать и звук, и изображение одновременно. Иллюзия может быть наложена бонусным действием.",
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
        type: "grant",
        target: "trait",
        key: "malleable-illusions",
        sourceKey: "malleable-illusions-l6-1",
        presentation: {
          authorExplanation: "Пока длится ваше заклинание иллюзии длительностью 1 минута и более, вы можете бонусным действием изменить природу иллюзии (в пределах параметров заклинания).",
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
        id: "illusory-self-l10",
        type: "grant",
        target: "trait",
        key: "illusory-self",
        sourceKey: "illusory-self-l10-1",
        presentation: {
          authorExplanation: "Реакцией на попадание атаки вы можете создать иллюзорного двойника. Атака автоматически промахивается. Долгого отдыха или траты ячейки 2+ уровня для перезарядки.",
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
          authorExplanation: "Когда вы накладываете заклинание иллюзии 1+ уровня бонусным действием, один неодушевлённый предмет в иллюзии становится реальным на 1 минуту.",
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
