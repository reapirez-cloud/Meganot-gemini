import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"
import { resolveCharacterContract, type CharacterEngineInput } from "../src/character-engine/index.ts"
import { buildCharacterPreparationModel } from "../src/lib/characterPreparation.ts"
import { assertClassPackageQuality } from "../src/rule-templates/internalClassQuality.ts"
import { assertClassResourcePolicy } from "../src/rule-templates/classResourcePolicy.ts"
import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"

const runtimeSql = fs.readFileSync("supabase/migrations/20260830022000_post_rest_preparation_runtime.sql", "utf8")
const classSql = fs.readFileSync("supabase/migrations/20260830023000_long_rest_choice_and_druid_preparation.sql", "utf8")
const spellPreparationSql = fs.readFileSync("supabase/migrations/20260830024000_chat_spell_preparation_commit.sql", "utf8")
const card = fs.readFileSync("src/components/chat/ChatPreparationCard.tsx", "utf8")
const preparationHook = fs.readFileSync("src/hooks/useChatPreparation.ts", "utf8")
const resolvedCharacterRuntime = fs.readFileSync("src/hooks/useResolvedCharacterRuntime.ts", "utf8")
const characterRuntimeResolver = fs.readFileSync("src/engine-runtime/characterRuntimeResolver.ts", "utf8")
const characterRuntimeSource = fs.readFileSync("src/engine-runtime/supabaseCharacterRuntimeSource.ts", "utf8")

function starsBundle(): CharacterTemplateBundle {
  return {
    assignment: {
      id: "assignment-stars",
      character_id: "character-1",
      template_id: "template-stars",
      template_level: 6,
      selected_choices: {},
      assigned_at: "2026-08-30T00:00:00Z",
      updated_at: "2026-08-30T00:00:00Z",
    },
    template: {
      id: "template-stars",
      campaign_id: "campaign-1",
      kind: "subclass",
      slug: "druid-circle-stars",
      name: "Круг Звёзд",
      description: "Круг Звёзд использует карту звёзд, Звёздную форму и ежедневно определяемое Космическое знамение.",
      version: 1,
      mechanics: [],
      choices: [],
      parent_template_id: "template-druid",
      unlock_level: 3,
      mechanical_summary: "Круг Звёзд получает отдельные звёздные формы и после долгого отдыха определяет одно Космическое знамение на новый игровой день.",
      rules_meta: {
        post_rest_preparations: [{
          key: "cosmic-omen-sign",
          label: "Космическое знамение",
          trigger: "long_rest",
          unlockLevel: 6,
          input: { kind: "roll", count: 1, sides: 6 },
          actionSourceKeys: { weal: "cosmic-omen-weal", woe: "cosmic-omen-woe" },
        }],
      },
      is_active: true,
      created_by: null,
      created_at: "2026-08-30T00:00:00Z",
      updated_at: "2026-08-30T00:00:00Z",
    },
    levels: [],
  }
}

function druidBundle(): CharacterTemplateBundle {
  return {
    assignment: {
      id: "assignment-druid",
      character_id: "character-1",
      template_id: "template-druid",
      template_level: 6,
      selected_choices: {},
      assigned_at: "2026-08-30T00:00:00Z",
      updated_at: "2026-08-30T00:00:00Z",
    },
    template: {
      id: "template-druid",
      campaign_id: "campaign-1",
      kind: "class",
      slug: "druid",
      name: "Друид",
      description: "Друид подготавливает заклинания после отдыха и использует классовые ресурсы и формы через общий лист персонажа.",
      version: 1,
      mechanics: [],
      choices: [],
      mechanical_summary: "Друид подготавливает доступные заклинания после долгого отдыха, использует формы и классовые ресурсы с восстановлением по их собственным правилам.",
      rules_meta: { spell_preparation_refresh: "long_rest" },
      is_active: true,
      created_by: null,
      created_at: "2026-08-30T00:00:00Z",
      updated_at: "2026-08-30T00:00:00Z",
    },
    levels: [],
  }
}

function engineInput(contributions: CharacterEngineInput["contributions"]): CharacterEngineInput {
  return {
    base: {
      id: "character-1",
      name: "Друид",
      level: 6,
      abilities: { strength: 10, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 18, charisma: 10 },
      baseMaxHp: 42,
      baseSpeed: 30,
    },
    state: { currentHp: 42, tempHp: 0, resources: {} },
    contributions,
  }
}

test("long rest opens one server-authoritative preparation generation", () => {
  assert.match(runtimeSql, /character_preparation_sessions/)
  assert.match(runtimeSql, /generation=public\.character_preparation_sessions\.generation\+1/)
  assert.match(runtimeSql, /is_open=true/)
  assert.match(runtimeSql, /perform public\.recover_character_resources\(p_character_id,'long_rest'\)/)
})

test("only ordinary assigned-player text closes preparation", () => {
  assert.match(runtimeSql, /new\.event_kind is not null/)
  assert.match(runtimeSql, /nullif\(btrim\(coalesce\(new\.body,''\)\),''\) is null/)
  assert.match(runtimeSql, /c\.assigned_user_id=new\.user_id/)
  assert.match(runtimeSql, /c\.character_type='pc'/)
  assert.match(runtimeSql, /closed_by_message_id=new\.id/)
  assert.match(runtimeSql, /spell_change_unlocked=false/)
})

