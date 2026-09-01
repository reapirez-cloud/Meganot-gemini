# Persistent Character Choices

> **AI/developer instruction:** before changing this runtime, read `./AGENTS.md`. Do not create source-specific choice engines for feats/classes; extend the generic CE choice contract when a real rule needs a new primitive.

`RuleChoiceDefinition.selection_mode = "player_once"` turns an ordinary template choice into a player-facing Character Engine decision.

## Contract

- The assigned player resolves player-facing choices.
- The server validates the active assignment, source level, option list, `option_unlock_level`, `count`, `count_by_level`, and `requires_choice`.
- A confirmed ordinary `player_once` option is append-only for the player. It cannot be removed or replaced through the player RPC.
- If `count_by_level` later increases the required number of selections, the choice becomes pending again only for the missing slots. Existing selections remain fixed.
- Manager-owned choices remain the default (`selection_mode` omitted or `manager`) and are not shown in the player decision queue.
- Administrative correction is a separate authority path. A GM/owner may correct character state through the character sheet/editor; that command belongs to the Oracle/admin layer and is not permission inherited by GENA.

## GENA long-rest boundary

`refresh = "long_rest"` is the explicit exception that lets the assigned player replace a choice during a new post-rest preparation generation.

- GENA preparation RPCs are **assigned-player only**. Campaign manager status does not grant access.
- Each post-rest task may be confirmed once per preparation generation. `Готово` means final until the next long rest, not "editable until the first chat message".
- GENA stores a `character_preparation_records` receipt for the confirmed generation. The receipt is the server-authoritative lock.
- An empty choice is never a valid confirmation.
- If the player starts ordinary character speech without confirming a refreshable persistent choice, the previous persisted choice remains in force.
- If an inherently random post-rest task is skipped, GENA may resolve its authored random input server-side before closing the preparation generation.

This separation is deliberate: **GENA executes character rules; Oracle/admin commands may override character state. GM authority does not leak into GENA merely because the same user has a manager role.**

## UI states

`resolveTemplateChoiceStates()` produces `hidden`, `pending`, or `locked` for ordinary persistent choices.

- `hidden`: dependency is not satisfied; the choice is not shown and emits no mechanics.
- `pending`: the source is unlocked but one or more required selections are missing.
- `locked`: the current required count is complete. Selected variants are shown as on; mutually exclusive alternatives are shown as off.

Post-rest GENA UI adds a generation lock on top: a refreshable choice can be drafted while its current generation has no receipt, then becomes read-only immediately after confirmation.

## Spells and future feats

Spell options should use stable catalog identities such as `spell:guidance` and their mechanics should grant the canonical `class_spell` access. The choice runtime stores only the selected stable keys; CE continues to resolve the actual mechanics from the source definition.

Prepared-spell quotas are authored by the class package. Always-prepared class/subclass spells are separate CE access grants and do not consume the player's selectable preparation quota.

The same choice contract is intentionally source-agnostic. When feats become CE sources, their "choose from" clauses should use this runtime rather than inventing a second selection system.

The next generic primitives are tracked in `./AGENTS.md`: dynamic option providers, structured CE-owned prerequisites, uniqueness/exclusion constraints, bounded numeric allocations, explicit respec/change policy, multi-stage dependent choices, and first-class feat source integration. Implement each when a real rule first needs it, but implement it generically rather than inside one feat/class.
