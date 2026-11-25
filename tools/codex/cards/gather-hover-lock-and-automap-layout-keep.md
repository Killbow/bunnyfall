---
slug: gather-hover-lock-and-automap-layout-keep
title: "Gathering Hover Lock, Per-Layout Automaps, and Instance Gate"
domain: world
kind: subcard
parent: owed-standing-and-maker-era-aetheric-overview
files:
  - src/professions/gatherHost.js
  - src/scenes/worldModes.js
  - src/scenes/dungeonContext.js
  - src/maps/automap.js
  - src/net/instanceRoom.js
  - src/world/smallerDungeons.js
  - src/systems/quest/questRepair.js
  - src/world/immersiveTravelGates.js
  - tools/townSolidsSweep.mjs
  - src/homes/homeYards.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-16c.md"
related:
  - owed-standing-and-maker-era-aetheric-overview
  - professions-gathering-nodes-and-motherlodes
  - dungeon-sizing-and-online-quest-relay
invariants:
  - "While a gathering act plays, hoverHit returns ACT_OWNS_LOOK ({key:null}), never null, so no plaque or tooltip is named behind it."
  - "Automap records keep up to AUTOMAP_LAYOUTS_KEPT (2) layouts per dungeon key. A saved game writes 'layouts' only when one is kept."
  - "relaySupportsInstances requires a worldNNN relay version >= INSTANCE_RELAY_MIN (208)."
traps:
  - "Older save readers ignore 'layouts'. Keep the field optional."
  - "The quest-elsewhere door warning has not been verified in live code."
dfu:
  - "Assets/Scripts/Game/UserInterfaceWindows/Automap.cs"
tags:
  - skin-plaque
  - layout-keep
  - instances
  - automap
---

# Gathering Hover Lock, Per-Layout Automaps, and Instance Gate

Gathering hover suppression, multi-layout dungeon automap persistence, and instance relay gating span `src/professions/gatherHost.js`, `src/scenes/worldModes.js`, `src/scenes/dungeonContext.js`, `src/maps/automap.js`, `src/net/instanceRoom.js`, and `src/world/smallerDungeons.js`.

## Gathering Hover Lock and Per-Layout Automaps

- **Gathering hover lock (`ACT_OWNS_LOOK`):** In `src/professions/gatherHost.js` and `src/scenes/worldModes.js`, while a gathering action is playing, `hoverHit` returns `ACT_OWNS_LOOK` (`{key:null}`) rather than `null`. Returning a non-null sentinel prevents the look raycast from naming any world plaque or tooltip behind the active node.
- **Per-layout automap persistence (`AUTOMAP_LAYOUTS_KEPT`):** `bindAutomapLayout` (called from `src/scenes/dungeonContext.js` and `interiorContext.js`) keys records via `automapDungeonKey` in `src/maps/automap.js` and retains up to `AUTOMAP_LAYOUTS_KEPT` (`2`) distinct layouts per dungeon key. Save serialization writes the `'layouts'` field only when at least one layout is stored, keeping the field optional for older save readers.

## Instance Relay Version Gate and World Placement

In `src/net/instanceRoom.js`, `relaySupportsInstances` requires a relay version at or above `INSTANCE_RELAY_MIN` (`208`), while `dungeonSizeFor` and `onlineDungeonSize` (`src/world/smallerDungeons.js`, alongside `src/systems/quest/questRepair.js`) determine whether the public dungeon room is laid out smaller. Separately, `layGateRecords` (`src/world/immersiveTravelGates.js`, audited with `tools/townSolidsSweep.mjs` and `src/homes/homeYards.js`) places carriage teams at travel gates.
