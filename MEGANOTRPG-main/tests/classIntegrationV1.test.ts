import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { resolveTemplateBundles } from "../src/rule-templates/resolver.ts"
import type { CharacterTemplateBundle } from "../src/rule-templates/types.ts"

function bundle(args: {
  id: string
  kind: "class" | "subclass"
  level: number | null
  parent?: string
  selectedChoices?: Record<string, string | string[]>
}): CharacterTemplateBundle {
  return {
    assignment: {
      id: `assignment-${args.id}`,
      character_id: "character-1",
      template_id: args.id,
      template_level: args.level,
      selected_choices: args.selectedChoices || {},
      assigned_at: "2026-08-28T00:00:00Z",
      updated_at: "2026-08-28T00:00:00Z",
    },
    template: {
      id: args.id,
      campaign_id: "campaign-1",
      kind: args.kind,
      slug: args.id,
      name: args.kind === "class" ? "Тестовый класс" : "Тестовый подкласс",
      description: "",
      version: 1,
      mechanics: [{
        id: `${args.id}-automatic`,
        type: "grant",
        sourceKey: "automatic",
        target: "feature",
        key: `${args.id}:automatic`,
      }],
      choices: args.kind === "class" ? [{
        key: "style",
        label: "Стиль",
        target: "trait",
        options: ["style:a", "style:b"],
        option_mechanics: {
          "style:a": [{ id: "style-a-mechanic", type: "grant", target: "feature", key: "style:a:feature" }],
          "style:b": [{ id: "style-b-mechanic", type: "grant", target: "feature", key: "style:b:feature" }],
        },
      }] : [],
      parent_template_id: args.parent || null,
      unlock_level: args.kind === "subclass" ? 3 : null,
      is_active: true,
      created_by: null,
      created_at: "2026-08-28T00:00:00Z",
      updated_at: "2026-08-28T00:00:00Z",
    },
    levels: [
      {
        id: `${args.id}-level-3`,
        template_id: args.id,
        level: 3,
        mechanics: [{ id: `${args.id}-l3`, type: "grant", sourceKey: "level-3", target: "feature", key: `${args.id}:l3` }],
        choices: [],
      },
      {
        id: `${args.id}-level-7`,
        template_id: args.id,
        level: 7,
        mechanics: [{ id: `${args.id}-l7`, type: "grant", sourceKey: "level-7", target: "feature", key: `${args.id}:l7` }],
        choices: [],
      },
    ],
  }
}

function hasKey(result: ReturnType<typeof resolveTemplateBundles>, key: string) {
  return result.contributions.some((entry) => "key" in entry && entry.key === key)
}

test("unresolved class choices stay inert while automatic mechanics still parse", () => {
  const result = resolveTemplateBundles([bundle({ id: "class-1", kind: "class", level: 3 })], 3)
  assert.equal(hasKey(result, "class-1:automatic"), true)
  assert.equal(hasKey(result, "class-1:l3"), true)
  assert.equal(hasKey(result, "style:a"), false)
  assert.equal(hasKey(result, "style:b"), false)
  assert.equal(hasKey(result, "style:a:feature"), false)
  assert.equal(hasKey(result, "style:b:feature"), false)
})

test("subclass mechanics always follow the parent class level in multiclass characters", () => {
  const classBundle = bundle({ id: "class-1", kind: "class", level: 6 })
  const subclassBundle = bundle({ id: "subclass-1", kind: "subclass", level: 20, parent: "class-1" })
  const result = resolveTemplateBundles([classBundle, subclassBundle], 12)

  assert.equal(hasKey(result, "subclass-1:l3"), true)
  assert.equal(hasKey(result, "subclass-1:l7"), false)
})

test("class management UI keeps choices optional, preserves edits and exposes GM source switches", () => {
  const frame = fs.readFileSync("src/components/characters/CharacterGameFrame.tsx", "utf8")
  assert.match(frame, /setSelectedChoices\(cloneChoices\(existing\?\.assignment\.selected_choices\)\)/)
  assert.match(frame, /Выбор можно оставить на потом/)
  assert.doesNotMatch(frame, /choiceDefs\.some\(\(choice\) => !choiceComplete\(choice\)\)/)
  assert.match(frame, /assigned\.suppressions\.setSuppressed/)
  assert.match(frame, /Механики класса/)
  assert.match(frame, /Сохранить изменения/)
})
