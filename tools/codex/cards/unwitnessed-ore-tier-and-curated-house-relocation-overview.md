---
slug: "unwitnessed-ore-tier-and-curated-house-relocation-overview"
title: "Unwitnessed Ore Tier and Curated House Relocation"
domain: "world"
kind: "overview"
parent: null
files:
  - "src/net/nodeLaw.js"
  - "src/world/curatedPlacements.js"
  - "src/ui/mapScale.js"
  - "src/guilds/factionStanding.js"
  - "src/ui/profPages.js"
  - "tools/curatedPlacements.mjs"
  - "src/formats/worldDataReplacement.js"
  - "src/formats/blocksFile.js"
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-09e.md"
related:
  - "held-map-ui-scale-and-all-faction-standing"
  - "professions-gathering-nodes-and-motherlodes"
  - "tamriel-held-map-ink"
invariants:
  - "Surface vein draw uses tier 7 when confirmed or surveyed, else UNCONFIRMED_VEIN_TIER."
  - "dungeonVein draws its whole deep table unwitnessed; only woodland Moonstone needs witnesses."
  - "MINING_GROUND_LINE text must match the law."
  - "Relocated buildings keep their DFU building key (block x<<16)+(block y<<8)+record."
traps:
  - "Changing UNCONFIRMED_VEIN_TIER needs a service law bump."
  - "Curated rows apply inside getDFBlockReplacementData, called from blocksFile."
dfu:
  - "Person.cs"
tags:
  - "mining"
  - "vein"
  - "witnessed-ground"
  - "curated-placement"
---

# Unwitnessed Ore Tier and Curated House Relocation

Mining vein tier limits on unwitnessed ground and curated block placement overrides govern ore availability and quest building accessibility across the world.

- **Unwitnessed Surface and Dungeon Vein Tiers (`src/net/nodeLaw.js`, `src/ui/profPages.js`):** In `src/net/nodeLaw.js`, surface ore vein selection draws up to tier `7` when the surrounding ground is confirmed or surveyed, and caps at `UNCONFIRMED_VEIN_TIER` (`3`, raised from `2`) on unconfirmed surface terrain. Inside dungeons, `dungeonVein` draws from its entire deep ore table without requiring witness confirmation, while only woodland Moonstone waits for witnessed ground. The explanatory copy in `MINING_GROUND_LINE` (`src/ui/profPages.js`) must stay synchronized with the node law in `src/net/nodeLaw.js`, and any modification to `UNCONFIRMED_VEIN_TIER` requires a service law version bump.
- **Curated House Relocation and Building Keys (`src/world/curatedPlacements.js`, `tools/curatedPlacements.mjs`, `src/formats/worldDataReplacement.js`, `src/formats/blocksFile.js`):** Because quest NPCs are assigned into `House2` interiors via `Person.cs` (`AssignHomeTown`), a residence buried inside a hill breaks quest delivery. `src/world/curatedPlacements.js` and `tools/curatedPlacements.mjs` relocate `TEMPASD1.RMB` record `6` (model `159`) from `(2816, 2176)` to `(3808, 2176)`. These curated rows apply inside `getDFBlockReplacementData` (`src/formats/worldDataReplacement.js`, invoked by `src/formats/blocksFile.js`), and relocated buildings preserve their classic building key `(block x << 16) + (block y << 8) + record`.
