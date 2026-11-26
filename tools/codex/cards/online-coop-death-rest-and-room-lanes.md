---
slug: online-coop-death-rest-and-room-lanes
title: "Online Death, Rest, Refused Flags, and Room-Locked Mod Keys"
domain: multiplayer
kind: subcard
parent: online-coop-overview
files:
  - src/systems/legacy/legacyWorld.js
  - src/player/deathRespawn.js
  - src/player/deathPenalty.js
  - src/player/restSession.js
  - src/platform/onlineLane.js
  - src/world/buildingLocks.js
  - src/world/worldTick.js
  - src/systems/quest/clock.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Online-Arc.md"
related:
  - online-coop-overview
  - online-time-arc-overview
  - legacy-online-death-hold-and-revival
  - realm-saves-and-mod-save-hooks
invariants:
  - "respawnOnlinePlayer heals before any await (reviveForPlay with force) and then moves the player to nearestSafeLocation. The co-op session does not end."
  - "Respawn health = max(1, floor(maxHealth * RESPAWN_HEALTH_FRACTION)) with fraction 0.5."
  - "Online death costs carried gold divided by DEATH_GOLD_DIVISOR (10) (10%), unless the place's death rule says none."
  - "ONLINE_REFUSED_FLAGS strips debug powers (tod, timescale, weather, tp, `nofoes`, and others) from online pages, so the shared clock stays read-only."
  - "ONLINE_ROOM_MOD_KEYS force roads-hazelnut Enabled, SmoothRoads, and RiversAndStreams on, so every player stands on identical ground."
  - "`reviveForPlay` restores health and ends lethal drains, exposure, and death holds together, then lifts zeroed stats, then sets fatigue, because the fatigue ceiling reads live STR and END that the earlier steps can raise."
traps:
  - "The skin is no longer forced online (OVH3). Do not reintroduce enhanced-only gates on online panels."
  - "A Travel Options message pushed over the death screen once trapped players after the one-shot respawn."
  - "`nearestSafeLocationAnywhere` exists because the open-sea region has no temple, city, or graveyard. It loads regions one at a time and reloads the previously loaded region afterward, so keep that restore."
dfu: []
tags:
  - death
  - respawn
  - rest
  - mods
  - boot-flags
---

# Online Death, Rest, Refused Flags, and Room-Locked Mod Keys

Online play replaces fatal reload loops with in-session revival, locks terrain-shaping mod settings across shared rooms, and keeps town services open around the clock.

## In-Session Respawn and Death Penalty

- **Immediate heal and relocation (`src/systems/legacy/legacyWorld.js`, `src/player/deathRespawn.js`):** `respawnOnlinePlayer` heals synchronously before any `await` via `reviveForPlay` with `force`, sets health to `max(1, floor(maxHealth * RESPAWN_HEALTH_FRACTION))` (`0.5`), and relocates to `nearestSafeLocation` without ending the co-op session. Modal prompts such as Travel Options are cleared so they cannot trap revived players.
- **Gold toll (`src/player/deathPenalty.js`):** Unless a location's death rule waives penalties, online death deducts carried gold divided by `DEATH_GOLD_DIVISOR` (`10`) (10%).

## Rest Caps, Clock Charging, and Town Relief

- **Rest and quest clocks (`src/player/restSession.js`, `src/systems/quest/clock.js`):** `RestSession` caps manual rest at `MAX_REST_HOURS` (`99`), while `PLAYED_STEP_MAX_SECONDS` (`30 * 60`) bounds played time charged to quest clocks per frame.
- **Night access and prices (`src/world/buildingLocks.js`, `src/world/worldTick.js`):** `onlineReliefBuilding` keeps shops, guild halls, and city gates unlocked at night online, while `worldRegionPricesOn` derives shared regional prices from the world day.

## Boot Parameters and Forced Room Geometry

- **Online lane rules (`src/platform/onlineLane.js`):** `BOOT_DOOR_KEYS` and `publishBootParams` govern online entry parameters. `ONLINE_REFUSED_FLAGS` strips debug overrides (`tod`, `timescale`, `weather`, `tp`, `nofoes`, and others), and `ONLINE_ROOM_MOD_KEYS` forces `roads-hazelnut` `Enabled`, `SmoothRoads`, and `RiversAndStreams` on without forcing UI skin preferences (`OVH3`).
