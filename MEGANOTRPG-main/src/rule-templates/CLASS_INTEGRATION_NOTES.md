# INTERNAL: Class integration rules

> **Developer-only note. Never render/import this file into the player UI, Reference Guide, narrator text, `description`, `author_description`, or `author_comment`.**
>
> Read this before changing any class or subclass integration.

## Mandatory quality gate for every next class

This is not advisory documentation. Before a new class package is called finished, its package test **must** import and run `assertClassPackageQuality` from `./internalClassQuality.ts` against the class and every included subclass fixture.

Every new class-related migration created from `20260830000000` onward must declare exactly one scope:

```text
-- CLASS_MIGRATION_SCOPE: mechanics|presentation|infrastructure
```

Use:
- `mechanics` when the migration creates or changes CE-facing class/subclass mechanics, choices, resources, actions, spell access, numeric contributions or mechanical progression;
- `presentation` when it changes only player-facing/reference/narrator copy while leaving mechanics intact;
- `infrastructure` for catalog lifecycle, cleanup, bootstrap, trigger, assignment or migration-history plumbing that does not define a class mechanic.

A `mechanics` migration must additionally include:

```text
-- CLASS_INTEGRATION_STRICT: class:<stable-key>
-- CLASS_PACKAGE_TEST: tests/<class>OfficialPack.test.ts
```

Do not force presentation or infrastructure migrations to pretend they are class packages merely because they touch `rule_templates`. Scope exists specifically to prevent that ambiguity.

The referenced mechanics test must:
- run `assertClassPackageQuality`;
- pass the real package through `resolveTemplateBundles`;
- reach `resolveCharacterContract`;
- include representative low, mid and high level checks;
- verify finite resource accounting and any persistent choices relevant to that class.

A class is **not finished** while any rule is недосказан, ambiguous, placeholder-like, or only implied by prose. If implementation work reveals uncertainty, resolve it explicitly before merge; never hide uncertainty behind generic wording.

For every player-facing feature, write every applicable part of this chain:

**trigger/condition → activation → cost → target → exact effect → numbers/dice/DC/range → duration → limit/recharge.**

If a part does not apply, omit it. If it does apply, it must be stated precisely.

Forbidden substitutes for an actual rule include wording equivalent to:
- “у вас что-то есть”;
- “вы можете что-то применять”;
- “расширяет возможности”;
- “усиливает возможности”;
- “становится эффективнее”;
- “по ситуации” / “при необходимости” when the real trigger can be stated;
- TODO/TBD/FIXME/placeholder text.

`internalClassQuality.ts` is deliberately developer-only and CI-facing. Do not import it into player application code. Its purpose is to make the Fighter-grade implementation standard reusable for every later class: exact text, real resources, server-authoritative actions, stable `sourceKey`, persistent choices, parent-class level semantics, parser→CE tests, and no fake scene state.

## Core rule

Character Engine (CE) is the mechanical source of truth for character data. A class/subclass parser emits structured contributions into CE. The UI reads the resolved contract; it must not re-parse class rules.

**CE is a calculator and resource ledger, not a virtual GM and not a world-state simulator.**

A class feature is considered integrated when:

1. the player-facing rule is precise;
2. the rule reaches CE as structured data where CE has real character-side state to resolve;
3. finite resources, spell costs, numeric bonuses, grants, persistent choices and other mechanically knowable values are native;
4. dependencies and upgrades that depend on character-side state are explicit;
5. GM suppression can remove the feature through a stable `sourceKey`;
6. the UI never pretends CE verified fiction that CE cannot know.

## What CE may enforce

CE may disable/block or automatically resolve only facts it actually owns.

Examples:
- minimum class level;
- a selected persistent option;
- resource current/max value (`wild_shape`, Ki/Focus, Rage, Superiority Dice, spell slots, charges);
- another owned feature/grant;
- a resource recharge limit represented by a real CE resource;
- an upgrade replacing an earlier feature;
- a subclass requiring its parent class;
- a persistent state only when MEGANOT explicitly stores that state as authoritative character data.

If a limit can be represented honestly as a resource, prefer a resource. Example: “once per long rest” can be a `1/1` resource with long-rest recharge.

## What CE must NOT enforce

Do **not** create fake parser state, fake flags, or `GM-enforced` requirements for things the engine cannot observe.

Examples:
- target is standing in water;
- it is raining;
- a corpse is nearby;
- the character can see the target;
- there is enough free space;
- a suitable plant/tree is nearby;
- the target is willing;
- the beast was previously seen;
- a hit actually occurred;
- a saving throw actually failed;
- initiative has just been rolled unless the application has a real initiative event/state;
- “once per turn” unless turns are explicitly tracked by the current gameplay runtime;
- the GM decides a creature/object qualifies.

Those are **execution rules**. Put them in the feature/action explanation so the player and GM know exactly what to do. They are not parser requirements and must not manufacture a fake `*_confirmed` or `*_available` fact merely to make a button look smart.

The parser may still expose the resource-side action. Example: an action can spend one Wild Shape use; the rule text explains what transformation occurs. CE does not need to simulate the beast form to account for the resource.

## Resource-side actions

For a deliberate class ability, emit an action when CE has something real to account for:

- resource spending;
- one of several alternative resource payments;
- restoring/converting a resource;
- attack/damage formulas that are directly rollable by the application;
- other character-side values that the current runtime genuinely owns.

The live character-sheet action path must be server-authoritative for resource mutations. Client-side `executeAction`/preview logic is not a substitute for persistent resource state.

