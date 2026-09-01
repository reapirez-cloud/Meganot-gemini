import type { RuleTemplate, RuleTemplateLevel } from "./types.ts"
import { WIZARD_SUBCLASS_PARENT_CATALOG_KEY, WIZARD_SUBCLASS_UNLOCK_LEVEL, type WizardSubclassPackageValidation } from "./wizardSubclasses.ts"

// ==========================================
// TRANSMUTATION (Legacy / 2014)
// ==========================================

export const transmutationTemplate: RuleTemplate = {
  id: "template:subclass:wizard-transmutation",
  campaign_id: "",
  kind: "subclass",
  slug: "wizard-transmutation",
  name: "Школа преобразования",
  description: "Волшебники школы Преобразования изменяют энергию и материю, манипулируя фундаментальными законами природы.",
  version: 1,
  catalog_key: "subclass:wizard:transmutation",
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

export const transmutationLevels: RuleTemplateLevel[] = [
  {
    id: "level:3:wizard-transmutation",
    template_id: transmutationTemplate.id,
    level: 3,
    choices: [],
    mechanics: [
      {
        id: "transmutation-savant-l3",
        type: "grant",
        target: "trait",
        key: "transmutation-savant",
        sourceKey: "transmutation-savant-l3-1",
        presentation: {
          authorExplanation: "Время и стоимость копирования заклинаний Преобразования в вашу книгу уменьшены вдвое.",
        }
      },
      {
        id: "minor-alchemy-l3",
        type: "grant",
        target: "trait",
        key: "minor-alchemy",
        sourceKey: "minor-alchemy-l3-1",
        presentation: {
          authorExplanation: "Вы можете потратить 10 минут, чтобы изменить физические свойства одного неволшебного предмета (дерево, камень, железо, медь или серебро) на 1 час.",
        }
      }
    ]
  },
  {
    id: "level:6:wizard-transmutation",
    template_id: transmutationTemplate.id,
    level: 6,
    choices: [],
    mechanics: [
      {
        id: "transmuters-stone-l6",
        type: "grant",
        target: "trait",
        key: "transmuters-stone",
        sourceKey: "transmuters-stone-l6-1",
        presentation: {
          authorExplanation: "Вы можете создать камень трансмутатора, дающий носителю один эффект на выбор (тёмное зрение, скорость, владение спасброском Телосложения или сопротивление урону).",
        }
      }
    ]
  },
  {
    id: "level:10:wizard-transmutation",
    template_id: transmutationTemplate.id,
    level: 10,
    choices: [],
    mechanics: [
      {
        id: "shapechanger-l10",
        type: "grant",
        target: "trait",
        key: "shapechanger",
        sourceKey: "shapechanger-l10-1",
        presentation: {
          authorExplanation: "Вы добавляете заклинание Превращение (Polymorph) в свою книгу. Вы можете наложить его на себя без траты ячейки, превратившись в зверя с показателем опасности 1 или ниже.",
        }
      }
    ]
  },
  {
    id: "level:14:wizard-transmutation",
    template_id: transmutationTemplate.id,
    level: 14,
    choices: [],
    mechanics: [
      {
        id: "master-transmuter-l14",
        type: "grant",
        target: "trait",
        key: "master-transmuter",
        sourceKey: "master-transmuter-l14-1",
        presentation: {
          authorExplanation: "Вы можете разрушить свой камень трансмутатора, чтобы произвести мощный эффект (Полное исцеление, Возвращение к жизни, омоложение или превращение объекта).",
        }
      }
    ]
  }
]

export const transmutationPackage: WizardSubclassPackageValidation = {
  template: transmutationTemplate,
  parent: { id: "template:class:wizard", kind: "class", catalog_key: WIZARD_SUBCLASS_PARENT_CATALOG_KEY },
  levels: transmutationLevels,
}
