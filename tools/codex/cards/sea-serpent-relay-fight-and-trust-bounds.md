---
slug: sea-serpent-relay-fight-and-trust-bounds
title: "Serpent Relay Cell Fights, Health Shares, and Hit Bounds"
domain: multiplayer
kind: subcard
parent: sea-serpent-world-boss
files:
  - server/src/index.js
  - src/net/serpentBrain.js
  - src/net/serpentLink.js
  - src/net/wire.js
  - src/worldEvents/serpentHost.js
  - src/systems/naval/navalHost.js
  - src/systems/naval/peerHulls.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Sea-Serpent.md"
related:
  - sea-serpent-world-boss
  - sea-serpent-body-attacks-and-coil
  - room-engine-and-hub-sharding
  - integrity-boss-body-ledger
  - scale-arc-hub-pull-layers-and-cells
invariants:
  - "A fight runs in the cell room containing its site, persisted under `SERPENT_FIGHTS_KEY` and `SERPENT_FIGHT_KEY` as `day@site`, capped at `SERPENT_SITES_MAX` (`3`) sites per cell per day and one site per account per cell per day."
  - "Range gates accept `in` frames within `ADMIT_R` (`1500` m), activate ship health shares within `ENGAGE_R` (`900` m), and fan state out to sockets within `FAN_R` (`3000` m)."
  - "Each engaged hull adds `SERPENT_TTK_S` times `SHIP_REF[hull]` HP; late ships join at the current HP fraction with an empty damage bucket, and deckhands without a ship add no HP."
  - "Each fighter bucket refills at `SERPENT_BUCKET_RATE_X` (`1.5`) times reference DPS up to `SERPENT_BUCKET_DEPTH_X` (`20`) times DPS, caps single blows at `SERPENT_HIT_CAP_X` (`14`) times DPS, limits rate to `SERPENT_HIT_HZ_MAX` (`6`) hits per second, and requires pose within `ENGAGE_R + GUN_REACH_M` (`300` m)."
  - "The brain steps every `SERPENT_TICK_MS` (`250` ms), checkpoints every `SERPENT_CHECKPOINT_MS` (`2000` ms) for up to `SERPENT_FIGHTERS_MAX` (`128`) accounts, increments attack sequence by `SERPENT_WAKE_SEQ` (`50`) on restart, and retains finished fights for `SERPENT_KEEP_MS` (`2` hours)."
traps:
  - "A hand aboard a ship owned by another player can damage the boss only with bows and offensive spells against a `SERPENT_HAND_REF` (`1.5` DPS) bucket within `SERPENT_HAND_REACH_M` (`200` m); personal hand attacks from a player on their own ship are ignored."
  - "Ships outside `ENGAGE_R` for `SERPENT_ABSENT_RETIRE_MS` (`45` s) or silent for `SERPENT_IDLE_RETIRE_MS` (`90` s) drop their health share until their next valid hit restores it at the current HP fraction."
  - "Peer hulls pass through one another during a serpent encounter (`src/systems/naval/peerHulls.js`) rather than colliding."
dfu: []
tags:
  - relay
  - durable-objects
  - anti-cheat
  - health-share
  - cells
---

# Serpent Relay Cell Fights, Health Shares, and Hit Bounds

Cell rooms in `server/src/index.js` host authoritative serpent encounters using `src/net/serpentBrain.js`, while clients batch combat traffic through `src/net/serpentLink.js`, `src/worldEvents/serpentHost.js`, and `src/systems/naval/navalHost.js`.

- **Cell storage, admission, and sleep:** Fights persist under `SERPENT_FIGHTS_KEY` and `SERPENT_FIGHT_KEY` (`day@site`, up to `SERPENT_SITES_MAX = 3` per cell and `SERPENT_FIGHTERS_MAX = 128` accounts). Sockets within `ADMIT_R` (`1500` m) join via `in` frames (`IN_RESEND_MS = 20000`, `IN_RETRY_MS = 3000`, or refused via `SERPENT_NO_WORDS`), and updates fan out to `FAN_R` (`3000` m). Unstepped for `SERPENT_SLEEP_MS` (`5000` ms), a fight sleeps; waking within `SERPENT_DRAWN_MS` (`12000` ms) preserves trajectories, whereas waking later returns the boss to cruise orbit and bumps attack sequence by `SERPENT_WAKE_SEQ` (`50`).
- **Health shares and combat gale:** Entering `ENGAGE_R` (`900` m) activates `SERPENT_TTK_S * SHIP_REF[hull]` HP at the current boss health ratio, applies `SERPENT_GALE` (`{wind: 1.15, turn: 1.5}`), and disables peer hull collisions (`src/systems/naval/peerHulls.js`). Shares retire after `SERPENT_ABSENT_RETIRE_MS` (`45` s) outside range or `SERPENT_IDLE_RETIRE_MS` (`90` s) without firing.
- **Hit buckets:** Clients batch volleys every `HIT_GATHER_MS` (`500` ms) under `SERPENT_HIT_HZ_MAX` (`6` Hz). The relay clamps hits to a bucket refilling at `SERPENT_BUCKET_RATE_X` (`1.5x` reference DPS), holding `SERPENT_BUCKET_DEPTH_X` (`20x`), and capping single blows at `SERPENT_HIT_CAP_X` (`14x`) within `ENGAGE_R + GUN_REACH_M` (`300` m). Deckhands without their own hull use `SERPENT_HAND_REF` (`1.5` DPS) within `SERPENT_HAND_REACH_M` (`200` m).
