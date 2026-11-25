---
slug: "code-map-src-layers-and-feature-folders"
title: "Code Map: src/ Layers and Feature Folders"
domain: "overview"
kind: "subcard"
parent: "code-map-repository-layout-overview"
files:
  - "src/scenes/world.js"
  - "src/scenes/worldModes.js"
  - "src/scenes/dungeonContext.js"
  - "src/scenes/exterior.js"
  - "src/combat/twoHands/twoHands.js"
  - "src/combat/twoHands/mixedArm.js"
  - "src/combat/twoHands/spellHand.js"
  - "src/characters/bodyMotion/bodyMotion.js"
  - "src/world/jungle/banthaArea.js"
  - "src/world/worldOfDaggerfall.js"
  - "src/mods/enemyExpansion/dexEquipment.js"
  - "src/mods/vanillaEnhanced.js"
  - "src/audio/soundscape/soundscapeHost.js"
  - "src/systems/naval/comeSailAway.js"
  - "src/systems/naval/csaBoatMenu.js"
  - "src/systems/hunt/namedMark.js"
  - "src/systems/questlines/qlEliteFoe.js"
  - "src/render/ketch/ktGaugePass.js"
  - "src/ui/introBuildWorker.js"
  - "src/ui/wardrobe/wardrobeWindow.js"
routes: []
tables: []
replacesBible:
  - "01-Overview/Code-Map.md"
related:
  - "code-map-repository-layout-overview"
  - "code-map-relay-bundle-and-move-ledger"
  - "four-hosts-and-modal-frame"
  - "body-motion-overview"
  - "bantha-jungle-area-field-and-layout"
invariants:
  - "Code is organized layer first (top-level src/ folder), then by feature subfolder inside that layer."
  - "Modules that a scene host wires conventionally end in Host.js (99 such files under src/)."
traps:
  - "Cross-layer features such as Ketch, Elite Gates and Starfall are split across src/systems, src/net, src/render, src/ui and src/world; there is no src/scenes/ketch or src/scenes/eliteGates."
  - "Mod ports live under src/mods/, not src/systems/: enemyExpansion/ is a folder, Vanilla Enhanced is loose files."
  - "Come Sail Away is loose in src/systems/naval/, not a comeSailAway/ folder."
dfu: []
tags:
  - "code-map"
  - "src"
  - "folders"
  - "layers"
---

# Code Map: src/ Layers and Feature Folders

`src/` is organized by architectural layer first across 37 top-level directories (`ai`, `audio`, `characters`, `combat`, `formats`, `guilds`, `homes`, `items`, `mods`, `net`, `player`, `poi`, `render`, `scenes`, `systems`, `tools`, `trade`, `travel`, `ui`, `world`, `worldEvents`, and others) and by feature subfolder second. Modules wired directly by a scene host conventionally end in `Host.js` (99 files across `src/`), while `src/scenes/` keeps the four hosts loose (`world.js`, `worldModes.js`, `dungeonContext.js`, and `exterior.js`).

## Representative Feature Placements

- **Combat, characters, and audio:** `src/combat/twoHands/` (6 modules) covers two-hand rules (`twoHands.js`, `mirrorRig.js`, `mixedArm.js`, `spellHand.js`, and `spellHandArm.js`). `src/characters/bodyMotion/` (6 modules) holds `bodyMotion.js`, `bodyKit`, `gait`, `carry`, `melee`, and `bodySolve`. `src/audio/soundscape/` houses `soundscapeHost.js` and off-thread sound workers.
- **World, mods, and systems:** `src/world/jungle/` (9 modules) holds `banthaArea.js` plus jungle haze, trail, and host modules, whereas `src/world/worldOfDaggerfall.js` sits loose in `src/world/`. Mod ports live under `src/mods/` rather than `src/systems/`: `src/mods/enemyExpansion/` is a subfolder (`dexEquipment.js`), while `src/mods/vanillaEnhanced.js` is loose. Inside `src/systems/`, Come Sail Away sits loose in `src/systems/naval/` (`comeSailAway.js` and `csaBoatMenu.js`), `src/systems/upkeep/` holds upkeep runtime and tier modules, `src/systems/hunt/namedMark.js` tracks marks, and `src/systems/questlines/qlEliteFoe.js` handles elite targets.
- **Cross-layer features and UI:** Features like Ketch, Elite Gates, and Starfall span `src/systems/`, `src/net/`, `src/render/` (`src/render/ketch/ktGaugePass.js`), `src/ui/`, and `src/world/` rather than owning folders under `src/scenes/`. In `src/ui/`, `wardrobe/wardrobeWindow.js` uses a subfolder while `introBuildWorker.js` sits loose.
