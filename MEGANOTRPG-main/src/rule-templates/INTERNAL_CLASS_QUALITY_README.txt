INTERNAL DEVELOPER POINTER — NOT PLAYER CONTENT

Before implementing, auditing, reopening, or completing any class/subclass:
1. Read CLASS_WORK_STATUS.md FIRST. It is the canonical work checkpoint.
2. Read CLASS_INTEGRATION_NOTES.md.
3. If the layer you touch was READY, mark it IN_PROGRESS while it is reopened.
4. Use internalClassQuality.ts.
5. The package test must run assertClassPackageQuality.
6. Resolve every ambiguity; never replace missing rules with vague prose.
7. Future class migrations must declare CLASS_INTEGRATION_STRICT and CLASS_PACKAGE_TEST headers.
8. Class/subclass persistent resources are allowed only for explicit finite pools that recover on short rest and/or long rest. Reaction, once-per-turn/round/combat and start-of-combat cadence never create CE counters by themselves; the GM tracks that cadence.
9. A reaction or triggered ability may still have a real resource when its rule separately grants a finite short/long-rest pool. Economy is never the resource.
10. Resource-backed class actions sent from chat must spend through the server-authoritative template action runtime in the same transaction as the chat event/roll. Resource-less actions remain linkable and unlimited from CE's resource perspective.
11. Update CLASS_WORK_STATUS.md before finishing the work: what changed, what is closed, what remains, and what must be audited next.

TEXT READY and MECHANICS READY are independent statuses. Never infer one from the other.
A class/subclass task is not complete if its status ledger entry is stale.

This file and CLASS_WORK_STATUS.md must never be imported or rendered by the application.
