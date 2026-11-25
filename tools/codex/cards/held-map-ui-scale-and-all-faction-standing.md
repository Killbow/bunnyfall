---
slug: "held-map-ui-scale-and-all-faction-standing"
title: "Held Map UI Scale and Full Faction Standing"
domain: "ui"
kind: "subcard"
parent: "unwitnessed-ore-tier-and-curated-house-relocation-overview"
files:
  - "src/ui/mapScale.js"
  - "src/ui/heldMap.js"
  - "src/ui/enhancedStyle.js"
  - "src/guilds/factionStanding.js"
  - "src/guilds/affiliations.js"
  - "src/platform/onlineLane.js"
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-09e.md"
related:
  - "unwitnessed-ore-tier-and-curated-house-relocation-overview"
  - "held-map-overview"
invariants:
  - "mapUiScale: numeric pref clamped to [MAP_SCALE_MIN 0.75, MAP_SCALE_MAX 2]; auto = height/MAP_SCALE_BASE_H to nearest 0.05, 1 at or below base, max 2."
  - "Chrome scales via the --hm-ui CSS variable."
  - "standingAll is a local pref, not room-agreed state."
  - "Active guild memberships are not duplicated in the full list."
traps:
  - "Expelled status is not active membership; without standingAll expelled guilds vanish."
dfu: []
tags:
  - "held-map"
  - "ui-scale"
  - "standing"
  - "factions"
---

# Held Map UI Scale and Full Faction Standing

Held Map interface scaling and the full faction standing toggle let players adjust map chrome sizing across viewport heights and inspect reputation across every faction beyond active guild memberships.

- **Held Map UI Scale (`src/ui/mapScale.js`, `src/ui/heldMap.js`, `src/ui/enhancedStyle.js`):** `MAP_SCALE_CHOICES` offers `'auto'`, `0.75`, `1`, `1.25`, `1.5`, `1.75`, and `2`. When `mapUiScale` (`src/ui/mapScale.js`) resolves a numeric preference, it clamps the value to `[MAP_SCALE_MIN, MAP_SCALE_MAX]` (`[0.75, 2]`). In `'auto'` mode, it divides the viewport height by `MAP_SCALE_BASE_H`, rounds to the nearest `0.05`, returns `1` at or below the base height, and caps at `2`. The resulting multiplier drives Held Map chrome dimensions in `src/ui/heldMap.js` and `src/ui/enhancedStyle.js` through the `--hm-ui` CSS custom property.
- **Full Faction Standing Toggle (`src/guilds/factionStanding.js`, `src/guilds/affiliations.js`, `src/platform/onlineLane.js`):** In `src/guilds/factionStanding.js`, `standingGroups(entity)` assembles the faction groups displayed on the Standing page. Because expelled status does not count as active guild membership in `src/guilds/affiliations.js`, expelled guilds disappear from the default active-only view unless the player enables `standingAll`. Stored as a local preference in `src/platform/onlineLane.js` rather than room-agreed state, `standingAll` expands the display to all known factions while ensuring active guild memberships are never duplicated in the full list.
