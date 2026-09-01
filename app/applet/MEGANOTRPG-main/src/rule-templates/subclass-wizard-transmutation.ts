import type { RuleTemplate, RuleTemplateLevel } from "./types.ts"
import { WIZARD_SUBCLASS_PARENT_CATALOG_KEY, WIZARD_SUBCLASS_UNLOCK_LEVEL, type WizardSubclassPackageValidation } from "./wizardSubclasses.ts"

// ==========================================
// TRANSMUTATION (Legacy - 2014 Compatible)
// ==========================================

export const transmutationTemplate: RuleTemplate = {
  id: "template:subclass:wizard-transmutation",
  campaign_id: "",
  kind: "subclass",
  slug: "wizard-transmutation",
  name: "Школа преобразования",
  description: "Волшебники школы Преобразования изменяют физические свойства материи и существ, стремясь к полному контролю над физическим миром.",
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
          authorExplanation: "Вы можете временно изменить физические свойства одного немагического предмета (дерево, камень, железо, медь или серебро), превратив его в другой материал из этого списка. Требует 10 минут за 1 кубический фут, действует 1 час.",
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
          authorExplanation: "Создание камня (8 часов), дающего носителю один из эффектов: Тёмное зрение 60 фт., скорость +10 фт., владение спасбросками Телосложения, или сопротивление стихии. Эффект можно менять накладывая заклинание Преобразования 1+ уровня.",
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
          authorExplanation: "Вы добавляете заклинание Превращение в свою книгу заклинаний (если его нет). Вы можете наложить его на себя один раз без траты ячейки заклинания для превращения в зверя показателя опасности 1 или ниже.",
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
          authorExplanation: "Действием вы можете уничтожить свой Камень Преобразователя, чтобы произвести эффект: полное исцеление и снятие проклятий, возвращение к жизни мертвого (Воскрешение), возвращение молодости, или превращение любого немагического предмета.",
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
