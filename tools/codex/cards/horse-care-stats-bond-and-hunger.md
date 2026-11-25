---
slug: horse-care-stats-bond-and-hunger
title: "Horse Stats, Bond Tiers, Hunger, and Feeding"
domain: world
kind: subcard
parent: horse-care-tiers-overview
files:
  - src/travel/steedCare.js
  - src/travel/horseCoats.js
  - src/items/itemFields.js
  - src/systems/upkeep/upkeepItemRows.js
  - src/net/realmTradeLaw.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Horse-Care.md"
related:
  - horse-care-tiers-overview
  - horse-care-keep-stables-and-yards
invariants:
  - "bornStats(seed) rolls Speed, Stamina, Endurance, and Strength from the immutable horseSeed (1..65535). Each stat is the mean of two draws in [20, 80], and no field stores the stats."
  - "steedStats = born + floor(bond / BOND_STEP 5) - hunger penalty (only when hungerCosts), clamped to [1, STEED_STAT_CAP 100]."
  - "Horses never die. Starvation bottoms out at stat 1 and bond 0."
traps:
  - "The starving bond fade (STARVING_BOND_TENTHS_A_DAY 20) is computed lazily by fadeBy and subtracted once in setFed when the clock next moves. Never apply it per tick."
  - "On Boons, holdStarving pins horseFed at the starving line so switching to Hard owes no back-fade."
dfu: []
tags:
  - horse
  - stats
  - bond
  - hunger
  - food
---

# Horse Stats, Bond Tiers, Hunger, and Feeding

Every horse derives base attributes from its immutable `horseSeed` (`1..65535`) and adjusts them via two item fields (`src/items/itemFields.js`): `horseBond` and `horseFed`.

- **Born and effective stats (`src/travel/steedCare.js`, `src/travel/horseCoats.js`):** `bornStats(seed)` rolls Speed, Stamina, Endurance, and Strength by averaging two `[20, 80]` draws per stat without storing stat fields. `steedStats` adds `floor(bond / BOND_STEP)` (`BOND_STEP` `5`), subtracts the hunger penalty when `hungerCosts` is active, and clamps to `[1, STEED_STAT_CAP]` (`100`). Horses never die; neglect bottoms out at stat `1` and bond `0`.
- **Bond tiers and lazy fade (`src/travel/steedCare.js`):** `horseBond` uses tenths up to `BOND_TENTHS_MAX` (`1000`) across six `BOND_TIERS`: Wary (`0`), Accepting (`15`), Familiar (`35`), Trusting (`55`), Devoted (`75`), and Kindred (`95`). Meals add `(hoursFed / 1440) * DAY_BOND_TENTHS * love` (`DAY_BOND_TENTHS` `30`). While starving on Hard, bond decays by `STARVING_BOND_TENTHS_A_DAY` (`20`), computed lazily by `fadeBy` and subtracted once in `setFed` when the clock moves. On Boons, `holdStarving` pins `horseFed` at the starving line so switching to Hard owes no back-fade.
- **Hunger, rations, and trade (`src/systems/upkeep/upkeepItemRows.js`, `src/net/realmTradeLaw.js`):** `HUNGER` moves from fed (`0` penalty, `1x` breath) to hungry (`-10` stats, `0.7x` breath) and starving at `STARVING_AFTER` (`2` days past `horseFed`, `-25` stats, `0.4x` breath, no gallop). Sack of Oats (`1710`, `UPKEEP_ITEM.Oats`) gives `24` hours at love `1`; hand-fed apples (`532`, `1608`) give `4` hours at love `1.5`. `feedHorse` refuses at `FULL_AHEAD` (`30` hours) and caps at `FED_AHEAD_MAX` (`48` hours). New horses start at `NEW_HORSE_FED` (`12` hours), and `RECEIVER_MARKS` strips `horseBond` and `horseFed` on trade.
