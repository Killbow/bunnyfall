---
slug: "deep-waters-fish-and-seafloor-decorations"
title: "Deep Waters Passive Fish and Seafloor Decorations"
domain: "world"
kind: "subcard"
parent: "deep-waters-overview"
files:
  - "src/world/passiveFish.js"
  - "src/underwater/deepWatersFish.js"
  - "src/underwater/deepWatersFishItems.js"
  - "src/underwater/deepWatersEncounters.js"
  - "src/world/underwaterDecorations.js"
  - "src/underwater/deepWatersDecor.js"
  - "src/world/deepWaterTransients.js"
  - "tools/iliacPuddleAssets.mjs"
routes: []
tables: []
replacesBible:
  - "03-World/Deep-Waters.md"
related:
  - "deep-waters-overview"
  - "deep-waters-enemies-and-sunken-loot"
invariants:
  - "Seven species, templates 9001-9007 (FISH_TEMPLATE_INDICES), are registered to ItemGroups 9 (UselessItems2) at rarity 20 and stocked at chanceMod x 5 / 100."
  - "Each fish is a DaggerfallLoot container holding its species item, with a 3.2 m reach."
  - "Pulse: TICK_INTERVAL 0.1 s, MAX_PENDING_DESTROYS_PER_FRAME 12, MAX_PENDING_FISH_SPAWNS_PER_FRAME 5. MaxLiveFish is clamped to 0..MAX_LIVE_FISH_LIMIT (1080), default 720."
  - "Decorations need at least 8 m of water, at most 35 degrees of slope, 0.25 m floor clearance (0.75 animated) and 5 m spacing. They are placed one pixel and one batch per frame within the Decoration Populate Radius, and only as heavy work."
  - "A transient reset (`onTransientReset`) clears spawners without clearing the floor build queue, and `RefreshPlayerArea` runs once grace ends."
traps:
  - "GetEdgeCleanedTexture treats alpha < 16 or every RGB channel <= 12 as padding. Skipping it leaves black sprite borders against the water."
  - "The species name is 'Finulon', but the item template is 'Juvenile Finulon'."
dfu: []
tags:
  - "deep-waters"
  - "fish"
  - "decorations"
  - "items"
  - "billboards"
---

# Deep Waters Passive Fish and Seafloor Decorations

Passive fish schools, catchable fish item templates, and deterministic seafloor billboard decorations are managed by `src/world/passiveFish.js`, `src/underwater/deepWatersFish.js`, `src/underwater/deepWatersFishItems.js`, `src/underwater/deepWatersEncounters.js`, `src/world/underwaterDecorations.js`, `src/underwater/deepWatersDecor.js`, `src/world/deepWaterTransients.js`, and `tools/iliacPuddleAssets.mjs`.

- **Passive fish items, pulsing, and schools:** Seven species register under `FISH_TEMPLATE_INDICES` (`9001..9007`, where species `'Finulon'` uses item template `'Juvenile Finulon'`) in `ItemGroups` `9` (`UselessItems2`) at rarity `20` and shop stocking chance `chanceMod * 5 / 100`. Each live fish spawns as a `DaggerfallLoot` container with a `3.2` m reach holding its species item, textured via `GetEdgeCleanedTexture` (treating `alpha < 16` or all `RGB <= 12` as padding to avoid black sprite borders). Spawner pulses tick every `TICK_INTERVAL` (`0.1` s) with `MAX_PENDING_DESTROYS_PER_FRAME` (`12`), `MAX_PENDING_FISH_SPAWNS_PER_FRAME` (`5`), and `MaxLiveFish` clamped to `0..MAX_LIVE_FISH_LIMIT` (`1080`, default `720`). Schools swim at `SCHOOL_CRUISE_SPEED` (`0.95` m/s times species multiplier) keeping `1.2` m off the floor and `1.4` m under the surface, while individual fish use `BASE_CRUISE_SPEED` (`1.2`), `BASE_FLEE_SPEED` (`3.5` times flee multiplier), and `FLEE_DISTANCE` (`8`).
- **Seafloor decorations and transient resets:** `UMRandom` (xorshift) seeds deterministic placement per pixel from archives `105`, `106` (records `2..6` animate at `5` fps), `206`, `211`, `213`, `253`, `305`, `306`, `380`, `501`, and `502`. Placements require at least `8` m of water, slope at most `35` degrees, `0.25` m floor clearance (`0.75` m animated), and `5` m spacing, advancing one pixel and one batch per frame as heavy work inside the Decoration Populate Radius. `onTransientReset` clears spawners without touching the floor build queue and calls `RefreshPlayerArea` after grace ends.
