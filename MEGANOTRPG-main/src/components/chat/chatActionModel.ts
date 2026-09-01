import type {
  CharacterSource,
  ResolvedAction,
  ResolvedCharacterContract,
  ResolvedResource,
  ResolvedSpell,
  ResolvedSpellAccess,
} from "../../character-engine/index.ts"
import type { ResolvedSourceRef } from "../../character-engine/types.ts"

export type ChatActionBucket = "attacks" | "class" | "unique"
export type ChatSourceCategory = "class" | "unique" | "item" | "other"

export type ChatActionSourceGroup = {
  id: string
  name: string
  sourceType?: string
  resources: ResolvedResource[]
  actions: ResolvedAction[]
  spells: ResolvedSpell[]
}

export type ChatActionModel = {
  attacks: ResolvedAction[]
  attackSpells: ResolvedSpell[]
  spells: ResolvedSpell[]
  classGroups: ChatActionSourceGroup[]
  uniqueGroups: ChatActionSourceGroup[]
}

const CLASS_SOURCE_TYPES = new Set(["class_template", "subclass_template"])
const SELF_SPELL_SOURCE_TYPES = new Set(["legacy_spell", "character_spell", "learned_spell", "spellbook"])
const UNIQUE_SOURCE_TYPES = new Set([
  "character_feature",
  "legacy_feature",
  "race_template",
  "subrace_template",
  "gm_effect",
  "feat",
  "trait",
])

type RoutedSpellIdentity = ResolvedSpell["identity"] & { dealsDamage?: boolean }

export function chatSourceCategory(source: CharacterSource): ChatSourceCategory {
  const type = source.sourceType || ""
  if (CLASS_SOURCE_TYPES.has(type) || source.id.startsWith("template:class:") || source.id.startsWith("template:subclass:")) return "class"
  if (type === "inventory_item" || source.id.startsWith("item:")) return "item"
  if (UNIQUE_SOURCE_TYPES.has(type) || source.id.startsWith("feature:") || source.id.startsWith("legacy-feature:") || source.id.startsWith("template:race:") || source.id.startsWith("template:subrace:")) return "unique"
  return "other"
}

export function chatSourceGroupId(source: CharacterSource): string {
  const templateRoot = source.id.match(/^(template:[^:]+:[^:]+:v\d+)/)?.[1]
  return templateRoot || source.id
}

function sourceVisible(source: CharacterSource, includePrivateSources: boolean) {
  return includePrivateSources || source.visibility !== "private"
}

function visibleRefs(refs: ResolvedSourceRef[], includePrivateSources: boolean) {
  return refs.filter((ref) => sourceVisible(ref.source, includePrivateSources))
}

function distinctSources(refs: ResolvedSourceRef[], includePrivateSources = true): CharacterSource[] {
  const map = new Map<string, CharacterSource>()
  for (const ref of visibleRefs(refs, includePrivateSources)) map.set(chatSourceGroupId(ref.source), ref.source)
  return [...map.values()]
}

function sourceRefsForSpell(spell: ResolvedSpell): ResolvedSourceRef[] {
  return spell.accesses.flatMap((access) => access.sources)
}

function resourceGroups(contract: ResolvedCharacterContract, category: "class" | "unique", includePrivateSources: boolean) {
  const ids = new Set<string>()
  for (const resource of contract.resources) {
    for (const source of distinctSources(resource.sources, includePrivateSources)) {
      const sourceCategory = chatSourceCategory(source)
      if (category === "class" ? sourceCategory === "class" : sourceCategory === "unique" || sourceCategory === "item") ids.add(chatSourceGroupId(source))
    }
  }
  return ids
}

function actionHasMeaningfulAttack(action: ResolvedAction) {
  return Boolean(action.attack) || action.damage.some((entry) => Boolean(entry.dice))
}

function spellDealsDamage(spell: ResolvedSpell) {
  return Boolean((spell.identity as RoutedSpellIdentity).dealsDamage)
}

function accessIsSelfSpell(access: ResolvedSpellAccess, includePrivateSources: boolean) {
  return distinctSources(access.sources, includePrivateSources).some((source) =>
    SELF_SPELL_SOURCE_TYPES.has(source.sourceType || "") || source.id.startsWith("legacy-spell-source:"),
  )
}

