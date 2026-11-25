---
slug: gilded-look-and-door-refusals
title: "Gilded Look (Crimson, Crown, Glow) and Door Refusals"
domain: ui
kind: subcard
parent: gilded-rung-overview
files:
  - src/ui/enhancedPlusStyle.js
  - src/ui/enhancedStyle.js
  - src/ui/lootTierMarks.js
  - src/ui/grimoireDress.js
  - src/render/spoilsGlow.js
  - src/items/physicalItems.js
  - src/items/reforge.js
  - src/ui/salvageMaterials.js
  - src/systems/legacy/heirloom.js
  - src/magic/enchanting.js
  - src/items/itemLaw.js
  - src/net/appearanceLaw.js
  - src/items/quickslots.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Gilded.md"
related:
  - gilded-rung-overview
  - weapon-glow-overview
  - loot-arc-welkynd-salvage-reforge-and-imprint
  - legacy-heirlooms-remains-and-blessing
  - wardrobe-appearances-overview
invariants:
  - "Color: RARITIES.gilded `#ff3b4a`, tint [1.00, 0.23, 0.29, 0.60]. RARITY_VARS sets `--rar-hi #ff7480`, `--rar-lo #8e1622`, and pips `GILDED_CROWN_SVG` (an 11 px crown)."
  - "Frame: `@keyframes gilded-glow` runs at `2.6s steps(8, end) infinite alternate`. On the Stone theme, post-win Gilded text lifts to `#ffb1b7`."
  - "`SPOILS_LINE_H.gilded = 2.5` (m), `PI_RIM.gilded = 0.8`, `RARITY_INK.gilded = '#a3122e'`."
  - "Refusals: `salvageRefusal` returns 'gilded'. Heirloom `NEVER_RARITY` includes 'gilded'. The item maker law returns ['enchantments'] for gilded. Enchanting refuses via `isGilded`. Sigil law refuses gilded. appearanceLaw refuses a gilded source look and strips 'gilded' from drawn copies."
traps:
  - "Weapon art stays gold. Only the rarity UI went crimson (GILDED-RED)."
  - "`quickslotKey` appends `|g<record id>` only when `item.gilded` is set, so old save keys still resolve."
dfu: []
tags:
  - ui
  - gilded
  - rarity-color
  - salvage
  - heirloom
  - enchanting
---

# Gilded Look (Crimson, Crown, Glow) and Door Refusals

Gilded items keep gold weapon art while rendering crimson (`#ff3b4a`) across UI frames, world beacons, and physical rims, and every modification or inheritance door refuses them.

- **Crimson palette, crown pips, and beacons (`src/ui/enhancedPlusStyle.js`, `enhancedStyle.js`, `lootTierMarks.js`, `grimoireDress.js`, `src/render/spoilsGlow.js`, `src/items/physicalItems.js`):** `RARITIES.gilded` uses `#ff3b4a` with tint `[1.00, 0.23, 0.29, 0.60]`. `RARITY_VARS` defines `--rar-hi #ff7480`, `--rar-lo #8e1622`, and `GILDED_CROWN_SVG` (`11` px crown pips) inside an animated `@keyframes gilded-glow` (`2.6s steps(8, end) infinite alternate`), lifting to `#ffb1b7` on the Stone theme post-win screen. Plaque rows in `lootTierMarks.js` pair a gold `#f6c945` inset ring with a crimson glow, `RARITY_INK.gilded` uses `'#a3122e'`, `SPOILS_LINE_H.gilded` rises `2.5` meters, and `PI_RIM.gilded` sets a `0.8` rim.
- **Quickslots and door refusals (`src/items/quickslots.js`, `reforge.js`, `src/ui/salvageMaterials.js`, `src/systems/legacy/heirloom.js`, `src/magic/enchanting.js`, `src/items/itemLaw.js`, `src/net/appearanceLaw.js`):** `quickslotKey` appends `|g<record id>` only when `item.gilded` is present. Salvage (`salvageRefusal` returns `'gilded'`), heirloom selection (`NEVER_RARITY`), enchanting (`isGilded`), item-maker law (`['enchantments']`), sigil law, and wardrobe appearance copying (`appearanceLaw` rejects a Gilded source look and strips `'gilded'` from drawn copies) all refuse Gilded items.
