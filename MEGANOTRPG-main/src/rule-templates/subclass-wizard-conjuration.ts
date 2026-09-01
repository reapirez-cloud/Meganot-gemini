import type { RuleTemplate, RuleTemplateLevel } from "./types.ts"
import { WIZARD_SUBCLASS_PARENT_CATALOG_KEY, WIZARD_SUBCLASS_UNLOCK_LEVEL, type WizardSubclassPackageValidation } from "./wizardSubclasses.ts"

// ==========================================
// CONJURATION (Legacy / 2014)
// ==========================================

export const conjurationTemplate: RuleTemplate = {
  id: "template:subclass:wizard-conjuration",
  campaign_id: "",
  kind: "subclass",
  slug: "wizard-conjuration",
  name: "Школа воплощения", // Note: the system translation used "Школа воплощения" for conjuration in legacy array, but we are using our translated narrative.
  description: "Волшебники школы Призыва специализируются на заклинаниях, которые создают объекты и существ из ничего или переносят их из других мест.",
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
    choices: [],
    mechanics: [
      {
        id: "conjuration-savant-l3",
        type: "grant",
        target: "trait",
        key: "conjuration-savant",
        sourceKey: "conjuration-savant-l3-1",
        presentation: {
          authorExplanation: "Время и стоимость копирования заклинаний Вызова в вашу книгу уменьшены вдвое.",
        }
      },
      {
        id: "minor-conjuration-l3",
        type: "grant",
        target: "trait",
        key: "minor-conjuration",
        sourceKey: "minor-conjuration-l3-1",
        presentation: {
          authorExplanation: "Действием вы можете создать неволшебный предмет в своей руке (или на земле в 10 футах). Он светится тусклым светом и исчезает через 1 час, если получит урон, или если вы используете умение снова.",
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
        type: "grant",
        target: "trait",
        key: "benign-transposition",
        sourceKey: "benign-transposition-l6-1",
        presentation: {
          authorExplanation: "Действием вы можете телепортироваться на 30 футов. Вы можете поменяться местами с согласным существом. Восстанавливается после долгого отдыха или накладывания заклинания Вызова 1+ уровня.",
        }
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
          authorExplanation: "Получение урона не может нарушить вашу концентрацию на заклинаниях Вызова.",
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
          authorExplanation: "Любое существо, которое вы вызываете или создаёте заклинанием Вызова, получает 30 временных хитов.",
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