Semantic consequences that are not persisted by the current runtime stay in the rule description. Do not invent state merely so the parser can “execute” them.

## Rule payload standard

Store enough structured data for the portions the application can truthfully consume without parsing Russian prose.

Where relevant, capture:
- activation / action economy;
- resource cost and alternative payments;
- target / range / area for display and roll tooling;
- attack, save, damage/healing/temp-HP formulas where the runtime actually supports them;
- duration for display;
- finite uses / recharge;
- scaling by class level, proficiency bonus, or ability modifier;
- persistent choices;
- replacement/upgrade behavior;
- resource-side dependencies.

Do not add structured “requirements” whose only consumer would be a human GM. The prose is the authoritative place for scene/fiction requirements.

## Spells from classes/subclasses

If a class/subclass automatically grants a spell at a level, emit a CE `spell` access from that source.

- unlock it from the source level, not total character level;
- subclass level follows its parent class level;
- use `always_prepared` when the rule says the spell is always prepared;
- do not duplicate it into the character's manually learned spell collection;
- the class tab may render the access under the class/subclass source;
- casting still spends the real shared spell-slot resource (or another declared casting resource).

## Dependencies and upgrades

Use structured dependencies only when they are based on authoritative CE character state.

For a true upgrade of the same mechanical identity, prefer replacement semantics (`REPLACE`) rather than granting two competing versions.

If a later feature changes the rule but the trigger remains scene-dependent, store the changed rule precisely in the feature description/payload without inventing an engine state.

## Persistent choices

A choice is selected once unless the rule explicitly allows changing it.

- unresolved choice is inert and must not block automatic class mechanics;
- selected choice persists across level changes;
- later `option_mechanics_by_level` unlock automatically from the original selection;
- an upgrade must follow the previously selected branch unless the rule grants a new choice.

## GM OFF / suppression

Every independently suppressible feature needs a stable `sourceKey`.

- related action/resource/spell/rule card should normally share the same `sourceKey`;
- suppressing the source removes the complete mechanical package;
- do not make UI-specific suppression hacks;
- source hierarchy belongs to parser/CE read-model, not class-specific consumers.

This is an administrative source switch, not “GM enforcement” of a scene condition.

## Player-facing explanations

Mechanical descriptions must answer, where applicable:

**Trigger/condition → activation → cost → target → exact effect → numbers/dice → duration → limit/recharge.**

Bad:
- “расширяет возможности друида”;
- “усиливает лечение”;
- “развивает направление”;
- “становится эффективнее”.

Good:
- “Когда заклинание 1+ уровня восстанавливает HP другому существу, друид восстанавливает себе 2 + уровень ячейки HP.”

Never use vague prose as a substitute for a rule. Conversely, never use fake engine state as a substitute for a clear execution rule.

## Narrator / Reynar Voss

Voss is an in-world narrator, not a developer note channel.

He may provide:
- field observations;
- dry practical advice;
- cynical or sarcastic commentary;
- consequences a person in the setting would understand.

He must never mention:
- Character Engine / CE / runtime;
- editions, revisions, compatibility or overrides;
- “we use”, “we changed”, “our implementation”;
- why developers selected one rule version over another.

Technical history stays in internal metadata/comments only.

## Druid project-specific rules

These are internal implementation facts and must not leak into narrator text.

- Base Druid follows the project's current base package.
- Wild Shape uses the project's pinned beast-stat/HP model.
- Wild Shape has 2 uses.
- Both uses return on a short or long rest.
- Form uses beast HP and physical stats.
- Do not grant temporary HP from the alternate Wild Shape model.
- Do not use alternate usage scaling.
- Druid subclass unlock is tied to Druid class level, not total character level.

### Druid resource examples

- `Wild Shape`: CE spends `wild_shape`; transformation execution is explained, not simulated by fake parser state.
- `Wild Companion`: CE spends either Wild Shape or a spell slot; familiar creation/existence is the rule execution.
- `Wild Resurgence`: CE can perform slot ↔ Wild Shape conversion because both sides are resources. The once-per-long-rest reverse exchange is another `1/1` resource. “Once per turn” remains prose until turn tracking actually exists.
- `Elemental Fury`: persistent choice at level 7; level 15 upgrades the selected branch automatically.
- `Beast Spells`: explanation changes what is legal while transformed; do not invent `wild_shape_active` merely to gate the parser unless the application later owns authoritative transformation state.
- `Archdruid`: CE may expose resource restoration/conversion actions. “When initiative is rolled” is a trigger explained to the player unless initiative events become authoritative runtime state.
- Scene requirements such as “target is in water” or “corpse is nearby” stay in the explanation only.

## Definition of done for one class

Do not call a class finished until all of these are checked:

1. base class levels 1–20 are accurate;
2. every included subclass is accurate;
3. no placeholder descriptions remain;
4. finite pools have CE resources;
5. resource-side deliberate abilities have usable server-authoritative actions;
6. spells are CE spell accesses, not prose-only grants;
7. passive mechanical grants are native where representable;
8. resource dependencies and upgrades are structured;
9. scene/fiction requirements are explained, not faked as parser state;
10. persistent choices survive level changes and unlock later mechanics;
11. subclass level follows parent class level;
12. GM suppression removes the complete source package;
13. parser → `ResolvedCharacterContract` tests verify representative low/mid/high levels;
14. resource mutations persist and are shared by sheet/chat;
15. reference text and Voss commentary contain no implementation meta;
16. the package test passes `assertClassPackageQuality` with zero issues;
17. every discovered ambiguity/nedosказанность is resolved explicitly;
18. CI is green.

If any item above fails, the class is still in progress.