function spellWithAccesses(spell: ResolvedSpell, accesses: ResolvedSpellAccess[]): ResolvedSpell {
  return {
    ...spell,
    accesses,
    available: accesses.some((access) => access.available),
  }
}

function visibleSpell(spell: ResolvedSpell, includePrivateSources: boolean): ResolvedSpell | null {
  const accesses = spell.accesses.filter((access) => visibleRefs(access.sources, includePrivateSources).length > 0)
  return accesses.length ? spellWithAccesses(spell, accesses) : null
}

function selfSpell(spell: ResolvedSpell, includePrivateSources: boolean): ResolvedSpell | null {
  const accesses = spell.accesses.filter((access) => accessIsSelfSpell(access, includePrivateSources))
  return accesses.length ? spellWithAccesses(spell, accesses) : null
}

export function classifyChatAction(action: ResolvedAction, uniqueResourceGroupIds: ReadonlySet<string>, includePrivateSources = true): ChatActionBucket {
  const sources = distinctSources(action.sources, includePrivateSources)
  const categories = new Set(sources.map(chatSourceCategory))
  if (categories.has("class")) return "class"
  if (categories.has("unique")) return "unique"

  const itemGroups = sources.filter((source) => chatSourceCategory(source) === "item").map(chatSourceGroupId)
  const itemIsPowered = itemGroups.some((id) => uniqueResourceGroupIds.has(id))
  const explicitlyUnique = action.tags.some((tag) => ["unique", "magic_item", "special", "feature"].includes(tag.toLocaleLowerCase("en-US")))
  if (itemIsPowered || action.resourceCosts.length > 0 || explicitlyUnique) return "unique"
  if (actionHasMeaningfulAttack(action)) return "attacks"
  return "unique"
}

function ensureGroup(map: Map<string, ChatActionSourceGroup>, source: CharacterSource, fallbackType?: string) {
  const id = chatSourceGroupId(source)
  let group = map.get(id)
  if (!group) {
    group = { id, name: source.name || "Особая способность", sourceType: source.sourceType || fallbackType, resources: [], actions: [], spells: [] }
    map.set(id, group)
  }
  return group
}

function addUnique<T>(items: T[], item: T, identity: (value: T) => string) {
  const id = identity(item)
  if (!items.some((existing) => identity(existing) === id)) items.push(item)
}

function addOrMergeSpell(items: ResolvedSpell[], spell: ResolvedSpell) {
  const existing = items.find((entry) => entry.key === spell.key)
  if (!existing) {
    items.push(spell)
    return
  }
  const accessKeys = new Set(existing.accesses.map((access) => access.key))
  const accesses = [...existing.accesses, ...spell.accesses.filter((access) => !accessKeys.has(access.key))]
  const index = items.indexOf(existing)
  items[index] = spellWithAccesses(existing, accesses)
}

function addResourceToGroups(map: Map<string, ChatActionSourceGroup>, resource: ResolvedResource, categories: ChatSourceCategory[], includePrivateSources: boolean) {
  for (const source of distinctSources(resource.sources, includePrivateSources).filter((entry) => categories.includes(chatSourceCategory(entry)))) {
    addUnique(ensureGroup(map, source).resources, resource, (entry) => entry.stateKey)
  }
}

function addActionToGroups(map: Map<string, ChatActionSourceGroup>, action: ResolvedAction, categories: ChatSourceCategory[], fallback: ChatActionSourceGroup, includePrivateSources: boolean) {
  const sources = distinctSources(action.sources, includePrivateSources).filter((entry) => categories.includes(chatSourceCategory(entry)))
  if (!sources.length) {
    addUnique(fallback.actions, action, (entry) => entry.stateKey)
    return
  }
  for (const source of sources) addUnique(ensureGroup(map, source).actions, action, (entry) => entry.stateKey)
}

