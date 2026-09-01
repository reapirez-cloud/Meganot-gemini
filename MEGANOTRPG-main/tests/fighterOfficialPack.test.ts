import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { resolveCharacterContract, type CharacterEngineInput, type CharacterSource } from "../src/character-engine/index.ts"
import { contributionForStoredMechanic } from "../src/lib/characterMechanics.ts"
import { resourceSyncInputs } from "../src/lib/resourceRuntime.ts"
import { choiceCountAtLevel, choiceOptionAvailableAtLevel } from "../src/rule-templates/resolver.ts"
import type { RuleChoiceDefinition } from "../src/rule-templates/types.ts"
import type { StoredMechanic } from "../src/types/characterMechanics.ts"

const baseMigration = fs.readFileSync("supabase/migrations/20260828211500_fighter_precision_pack.sql", "utf8")
const completionMigration = fs.readFileSync("supabase/migrations/20260829060000_fighter_completion_and_ru_audit.sql", "utf8")
const choiceActionMigration = fs.readFileSync("supabase/migrations/20260829061000_selected_choice_template_actions.sql", "utf8")
const psiRuntimeMigration = fs.readFileSync("supabase/migrations/20260829062000_fighter_psi_runtime_finalization.sql", "utf8")
const gameFrameSource = fs.readFileSync("src/components/characters/CharacterGameFrame.tsx", "utf8")

const fighterSource: CharacterSource = {
  id: "template:class:fighter:v1:source:second-wind",
  name: "Второе дыхание",
  sourceType: "class_template",
}

function baseInput(contributions: CharacterEngineInput["contributions"]): CharacterEngineInput {
  return {
    base: {
      id: "fighter-test",
      name: "Воин",
      level: 5,
      abilities: { strength: 16, dexterity: 14, constitution: 16, intelligence: 10, wisdom: 12, charisma: 10 },
      baseMaxHp: 44,
      baseSpeed: 30,
    },
    state: { currentHp: 44, tempHp: 0, resources: {} },
    contributions,
  }
}

test("Fighter pack installs all ten project subclasses", () => {
  for (const key of [
    "arcane-archer",
    "battle-master",
    "cavalier",
    "champion",
    "echo-knight",
    "eldritch-knight",
    "psi-warrior",
    "banneret",
    "rune-knight",
    "samurai",
  ]) assert.match(baseMigration, new RegExp(`subclass:fighter:${key}`))
})

test("base Fighter progression is represented by real resources and values", () => {
  assert.match(baseMigration, /fighter-second-wind-l1[\s\S]*'2'::jsonb/)
  assert.match(baseMigration, /fighter-second-wind-l4[\s\S]*'3'::jsonb/)
  assert.match(baseMigration, /fighter-second-wind-l10[\s\S]*'4'::jsonb/)
  assert.match(baseMigration, /fighter-action-surge-l17[\s\S]*'2'::jsonb/)
  assert.match(baseMigration, /fighter-indomitable-l13[\s\S]*'2'::jsonb/)
  assert.match(baseMigration, /fighter-indomitable-l17[\s\S]*'3'::jsonb/)
  assert.match(baseMigration, /weapon_mastery_count/)
  assert.match(baseMigration, /fighter-weapon-mastery-l16[\s\S]*'6'::jsonb/)
  assert.match(baseMigration, /attacks_per_attack_action/)
  assert.match(baseMigration, /fighter-attacks-l20[\s\S]*'4'::jsonb/)
})

test("Second Wind persists per-trigger recovery without class-specific recovery code", () => {
  const mechanic = {
    id: "second-wind-test",
    type: "grant",
    target: "resource",
    key: "second_wind",
    sourceKey: "second-wind",
    payload: {
      max: 3,
      label: "Второе дыхание",
      initial: "full",
      recharge: { triggers: ["long_rest"], restore: "full" },
      recoveryRules: [
        { trigger: "short_rest", restore: "amount", amount: 1 },
        { trigger: "long_rest", restore: "full" },
      ],
    },
  } as unknown as StoredMechanic
  const contract = resolveCharacterContract(baseInput([contributionForStoredMechanic(mechanic, fighterSource)]))
  const sync = resourceSyncInputs(contract)
  assert.deepEqual(sync[0]?.recharge, {
    rules: [
      { trigger: "short_rest", restore: "amount", amount: 1 },
      { trigger: "long_rest", restore: "full" },
    ],
  })
  assert.match(baseMigration, /jsonb_typeof\(v_row\.recharge->'rules'\)='array'/)
  assert.doesNotMatch(baseMigration, /second_wind.*p_trigger/i)
})

