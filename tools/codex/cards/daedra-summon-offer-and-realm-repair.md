---
slug: daedra-summon-offer-and-realm-repair
title: "Daedra Summoning Quest Check Before Payment and the Realm Repair Tool"
domain: magic
kind: subcard
parent: stores-beds-grog-mending-and-wild-escrow-overview
files:
  - src/magic/daedraSummoning.js
  - src/scenes/worldModes.js
  - src/ui/daedraSummonedWindow.js
  - src/systems/quest/offerFlow.js
  - src/systems/quest/questBridge.js
  - src/net/repairLaw.js
  - server-account/src/review.js
  - server-account/src/service.js
  - server-account/src/index.js
  - server-account/migrations/0117_realm_repairs.sql
routes:
  - /v1/mod/realm-repair
tables:
  - realm_repairs
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-14.md"
related:
  - stores-beds-grog-mending-and-wild-escrow-overview
  - online-waits-daedra-summoning-by-name
  - realm-arc-service-transactions-and-escrow
invariants:
  - "`attemptSummoning` builds the prince's quest (`offerQuest(called.quest)`) before taking any gold or setting `FACTION_FLAGS.Summoned`. A summon that cannot produce a quest returns `{ kind: 'noQuest' }`, and the player keeps their gold."
  - "`noQuestText` tells the player the prince has no task in this region and the gold is kept. DFU says nothing here; this line is Bunnyfall's own."
  - "A `'failed'` summoning (the prince does not answer) still spends its cost."
  - "`/v1/mod/realm-repair` (`repairAct` in server-account/src/review.js) clears one FactionFile flag bit on one faction and refunds gold as a single letter of credit, once per ticket. It never rolls back the whole record."
traps:
  - "This intentionally departs from DFU, which takes the gold and sets the flag first. In a region with no required building (for example, no palace in Dakfron for Hermaeus Mora), that locked the quest forever and cost 100k gold."
  - "Repairs are run by an operator. Records are not mended automatically at load time."
dfu:
  - Assets/Scripts/Game/Player/PersistentFactionData.cs
  - Assets/Scripts/Game/UserInterfaceWindows/DaggerfallDaedraSummonedWindow.cs
tags:
  - daedra
  - summoning
  - quests
  - staff-tools
  - realm
---

# Daedra Summoning Quest Check Before Payment and the Realm Repair Tool

Bunnyfall validates Daedra quest placement before charging summoning gold or marking the prince summoned, and provides an operator endpoint to repair realm characters affected by the legacy DFU order.

- **Pre-payment quest validation:** In DFU, summoning deducts gold and sets `FACTION_FLAGS.Summoned` before compiling the quest, permanently locking the prince and consuming the payment when the current region lacks a required site (such as summoning Hermaeus Mora in a region without a palace). In `src/magic/daedraSummoning.js`, `src/systems/quest/offerFlow.js`, and `src/systems/quest/questBridge.js`, `attemptSummoning` runs `offerQuest(called.quest)` first.
- **No-quest vs failed outcomes:** When the quest cannot be built in the current region, `attemptSummoning` returns `{ kind: 'noQuest' }` without charging gold or setting `FACTION_FLAGS.Summoned`, and `src/scenes/worldModes.js` plus `src/ui/daedraSummonedWindow.js` display `noQuestText` explaining that the prince has no task in this region and the gold is kept. By contrast, a `'failed'` roll where the prince refuses to answer still deducts the summoning cost.
- **Operator realm repair endpoint:** For realm characters that lost gold and locked a faction flag under the old order, an operator invokes `POST /v1/mod/realm-repair` with `{ id, ticket, faction, flag, gold, note? }` (`src/net/repairLaw.js`, `server-account/src/review.js`, `server-account/src/service.js`, and `server-account/src/index.js`). `repairAct` clears the single flag bit on the targeted faction, issues one letter of credit for the refunded gold, and logs the idempotent ticket in `realm_repairs` (`server-account/migrations/0117_realm_repairs.sql`) without rolling back the entire character record.
