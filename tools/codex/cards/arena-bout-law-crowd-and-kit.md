---
slug: arena-bout-law-crowd-and-kit
title: "Arena Bout Law, Crowd, Kit, and Wagers"
domain: combat
kind: subcard
parent: arena-colosseum-overview
files:
  - src/arena/arenaBout.js
  - src/arena/arenaCrowd.js
  - src/arena/arenaKit.js
  - src/arena/arenaQuiver.js
  - src/arena/arenaBook.js
  - src/arena/arenaHerald.js
  - src/arena/arenaSound.js
  - src/arena/arenaScore.js
  - src/arena/arenaBouts.js
  - src/net/duelSession.js
  - src/items/useItem.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Arena.md"
related:
  - arena-colosseum-overview
  - integrity-pvp-duel-and-wild-referees
invariants:
  - "Bout phase timers run at `CALL_BEAT_MS` (1,600 ms), `WALK_MAX_MS` (9,000 ms), `COUNT_MS` / `DUEL_COUNTDOWN_MS` (3,000 ms), `BOUT_LIMIT_MS` (3 min), `END_HOLD_MS` (1,500 ms), `VERDICT_MS` (4,500 ms), and `HEAL_HOLD_MS` / `DUEL_HEAL_HOLD_MS` (2,000 ms)."
  - "The combat ring has radius `ARENA_RING_R = 14` meters around `ARENA_FLOOR_CENTRE`; stepping outside for `FLEE_MS` (1,500 ms) flags fleeing, and `RING_OUT_MS` / `DUEL_OUT_MS` (2,000 ms) ends the bout as a ring-out."
  - "Ladder kit rules (`arenaKit.js`) refuse potion use via `sandPotionRefusal` and block `SAND_BARRED_KINDS` (`invisibility`, `levitate`, `chameleon`, and `shade`) on the sand."
  - "Arrows fired during a bout are tallied in `arenaQuiver.js` and returned to the fighter when the bout ends."
traps:
  - "Attacking an exhibition fighter from outside the match reverses the damage and triggers the Herald's first warning (`intrude`); a second hit reports a crime to the city watch (`intrudeCrime`)."
  - "Bookmaker wagers apply only to the hourly exhibition (`arenaBook.js`); abandoning the scene before the verdict (`BOUT_LEFT`) forfeits the stake, whereas a draw refunds all bets."
dfu: []
tags:
  - arena
  - bout
  - crowd
  - kit
  - wagers
  - herald
  - timers
---

# Arena Bout Law, Crowd, Kit, and Wagers

`src/arena/arenaBout.js` and `src/arena/arenaBouts.js` enforce a `14`-meter combat circle (`ARENA_RING_R = 14` around `ARENA_FLOOR_CENTRE`). After the Herald call (`CALL_BEAT_MS = 1600`, `src/arena/arenaHerald.js`), walk-in (`WALK_MAX_MS = 9000`), and `3`-second countdown (`COUNT_MS = DUEL_COUNTDOWN_MS = 3000`), fighters have `BOUT_LIMIT_MS` (`3` minutes) before the judges score the bout (`src/arena/arenaScore.js`, using `judgesFloor = LADDER_JUDGES_SHARE = 0.5` on relay ladder bouts), followed by `END_HOLD_MS` (`1500` ms), `VERDICT_MS` (`4500` ms), and `HEAL_HOLD_MS` (`2000` ms). Crossing the ring line triggers a flee warning at `FLEE_MS` (`1500` ms) and a ring-out defeat at `RING_OUT_MS` (`2000` ms).

## Sand Restrictions, Crowd Mood, and Exhibition Wagers

- **Kit and quiver rules (`src/arena/arenaKit.js`, `src/arena/arenaQuiver.js`, `src/items/useItem.js`):** On the sand, `sandPotionRefusal` blocks potion drinking, and spellcasting rejects `SAND_BARRED_KINDS` (`invisibility`, `levitate`, `chameleon`, and `shade`). `arenaQuiver.js` counts arrows loosed during the fight and restores them afterward.
- **Crowd and stalls (`src/arena/arenaCrowd.js`, `src/arena/arenaSound.js`):** Going `STALL_MS` (`8000` ms) without landing a blow triggers a stall penalty (`MOOD_PUSH.stall` and `FAVOUR_PUSH.stall`) and a crowd boo cue. `CROWD_WASH` tints spectator banners red or blue.
- **Exhibitions and bookmaking (`src/arena/arenaBook.js`):** Players can wager only on the hourly exhibition; leaving early (`BOUT_LEFT`) forfeits the bet, while an intruder strike draws a Herald warning before summoning the guards.
