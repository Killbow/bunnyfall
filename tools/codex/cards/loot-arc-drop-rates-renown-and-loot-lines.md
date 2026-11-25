---
slug: loot-arc-drop-rates-renown-and-loot-lines
title: "Plain-Enemy Drop Rates, Renown Scaling, and Loot Line Beacons"
domain: items
kind: subcard
parent: loot-arc-overview
files:
  - src/combat/hostCombat.js
  - src/items/foeLootCap.js
  - src/items/renownLoot.js
  - src/items/lootLines.js
  - src/systems/survival/restItems.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Loot-Arc.md"
related:
  - loot-arc-overview
  - loot-arc-signature-drops-champions-and-drought
invariants:
  - "Non-elite enemies retain each rolled inventory piece independently at `plainFoeLootKeep`, interpolating by `RENOWN_LOOT_QUARTERS` (`[2, 3, 4, 5, 6]` quarters at Renown `1`, `10`, `20`, `30`, and `40` online, or `RENOWN_LOOT_OFFLINE_QUARTERS = 4` offline) from `0.5` toward `PLAIN_FOE_LOOT_KEEP = 0.75`."
  - "Elite enemies, Elite Dungeon enemies, and champions bypass the plain-enemy drop cut (`eliteLooted`)."
  - "`plainFoeRarityWeights` scales the plain-enemy rarity ladder by the same Renown quarters around `PLAIN_FOE_RARITY_WEIGHTS`, and enemy worn equipment rolls once on that ladder (`rollKitPieces`)."
  - "`pickLootLines` renders at most `LOOT_LINES_MAX = 8` vertical light beacons for nearby loot piles containing a Rare or higher item within `LOOT_LINES_REACH = 40` m, sorted nearest first and anchored at `LOOT_LINE_CROWN = 0.6` m when no sprite height is present."
traps:
  - "Multiplayer shared room rolls (`PARTY-LOOT`) pass every rarity parameter explicitly as function arguments; never read local player stats from global state inside the roll chain."
dfu: []
tags:
  - drop-rates
  - renown-loot
  - loot-ease
  - loot-lines
  - beacons
---

Combat loot generation paces item volume from ordinary enemies through per-item retention coins and Renown-scaled rarity ladders, while highlighting high-rarity drops in the 3D scene with vertical light beacons.

## Plain-Enemy Drop Retention and Renown Scaling

Before rarity rolls run in `src/combat/hostCombat.js` and `src/items/foeLootCap.js`, humanoid equipment drop odds scale by `HUMANOID_LOOT_ITEM_SCALE` (`0.25`) while gold drops remain unchanged. Non-elite enemies then test each carried piece independently against `plainFoeLootKeep` (`src/items/renownLoot.js`). Using `lootEased(0.5, 0.75, quarters)` and `PLAIN_FOE_LOOT_KEEP` (`0.75`), retention steps across `RENOWN_LOOT_QUARTERS` (`[2, 3, 4, 5, 6]` at Renown thresholds `1`, `10`, `20`, `30`, and `40` online), yielding `62.5`% at Renown 1, `75`% at Renown 20 (and in offline play via `RENOWN_LOOT_OFFLINE_QUARTERS` = `4`), and `87.5`% at Renown 40.

`eliteLooted` exempts champions, elite enemies, and Elite Dungeon spawns from this retention cut. For surviving plain-enemy items and worn equipment (`rollKitPieces`), `plainFoeRarityWeights` shifts the rarity ladder around `PLAIN_FOE_RARITY_WEIGHTS` by the same Renown quarter step. In addition, `REST_ITEMS_ONLINE` (`true` in `src/systems/survival/restItems.js`) enables rest-item generation during online sessions.

## Loot Line Beacons

In `src/items/lootLines.js`, `pickLootLines` scans loot piles within `LOOT_LINES_REACH` (`40` m) whose highest rarity is at least Rare. It sorts qualifying piles by distance and draws up to `LOOT_LINES_MAX` (`8`) color-coded vertical beacons, placing the beam base at `LOOT_LINE_CROWN` (`0.6` m) whenever the pile lacks a sprite height.
