---
slug: witches-festival-hearth-offerings
title: "Hearth Offering Bowls at Home Doors"
domain: systems
kind: subcard
parent: witches-festival-overview
files:
  - server-account/src/festival.js
  - src/net/festivalLaw.js
  - src/homes/witchesHost.js
  - src/systems/festival/soulCake.js
  - src/systems/festival/festivalClient.js
  - src/player/activate.js
  - server-account/migrations/0140_festival.sql
routes:
  - /v1/festival/town
  - /v1/festival/offering/set
  - /v1/festival/offering/fill
  - /v1/festival/offering/take-in
  - /v1/festival/offering/take
tables:
  - players
  - fest_offerings
  - fest_takes
  - homes
replacesBible:
  - "06-Systems/Witches-Festival.md"
related:
  - witches-festival-overview
  - witches-festival-town-dressing
  - homes-camps-guilds-and-territories
invariants:
  - "Owned bowls are tracked in `players.fest_bowls`; placing a bowl decrements `fest_bowls`, and taking it in credits both the bowl and its remaining `stock` back to `players` in the same D1 batch."
  - "`fest_offerings` allows at most one bowl per home (`PRIMARY KEY (map_id, building_key)`), restricted to personal homes owned by the named character and excluding guild halls (`h.guild_id IS NULL`)."
  - "Each `/v1/festival/offering/fill` call transfers up to `OFFERING_FILL = 10` Soul Cakes from `players.fest_cakes` without exceeding `OFFERING_STOCK_MAX = 60`."
  - "Each `/v1/festival/offering/take` call transfers `OFFERING_TAKE = 1` Soul Cake, limited to once per taker per offering per UTC day (`fest_takes` primary key) and blocked on the owner's own account (`own`), while incrementing `fest_given` on the host and `fest_taken` on the visitor."
  - "`/v1/festival/offering/take-in` bypasses the festival calendar and switch gate so owners can recover bowls and stocked cakes under any switch or after the festival closes, though guests remain blocked."
  - "If a home changes hands or loses ownership, the `INNER JOIN homes` in `/v1/festival/town` hides the orphaned offering immediately, and `orphansHome` refunds the bowl and stock on the former owner's next `/v1/festival/mine` read (or when the new owner calls `setOffering`)."
traps:
  - "Offering activation boxes in `src/homes/witchesHost.js` must be `{ min, max }` `RayBox` objects rather than 6-element frustum arrays, or `rayAabb` in `src/player/activate.js` will fail."
  - "`/v1/festival/town` is the only festival route that uses replica read consistency; guests may call it, and outside active festival dates it returns only offerings owned by the caller."
dfu: []
tags:
  - witches-festival
  - hearth-offering
  - housing
  - treat-bowl
  - d1-batch
---

# Hearth Offering Bowls at Home Doors

Players place, stock, and visit Hearth Offering treat bowls outside personal homes through `server-account/src/festival.js`, `src/net/festivalLaw.js`, `src/homes/witchesHost.js`, `src/systems/festival/soulCake.js`, and `src/systems/festival/festivalClient.js`.

## Placement, Stocking, and Visitor Takes

- **Door placement (`/v1/festival/offering/set`):** Within `OFFERING_SET_REACH = 4` meters of the center of an owned personal home door (`h.guild_id IS NULL` in `homes`), the owner spends one bowl from `players.fest_bowls` to insert a `fest_offerings` row keyed by `(map_id, building_key)`.
- **Filling and taking (`/v1/festival/offering/fill`, `/v1/festival/offering/take`):** The owner adds up to `OFFERING_FILL = 10` cakes per fill up to `OFFERING_STOCK_MAX = 60`. Visitors take `OFFERING_TAKE = 1` cake per offering per `utcDay` (`fest_takes`), incrementing `players.fest_given` on the host and `players.fest_taken` on the visitor. Reaching `HEARTHKEEPER_GIVEN = 25` grants the `hearthkeeper` title; reaching `SOULCAKE_TAKEN = 10` unlocks the `soulcake` profile icon.
- **Refusals and recovery (`/v1/festival/offering/take-in`):** Server refusals return `home`, `set`, `item`, `none`, `full`, `cakes`, `own`, `taken`, `empty`, or `gone` (after the bowl was taken inside). `takeInOffering` skips the calendar gate so cakes are never stranded after close, and `orphansHome` lazily refunds offerings from sold or lost homes.

## Town Polling and Ray Activation

`witchesHost.js` polls `/v1/festival/town` every `OFFERING_REFRESH_MS = 60000` ms (one request in flight). Bowls register `{ min, max }` `RayBox` targets under `witch:<mapId>:<buildingKey>` (`src/player/activate.js`), showing **Fill** and **Take in** to owners and **Take a Soul Cake** to visitors.
