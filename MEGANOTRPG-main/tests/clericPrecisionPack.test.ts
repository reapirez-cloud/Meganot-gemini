import assert from "node:assert/strict"
import test from "node:test"

import { resolveCharacterContract, type CharacterEngineInput, type GrantPayload } from "../src/character-engine/index.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle, RuleTemplate } from "../src/rule-templates/types.ts"

const cleric: RuleTemplate = {
  id: "cleric-template",
  campaign_id: "campaign",
  kind: "class",
  slug: "cleric-core",
  name: "Жрец",
  description: "",
  version: 1,
  mechanics: [],
  choices: [],
  parent_template_id: null,
  unlock_level: null,
  catalog_key: "class:cleric",
  catalog_revision: "precision-test",
  source_kind: "official",
  source_label: "Official",
  is_builtin: true,
  mechanical_summary: "",
  author_description: "",
  author_comment: "",
  rules_meta: {},
  is_active: true,
  created_by: null,
  created_at: "2026-08-28T00:00:00Z",
  updated_at: "2026-08-28T00:00:00Z",
}

const life: RuleTemplate = {
  ...cleric,
  id: "life-template",
  kind: "subclass",
  slug: "cleric-life-domain",
  name: "Домен жизни",
  catalog_key: "subclass:cleric:life-domain",
  parent_template_id: cleric.id,
  unlock_level: 3,
}

function assignment(templateId: string, level: number, selected_choices: Record<string, string> = {}) {
  return {
    id: `assignment:${templateId}`,
    character_id: "hero",
    template_id: templateId,
    template_level: level,
    selected_choices,
    assigned_at: "2026-08-28T00:00:00Z",
    updated_at: "2026-08-28T00:00:00Z",
  }
}

function bundle(template: RuleTemplate, level: number): CharacterTemplateBundle {
  if (template.kind === "class") {
    return {
      template,
      assignment: assignment(template.id, level, { "cleric-blessed-strikes": "divine-strike" }),
      levels: [
        {
          id: "cleric-l2",
          template_id: template.id,
          level: 2,
          mechanics: [
            { id: "channel", type: "resource", key: "channel_divinity", label: "Божественный канал", max: 3, recharge: ["long_rest"], sourceKey: "channel-divinity" },
          ],
          choices: [],
        },
        {
          id: "cleric-l7",
          template_id: template.id,
          level: 7,
          mechanics: [],
          choices: [
            {
              key: "cleric-blessed-strikes",
              label: "Благословенные удары",
              target: "trait",
              count: 1,
              options: ["divine-strike", "potent-spellcasting"],
              option_labels: { "divine-strike": "Божественный удар", "potent-spellcasting": "Могущественные заклинания" },
              option_mechanics: {
                "divine-strike": [
                  {
                    id: "divine-strike",
                    type: "grant",
                    target: "feature",
                    key: "class:cleric:blessed-strikes:divine-strike",
                    sourceKey: "blessed-strikes:divine-strike",
                    priority: 7,
                    payload: {
                      label: "Божественный удар",
                      description: "1к8",
                      mechanic: { kind: "triggered_damage", trigger: "weapon_attack_hit", dice: "1d8" },
                    },
                  },
                ],
              },
              option_mechanics_by_level: {
                "divine-strike": {
                  "14": [
                    {
                      id: "divine-strike-l14",
                      type: "grant",
                      target: "feature",
                      key: "class:cleric:blessed-strikes:divine-strike",
                      sourceKey: "blessed-strikes:divine-strike",
                      priority: 14,
                      grantOperation: "REPLACE",
                      payload: {
                        label: "Божественный удар",
                        description: "2к8",
                        mechanic: { kind: "triggered_damage", trigger: "weapon_attack_hit", dice: "2d8" },
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      ],
    }
  }

  return {
    template,
    assignment: assignment(template.id, level),
    levels: [
      {
        id: "life-l3",
        template_id: template.id,
        level: 3,
        mechanics: [
          {
            id: "disciple-of-life",
            type: "grant",
            target: "feature",
            key: "subclass:cleric:life-domain:disciple-of-life",
            sourceKey: "disciple-of-life",
            payload: {
              label: "Ученик жизни",
              description: "Дополнительное лечение = 2 + уровень ячейки.",
              mechanic: {
                kind: "triggered_healing_bonus",
                trigger: { event: "spell_restores_hp", requiresSpellSlot: true },
                effect: { target: "healed_creature", amount: { flat: 2, plus: "spell_slot_level" } },
              },
            },
          },
          {
            id: "preserve-life-feature",
            type: "grant",
            target: "feature",
            key: "subclass:cleric:life-domain:preserve-life",
            sourceKey: "preserve-life",
            payload: {
              label: "Сохранить жизнь",
              mechanic: { kind: "healing_pool_action", pool: { class: "cleric", classLevelMultiplier: 5 }, perTargetCap: "half_max_hp" },
            },
          },
          {
            id: "preserve-life-action",
            type: "action",
            key: "preserve_life",
            label: "Сохранить жизнь",
            economy: "magic_action",
            resourceKey: "channel_divinity",
            resourceCost: 1,
            sourceKey: "preserve-life",
          },
        ],
        choices: [],
      },
    ],
  }
}

function input(contributions: CharacterEngineInput["contributions"]): CharacterEngineInput {
  return {
    base: {
      id: "hero",
      name: "Жрец",
      level: 14,
      abilities: { strength: 10, dexterity: 10, constitution: 14, intelligence: 10, wisdom: 18, charisma: 10 },
      baseMaxHp: 80,
      baseSpeed: 30,
    },
    state: { currentHp: 80, tempHp: 0, resources: { channel_divinity: { current: 3 } } },
    contributions,
  }
}

function objectPayload(payload: GrantPayload | undefined): Record<string, GrantPayload> {
  assert.ok(payload && typeof payload === "object" && !Array.isArray(payload))
  return payload as Record<string, GrantPayload>
}

test("precise passive class and subclass rules survive parser -> Character Engine contract", () => {
  const parsed = resolveTemplateBundles([bundle(cleric, 14), bundle(life, 14)], 14)
  const contract = resolveCharacterContract(input(parsed.contributions))

  const disciple = contract.capabilities.features.find((entry) => entry.key === "subclass:cleric:life-domain:disciple-of-life")
  assert.ok(disciple)
  const discipleMechanic = objectPayload(objectPayload(disciple.payload).mechanic)
  assert.equal(discipleMechanic.kind, "triggered_healing_bonus")

  const strike = contract.capabilities.features.find((entry) => entry.key === "class:cleric:blessed-strikes:divine-strike")
  assert.ok(strike)
  const strikeMechanic = objectPayload(objectPayload(strike.payload).mechanic)
  assert.equal(strikeMechanic.dice, "2d8")
})

test("Preserve Life reaches CE as an actionable ability with Channel Divinity cost", () => {
  const parsed = resolveTemplateBundles([bundle(cleric, 14), bundle(life, 14)], 14)
  const contract = resolveCharacterContract(input(parsed.contributions))

  const action = contract.actions.find((entry) => entry.key === "preserve_life")
  assert.ok(action)
  assert.equal(action.economy, "magic_action")
  assert.equal(action.available, true)
  assert.equal(action.resourceCosts.length, 1)
  assert.equal(action.resourceCosts[0]?.key, "channel_divinity")
  assert.equal(action.resourceCosts[0]?.amount, 1)
})
