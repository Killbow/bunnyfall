---
slug: questlines-rewards-tiers-and-gear-offers
title: "Quest Tiers, Pay Profiles, and Gear Offers"
domain: quests
kind: subcard
parent: questlines-arc-overview
files:
  - src/systems/questlines/qlRewards.js
  - src/systems/questlines/qlLayer.js
  - src/systems/quest/questBridge.js
  - src/ui/notebook.js
  - src/ui/questlines/qlJournal.js
  - src/systems/quest/onlineRepute.js
  - tools/qlSheetLaw.mjs
routes: []
tables: []
replacesBible:
  - "06-Systems/Questlines-Arc.md"
related:
  - questlines-arc-overview
  - questlines-objective-sheets-and-branches
  - economy-ledger-and-item-judge
invariants:
  - "`TIER_FLOORS`: tiers `1` and `2` start at `magic` rarity (tier `2` has a `0.25` chance to step up one rung), and tiers `3` and `4` start at `rare` with no step up; quest gear rewards never roll `legendary`."
  - "`OFFERS_MAX = 12` caps waiting gear reward offers; `trimOffers` drops the oldest offer without a named item first, falling back to the oldest overall only when all twelve hold named items."
  - "`REWARD_CHOICES = 3` items are generated per gear-paying outcome; if a player's class restrictions bar a rolled weapon or armor piece, that slot re-rolls into usable armor or jewelry."
  - "In online play (`quest.hooks.sharedClock()`), a failed outcome applies zero faction standing penalty (`failureFree`), whereas offline play applies normal failure standing."
traps:
  - "`goldStillOwed(paid, outcome)` pays only the difference between the outcome's target gold and the gold the quest script already awarded, preventing double payouts."
  - "Outcome gold multipliers are clamped between `OUTCOME_GOLD_MIN = 0.75` and `OUTCOME_GOLD_MAX = 1.5`."
  - "The questline layer offers an outcome's gear only when the quest is paid (by `give pc`, `ql paid`, or `train pc`) or ends as a success, so `tools/qlSheetLaw.mjs` refuses a gear outcome whose script never pays, or whose ending task ends the quest unpaid while no start task pays."
dfu: []
tags:
  - questlines
  - rewards
  - loot-tiers
  - gear-offers
  - reputation
---

`src/systems/questlines/qlRewards.js` computes outcome gold adjustments, faction standing rules, and tiered equipment offers when a stamped quest completes through `src/systems/questlines/qlLayer.js` and `src/systems/quest/questBridge.js`.

## Pay Profiles and Gold Reconciliation

Each sheet outcome references one of the `PAY_PROFILES`: `standard` (`1x` gold and gear), `lesser` (`0.75x` with gear), `greater` (`1.25x` with gear plus one quest tier step), `double` (`1x` gear with raised gold), and `betrayal`, `own`, or `none` (`1x` with no gear offer). Outcome gold multipliers are clamped to `OUTCOME_GOLD_MIN = 0.75` and `OUTCOME_GOLD_MAX = 1.5`. Because classic quest scripts often pay base gold before completion, `goldStillOwed(paid, outcome)` awards only the unpaid remainder so the player is never paid twice.

## Gear Tiers, Offer Queue, and Standing Rules

Gear-paying outcomes roll `REWARD_CHOICES = 3` candidate items governed by `TIER_FLOORS`: tiers `1` and `2` use a `magic` floor (tier `2` has a `0.25` chance to upgrade to `rare`), while tiers `3` and `4` use a `rare` floor with zero upgrade chance, ensuring quest offers never reach `legendary`. If class restrictions forbid a rolled weapon or armor type, the generator substitutes legal armor or jewelry in that choice slot.

Up to `OFFERS_MAX = 12` uncollected reward offers wait in `src/ui/questlines/qlJournal.js`; `trimOffers` evicts the oldest unnamed offer before touching offers with named items. Completed outcomes persist via `notebook.fileFinishedOutcome` (`finishedQuestOutcomes` in `src/ui/notebook.js`). In `src/systems/quest/onlineRepute.js`, failed quests skip reputation loss while online (`failureFree` when `quest.hooks.sharedClock()` is truthy), while offline saves apply standard failure standing.
