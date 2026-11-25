---
slug: wagon-upkeep-mending-and-repair-refusal
title: "Wagon Yard Mending, Repair Kits, and Smith Refusal"
domain: world
kind: subcard
parent: wagon-upkeep-tiers-overview
files:
  - src/travel/wagonUpkeep.js
  - src/world/yardsPortsWorld.js
  - src/world/merchantYards/merchantYards.js
  - src/systems/upkeep/upkeepItemRows.js
  - src/systems/upkeep/upkeepRuntime.js
  - src/trade/repairService.js
  - src/trade/tradeModes.js
  - src/scenes/worldModes.js
  - src/magic/enchantments.js
  - src/ui/holdingsPages.js
  - src/ui/enhancedSaddle.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Wagon-Upkeep.md"
related:
  - wagon-upkeep-tiers-overview
  - wagon-upkeep-wear-and-condition
  - economy-arc-repair-wear-and-kits
  - horse-care-keep-stables-and-yards
  - market-vendors-and-professions
invariants:
  - "mendPrice = max(1, round(max(MEND_LEAST 40, round(MEND_SHARE 0.12 * kind value)) * lacks * (away ? 1 + MEND_FETCH 0.5 : 1))); 0 when already whole."
  - "`mendAtYard` (yardsPortsWorld.js) sets `away` when the wagon is outside the counter reach (`canAccessWagonInventory`), asks yes/no, deducts gold, and `mendWagon` restores full condition."
  - "Wagon Repair Kit is UPKEEP_ITEM.WagonKit 1711: `kitMendWagon` adds KIT_MEND 0.25 of whole up to WAGON_KIT_CEILING 0.6, KIT_MINUTES 60; refused at or above the ceiling."
  - "UPKEEP_ITEMS_ONLINE = true, so Wagon Yards sell kits online (YARD_KITS_STACK 5; Mend row YARD_MEND_ROW)."
  - "`repairRefusal` returns 'transport' for templates TRANSPORT_HORSE and TRANSPORT_SMALL_CART, shown as TRANSPORT_CANNOT_BE_REPAIRED_TEXT."
  - "`repairsObjectsTarget` skips horse and wagon templates, so the Repairs Objects enchantment never mends them."
traps:
  - "Off tier: the yard wright refuses work and kit Use is unusable (`usable: () => Boolean(wagonUpkeep())`)."
  - "Never route wagons through smith repair queues; that previously removed the wagon from the pack for days."
dfu: []
tags:
  - wagon
  - mending
  - repair-kit
  - wagon-yard
  - smith
---

# Wagon Yard Mending, Repair Kits, and Smith Refusal

Wagons are mended instantaneously at town Wagon Yards or partially patched in the field with Wagon Repair Kits, bypassing smith repair queues and passive item-repair enchantments.

- **Wagon Yard wright (`src/travel/wagonUpkeep.js`, `src/world/yardsPortsWorld.js`, `src/world/merchantYards/merchantYards.js`, `src/ui/holdingsPages.js`):** The yard service row (`YARD_MEND_ROW`) invokes `mendAtYard`, which checks `canAccessWagonInventory` to set `away` when the wagon is parked beyond counter reach. When damaged, `mendPrice` charges `max(1, round(max(MEND_LEAST 40, round(MEND_SHARE 0.12 * kindValue)) * lacks * (away ? 1 + MEND_FETCH 0.5 : 1)))` (`0` when whole), so a distant Failing wagon can always pay the `1.5x` traveling-wright surcharge instead of being stranded. Confirming yes deducts gold and calls `mendWagon` to restore full condition; Holdings `mendLine` previews both yard and traveling-wright quotes. Under Off, the wright refuses work.
- **Wagon Repair Kits (`src/systems/upkeep/upkeepItemRows.js`, `src/systems/upkeep/upkeepRuntime.js`, `src/ui/enhancedSaddle.js`):** Template `UPKEEP_ITEM.WagonKit = 1711` is stocked at Wagon Yards (`YARD_KITS_STACK = 5`), including online (`UPKEEP_ITEMS_ONLINE = true`). Calling `kitMendWagon` advances the clock by `KIT_MINUTES = 60` and restores `KIT_MEND = 0.25` of max condition up to `WAGON_KIT_CEILING = 0.6` (`Sound` threshold), refusing use at or above that ceiling or when upkeep is Off (`usable: () => Boolean(wagonUpkeep())`). The Holdings and saddle UI surfaces held kit counts.
- **Smith and enchantment exclusions (`src/trade/repairService.js`, `src/trade/tradeModes.js`, `src/scenes/worldModes.js`, `src/magic/enchantments.js`):** `repairRefusal` returns `'transport'` for `TRANSPORT_HORSE` and `TRANSPORT_SMALL_CART` (displaying `TRANSPORT_CANNOT_BE_REPAIRED_TEXT` so a smith queue never confiscates the player's wagon for days), and `repairsObjectsTarget` excludes both templates from the `Repairs Objects` enchantment.
