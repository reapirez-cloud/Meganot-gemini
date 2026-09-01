import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const migration = fs.readFileSync("supabase/migrations/20260830205500_catalog_only_character_spells.sql", "utf8")
const spellbook = fs.readFileSync("src/components/characters/CharacterSpellbook.tsx", "utf8")
const types = fs.readFileSync("src/types/characterSheet.ts", "utf8")
const reference = fs.readFileSync("src/components/characters/SpellReference.tsx", "utf8")

test("character spells require one canonical spell_catalog identity in storage", () => {
  assert.match(migration, /character_spells[\s\S]*alter column catalog_spell_id set not null/i)
  assert.match(migration, /character_spells_catalog_spell_id_fkey[\s\S]*on delete restrict/i)
  assert.match(migration, /character_spells_catalog_unique_idx[\s\S]*character_id, catalog_spell_id/i)
  assert.match(types, /CharacterSpell = \{[\s\S]*catalog_spell_id\?: string \| null/)
})

test("legacy local spell definitions are archived instead of guessed into the catalog", () => {
  assert.match(migration, /character_spell_legacy_archive/)
  assert.match(migration, /Missing canonical spell_catalog identity/)
  assert.match(migration, /delete from public\.character_spells[\s\S]*catalog_spell_id is null/i)
  assert.doesNotMatch(migration, /insert into public\.spell_catalog[\s\S]*character_spell_legacy_archive/i)
})

test("compatibility spell fields are always rebuilt from the catalog", () => {
  assert.match(migration, /sync_character_spell_catalog_projection/)
  assert.match(migration, /new\.name := coalesce\(nullif\(v_spell\.name_ru/)
  assert.match(migration, /new\.spell_level := v_spell\.spell_level/)
  assert.match(migration, /new\.description := concat_ws/)
  assert.match(migration, /before insert or update on public\.character_spells/)
})

test("learnable spell options are catalog links instead of standalone definitions", () => {
  assert.match(migration, /character_spell_options[\s\S]*add column if not exists catalog_spell_id uuid/i)
  assert.match(migration, /character_spell_options[\s\S]*alter column catalog_spell_id set not null/i)
  assert.match(migration, /character_spell_options_catalog_unique_idx/)
  assert.match(migration, /insert into public\.character_spells \([\s\S]*character_id,[\s\S]*catalog_spell_id,[\s\S]*prepared/)
})

test("spellbook authors character spell membership only through the shared reference", () => {
  assert.match(spellbook, /\+ Добавить из Справочника/)
  assert.match(spellbook, /Заклинания персонажа всегда ссылаются на общий каталог/)
  assert.doesNotMatch(spellbook, /onClick=\{onAddOption\}/)
  assert.doesNotMatch(spellbook, /onClick=\{\(\) => onEditSpell/)
  assert.doesNotMatch(spellbook, /onClick=\{\(\) => onEditOption/)
  assert.match(reference, /rpc\("learn_catalog_spell"/)
})