test("daily roll results are one record per long rest and can explicitly feed resources", () => {
  assert.match(runtimeSql, /unique\(character_id,generation,assignment_id,task_key\)/)
  assert.match(runtimeSql, /Preparation value is already recorded for this long rest/)
  assert.match(runtimeSql, /send_chat_preparation_roll_v1/)
  assert.match(runtimeSql, /preparationRecord/)
  assert.match(runtimeSql, /coalesce\(v_output->>'kind','stored_value'\)='resource'/)
})

test("finished prepared casters and Circle of the Land opt into long-rest policies", () => {
  assert.match(classSql, /catalog_key in \('class:druid','class:cleric'\)/)
  assert.match(classSql, /spell_preparation_refresh','long_rest'/)
  assert.match(classSql, /'selection_mode','player_once','refresh','long_rest'/)
  assert.match(classSql, /v_can_replace:=v_refresh='long_rest' and private\.is_character_preparation_open/)
})

test("Cosmic Omen records parity and server-gates the sibling action", () => {
  assert.match(classSql, /'odd','woe','even','weal'/)
  assert.match(classSql, /'weal','stars-cosmic-weal','woe','stars-cosmic-woe'/)
  assert.match(classSql, /assert_character_template_preparation_action/)
  assert.match(classSql, /This action is not available for the current daily preparation/)
})

test("post-rest class package still passes quality/resource gates and reaches CE", () => {
  const packages = [druidBundle(), starsBundle()]
  assert.doesNotThrow(() => assertClassPackageQuality(packages))
  assert.doesNotThrow(() => assertClassResourcePolicy(packages))
  const parsed = resolveTemplateBundles(packages, 6)
  const contract = resolveCharacterContract(engineInput(parsed.contributions))
  assert.equal(contract.level, 6)
})

test("CE read model suppresses both daily actions before roll and only the wrong sibling after it", () => {
  const session = {
    character_id: "character-1",
    generation: 2,
    is_open: true,
    opened_at: null,
    opened_by: null,
    closed_at: null,
    closed_by_message_id: null,
  }
  const bundles = [druidBundle(), starsBundle()]
  const before = buildCharacterPreparationModel(bundles, 6, session, [])
  assert.deepEqual(before.suppressedSourceIds, [
    "template:subclass:template-stars:v1:source:cosmic-omen-weal",
    "template:subclass:template-stars:v1:source:cosmic-omen-woe",
  ])
  const spellBefore = before.tasks.find((task) => task.kind === "spells")
  assert.equal(spellBefore?.kind, "spells")
  if (spellBefore?.kind === "spells") assert.equal(spellBefore.record, null)
  assert.equal(before.tasks.some((task) => task.kind === "roll" && task.key === "cosmic-omen-sign"), true)

  const after = buildCharacterPreparationModel(bundles, 6, session, [{
    id: "record-1",
    character_id: "character-1",
    generation: 2,
    assignment_id: "assignment-stars",
    task_key: "cosmic-omen-sign",
    input_value: 4,
    resolved_value: "weal",
  }, {
    id: "record-spells",
    character_id: "character-1",
    generation: 2,
    assignment_id: "assignment-druid",
    task_key: "spells:template-druid",
    input_value: 3,
    resolved_value: ["spell-1", "spell-2", "spell-3"],
  }])
  assert.deepEqual(after.suppressedSourceIds, [
    "template:subclass:template-stars:v1:source:cosmic-omen-woe",
  ])
  const spellAfter = after.tasks.find((task) => task.kind === "spells")
  assert.equal(spellAfter?.kind, "spells")
  if (spellAfter?.kind === "spells") assert.equal(spellAfter.record?.input_value, 3)
})

test("chat owns atomic personal spell preparation and persists Ready state", () => {
  assert.match(spellPreparationSql, /commit_character_spell_preparation_v1/)
  assert.match(spellPreparationSql, /not v_session\.is_open/)
  assert.match(spellPreparationSql, /s\.spell_level>0/)
  assert.match(spellPreparationSql, /s\.cast_mode='slot'/)
  assert.match(spellPreparationSql, /set prepared=\(s\.id=any\(v_ids\)\)/)
  assert.match(spellPreparationSql, /on conflict \(character_id,generation,assignment_id,task_key\) do update/)
  assert.match(spellPreparationSql, /v_task_key:='spells:' \|\| v_template\.id::text/)
})

test("spell preparation is performed inside chat instead of redirecting to the sheet", () => {
  assert.match(card, /commit_character_spell_preparation_v1/)
  assert.match(card, /p_prepared_spell_ids: draft/)
  assert.match(card, /"Готово"/)
  assert.doesNotMatch(card, /Открыть заклинания персонажа/)
})

test("spell changes refresh both preparation UI and the shared CE runtime bridge", () => {
  assert.match(preparationHook, /table: "character_spells"/)
  assert.match(preparationHook, /select\("id,catalog_spell_id,name,spell_level,prepared,cast_mode,wizard_spell_mastery,wizard_signature_spell"\)/)
  assert.match(resolvedCharacterRuntime, /table: "character_spells"/)
  assert.match(characterRuntimeSource, /from\("character_spells"\)/)
  assert.match(characterRuntimeResolver, /resolveLegacyCharacterEngineView\(\{/)
  assert.match(characterRuntimeResolver, /spells: core\.spells/)
})

test("chat preparation card warns that text closes the window while rolls do not", () => {
  assert.match(card, /Первый отправленный текст закроет это окно/)
  assert.match(card, /Броски, способности и заклинания окно не закрывают/)
  assert.match(card, /Бросить \$\{notation\} и записать/)
})
