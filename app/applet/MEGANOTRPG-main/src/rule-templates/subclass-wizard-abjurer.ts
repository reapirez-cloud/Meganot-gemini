import type { RuleTemplate, RuleTemplateLevel } from "./types.ts"
import { WIZARD_SUBCLASS_PARENT_CATALOG_KEY, WIZARD_SUBCLASS_UNLOCK_LEVEL, type WizardSubclassPackageValidation } from "./wizardSubclasses.ts"

// ==========================================
// ABJURER (PHB 2024)
// ==========================================

export const abjurerTemplate: RuleTemplate = {
  id: "template:subclass:wizard-abjurer",
  campaign_id: "",
  kind: "subclass",
  slug: "wizard-abjurer",
  name: "Абжурер",
  description: "Волшебники школы Ограждения концентрируются на защитной магии, барьерах и рассеивании чар.",
  version: 1,
  catalog_key: "subclass:wizard:abjurer",
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

export const abjurerLevels: RuleTemplateLevel[] = [
  {
    id: "level:3:wizard-abjurer",
    template_id: abjurerTemplate.id,
    level: 3,
    choices: [],
    mechanics: [
      {
        id: "abjuration-savant-l3",
        type: "grant",
        target: "trait",
        key: "abjuration-savant",
        sourceKey: "abjuration-savant-l3-1",
        presentation: {
          authorExplanation: "Время и стоимость копирования заклинаний Ограждения в вашу книгу уменьшены вдвое.",
        }
      },
      {
        id: "arcane-ward-l3",
        type: "grant",
        target: "trait",
        key: "arcane-ward",
        sourceKey: "arcane-ward-l3-1",
        presentation: {
          authorExplanation: "Когда вы накладываете заклинание Ограждения 1 уровня и выше, вы создаёте магический барьер, поглощающий урон вместо вас. Максимум равен (Уровень Волшебника × 2) + Интеллект.",
        }
      },
      // Arcane Ward HP tracking (resource)
      {
        id: "arcane-ward-resource",
        type: "resource",
        key: "arcane-ward",
        label: "Магический оберег (HP)",
        max: { type: "reference", target: "max_arcane_ward" }, // This assumes the engine calculates it or handles it via trait
        recharge: "long_rest",
        initial: "empty",
        sourceKey: "arcane-ward-l3-1"
      }
    ]
  },
  {
    id: "level:6:wizard-abjurer",
    template_id: abjurerTemplate.id,
    level: 6,
    choices: [],
    mechanics: [
      {
        id: "projected-ward-l6",
        type: "grant",
        target: "trait",
        key: "projected-ward",
        sourceKey: "projected-ward-l6-1",
        presentation: {
          authorExplanation: "Когда существо в 30 футах получает урон, вы можете реакцией перенести этот урон на свой Магический оберег.",
        }
      }
    ]
  },
  {
    id: "level:10:wizard-abjurer",
    template_id: abjurerTemplate.id,
    level: 10,
    choices: [],
    mechanics: [
      {
        id: "spell-breaker-l10",
        type: "grant",
        target: "trait",
        key: "spell-breaker",
        sourceKey: "spell-breaker-l10-1",
        presentation: {
          authorExplanation: "Вы всегда имеете подготовленным Рассеивание магии. Когда вы его накладываете, добавьте свой бонус мастерства к проверке характеристики.",
        }
      }
    ]
  },
  {
    id: "level:14:wizard-abjurer",
    template_id: abjurerTemplate.id,
    level: 14,
    choices: [],
    mechanics: [
      {
        id: "spell-resistance-l14",
        type: "grant",
        target: "trait",
        key: "spell-resistance",
        sourceKey: "spell-resistance-l14-1",
        presentation: {
          authorExplanation: "Вы получаете преимущество на спасброски против заклинаний, и сопротивление к урону от заклинаний.",
        }
      }
    ]
  }
]

export const abjurerPackage: WizardSubclassPackageValidation = {
  template: abjurerTemplate,
  parent: { id: "template:class:wizard", kind: "class", catalog_key: WIZARD_SUBCLASS_PARENT_CATALOG_KEY },
  levels: abjurerLevels,
}
