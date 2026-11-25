---
slug: integrity-boss-body-ledger
title: "Boss Fight Body Ledger: Landings, Mends, and Measurement"
domain: multiplayer
kind: subcard
parent: integrity-arc-overview
files:
  - src/net/bossBody.js
  - src/net/bossRef.js
  - src/net/wire.js
  - src/net/gateReceipt.js
  - src/net/serpentReceipt.js
  - server-account/src/review.js
routes:
  - /v1/mod/realm-bodies
tables:
  - gate_kills
  - sd_kills
  - serpent_kills
  - realm_config
replacesBible:
  - "06-Systems/Integrity-Arc.md"
related:
  - integrity-arc-overview
  - dagons-breach-world-boss
  - breach-receipts-spoils-and-embers
  - abyss-dungeons-overview
invariants:
  - "A boss blow counts as a landing only when the target pose stays at least `BODY_MARGIN` (`1.5` m) inside the blow shape when checked `BODY_AFTER_MS` (`400` ms) after impact."
  - "Clients send their vitality word (`vt`) no faster than `BODY_SAY_MS` (`250` ms) and at least every `BODY_SAY_KEEP_MS` (`3000` ms); the relay rate-limits `vt` at `BODY_WORD_HZ_MAX` (`4` per second) on a bucket separate from blows."
  - "`BODY_DEFAULT` ships with `enforce: false`, and any malformed `BOSS_BODY` config entry in `realm_config` falls back to `BODY_DEFAULT` in measurement mode."
traps:
  - "When enforcement is enabled, a `dd` death grants a fresh life budget only after `BODY_RISE_MS` (`15000` ms)."
  - "Boss refereeing activates on relays at or above `BOSS_REF_RELAY_MIN` in `src/net/wire.js`, never via a hardcoded relay version literal."
tags:
  - integrity
  - boss
  - relay
  - healing-budget
---

`src/net/bossBody.js` and `src/net/bossRef.js` track boss blow landings and player recovery on the relay so world-boss and dungeon-boss receipts (`src/net/gateReceipt.js` and `src/net/serpentReceipt.js`) reflect verified combat survival.

## Delayed Landing Checks and Vitality Words

Rather than trusting client hit reports immediately, the relay records pose trails over `BODY_TRAIL_MS = 2000` and telegraphed blow windows over `BODY_TELL_MS = 3000`. A boss attack counts as landed only if the player pose remains at least `BODY_MARGIN = 1.5` meters inside the attack shape `BODY_AFTER_MS = 400` ms after impact.

Clients emit their vitality word (`vt`) at intervals between `BODY_SAY_MS = 250` ms and `BODY_SAY_KEEP_MS = 3000` ms. The relay accepts at most `BODY_WORD_HZ_MAX = 4` vitality words per second on a dedicated bucket separate from combat blows. Boss refereeing requires a relay version at or above `BOSS_REF_RELAY_MIN` (`src/net/wire.js`).

## Healing Budgets and Measurement Review

`BODY_DEFAULT` sets `enforce: false`, `BODY_LINE_MAX = 10`, a personal body healing pool of `depth: 1` refilling at `perS: 0.05`, and a ship hull pool of `depth: 0.15` refilling at `perS: 0.012` with `HULL_REFLOAT = 0.15`. After a reported death (`dd`), a fresh life budget requires waiting `BODY_RISE_MS = 15000` ms once enforcement is active. Any malformed `BOSS_BODY` rule in `realm_config` reverts to `BODY_DEFAULT`.

On the account server, `server-account/src/review.js` exposes `/v1/mod/realm-bodies`, reading `gate_kills`, `sd_kills`, and `serpent_kills` to summarize measured landing and healing ratios before operators enable enforcement.
