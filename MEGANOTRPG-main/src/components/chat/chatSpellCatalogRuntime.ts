import type { ResolvedSpell } from "../../character-engine/index.ts"
import type { CatalogSpellRollMode, CatalogSpellRollSource } from "../../lib/spellRollCatalog.ts"

export type ChatSpellCatalogRuntime = CatalogSpellRollSource & {
  roll_mode: CatalogSpellRollMode
}

export type ChatSpellIdentityRuntime = ResolvedSpell["identity"] & {
  dealsDamage?: boolean
  catalogRoll?: ChatSpellCatalogRuntime
}

export function chatSpellIdentityRuntime(spell: ResolvedSpell): ChatSpellIdentityRuntime {
  return spell.identity as ChatSpellIdentityRuntime
}

export function chatSpellCatalogRuntime(spell: ResolvedSpell): ChatSpellCatalogRuntime | null {
  return chatSpellIdentityRuntime(spell).catalogRoll || null
}
