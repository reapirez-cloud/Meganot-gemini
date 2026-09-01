# INTERNAL: GM adjudication boundary

> **Developer/agent contract. Never render or import this file into player-facing UI.**
>
> This document defines the default boundary between Character Engine (Gena/CE) and the human GM for classes, subclasses, feats, spells, items and other rule sources.

## Core rule

**Gena owns persistent character-side state and deterministic bookkeeping. The GM owns scene legality, action economy and narrative transactions.**

Do not automate a rule merely because it can theoretically be automated. A mechanic is complete when the application represents the durable character state it actually needs and gives the GM/player enough exact information to adjudicate the rest.

Manual GM mutation through the normal manager tools is a valid and intentional execution path. It is not a missing runtime mechanic.

## What Gena should own

Automate or enforce facts that are durable, deterministic and already authoritative inside the application, for example:

- class/subclass level and unlocks;
- ability scores, proficiencies, Expertise and other persistent capabilities;
- persistent class choices;
- spellbook membership when a spell has actually been granted/recorded;
- prepared-spell membership and prepared-count limits;
- spell slots and other finite resources;
- PB/LR, X/SR, X/LR and similar finite pools when represented by a real resource;
- rest recharge of resources when the application owns the rest event/window;
- permanent/passive numeric modifiers;
- inventory/currency/spellbook state after an authorized GM/player mutation;
- deterministic eligibility that depends only on authoritative character data.

If the state must survive reloads, affect later calculations, or be shared between sheet and chat, it is a strong candidate for CE ownership.

## What the GM should own

Do not build runtime enforcement for facts whose legality is established by play at the table/chat rather than by authoritative character state.

This includes by default:

- whether the character still has an Action, Bonus Action or Reaction available;
- how many attacks/actions the player already attempted this turn;
- `once per turn`, `once per round`, or similar cadence when MEGANOT does not explicitly run an authoritative turn tracker;
- whether a hit occurred, a saving throw failed, a creature is visible/reachable/willing, a corpse/object/terrain exists, or another scene trigger is true;
- whether a target qualifies under a narrative rule;
- movement legality, free space, cover, weather, initiative timing and other scene state not owned by the app;
- narrative purchases, crafting, transcription, training, bargaining and similar transactions whose inputs are handled by the GM during play;
- consuming/removing a scroll, material, book or other item as part of such a narrative transaction unless that specific flow has intentionally been promoted into a first-class authoritative system.

**Do not create a turn tracker, combat-state machine, fake scene flags or transaction subsystem only to make one class feature look automatic.**

## Action-economy policy

`action`, `bonus_action` and `reaction` are presentation/adjudication information unless a separate authoritative resource is involved.

The UI may expose a class action every time the player wants to invoke/roll/send it. Gena does **not** block repeated presses merely because the rule says Action, Bonus Action, Reaction, once per turn, or because the character normally has a limited number of attacks in a turn.

Example: if the player sends ten ordinary attacks, all ten attempts may appear in chat/logs. The GM decides how many were legal and resolves/ignores the rest.

If the same ability also spends a real finite resource, Gena still owns that resource. Example: an ability may be a Bonus Action and have 3 uses per Long Rest. Gena may spend the 3-use pool, but it still does not need to know whether the Bonus Action for the current turn was already spent.

`Extra Attack` and similar rules should state/display the legal number precisely, but they do not justify a turn/action counter by themselves.

## Narrative transaction policy

A rule can have an exact cost/time/item procedure in its player-facing text without requiring a dedicated transactional runtime.

Canonical Wizard example: copying a found spell or spell scroll into a spellbook.

During play the GM and player resolve the fiction. The GM can:

1. verify the source/scroll and whether copying is allowed;
2. deduct currency through normal GM inventory/currency tools;
3. remove/consume the scroll or other source if appropriate;
4. add the resulting spell to the character's authoritative spellbook;
5. record any narrative time/consequence in play.

Gena only needs the durable result: the spell is now in the spellbook. It does **not** need a special "transcribe scroll" workflow, timer, automatic gold deduction or automatic scroll consumption unless the project later deliberately chooses to make that transaction itself a first-class system.

The same principle applies to many class/item interactions: if the GM can already perform the authoritative end-state mutation safely, do not duplicate the GM with a bespoke mini-game.

## Hybrid mechanics

Many mechanics are intentionally hybrid:

- **GM:** decides whether the trigger/action/target is legal in the scene.
- **Gena:** calculates or persists the parts it owns, such as attack formula, damage roll, slot/resource cost, prepared state or permanent grant.

Hybrid is the normal case, not a failure of integration.

A feature may therefore be mechanically complete even when part of its execution remains GM-adjudicated.

## Completion rule for class audits

When auditing a class, every rule must be classified mentally into one of these buckets:

1. **CE-owned:** must be implemented and tested as authoritative state/runtime.
2. **GM-adjudicated:** exact rule text is required, but no fake automation is required.
3. **Hybrid:** CE implements only the durable/deterministic portion; GM adjudicates scene/action legality.

Do not leave a rule vague. But also do not convert a precise GM-adjudicated rule into an artificial runtime blocker.

A class is not incomplete merely because it lacks automation for a GM-adjudicated part of the rule.

## Default decision test

Before adding a new runtime primitive for a class mechanic, ask:

1. Does the app already own the facts needed to decide this without asking the GM?
2. Does the result need to persist and affect later character calculations/state?
3. Would failure to automate this cause inconsistent character state rather than merely require GM adjudication?
4. Is this capability reusable beyond one isolated narrative interaction?

If the answer is mostly **no**, keep the rule precise in text and leave execution to the GM.
