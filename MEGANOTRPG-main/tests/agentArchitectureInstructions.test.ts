import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const root = fs.readFileSync("AGENTS.md", "utf8")
const ruleTemplates = fs.readFileSync("src/rule-templates/AGENTS.md", "utf8")
const choiceRuntime = fs.readFileSync("src/rule-templates/CHOICE_RUNTIME.md", "utf8")
const typesSource = fs.readFileSync("src/rule-templates/types.ts", "utf8")
const resolverSource = fs.readFileSync("src/rule-templates/resolver.ts", "utf8")
const characterContext = fs.readFileSync("src/context/CharacterContext.tsx", "utf8")
const appSource = fs.readFileSync("src/App.tsx", "utf8")

test("repository keeps AI/developer architecture instructions discoverable from code", () => {
  assert.match(root, /Active class \/ Character Engine work is done on `dev`/)
  assert.match(root, /Generic mechanics before source-specific mechanics/)
  assert.match(root, /Future feats .* must reuse this runtime/i)
  assert.match(root, /Dynamic option providers/)
  assert.match(root, /Structured prerequisites/)
  assert.match(root, /Uniqueness \/ exclusion constraints/)
  assert.match(root, /Allocation choices/)
  assert.match(root, /Feat source integration/)

  assert.match(ruleTemplates, /Do not fork the architecture per source/)
  assert.match(ruleTemplates, /commit_character_template_choice_v1/)
  assert.match(ruleTemplates, /Dynamic option providers/)
  assert.match(ruleTemplates, /Structured prerequisites/)
  assert.match(ruleTemplates, /Allocation choices/)
  assert.match(ruleTemplates, /When feat implementation begins, make feats first-class CE\/template sources/)

  assert.match(typesSource, /INTERNAL AI\/DEV CONTRACT/)
  assert.match(typesSource, /read \.\/AGENTS\.md/)
  assert.match(resolverSource, /read \.\/CLASS_INTEGRATION_NOTES\.md/)
  assert.match(choiceRuntime, /before changing this runtime, read `\.\/AGENTS\.md`/)
})

test("owner admin remains a player-capable identity with GM-equivalent management authority", () => {
  assert.match(root, /Owner\/admin is not a third mutually exclusive role/)
  assert.match(root, /role = "player".*is_owner = true/s)
  assert.match(root, /canManage = isGm \|\| isOwner/)
  assert.match(root, /must be able to own\/activate\/play an assigned PC exactly like a player/i)
  assert.match(root, /gate GM-management UI only on `isGm` when `canManage` is the intended permission/)

  assert.match(characterContext, /role:\s*"gm"\s*\|\s*"player"/)
  assert.match(characterContext, /is_owner:\s*boolean/)
  assert.match(characterContext, /const\s+isGm\s*=\s*myMember\?\.role\s*===\s*"gm"/)
  assert.match(characterContext, /const\s+isOwner\s*=\s*myMember\?\.is_owner\s*===\s*true/)
  assert.match(characterContext, /const\s+canManage\s*=\s*isGm\s*\|\|\s*isOwner/)
  assert.match(characterContext, /character\.assigned_user_id\s*===\s*user\.id\s*&&\s*character\.character_type\s*===\s*"pc"/s)
  assert.match(appSource, /route\.tab==="me"&&canManage&&<GmWorkspace/)
  assert.doesNotMatch(appSource, /route\.tab==="me"&&isGm&&<GmWorkspace/)
})
