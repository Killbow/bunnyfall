---
slug: blood-bleeding-tracks-and-screen-spatter
title: "Bleeding, Corpse Pools, Bloody Prints, and Screen Spatter"
domain: combat
kind: subcard
parent: blood-marks-overview
files:
  - src/combat/bloodBleed.js
  - src/combat/bloodMarks.js
  - src/combat/hitEffects.js
  - src/ui/bloodScreen.js
  - src/ui/damageFlash.js
  - src/ui/hud.js
  - src/ui/hudVitals.js
routes: []
tables: []
replacesBible:
  - "05-Combat/Blood-Arc.md"
related:
  - blood-marks-overview
  - blood-atlas-drying-and-wet-film
invariants:
  - "The bleed ledger keeps its state in a `WeakMap` keyed by body, and `clear()` replaces the map."
  - "A body first seen dead never pools. A body that comes back to life resets its pooled latch."
  - "The player bleeds through the same ledger, keyed by `PLAYER_WALKER` with `strides: false`. Each landed drip calls `flashPlayerBleed`, which only ever raises the flash alpha to `BLEED_FLASH_ALPHA` (`0.12`)."
  - "Screen spatter needs both `playerDamageFlash.takeBlow()` and `lastHealthLostPercent() >= SCREEN_SPATTER_MIN`, so loads, spells, and surrender never spatter the screen. `resetVitalsDetector` un-primes the detector."
traps:
  - "`TELEPORT_SPEED` is a speed (`40 m/s * dt`), not a distance, so a frame hitch does not erase a running enemy trail."
  - "Player prints come from `footfall` (the footstep machine), never from strides, so each step prints once."
dfu:
  - "Assets/Scripts/Game/Player/VitalsChangeDetector.cs"
tags:
  - blood
  - bleeding
  - tracks
  - hud
  - screen-spatter
---

Wounded actors drip blood, fresh corpses expand floor pools, wet pools stain boots, and heavy blows spatter the HUD.

## Bleed Ledger and Corpse Pools

`src/combat/bloodBleed.js` and `src/combat/bloodMarks.js` track actors in a `WeakMap` keyed by body (`clear()` replaces the map). Below `BLEED_THRESHOLD` (`0.5`), drips fire every `BLEED_WAIT` (`2..5` s), dropping `bleedDrops = max(1, round(share * 6))` droplets from `DRIP_FROM` (`0.5` m, knee height). When a tracked living body dies, its corpse pool grows from `POOL_SIZE` (`0.45`) to `1.5` over `POOL_SPREAD` (`12` s) in `POOL_STEPS` (`8`) rewrites. Bodies first seen dead never pool, and resurrected bodies reset their pooled latch.

## Bloody Footprints

Enemies step every `STRIDE` (`0.7` m), guarded by `TELEPORT_SPEED` (`40 m/s * dt`) so hitches do not erase trails. Treading a floor mark at stage `<= TRACK_WET_STAGE` (`2`) leaves `TRACK_STEPS` (`6`) prints offset by `PRINT_SPREAD` (`0.13` m). The player uses the same ledger under `PLAYER_WALKER` (`strides: false`); player prints fire from `footfall` once per step, and each landed drip calls `flashPlayerBleed` (`src/combat/hitEffects.js`), raising flash alpha to `BLEED_FLASH_ALPHA` (`0.12` in `src/ui/damageFlash.js`).

## Screen Spatter

`src/ui/bloodScreen.js`, `src/ui/hud.js`, and `src/ui/hudVitals.js` spatter only when `playerDamageFlash.takeBlow()` and `lastHealthLostPercent() >= SCREEN_SPATTER_MIN` hold (`resetVitalsDetector` un-primes on load, spells, or surrender). Hits add `1..5` drops (most at `SCREEN_DROPS_AT = 0.5`), capped at `12`, living `2.5` s and fading over the last `40%`.
