---
slug: arrow-supply-fletching-and-shop-quivers
title: "Fletching Wood and Shop Counter Quivers"
domain: economy
kind: subcard
parent: arrow-supply-overview
files:
  - src/professions/fletching.js
  - src/items/itemTemplates.js
  - src/items/useItem.js
  - src/trade/shopStock.js
  - src/scenes/worldModes.js
  - src/net/recipeLaw.js
  - src/net/marketLaw.js
  - server-account/src/market.js
routes: []
tables: []
replacesBible:
  - "05-Combat/Arrow-Supply.md"
related:
  - arrow-supply-overview
  - market-vendors-and-professions
  - professions-market-auctions-and-orders
  - economy-ledger-and-item-judge
invariants:
  - "fletchYield = floor(template baseWeight / classic ITEM_TEMPLATES Arrow baseWeight 0.25), 0 for non-FLETCH_TEMPLATES [8, 14, FT.WoodBundle]."
  - "One wood piece per Use; arrows go to ctx.localItems via createWeapon(ARROW_TEMPLATE, 0, () => 0) and message 'You fletch N arrows from the <name>.'"
  - "shopAmmoStack = max(1, round(max * (shopWeaponsChance / 0x46) * (0.5 + 0.5*(q-1)/19))); 0 where no weapons are sold."
traps:
  - "Fletch must use the classic 0.25 kg Arrow weight; Roleplay & Realism: Items' 0.1 kg made a Twig five arrows (BENCH-ARROWS)."
  - "Quest items are never fletched."
  - "General Store quivers are ENDLESS-ARROWS: always 100 and refilled after purchases only, never after theft; other shops sell out until daily restock."
  - "Crafted arrows are never market-listable (marketLaw.js CRAFTED_FAMILIES, server-account market.js)."
dfu:
  - Assets/Scripts/Game/Items/ItemHelper.cs
  - Assets/Scripts/Game/Items/ItemCollection.cs
tags:
  - fletching
  - shop-stock
  - endless-arrows
  - carpentry
  - economy
---

# Fletching Wood and Shop Counter Quivers

Field fletching, online carpentry recipes, and deterministic shop quivers supply arrows outside combat (`src/professions/fletching.js`, `src/trade/shopStock.js`, and `src/net/recipeLaw.js`).

- **Field fletching and carpentry:** `src/professions/fletching.js` registers an item-use handler via `registerItemUseHandler` (`src/items/itemTemplates.js`, dispatched by `src/items/useItem.js`) for `FLETCH_TEMPLATES` (`[8, 14, FT.WoodBundle]`, refusing quest items). `fletchYield` divides wood `baseWeight` by classic `ITEM_TEMPLATES` Arrow `baseWeight` (`0.25` kg, ignoring the `0.1` kg value from Roleplay & Realism: Items under `BENCH-ARROWS`), yielding `2` arrows from `Twigs` (`0.5` kg), `4` from `Pine Branch` (`1` kg), and `10` from `Wood Bundle` (`2.5` kg). Each Use consumes one piece, adds `createWeapon(ARROW_TEMPLATE, 0, () => 0)` to `ctx.localItems`, and logs `'You fletch N arrows from the <name>.'` Online carpentry recipes `arrows:north` and `arrows:south` (`src/net/recipeLaw.js`) craft `ARROWS_STACK` (`20`) from `1` pine plank, `1` iron ingot, and `4` `Twigs`. Crafted arrows are barred from market listings (`CRAFTED_FAMILIES` in `src/net/marketLaw.js`, `server-account/src/market.js`).
- **Shop counter quivers:** In `src/trade/shopStock.js` and `src/scenes/worldModes.js`, `shopAmmoStack` computes `max(1, round(max * (shopWeaponsChance / 0x46) * (0.5 + 0.5*(q-1)/19)))` (or `0` where no weapons sell), merging with arrows from the DFU `Range(1, 21)` shelf draw while `PELLETS-SCARCE` omits Dwemer Pellets. At `q1/q10/q20`, Weapon Smiths stock `50/74/100`, Armorers `14/21/29`, and Pawn Shops `7/11/14`. Under `ENDLESS-ARROWS`, General Stores always carry `GENERAL_STORE_ARROWS` (`100`) and refill after purchases only, never theft.