test("Battle Master keeps superiority pool and die size as separate identities", () => {
  assert.match(completionMigration, /superiority_dice/)
  assert.match(completionMigration, /superiority_die/)
  assert.match(completionMigration, /fighter-bm-dice-l3[\s\S]*'4'::jsonb/)
  assert.match(completionMigration, /fighter-bm-dice-l7[\s\S]*'5'::jsonb/)
  assert.match(completionMigration, /fighter-bm-dice-l15[\s\S]*'6'::jsonb/)
  assert.match(completionMigration, /fighter-bm-die-l3[\s\S]*'8'::jsonb/)
  assert.match(completionMigration, /fighter-bm-die-l10[\s\S]*'10'::jsonb/)
  assert.match(completionMigration, /fighter-bm-die-l18[\s\S]*'12'::jsonb/)
})

test("persistent subclass choices expand with Fighter level", () => {
  assert.match(completionMigration, /"key":"battle_master_maneuvers"[\s\S]*?"count_by_level":\{"7":5,"10":7,"15":9\}/)
  assert.match(completionMigration, /"key":"arcane_shot_options"[\s\S]*?"count_by_level":\{"7":3,"10":4,"15":5,"18":6\}/)
  assert.match(completionMigration, /"key":"rune_knight_runes"[\s\S]*?"count_by_level":\{"7":3,"10":4,"15":5\}/)
  assert.match(completionMigration, /"option_unlock_level":\{"hill":7,"storm":7\}/)
})

test("generic choice helpers enforce level-scaled count and option unlocks", () => {
  const choice: RuleChoiceDefinition = {
    key: "techniques",
    label: "Приёмы",
    target: "trait",
    options: ["a", "b", "c", "hill"],
    count: 2,
    count_by_level: { "7": 3, "15": 4 },
    option_unlock_level: { hill: 7 },
  }
  assert.equal(choiceCountAtLevel(choice, 3), 2)
  assert.equal(choiceCountAtLevel(choice, 7), 3)
  assert.equal(choiceCountAtLevel(choice, 14), 3)
  assert.equal(choiceCountAtLevel(choice, 15), 4)
  assert.equal(choiceOptionAvailableAtLevel(choice, "hill", 6), false)
  assert.equal(choiceOptionAvailableAtLevel(choice, "hill", 7), true)
  assert.equal(choiceOptionAvailableAtLevel(choice, "a", 1), true)
})

test("class binding UI uses the same level-aware choice policy as the parser", () => {
  assert.match(gameFrameSource, /choiceCountAtLevel\(definition, effectiveChoiceLevel\)/)
  assert.match(gameFrameSource, /choiceCountAtLevel\(choice, effectiveChoiceLevel\)/)
  assert.match(gameFrameSource, /choiceOptionAvailableAtLevel\(choice, option, effectiveChoiceLevel\)/)
  assert.match(gameFrameSource, /Уже сделанный выбор сохраняется при повышении уровня/)
})

