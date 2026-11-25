---
slug: tonal-warden-fight-and-downed-crew
title: "Tonal Warden Fight, Falls, and Downed Crew"
domain: multiplayer
kind: subcard
parent: sky-ketch-raid-overview
files:
  - src/net/ketch/ketchWarden.js
  - src/net/ketch/ketchBrain.js
  - src/net/ketch/ketchDeck.js
  - src/systems/ketch/ketchFight.js
  - src/systems/ketch/ketchClient.js
  - src/systems/ketch/ketchDeckHost.js
  - src/systems/ketch/ketchWords.js
  - src/characters/madeLevel.js
  - server/src/index.js
replacesBible:
  - "11-Multiplayer/Sky-Ketch.md#warden"
  - "11-Multiplayer/Sky-Ketch.md#death"
related:
  - sky-ketch-raid-overview
  - sky-ketch-stages-cells-and-constructs
  - sky-ketch-receipts-spoils-and-claims
  - combat-formulas-and-power-ceiling
invariants:
  - "The Tonal Warden fight runs on `KETCH_SEAM`: each participating account (up to `KT_CREW_MAX`) adds `KW_TTK_S` (`600 s`) of its reference DPS to max health."
  - "Phase thresholds sit at `KW_PHASE_AT` `0.65` and `0.35`: Phase 1 (Steersman) cycles standard blows, Phase 2 (Discord) shields the boss until four resonators are retuned with bridge cells, and Phase 3 (Last Note) casts Keel-Song unless all spawned tuning forks are destroyed while bridge ring sections collapse."
  - "If no living fighter remains on the bridge for `KW_LOST_MS` (`120 s`), the encounter resets, clearing bridge enemies and cells until the next `'in'` frame starts a fresh fight."
  - "When crewmates are present, fatal damage puts the player into `lieDown` at 1 HP and invulnerable for `KT_DOWN_MS` (`60 s`); a Resurrect within `KT_REZ_REACH_M` (`10 m`) revives at `KT_REZ_PCT` (`30%`) health, and timer expiry drops the player overboard."
traps:
  - "A solo player with no peers aboard skips `lieDown` and falls overboard immediately on fatal damage."
  - "Client hit claims deduplicate through `spendBlow` keyed by target (`'w'` plus body ID) and attack sequence so multi-target swings and network retries apply only once."
  - "When the Warden dies, `ketchBrain.js` clears all carried and loose cells and broadcasts the empty cell state before transitioning to `'vault'`."
tags:
  - multiplayer
  - sky-ketch
  - boss
  - tonal-warden
  - resurrect
  - falls
---

In `src/net/ketch/ketchWarden.js`, the Tonal Warden (`KW_ID = 1`) opens after `KW_OPENING_MS` (`6 s`) and scales attack cadence by `KW_FAST` (`[1, 0.85, 0.75]`). Its attacks (`KW_BLOWS`) are Keel-Strike (26 m lane), Steam Lash (150-degree fire cone, 13 m radius), and Tonal Ring (7 m inner ring plus a 20 m wave).

## Phases and Enrage

At 65% health (`KW_PHASE_AT`), Phase 2 triggers the Discord at 8 s and every 30 s for 25% health (no save) while shielding the boss. Banking bridge cells (12 s respawn) into four resonators breaks the shield and stuns the Warden for `KW_STUN_MS` (`10 s`) at 1.5x damage taken.

At 35% health, Phase 3 spawns `forkCountFor(n) = min(7, 3 + floor(n / 2))` tuning forks (`KW_FORK_ID0 = 200`). Every 45 s (starting at 20 s), Keel-Song deals 70% health and heals the boss by 8% unless all forks break. Two ring sections collapse every 20 s (3 s warning, 7 s gone). At `KW_ENDS_MS` (`22 min`), "The Ketch Turns West" deals `KW_END_PCT` (`99%`) health every `KW_END_EVERY_MS` (`2 s`).

## Downed Crew and Overboard Falls

Falling into a bridge gap triggers `castBack` (`src/systems/ketch/ketchDeckHost.js`), moving the player 55% from `KT_BRIDGE` center toward their last footing, deducting `KT_CAST_BACK_LOSS` (`15%` max HP, non-lethal), and dropping any cell. Fatal damage with peers starts `lieDown` at 1 HP for `KT_DOWN_MS` (`60 s`) awaiting Resurrect (`KT_REZ_REACH_M = 10 m`, `KT_REZ_PCT = 0.3`). Unrevived or solo players call `fall()` and wake below at `max(current, round(maxHealth * KT_FALL_WAKE))` (`25%` max HP).
