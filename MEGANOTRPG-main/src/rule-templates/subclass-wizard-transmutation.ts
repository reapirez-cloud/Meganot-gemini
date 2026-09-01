import type { RuleTemplate, RuleTemplateLevel } from "./types.ts"
import { WIZARD_SUBCLASS_PARENT_CATALOG_KEY, WIZARD_SUBCLASS_UNLOCK_LEVEL, type WizardSubclassPackageValidation } from "./wizardSubclasses.ts"

export const transmutationTemplate: RuleTemplate = {
  id: "template:subclass:wizard-transmutation",
  campaign_id: "",
  kind: "subclass",
  slug: "wizard-transmutation",
  name: "Школа Преобразования",
  description: "Трансмутаторы — это исследователи, стремящиеся изменять структуру материи, превращая одно в другое, изменяя законы физики.",
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
    choices: [
      {
        key: "transmutation-savant-spells",
        label: "Заклинания Преобразования",
        target: "trait",
        options: [],
        options_query: "spell:school=transmutation",
        count: 2
      }
    ],
    mechanics: [
      {
        id: "transmutation-savant-l3",
        type: "grant",
        target: "trait",
        key: "transmutation-savant",
        sourceKey: "transmutation-savant-l3-1",
        presentation: {
          authorExplanation: "[PHB 2014] Золото и время, которые вы тратите на копирование заклинания Преобразования в свою книгу заклинаний, уменьшаются вдвое.",
        }
      },
      {
        id: "minor-alchemy-l3",
        type: "grant",
        target: "trait",
        key: "minor-alchemy",
        sourceKey: "minor-alchemy-l3-1",
        presentation: {
          authorExplanation: "Вы можете временно изменять физические свойства немагического объекта (дерево, камень, железо, медь или серебро), тратя по 10 минут за каждый кубический фут материала. Эффект длится 1 час или пока вы не отмените его (не требует действия).",
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
        type: "action",
        key: "action:transmuters-stone",
        label: "Создать камень преобразователя",
        economy: "action",
        sourceKey: "transmuters-stone-l6-1",
        presentation: {
          authorExplanation: "Вы можете потратить 8 часов, чтобы создать Камень преобразователя, дающий носителю один бафф на выбор: Темное зрение (60 фт.), Скорость +10 фт., Владение спасбросками Телосложения, или сопротивление урону (кислота, холод, огонь, молния или звук). Вы можете менять эффект при касте заклинаний Преобразования.",
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
        type: "spell",
        key: "spell:polymorph",
        payload: {
          spell: { name: "Превращение (Зверь 1 ОП)", level: 4, school: "transmutation" },
          preparation: { mode: "always_prepared" },
          methods: [{ key: "shapechanger-cast", kind: "class_feature", resourceOptions: [{ key: "shapechanger-charge", costs: [{key: "resource:shapechanger", amount: 1}] }] }]
        },
        sourceKey: "shapechanger-l10-1",
        presentation: {
          authorExplanation: "Вы получаете заклинание Превращение (Polymorph). Вы можете накладывать его на себя один раз без ячейки до короткого или долгого отдыха (только в зверя опасности 1 или ниже).",
        }
      },
      {
        id: "shapechanger-resource-l10",
        type: "resource",
        key: "resource:shapechanger",
        label: "Перевертыш (использование)",
        max: 1,
        recharge: ["short_rest", "long_rest"]
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
          authorExplanation: "Вы можете разрушить свой Камень преобразователя действием для мощного эффекта: Полное преобразование (предмет 5x5x5 в другой), Панацея (снять все недуги и восстановить хиты), Восстановление жизни (каст Raise Dead без компонентов) или Омоложение (омолодить цель на 3d10 лет).",
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