function addSpellToGroups(map: Map<string, ChatActionSourceGroup>, spell: ResolvedSpell, categories: ChatSourceCategory[], includePrivateSources: boolean) {
  const grouped = new Map<string, { source: CharacterSource; accesses: ResolvedSpellAccess[] }>()
  for (const access of spell.accesses) {
    const sources = distinctSources(access.sources, includePrivateSources).filter((entry) => categories.includes(chatSourceCategory(entry)))
    for (const source of sources) {
      const id = chatSourceGroupId(source)
      const current = grouped.get(id) || { source, accesses: [] }
      if (!current.accesses.some((entry) => entry.key === access.key)) current.accesses.push(access)
      grouped.set(id, current)
    }
  }
  for (const { source, accesses } of grouped.values()) {
    addOrMergeSpell(ensureGroup(map, source).spells, spellWithAccesses(spell, accesses))
  }
}

function sortSpells(spells: ResolvedSpell[]) {
  return spells.slice().sort((left, right) =>
    left.identity.level - right.identity.level || left.identity.name.localeCompare(right.identity.name, "ru"),
  )
}

function sortedGroups(map: Map<string, ChatActionSourceGroup>) {
  return [...map.values()]
    .filter((group) => group.resources.length || group.actions.length || group.spells.length)
    .map((group) => ({ ...group, spells: sortSpells(group.spells) }))
    .sort((left, right) => left.name.localeCompare(right.name, "ru"))
}

function hasVisibleSources(refs: ResolvedSourceRef[], includePrivateSources: boolean) {
  return includePrivateSources || refs.some((ref) => ref.source.visibility !== "private")
}

export function buildChatActionModel(contract: ResolvedCharacterContract | null, includePrivateSources = true): ChatActionModel {
  if (!contract) return { attacks: [], attackSpells: [], spells: [], classGroups: [], uniqueGroups: [] }

  const classGroups = new Map<string, ChatActionSourceGroup>()
  const uniqueGroups = new Map<string, ChatActionSourceGroup>()
  const classFallback: ChatActionSourceGroup = { id: "class:other", name: "Классовые способности", sourceType: "class", resources: [], actions: [], spells: [] }
  const uniqueFallback: ChatActionSourceGroup = { id: "unique:other", name: "Особые способности", sourceType: "unique", resources: [], actions: [], spells: [] }
  classGroups.set(classFallback.id, classFallback)
  uniqueGroups.set(uniqueFallback.id, uniqueFallback)

  const uniqueResourceGroupIds = resourceGroups(contract, "unique", includePrivateSources)

  for (const resource of contract.resources) {
    if (!hasVisibleSources(resource.sources, includePrivateSources)) continue
    addResourceToGroups(classGroups, resource, ["class"], includePrivateSources)
    addResourceToGroups(uniqueGroups, resource, ["unique", "item"], includePrivateSources)
  }

  const attacks: ResolvedAction[] = []
  for (const action of contract.actions) {
    if (!hasVisibleSources(action.sources, includePrivateSources)) continue
    const bucket = classifyChatAction(action, uniqueResourceGroupIds, includePrivateSources)
    if (bucket === "attacks") attacks.push(action)
    else if (bucket === "class") addActionToGroups(classGroups, action, ["class"], classFallback, includePrivateSources)
    else addActionToGroups(uniqueGroups, action, ["unique", "item"], uniqueFallback, includePrivateSources)
  }

  const attackSpells: ResolvedSpell[] = []
  const spells: ResolvedSpell[] = []
  for (const spell of contract.spells) {
    const visible = visibleSpell(spell, includePrivateSources)
    if (!visible) continue
    if (spellDealsDamage(visible)) attackSpells.push(visible)
    const self = selfSpell(visible, includePrivateSources)
    if (self) spells.push(self)
    addSpellToGroups(classGroups, visible, ["class"], includePrivateSources)
    addSpellToGroups(uniqueGroups, visible, ["unique", "item"], includePrivateSources)
  }

  return {
    attacks: attacks.slice().sort((a, b) => (a.label || a.key).localeCompare(b.label || b.key, "ru")),
    attackSpells: sortSpells(attackSpells),
    spells: sortSpells(spells),
    classGroups: sortedGroups(classGroups),
    uniqueGroups: sortedGroups(uniqueGroups),
  }
}
