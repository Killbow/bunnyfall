---
slug: legacy-online-birth-seat-and-heir-guard
title: "Legacy Online Birth, Home Seat, and Heir-Clone Guard"
domain: legacy
kind: subcard
parent: salvage-cargo-companion-yield-and-seat-overview
files:
  - src/systems/legacy/legacyHost.js
  - src/ui/familyPages.js
  - src/main.js
  - server-account/src/legacy.js
  - server-account/src/routes/storageRoutes.js
routes:
  - /v1/realm/unions
tables:
  - lineages
  - realm_characters
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-12d.md"
related:
  - salvage-cargo-companion-yield-and-seat-overview
  - legacy-family-records-and-heir-birth
  - legacy-courtship-and-online-wedding
  - legacy-arc-overview
invariants:
  - "writeCurrent returns early unless playedHere(current); a save never writes the world's character over a member made current but not yet played."
  - "While family.pending and the page is bearing a newborn (born, until onBorn), the Succession is not offered again."
  - "placeHere: a town, else a non-dungeon place whose mapId matches a house in family.houses; null elsewhere."
traps:
  - "A legacy birth from the Online page must drop the classic param in main.js, or the world spawns at Privateer's Hold instead of the seat."
  - "A farm off a town map pixel was never a seat before SEAT-HOME; heirs spawned at the first noted town."
dfu: []
tags:
  - legacy
  - succession
  - family-seat
  - heir-clone
  - birth-start
  - seat-home
---

# Legacy Online Birth, Home Seat, and Heir-Clone Guard

Online heir birth transitions, family seat relocation, and save-cloning guards live in `src/systems/legacy/legacyHost.js`, `src/ui/familyPages.js`, `src/main.js`, `server-account/src/legacy.js`, and `server-account/src/routes/storageRoutes.js`.

- **Heir-Clone Guard (`HEIR-CLONE`):** `writeCurrent` returns early unless `playedHere(current)` holds, ensuring an active world save never overwrites a newly promoted family member before that heir has loaded into the world. While `family.pending` is active and `src/ui/familyPages.js` is bearing a newborn (`born` through `onBorn`), the Succession prompt is suppressed so players cannot trigger duplicate successions.
- **Online Birth Spawn (`BIRTH-START`):** When launching a legacy birth from the Online page, `src/main.js` strips the `classic` URL parameter. Leaving `classic` set caused the newborn heir to spawn inside Privateer's Hold rather than at the family seat.
- **Home Seat Relocation (`SEAT-HOME`):** `placeHere` resolves to the current town, or to a non-dungeon location whose `mapId` matches an owned home in `family.houses`, and returns `null` everywhere else. This allows off-town homesteads and farms to serve as family seats instead of defaulting heirs to the first recorded town. Calling `moveFamilySeat` stamps `seat.at` above the prior timestamp so the relocation wins every lineage merge (`lineages` and `realm_characters`). Standing outside an eligible site displays `seatNowhere`: `"To move the family seat, stand anywhere in another town, or at a home your family owns."`
- **Realm Unions (`UNION-CHILDREN`):** `/v1/realm/unions` and `unionsHeard` record active and partner-ended realm unions; shared child records are not yet implemented.
