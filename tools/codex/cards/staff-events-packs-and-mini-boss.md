---
slug: staff-events-packs-and-mini-boss
title: "Staff Event Pack Spawning and Mini Boss Rules"
domain: combat
kind: subcard
parent: staff-events-overview
files:
  - src/worldEvents/raidingParties.js
  - src/worldEvents/staffEvents.js
  - src/world/raidShared.js
  - src/characters/eliteFoes.js
  - src/characters/exteriorFoes.js
  - src/combat/hitFlash.js
  - src/magic/effects.js
  - src/ai/tactics.js
  - src/net/grantHost.js
  - src/combat/formulas.js
  - src/party/partyScale.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Staff-Events.md"
related:
  - staff-events-overview
  - staff-events-order-book-and-meter
  - balance-arc-place-threat-elites-and-death
invariants:
  - "Packs: STAFF_PACK_MIN..STAFF_PACK_MAX (3..5) enemies each. The pace is rolled once so MAX_RAID_ENEMIES (25) fills in STAFF_PACK_FILL_MIN_S..STAFF_PACK_FILL_MAX_S (20..45 s)."
  - "PACK-SPREAD (staffPackPlayer): each pack leader stands around the next player in town, in id order."
  - "PACK-SCALE (staffPackScale): cap = min(STAFF_PACK_CAP_MAX 40, 25 + STAFF_PACK_CAP_PER 5 per extra player); speed scales up to 2x."
  - "The mini boss is an elite underneath, glowing yellow: STAFF_BOSS_GLOW offset 2 (living pulse 2.55..3, corpse -2.05..-3), drawn with STAFF_BOSS_RIM in hitFlash.js."
  - "BOSS-HARD: STAFF_BOSS_MIN_METAL (Silver) is the minimum weapon material, and STAFF_BOSS_ARMOR is 10 on every body part. Hand-to-hand still lands."
  - "BOSS-SPELL-WARD: STAFF_BOSS_SPELL_TAKEN (0.1) of every spell, minimum 1. A whole-health spell deals 10% of max health and never kills outright."
  - "BOSS-HIT-SHARE (staffBossHit): one hit deals at most max(1, round(maxHealth*0.01 / fighters)), with fighters capped at STAFF_BOSS_FIGHTERS_MAX (100)."
  - "BOSS-UNSHAKEN: no knockback, the wind-up holds (tactics.js), and isImmuneToParalysis is true for staffBoss."
traps:
  - "BOSS-EXACT: exact hp skips PSCALE1 toughness scaling (_toughFoe/partyHit)."
  - "BOSS-BIG-HIT: peer blows above PEER_HIT_DMG_MAX (10000) are clamped, not rejected, for staffBoss only."
  - "BOSS-BAR: wireHealth scales health above FOE_HEALTH_MAX (1e5) to a ratio for the bar."
  - "BOSS-BOUND: peers accept oversized boss stats only if the record carries the raid tag rz and staff-boss tag sb of a live event (validStaffBossTags, staffBossBound). Otherwise statsRefused applies."
  - "If the runner migrates hosts mid-spawn, one call can produce two bosses."
dfu: []
tags:
  - staff-events
  - mini-boss
  - raids
  - elites
  - spawning
---

# Staff Event Pack Spawning and Mini Boss Rules

During a staff event (`src/worldEvents/raidingParties.js`, `src/worldEvents/staffEvents.js`), the runner spawns packs of `STAFF_PACK_MIN` to `STAFF_PACK_MAX` (`3` to `5`) enemies paced so `MAX_RAID_ENEMIES` (`25`) fills in `STAFF_PACK_FILL_MIN_S` to `STAFF_PACK_FILL_MAX_S` (`20` to `45` s). `staffPackPlayer` rotates packs across town players in id order, while `staffPackScale` raises the cap by `STAFF_PACK_CAP_PER` (`5`) per extra player up to `STAFF_PACK_CAP_MAX` (`40`) and scales speed up to `2`x. Peers render up to `RAID_PUPPETS_MAX` (`40`) puppets (`src/world/raidShared.js`).

- **Boss call, placement, and recovery:** A meter-called boss waits until standing enemies fall or `STAFF_BOSS_CLEAR_MAX_MS` (`120000` ms) elapses, while a hand-called boss (`staffBossByHand`) spawns immediately. `staffBossSpot` places the boss beside the player with the most peers within `STAFF_BOSS_GROUP_M` (`30` m), breaking ties by highest group level and lowest id. Unconfirmed spawns retry after `PENDING_TIMEOUT_S` (`8` s), and a boss unseen for `STAFF_BOSS_LOST_MS` (`8000` ms) respawns via `staffBossLost`.
- **Mini boss defenses and wire bounds:** Built on elite enemies (`src/characters/eliteFoes.js`, `src/characters/exteriorFoes.js`) with yellow `STAFF_BOSS_GLOW` and `STAFF_BOSS_RIM` (`src/combat/hitFlash.js`), the boss uses `bh * kindHealth` (`STAFF_BOSS_HEALTH_MULT` `10`) or exact `hp` up to `1000000` (skipping `_toughFoe` and `partyHit` in `src/party/partyScale.js`). It requires `STAFF_BOSS_MIN_METAL` (Silver) weapons or hand-to-hand, sets `STAFF_BOSS_ARMOR` (`10`) on all parts (`src/combat/formulas.js`), takes `STAFF_BOSS_SPELL_TAKEN` (`0.1`) spell damage (`src/magic/effects.js`), caps single hits via `staffBossHit` (`STAFF_BOSS_FIGHTERS_MAX` `100`), ignores knockback and paralysis (`src/ai/tactics.js`), scales health bars above `FOE_HEALTH_MAX` (`1e5`) via `wireHealth`, clamps peer blows above `PEER_HIT_DMG_MAX` (`10000`), and passes `statsRefused` (`src/net/grantHost.js`) only with valid `rz` and `sb` tags (`validStaffBossTags`, `staffBossBound`).
