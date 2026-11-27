---
slug: "world-arc-record-gates-and-dungeon-entry"
title: "Block Record Gates: Markers, NPC Flats, Treasure, Ladders, and Dungeon Entry"
domain: "world"
kind: "subcard"
parent: "world-arc-classic-port-overview"
files:
  - "src/world/rmbFlats.js"
  - "src/world/rdbLayout.js"
  - "src/world/npcFlatArchives.js"
  - "src/world/interiorLayout.js"
  - "src/scenes/interiorContext.js"
  - "src/scenes/dungeonContext.js"
  - "src/scenes/dungeon.js"
  - "src/player/enterExit.js"
  - "src/items/droppedLoot.js"
routes: []
tables: []
replacesBible:
  - "03-World/World-Arc.md"
related:
  - "world-modes-and-transitions"
  - "world-arc-classic-port-overview"
invariants:
  - "NPC_FLAT_ARCHIVES = [334, 346, 357, 175..184] lives in src/world/npcFlatArchives.js (re-exported by rdbLayout.js); RDB NPC flats mint StaticNPC records."
  - "Interior enter markers accept both Enter (199.8) and Rest (199.4) per FindClosestEnterMarker."
  - "Fixed treasure (archive 216) is not floor-raycast; floorLanding is reserved for random treasure."
  - "Ladder 41409 and furniture containers act only when objectType === PROP_MODEL_TYPE (3)."
traps:
  - "Exterior archive-199 flats are stamped editor: true and kept for marker/quest/action chains but must stay out of billboard batching."
  - "tryEnterDungeon calls startSpawn({ preferEnterMarker: false }) and faces away from the closest exit door (closestDoorTo); the standalone dungeon host keeps the default true."
  - "Dropped loot piles carry pixelKey and must die when their pixel unloads unless restored from the world snapshot."
  - "Fixed-treasure (archive 216) entries share `markers` with editor flats (archive 199) and share their record numbers, so every consumer must test `archive`. Only 199 entries carry the enemy fields."
  - "`mobileBillboardSize` applies the mod xml scale to every record, while `billboardSize` applies it only when a replacement texture exists, so xml-only mods scale monsters but not corpses or other static billboards."
  - "Exterior nature-range flats set `z` to the raw `NATURE_FLATS_OFFSET_Y` (-2) after the climate archive swap. This looks like a y/z typo but matches DFU, so leave it."
dfu:
  - "Assets/Scripts/Utility/RDBLayout.cs"
  - "Assets/Scripts/Internal/DaggerfallInterior.cs"
  - "Assets/Scripts/Game/PlayerEnterExit.cs"
  - "Assets/Scripts/Game/StaticNPC.cs"
tags:
  - "markers"
  - "npc-flats"
  - "treasure"
  - "ladders"
  - "dungeon-entry"
  - "loot-piles"
---

# Block Record Gates: Markers, NPC Flats, Treasure, Ladders, and Dungeon Entry

Block record loaders gate editor markers, NPC billboards, treasure flats, interactive prop models, dungeon entry orientation, and pixel-bound loot piles across exterior, interior, and dungeon scenes.

- **Editor markers, NPC flats, and props (`src/world/rmbFlats.js`, `src/world/npcFlatArchives.js`, `src/world/rdbLayout.js`, `src/world/interiorLayout.js`, `src/scenes/interiorContext.js`):** When `textureArchive === EDITOR_FLATS_ARCHIVE` (`199`), `rmbFlats.js` stamps exterior records with `editor: true` so quest, marker, and action chains retain them while billboard batching skips them. Interior entry searches accept both Enter (`199.8`) and Rest (`199.4`) markers. `NPC_FLAT_ARCHIVES` (`[334, 346, 357, 175..184]` in `npcFlatArchives.js`, re-exported by `rdbLayout.js`) identifies RDB flats that mint `StaticNPC` records. In `interiorLayout.js`, model records keep `objectType` so `interiorContext.js` activates ladder `41409` and furniture containers only when `objectType === PROP_MODEL_TYPE` (`3`).
- **Treasure landing, dungeon entry, and dropped loot (`src/scenes/dungeonContext.js`, `src/scenes/dungeon.js`, `src/player/enterExit.js`, `src/items/droppedLoot.js`):** Fixed treasure flats (archive `216`) keep their authored height without floor raycasting, reserving `floorLanding` for random treasure piles. On dungeon transitions, `tryEnterDungeon` (`enterExit.js`) invokes `startSpawn({ preferEnterMarker: false })` and turns the player away from `closestDoorTo`, whereas the standalone dungeon host (`dungeon.js`) leaves `preferEnterMarker = true`. Exterior dropped loot piles (`droppedLoot.js`) record `pixelKey` and despawn when their map pixel unloads unless restored from the world snapshot.
