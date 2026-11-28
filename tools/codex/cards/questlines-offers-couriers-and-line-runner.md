---
slug: questlines-offers-couriers-and-line-runner
title: "Questline Offers, Courier Pacing, and the Line Runner"
domain: quests
kind: subcard
parent: questlines-arc-overview
files:
  - src/systems/questlines/qlLineRunner.js
  - src/systems/questlines/qlLines.js
  - src/systems/quest/questlineOffers.js
  - src/systems/quest/questlineHost.js
  - src/systems/quest/questShare.js
  - src/systems/questlines/qlActs.js
  - src/systems/questlines/qlLadders.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Questlines-Arc.md"
related:
  - questlines-arc-overview
  - questlines-service-claims-titles-and-weir-key
  - sky-ketch-raid-overview
  - dagons-breach-world-boss
invariants:
  - "A questline is never pushed automatically; it appears on a notice board, at a giver's door, or in the Quests tab, and step 1 starts only when the player accepts it (`taken: true`)."
  - "A later step's courier letter waits while another letter is in transit (`letterOnItsWay`), and `STEP_GAP_S = 3600` game seconds elapses after the previous letter arrives (`lettered`)."
  - "Questline steps cannot be shared in a party: `src/systems/quest/questShare.js` rejects both send and receive with reason `'questline'` whenever `lineStepOf(questName)` matches."
  - "Lines with `opens.online` open only when the account service is reachable, and every endgame line also requires `opens.account` (a registered account, not a guest)."
traps:
  - "`RETRY_GAP_S = 24 * 3600` game seconds governs both retrying a failed later step and resting a refused giver offer in `src/systems/quest/questlineOffers.js`."
  - "When an environmental prerequisite stops holding (such as `starfall` after the Witches Festival ends), the runner shelves the active step via `machine.shelveQuest` with `aside = true` and reclaims it when the condition returns, never reclaiming quests shelved by the player."
dfu:
  - Assets/Scripts/Game/Questing/Actions/GivePc.cs
tags:
  - questlines
  - offers
  - courier
  - pacing
  - acts-feed
  - ladders
---

`src/systems/questlines/qlLines.js` defines eight intro lines and seven endgame lines (`burningDoors`, `covensHoard`, `weirRoad`, `hourThatWasNot`, `skyKetch`, `oldCoil`, and `thirteenthFrostfall`). `src/systems/questlines/qlLineRunner.js`, `src/systems/quest/questlineOffers.js`, and `src/systems/quest/questlineHost.js` manage offer availability, step transitions, and courier pacing.

## Opt-In Offers and Courier Pacing

Questlines never auto-start. Eligible lines (`lineOpens`, which checks `opens.online` and `opens.account` for online and registered-account requirements) post offers at notice boards, quest givers, and the Quests tab. Disabled content blocks offers and stops the runner from scheduling further steps. Saved progress is retained. Step 1 launches only after the player accepts the offer (`taken: true`). Once a step finishes, the runner schedules the next step's courier letter (`GivePc`) after `STEP_GAP_S = 3600` game seconds measured from the last delivered letter (`lettered`), holding delivery whenever another letter is already in transit (`letterOnItsWay`).

## Retries, Shelving, Party Lockout, and Acts Feed

If a later step fails or a player declines a giver's offer, `RETRY_GAP_S = 24 * 3600` game seconds delays the next attempt. When an active step's world requirement turns off mid-step (such as `starfall` when the Witches Festival closes), the runner shelves the quest via `machine.shelveQuest` with `aside = true` rather than failing it, and restores it once the condition returns (ignoring quests manually shelved by the player).

In `src/systems/quest/questShare.js`, `lineStepOf(questName)` blocks party sharing on all questline steps with reason `'questline'`. World systems record player milestones through `noteAct(kind, n)` in `src/systems/questlines/qlActs.js` for `act` bindings, while `ladders()` in `src/systems/questlines/qlLadders.js` builds guild rank progress rows.
