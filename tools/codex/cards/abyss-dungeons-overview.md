---
slug: abyss-dungeons-overview
title: "Abyss Dungeons (Super Dungeons) Overview"
domain: multiplayer
kind: overview
parent: null
files:
  - src/net/sdLaw.js
  - src/world/dungeonTier.js
  - src/world/sdDungeon.js
  - src/net/sdRemnant.js
  - server-account/src/sds.js
routes:
  - "/v1/sd/claim"
  - "/internal/sd/census"
tables:
  - sd_kills
  - players
replacesBible:
  - "11-Multiplayer/Super-Dungeons.md"
related:
  - abyss-dungeon-director-and-census
  - abyss-dungeon-discovery-and-rift
  - shattered-hour-orrery-and-steps
  - brass-remnant-fight-and-rewards
invariants:
  - "Player-facing text uses `Abyss Dungeon` (`DUNGEON_TIER_TEXT.super`), while internal code keeps `super`, `superTier`, and `sd*` identifiers."
  - "Only one Hollow exists globally at a time, and its slot counter (`sdslot`) strictly increases without reuse."
traps:
  - "Offline code paths must never spawn Hollows or display Abyss tier labels (`tierShown` is online-only, and offline dungeons are always `regular`)."
  - "Avoid hardcoding `RELAY_VERSION` literals or region counts when working with `sd` frames or census logic."
tags:
  - super-dungeons
  - abyss-dungeons
  - world-events
  - multiplayer
---

Abyss Dungeons are online-only global world events that temporarily turn one existing dungeon into a high-difficulty Hollow leading to the Shattered Hour and the Brass Remnant boss fight. In offline play, every dungeon remains `regular` (`src/world/dungeonTier.js`) and no Hollow spawns.

## Global Lifecycle and Naming

Player-facing UI refers to the tier as `Abyss Dungeon` via `DUNGEON_TIER_TEXT.super`, while modules, constants, and `sd` room frames retain `super`, `superTier`, and `sd*` names. The hub director (`src/net/sdLaw.js`) runs a single global Hollow through four phases (`sdPhase`): `risen`, `found`, `fell`, and `gone`. A risen Hollow lasts for `SD_LIFETIME_MS` (48 hours). After players defeat the boss, the Hollow enters a `SD_COLLAPSE_MS` (3 minutes) collapse window before a `SD_COOLDOWN_MS` (2 hours) cooldown begins.

## Event Flow

Players find the unannounced exterior door in the chosen region, fight through scaled elite packs to the end marker, and enter the Rift into the Shattered Hour. Inside the realm, fighters solve the Orrery of Endings, climb the Unmoored Steps, and fight the Brass Remnant (`src/net/sdRemnant.js`). Upon victory, the relay issues signed `h1` receipts redeemed at `POST /v1/sd/claim` (`server-account/src/sds.js`) for spoils, Aetheric set pieces, and honours stored in `sd_kills` and `players.sd_honours`.

## Subcards

- `abyss-dungeon-director-and-census`: hub scheduling, region census, site selection, and Discord Herald alerts.
- `abyss-dungeon-discovery-and-rift`: door discovery radii, enemy scaling, Rift placement, and the Way Through shortcut.
- `shattered-hour-orrery-and-steps`: realm restrictions, Orrery puzzle math, Unmoored Steps hazards, and One-Life resurrection.
- `brass-remnant-fight-and-rewards`: boss phases, Endings and Omens, damage receipts, spoils, and honours rolls.