test("selected option actions are resolved server-side with the parser gates", () => {
  assert.match(choiceActionMigration, /selected_options/)
  assert.match(choiceActionMigration, /count_by_level/)
  assert.match(choiceActionMigration, /option_unlock_level/)
  assert.match(choiceActionMigration, /option_mechanics/)
  assert.match(choiceActionMigration, /option_mechanics_by_level/)
  assert.match(choiceActionMigration, /:choice:'/)
  assert.match(choiceActionMigration, /character_source_suppressions/)
})

test("Psi Warrior uses the exact Fighter-level dice table instead of total-level proficiency", () => {
  const psiSection = completionMigration.match(/if v_psi is not null then[\s\S]*?\n  end if;\n\n  if v_banneret is not null then/)?.[0] || ""
  assert.ok(psiSection)
  assert.match(psiSection, /fighter-psi-pool-l3[\s\S]*'4'::jsonb/)
  assert.match(psiSection, /fighter-psi-pool-l5[\s\S]*'6'::jsonb/)
  assert.match(psiSection, /fighter-psi-pool-l9[\s\S]*'8'::jsonb/)
  assert.match(psiSection, /fighter-psi-pool-l13[\s\S]*'10'::jsonb/)
  assert.match(psiSection, /fighter-psi-pool-l17[\s\S]*'12'::jsonb/)
  assert.match(psiSection, /fighter-psi-die3[\s\S]*'6'::jsonb/)
  assert.match(psiSection, /fighter-psi-die5[\s\S]*'8'::jsonb/)
  assert.match(psiSection, /fighter-psi-die11[\s\S]*'10'::jsonb/)
  assert.match(psiSection, /fighter-psi-die17[\s\S]*'12'::jsonb/)
  assert.match(psiSection, /short_rest[^\n]*restore[^\n]*amount[^\n]*1/)
  assert.doesNotMatch(psiSection, /core\.proficiencyBonus/)
  assert.doesNotMatch(psiSection, /psionic_recovery/)
})

test("Psi Warrior finite powers are real CE actions and free-use resources", () => {
  for (const id of [
    "fighter-psi-protective-field-use",
    "fighter-psi-strike-use",
    "fighter-psi-movement-use",
    "fighter-psi-movement-restore",
    "fighter-psi-leap-use",
    "fighter-psi-leap-restore",
    "fighter-psi-guarded-mind-use",
    "fighter-psi-bulwark-use",
    "fighter-psi-bulwark-restore",
    "fighter-psi-telekinesis-restore",
  ]) assert.match(psiRuntimeMigration, new RegExp(id))

  for (const resource of [
    "psi_telekinetic_movement_free",
    "psi_powered_leap_free",
    "psi_bulwark_free",
    "psi_telekinetic_master_free",
  ]) assert.match(psiRuntimeMigration, new RegExp(resource))

  assert.match(psiRuntimeMigration, /'psionic_energy','amount',1/)
  assert.match(psiRuntimeMigration, /'operation','RESTORE'/)
  assert.match(psiRuntimeMigration, /telekinesis_always_prepared/)
  assert.match(psiRuntimeMigration, /'key','telekinesis'/)
  assert.match(psiRuntimeMigration, /'mode','always_prepared'/)
})

test("Eldritch Knight keeps shared spell slots and restores Weapon Bond", () => {
  assert.match(completionMigration, /spellcasting_progression','one_third'/)
  assert.match(completionMigration, /fighter-ek-bond[\s\S]*Связь с оружием/)
  assert.match(completionMigration, /fighter-ek-slot1-l3[\s\S]*spell_slot_1[\s\S]*'2'::jsonb/)
  assert.match(completionMigration, /fighter-ek-slot2-l7[\s\S]*spell_slot_2[\s\S]*'2'::jsonb/)
  assert.match(completionMigration, /fighter-ek-slot3-l13[\s\S]*spell_slot_3[\s\S]*'2'::jsonb/)
  assert.match(completionMigration, /fighter-ek-slot4-l19[\s\S]*spell_slot_4[\s\S]*'1'::jsonb/)
  assert.doesNotMatch(completionMigration, /eldritch_knight_slot_/)
})

test("Russian Fighter cards use audited project terminology", () => {
  for (const term of [
    "Тактическое мышление",
    "Тактическое смещение",
    "Мастер боя",
    "Магический выстрел",
    "Сжимающая стрела",
    "Связь с оружием",
    "Кости пси-энергии",
    "Рунический щит",
  ]) assert.match(completionMigration, new RegExp(term))

  assert.match(psiRuntimeMigration, /Защитное поле/)
  assert.match(psiRuntimeMigration, /Телекинетическое передвижение/)
  assert.match(psiRuntimeMigration, /Усиленный пси-прыжок/)
  assert.match(psiRuntimeMigration, /Оплот силы/)
})

test("finite subclass mechanics use resources rather than fake GM scene flags", () => {
  const combined = `${baseMigration}\n${completionMigration}\n${psiRuntimeMigration}`
  for (const key of [
    "arcane_shot",
    "warding_maneuver",
    "unleash_incarnation",
    "shadow_martyr",
    "psionic_energy",
    "giants_might",
    "runic_shield",
    "fighting_spirit",
    "strength_before_death",
  ]) assert.match(combined, new RegExp(key))

  assert.doesNotMatch(combined, /"enforcement"\s*:\s*"gm"/)
  assert.doesNotMatch(combined, /_confirmed/)
  assert.match(combined, /no_fake_scene_state/)
})

test("Banneret reuses Fighter resources rather than duplicating them", () => {
  assert.match(baseMigration, /Групповое восстановление[\s\S]*то же Второе дыхание/)
  assert.match(baseMigration, /Воодушевляющий всплеск[\s\S]*ресурс базового класса/)
  assert.match(baseMigration, /Общая стойкость[\s\S]*ресурс Неукротимого/)
  assert.doesNotMatch(`${baseMigration}\n${completionMigration}`, /banneret_(second_wind|action_surge|indomitable)/)
})
