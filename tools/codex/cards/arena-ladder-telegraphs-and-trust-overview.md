---
slug: arena-ladder-telegraphs-and-trust-overview
title: "Arena Ladder Telegraphs, Ticket Law, and Judges"
domain: combat
kind: overview
parent: null
files:
  - src/arena/arenaBouts.js
  - src/arena/arenaLadder.js
  - src/arena/arenaKit.js
  - src/arena/arenaBout.js
  - src/arena/arenaOnline.js
  - src/net/arenaLaw.js
  - src/net/arenaBrain.js
  - server-account/src/arena.js
routes:
  - /v1/arena/attempt
tables:
  - arena_attempts
  - arena_pve
replacesBible:
  - "01-Overview/audits/Audit-Arena-Ladder.md"
related:
  - arena-colosseum-overview
  - arena-bout-law-crowd-and-kit
  - arena-enemy-telegraph-blows
  - arena-ladder-tickets-and-judges
invariants:
  - "A lost ladder bout resets the tier run via `ladderAfter`; beaten champions stay beaten."
  - "Kit law and the sand ceiling apply only to kit (ladder/practice) bouts, not player-vs-player bouts."
traps:
  - "A body that vanishes without falling voids the bout (`voidBout`) only while the player is still in it; otherwise it counts as a fall."
dfu: []
tags:
  - arena
  - ladder
  - telegraph
  - audit
  - kit
---

# Arena Ladder Telegraphs, Ticket Law, and Judges

The Arena Ladder Audit (`src/arena/arenaBouts.js`, `src/arena/arenaLadder.js`, `src/net/arenaLaw.js`, and `server-account/src/arena.js`) hardens PvE ladder and practice bouts with telegraphed enemy blows, strict kit enforcement, single-use attempt tickets, and timeout scoring. Under `ladderAfter`, losing a ladder bout resets progress within the current tier while preserving previously defeated tier champions.

## Kit Law, Sand Ceiling, and Lifecycle Rules

- **Kit and ceiling restrictions (`src/arena/arenaKit.js`, `src/magic/hostMagic.js`):** Kit law and the four-meter sand ceiling (`SAND_CEILING_M = 4` via `ceilAbove`) govern kit (ladder and practice) bouts while leaving player-vs-player bouts unconstrained. On the sand, potions are refused, warded spells fail through `wardedHere` in `src/magic/hostMagic.js`, and ladder enemies receive `pacifyImmune`. When a fighter visits healers or leaves the bout, `restoreSandHeld` restores any held ring effects.
- **Exhaustion, despawn, and revenant guards (`src/arena/arenaBout.js`, `src/scenes/dungeonContext.js`):** Fatigue collapse on the sand resolves through `exhaustionOutcome` (`src/player/rest.js`) inside `src/scenes/dungeonContext.js`. If an opponent body vanishes without falling, `voidBout` voids the match only while the player remains inside the bout; otherwise the disappearance counts as a fall. Defeated elite ladder champions are excluded from revenant spawning via `revenantCandidate` in `src/revenants/revenant.js`.
- **Telegraphs and account tickets (`src/arena/arenaOnline.js`, `src/net/arenaBrain.js`):** Relay ladder fighters telegraph heavy blows (`arena-enemy-telegraph-blows`) and settle verified runs through `/v1/arena/attempt` across `arena_attempts` and `arena_pve` (`arena-ladder-tickets-and-judges`).
