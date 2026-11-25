---
slug: loot-banner-overview
title: "Loot Banner Queue, Holds, and Honor Fanfare"
domain: ui
kind: overview
parent: null
files:
  - src/ui/lootBanner.js
  - src/items/acquireWatch.js
  - src/ui/hud.js
  - src/ui/hudLayout.js
  - src/ui/pickupFeed.js
  - src/items/lootCodex.js
  - tools/lootBannerProbe.mjs
  - src/ui/playerBadge.js
  - src/net/sdClaims.js
  - src/net/serpentClaims.js
  - src/world/lampKeeper.js
routes: []
tables: []
replacesBible:
  - "10-UI/Loot-Banner.md"
related:
  - loot-banner-acquire-watch-and-marks
  - loot-rarity-ladder-overview
  - account-titles-glyphs-and-play-clock
  - lamp-keeper-daily-odds-and-title-claim
  - sea-serpent-receipts-hoard-and-honours
invariants:
  - "drawHud calls drawLootBanners once per frame; the watcher runs on every skin, but DOM and styles are built only on Enhanced Plus."
  - "Only Rare-or-better tiers get a banner; Common and Magic stay in the pickup feed."
  - "Pickup feed drops its card for a fresh Rare-or-better piece the banner will announce."
  - "createBannerQueue: at most LOOT_BANNERS_MAX (3) standing, newest on top, and LOOT_BANNER_PENDING_MAX (12) waiting, best tier first."
  - "Hold is LOOT_BANNER_HOLD_MS (4500), or LOOT_BANNER_BIG_HOLD_MS (7000) for the big tiers Aetheric, Artifact, and Gilded."
  - "A repeat card of a kind already standing or waiting bumps the count on that banner. A piece no longer held when its turn comes (bannerStillHeld) is never shown."
traps:
  - "`announceHonour(kind, key)` skips the watcher because honors are account-held; it writes a chat line on every skin and returns false on classic skin."
dfu: []
tags:
  - loot-banner
  - hud
  - enhanced-plus
  - rarity
  - titles
---

# Loot Banner Queue, Holds, and Honor Fanfare

In `src/ui/hud.js`, `drawHud` calls `drawLootBanners` (`src/ui/lootBanner.js`) every frame. While `src/items/acquireWatch.js` tracks arrivals on all skins and records codex discoveries via `presentCodexFind` (`src/items/lootCodex.js`), the banner DOM and styles build only on Enhanced Plus.

- **Tier routing and queue caps (`createBannerQueue`):** Only Rare-or-better tiers open a banner while Common and Magic stay in `src/ui/pickupFeed.js`, which drops its card whenever the banner announces a fresh Rare-or-better piece. The queue holds up to `LOOT_BANNERS_MAX` (`3`) standing banners (newest on top) and `LOOT_BANNER_PENDING_MAX` (`12`) waiting entries (best tier first). Holds last `LOOT_BANNER_HOLD_MS` (`4500` ms) or `LOOT_BANNER_BIG_HOLD_MS` (`7000` ms) for Aetheric, Artifact, and Gilded tiers, which play `SOUND.ArenaFanfareLevelUp` once when enhanced sounds are enabled. Repeat cards merge counts, and `bannerStillHeld` drops waiting items no longer held.
- **Layout and honors (`src/ui/hudLayout.js`, `src/ui/playerBadge.js`):** Registered as `'loot'` (`.lootbanner-stack`) at `vh * 0.6` under notice stacks via `bannerLayout`, banners reuse `hudVeil`, pause under open windows, and honor reduced motion (`tools/lootBannerProbe.mjs`). `announceHonour(kind, key)` from `src/net/sdClaims.js`, `src/net/serpentClaims.js`, and `src/world/lampKeeper.js` logs chat on all skins and queues a Gilded `honourEntry` (`TITLE_TEXT`, `AURA_TEXT`, `AURA_PAINT`, `titlePaint`, `honourVars`) on Enhanced Plus.
