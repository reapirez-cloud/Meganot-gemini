import type { RuleTemplate, RuleTemplateLevel } from "./types.ts"
import { WIZARD_SUBCLASS_PARENT_CATALOG_KEY, WIZARD_SUBCLASS_UNLOCK_LEVEL, type WizardSubclassPackageValidation } from "./wizardSubclasses.ts"

export const abjurerTemplate: RuleTemplate = {
  id: "template:subclass:wizard-abjurer",
  campaign_id: "",
  kind: "subclass",
  slug: "wizard-abjurer",
  name: "Абжурер",
  description: "Абжуреры (Оградители) посвящают себя защитной магии, создавая мистические обереги, изгоняя потусторонних существ и разрушая чужие чары.",
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
    choices: [
      {
        key: "abjuration-savant-spells",
        label: "Заклинания Ограждения",
        target: "trait",
        options: [],
        options_query: "spell:school=abjuration",
        count: 2
      }
    ],
    mechanics: [
      {
        id: "abjuration-savant-l3",
        type: "grant",
        target: "trait",
        key: "abjuration-savant",
        sourceKey: "abjuration-savant-l3-1",
        presentation: {
          authorExplanation: "[PHB 2024] Вы бесплатно добавляете два заклинания школы Ограждения в свою книгу. Эти заклинания всегда считаются подготовленными и не идут в счет лимита. При повышении уровня вы можете заменить одно из них на другое заклинание Ограждения.",
        }
      },
      {
        id: "arcane-ward-l3",
        type: "resource",
        key: "resource:arcane-ward",
        label: "Магический оберег",
        max: { kind: "add", terms: [{ kind: "multiply", factors: [{ kind: "reference", key: "class:wizard:level" }, { kind: "literal", value: 2 }] }, { kind: "reference", key: "intelligence:modifier" }] },
        recharge: ["long_rest"],
        initial: "empty",
        sourceKey: "arcane-ward-l3-1",
        presentation: {
          authorExplanation: "Создает магический оберег, когда вы накладываете заклинание Ограждения. Оберег имеет хиты (уровень волшебника * 2 + мод. Интеллекта) и принимает урон на себя. Когда вы накладываете другие заклинания Ограждения, оберег восстанавливает хиты (удвоенный уровень заклинания).",
        }
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
        type: "action",
        key: "action:projected-ward",
        label: "Спроецированный оберег",
        economy: "reaction",
        range: { kind: "ranged", normal: 30, unit: "ft" },
        sourceKey: "projected-ward-l6-1",
        presentation: {
          authorExplanation: "Когда существо в пределах 30 футов от вас получает урон, вы можете реакцией заставить ваш Магический оберег принять этот урон на себя.",
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
        id: "spellbreaker-l10",
        type: "spell",
        key: "spell:dispel-magic",
        payload: {
          spell: { name: "Рассеивание магии", level: 3, school: "abjuration" },
          preparation: { mode: "always_prepared" },
          methods: [{ key: "spellbreaker-cast", kind: "class_feature", resourceOptions: [{ key: "spellbreaker-bonus", costs: [{key: "resource:spell_slot_3", amount: 1}] }] }]
        },
        sourceKey: "spellbreaker-l10-1",
        presentation: {
          authorExplanation: "[PHB 2024] Вы всегда имеете подготовленным заклинание Рассеивание магии (Dispel Magic). Вы можете накладывать его как Бонусное действие. Если вы накладываете его и успешно прерываете заклинание, ваш Оберег восстанавливает хиты.",
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
          authorExplanation: "Вы получаете преимущество на спасброски от заклинаний, а также сопротивление к урону от заклинаний.",
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
