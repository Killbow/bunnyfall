---
slug: "classic-nearby-objects-query"
title: "Classic Nearby Objects Query, Flags, and Groups"
domain: "world"
kind: "subcard"
parent: "enemy-expansion-groups-and-corpse-markers-overview"
files:
  - "src/world/nearbyObjects.js"
routes: []
tables: []
replacesBible: []
related:
  - "enemy-expansion-groups-and-corpse-markers-overview"
  - "world-arc-classic-port-overview"
invariants:
  - "`entityFlags` gives a civilian the Humanoid bit alone, never Enemy or a group bit, and sets Magic for any entity with at least one live effect, as DFU does."
  - "`createNearbyScan` resets its timer to 0 when it rebuilds instead of subtracting the interval, so a long frame never banks a second rebuild, matching DFU's 0.33 s refresh."
traps:
  - "Nearby-object group bits come from the DFU career switch in `combat/enemyGroups.js`, not the `affinity` field of `ENEMY_BASICS`, which is a different nine-value classification and would give many enemies no group bit."
  - "Class enemies (IDs from 128) reach the group switch through career index ID minus 128 and collide with monster careers, so a Mage counts as an animal and a Knight as undead; this matches DFU and is not a bug."
  - "`isPlayerInTown` with `mustBeOutside` is true only outdoors in a town and false once inside a door; reversing the gate would make every inn refuse rest. The seven town types include farms, wealthy homes, taverns, and temples."
  - "`getNearbyObjects` returns null for a None query, matches all requested bits rather than any, and uses a strict `distance < maxRange`; asking for Undead and Daedra together finds nothing, as in DFU."
dfu: []
tags:
  - "nearby-objects"
  - "dfu-parity"
  - "enemy-groups"
---

# Classic Nearby Objects Query, Flags, and Groups

The nearby objects scan in `src/world/nearbyObjects.js` copies the classic `PlayerGPS` nearby query. Hosts adapt their own entity pools into one record shape, and every caller reads the same scan.

- **Flags:** each entity carries enemy, humanoid, magic, and group bits. Group bits come from the classic career switch.
- **Query:** a query matches all requested bits, uses a strict range test, and returns null for an empty query.
- **Refresh:** the scan rebuilds on a fixed interval and resets its timer on each rebuild.
- **Town test:** the player-in-town check can require the player to be outdoors.
