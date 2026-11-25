---
slug: physical-items-overview
title: "Physical Items Layer, Pickup Press, and Rarity Rims"
domain: items
kind: overview
parent: null
files:
  - src/items/physicalItems.js
  - src/items/physicalItemsLayer.js
  - src/items/droppedLoot.js
  - src/scenes/world.js
  - src/scenes/exterior.js
  - src/scenes/worldModes.js
  - src/scenes/dungeonContext.js
  - src/platform/onlineLane.js
  - vendor/physical-items/README.md
  - vendor/physical-items/il/PhysicalItems.il.txt
  - tools/ilDump.py
  - src/items/quickLoot.js
  - src/items/lootLines.js
  - src/combat/hitFlash.js
  - src/combat/fpArm.js
  - src/ui/itemIconColor32.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Physical-Items.md"
  - "01-Overview/audits/Audit-PI1.md"
related:
  - physical-items-body-physics-and-shift-drop
  - loot-arc-drop-rates-renown-and-loot-lines
  - loot-ii-junk-quick-loot-and-ayleid-stones
invariants:
  - "Port of the vendored PhysicalItems.dll (IL dump under vendor/physical-items/il); IL offsets cited in comments are the law."
  - "Pure logic lives in src/items/physicalItems.js; the per-scene layer in src/items/physicalItemsLayer.js is attached via droppedLoot.physical.attach in world.js, exterior.js, worldModes.js (interiorDropped) and dungeonContext.js."
  - "The body keeps the item; the proxy is only its picture, so body window, quick loot and online room still see the item."
  - "Online, physical items are local per player (ONLINE_PLAYERS_OWN_MODS in src/platform/onlineLane.js)."
  - "Press order (TryPickup): summoned refusal, map read and spend, quest click, whole stack or nothing (CanCarryWholeStack via takeOneItem wholeStack), gold to purse."
  - "PI_REACH = 3 m regardless of host pile reach; any armed quick-loot key is spent on the press (quickLootSpend)."
  - "Transformed lycanthropes CAN pick up items."
  - "Picture: Morrowind ground picture via mountPicture at PI_MW_PX = 64 with bleedEdges, else classic art under PI_ICON_ARCHIVE = 38161; retry PI_RETRY_MS 5000 doubling up to PI_RETRY_MAX 3 (5/10/20 s)."
  - "Press box: PI_BOX_MIN_HALF 0.2, PI_BOX_MIN_H 0.25; visible texels alpha >= 128 (PI_ALPHA_VISIBLE)."
traps:
  - "Corpse proxies are not saved; on reload bodies re-scatter with the small nudge launch. Shift-dropped piles are saved and restore settled."
  - "Mod placement (hold Activate to carry/throw/scale) and contact shadows are intentionally not ported."
  - "A pile keeps its bag until its picture batch stands (`presents` checks for a non-null `p.batch`), and textures ref-count across layers via `holdTexture` and `letTexture` until `heldTextureCount` reaches zero."
  - "The first item taken from a corpse rolls `silverFindAt('corpse', g.silver)` once (`g.silvered`)."
  - "Items do not chime again; the body's playRareDrop chimed at the kill."
dfu: []
tags:
  - physical-items
  - loot
  - pickup
  - rarity
---

# Physical Items Layer, Pickup Press, and Rarity Rims

`src/items/physicalItems.js` and `src/items/physicalItemsLayer.js` port the vendored `PhysicalItems.dll` (`vendor/physical-items/il/PhysicalItems.il.txt`, dumped by `tools/ilDump.py`). Each scene attaches the layer via `droppedLoot.physical.attach` (`src/items/droppedLoot.js`) across `src/scenes/world.js`, `src/scenes/exterior.js`, `src/scenes/worldModes.js` (`interiorDropped`), and `src/scenes/dungeonContext.js`.

## Proxy Model, Categories, and Art

The corpse or dropped pile retains the underlying item while a proxy keyed under `PI_KEY_PREFIX` (`'droppedLoot:pi'`) renders its picture in `lootTargets`. Online (`ONLINE_PLAYERS_OWN_MODS` in `src/platform/onlineLane.js`), proxies remain local per player. `PI_CATEGORIES` defines 16 filter categories; ungrouped items fall under Other Items.

Proxies render Morrowind ground pictures via `mountPicture` at `PI_MW_PX = 64` with `bleedEdges` (`src/ui/itemIconColor32.js`), or fall back to classic sprites under `PI_ICON_ARCHIVE = 38161`, retrying at `PI_RETRY_MS = 5000` doubled up to `PI_RETRY_MAX = 3` (`5`, `10`, and `20` s). A pile keeps its bag until `isPresented` becomes true, and `src/items/lootLines.js` draws beams on `isRareOrBetter` items while `PI_RIM` (`magic: 0.3`, `rare: 0.45`, `legendary: 0.6`, `aetheric: 0.7`, `artifact: 0.7`, `gilded: 0.8`) tints `setBatchGlint`.

## Pickup Press and Bounds

Press boxes enforce `PI_BOX_MIN_HALF = 0.2`, `PI_BOX_MIN_H = 0.25`, and `PI_ALPHA_VISIBLE = 128`, displaying `lootPileName` on single-item piles. Within `PI_REACH = 3` m, `TryPickup` spends any armed quick-loot key (`quickLootSpend` in `src/items/quickLoot.js`), allows transformed lycanthropes, and evaluates summoned refusal, map reading, quest click, `CanCarryWholeStack` (`takeOneItem` with `wholeStack`), and gold transfer.
