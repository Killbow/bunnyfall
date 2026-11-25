---
slug: zone-respawn-hold-monument-and-honor-banners-overview
title: "Zone Respawn, Privateer's Hold Monument, and Honor Banners"
domain: world
kind: overview
parent: null
files:
  - src/net/wire.js
  - src/world/dungeonRespawn.js
  - src/net/sdLaw.js
  - src/scenes/dungeonContext.js
  - src/world/lefayMonument.js
  - src/world/wodPrivateersHold.js
  - src/world/startDungeon.js
  - src/player/enterExit.js
  - src/world/rmbFlats.js
  - src/scenes/world.js
  - src/scenes/exterior.js
  - src/ui/lootBanner.js
  - src/net/sdClaims.js
routes: []
tables: []
replacesBible:
  - "01-Overview/handoffs/Five-Asks-2026-10-14.md"
related:
  - chair-seating-pose-and-surface-probe
  - lamp-keeper-daily-odds-and-title-claim
  - account-titles-glyphs-and-play-clock
  - sea-serpent-receipts-hoard-and-honours
invariants:
  - "RESPAWN_MS (wire.js) = 30 min; dungeonRespawnMs returns it for wild and superTier dungeons, ELITE_DUNGEON_RESPAWN_MS (40 min) for elite ones, and DUNGEON_RESPAWN_MS (20 min) for everything else."
  - "WDUN_LOCK_MS stays 60 min; SD_COOLDOWN_MS (sdLaw.js) stays 2 h."
  - "LEFAY_TOWN = Privateer's Hold; the monument search starts at the exit landing (dungeonEntranceLanding) and keeps MONUMENT_LANDING_M 3.2 m on each side of the exit line, from MONUMENT_DOOR_BACK_M 4 m behind it to MONUMENT_WALK_M 8 m ahead."
  - "Camp clearance: MONUMENT_RUIN_KEEP_M 8 m around ruins, MONUMENT_CAMP_KEEP_M 4 m around HOLD_MODELS (33 models)."
  - "Honor banners fire only on newly earned honors (titleNew/auraNew)."
traps:
  - "Changing RESPAWN_MS is a wire change and needs a relay protocol bump."
  - "dungeonContext.js stands no monument."
  - "Removing the exit-line keep-out lets the monument block the exit landing."
dfu:
  - LocationHelper.cs
tags:
  - respawn
  - monument
  - privateers-hold
  - loot-banner
  - honor
---

# Zone Respawn, Privateer's Hold Monument, and Honor Banners

This overview covers wild and super-dungeon respawn timers, exterior monument placement at `LEFAY_TOWN`, and first-claim honor banners alongside `chair-seating-pose-and-surface-probe` and `lamp-keeper-daily-odds-and-title-claim`.

## Wild and Super-Dungeon Respawn Timers

In `src/world/dungeonRespawn.js` and `src/net/wire.js`, `dungeonRespawnMs` returns `RESPAWN_MS` (`30` minutes) for wild and `superTier` dungeons, `ELITE_DUNGEON_RESPAWN_MS` (`40` minutes) for elite dungeons, and `DUNGEON_RESPAWN_MS` (`20` minutes) for all others. `WDUN_LOCK_MS` remains `60` minutes and `SD_COOLDOWN_MS` (`src/net/sdLaw.js`) remains `2` hours. Because `RESPAWN_MS` lives on the wire, changing it requires a relay protocol bump.

## Monument Placement and Honor Banners

- **Exterior monument (`src/world/lefayMonument.js`, `src/world/wodPrivateersHold.js`, `src/world/startDungeon.js`, `src/player/enterExit.js`, `src/world/rmbFlats.js`, `src/scenes/world.js`, `src/scenes/exterior.js`, `LocationHelper.cs`):** Only exterior scenes stand the monument; `src/scenes/dungeonContext.js` stands none. Search starts at `dungeonEntranceLanding` (falling back to `collectMiscFlats` start-marker flats if no door is measured) with `MONUMENT_CLEAR_M` (`5.8` m), keeping `MONUMENT_LANDING_M` (`3.2` m) on each side of the exit line from `MONUMENT_DOOR_BACK_M` (`4` m) behind to `MONUMENT_WALK_M` (`8` m) ahead, `MONUMENT_RUIN_KEEP_M` (`8` m) from ruins, and `MONUMENT_CAMP_KEEP_M` (`4` m) from `HOLD_MODELS` (`33` models).
- **Honor banners (`src/ui/lootBanner.js`, `src/net/sdClaims.js`):** `announceHonour(kind, key)` fires only on newly earned honors (`titleNew` and `auraNew`) for `SD_HONOUR_KEYS` (`title: 'hourbreaker'`, `aura: 'turninghour'`).
