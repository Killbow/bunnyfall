---
slug: gilded-records-mint-and-drops
title: "Gilded Records, Minting, and World Boss Drops"
domain: items
kind: subcard
parent: gilded-rung-overview
files:
  - src/items/gilded.js
  - src/worldEvents/sdSpoilsRoll.js
  - src/worldEvents/gateSpoils.js
  - src/worldEvents/serpentSpoils.js
  - server-account/src/lostSpoils.js
  - src/characters/testRoom.js
  - src/items/lootCodex.js
  - src/combat/enemyEquipment.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Gilded.md"
related:
  - gilded-rung-overview
  - brass-remnant-fight-and-rewards
  - sea-serpent-receipts-hoard-and-honours
  - sky-ketch-receipts-spoils-and-claims
invariants:
  - "`GILDED_RECORDS` = [HOURLOCK ('the-hourlock', Dwarven `WEAPONS.Long_Bow`), DRAGONFIRE_OATH ('the-dragonfire-oath', Daedric `WEAPONS.Dai_Katana`), SUNKEN_SOVEREIGN ('the-sunken-sovereign', Ebony `WEAPONS.Saber`)]."
  - "Lines on every record sit at the top of the Legendary band: damage 40, a stat 15, a skill 30, plus a fourth line (Hourlock: shock 10; Oath: endurance 15; Sovereign: leech 10)."
  - "`mintGilded(r)` builds the item via `createWeapon(templateIndex, material)`, copies only affixes that pass `validAffix`, sets `isIdentified`, and prices it at `itemBaseValue + affixesWorth + GILDED_WORTH`."
  - "Each roll is one draw, always, and is the LAST draw of its spoils, so earlier spoils stay unchanged for their seed: `rollHourlock` (sdSpoilsRoll.js), `rollDragonfireOath` (gateSpoils.js, after `techniquePass`), `rollSunkenSovereign` (serpentSpoils.js, only for a ship that `dealt`)."
traps:
  - "`lostLeftBy` (server-account/src/lostSpoils.js) accepts only un-gilded items or the `LOST_GILDED` of that event record (gate: Oath, sd: Hourlock). A foreign Gilded piece is rejected."
  - "Adding a draw before a Gilded roll shifts every seeded spoils. Append new draws after it."
dfu: []
tags:
  - items
  - gilded
  - spoils
  - drop-rates
  - world-events
---

# Gilded Records, Minting, and World Boss Drops

`GILDED_RECORDS` in `src/items/gilded.js` defines three static-roll weapons minted by `mintGilded` (`src/combat/enemyEquipment.js` `createWeapon`) and rolled as the final draw of world boss spoils.

- **Catalog and static lines (`src/items/gilded.js`, `src/items/lootCodex.js`, `src/characters/testRoom.js`):**
  - `HOURLOCK` (`'the-hourlock'`): Dwarven `WEAPONS.Long_Bow` with damage `40`, agility `15`, archery `30`, and shock `10`.
  - `DRAGONFIRE_OATH` (`'the-dragonfire-oath'`): Daedric `WEAPONS.Dai_Katana` with damage `40`, strength `15`, long blade `30`, and endurance `15`.
  - `SUNKEN_SOVEREIGN` (`'the-sunken-sovereign'`): Ebony `WEAPONS.Saber` with damage `40`, speed `15`, short blade `30`, and leech `10`.
  `mintGilded(r)` validates each affix with `validAffix`, marks `isIdentified`, and sets `value = itemBaseValue + affixesWorth + GILDED_WORTH` (`12500`). The test room mints records via `mintHourlock` and `mintGilded`, and `codexGilded()` lists them for Collections.
- **Seeded boss rolls and lost spoils (`src/worldEvents/sdSpoilsRoll.js`, `gateSpoils.js`, `serpentSpoils.js`, `server-account/src/lostSpoils.js`):** Each roll consumes exactly one PRNG draw at the end of its spoils roll: `rollHourlock` at `GILDED_CHANCE = 1/100` (Brass Remnant), `rollDragonfireOath` at `GATE_GILDED_CHANCE = 1/250` (after `techniquePass` on the gate Warden), and `rollSunkenSovereign` at `SERPENT_GILDED_CHANCE = 1/250` (for a ship that `dealt`). On the account server, `lostLeftBy` allows only un-gilded gear or the matching `LOST_GILDED` piece (`sd`: Hourlock, `gate`: Oath).
