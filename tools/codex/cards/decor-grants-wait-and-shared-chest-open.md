---
slug: decor-grants-wait-and-shared-chest-open
title: "Home Chest Grants Wait Gate and Shared Chest Hold Refresh"
domain: homes
kind: subcard
parent: online-home-shared-chest-storage-overview
files:
  - src/homes/decorGrants.js
  - src/scenes/worldModes.js
  - server-account/src/decorAccess.js
  - src/net/accountClient.js
  - src/items/physicalItems.js
routes:
  - /v1/homes/decor/use
tables:
  - decor_bin
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-25d.md"
related:
  - online-home-shared-chest-storage-overview
  - homes-camps-guilds-and-territories
invariants:
  - "`openOwnChest` (`src/homes/decorGrants.js`, wired via `activateDecor` in `src/scenes/worldModes.js`) keeps the chest shut (`The chest stays shut.`) until `POST /v1/homes/decor/use` (`op: 'grants'`) resolves for the current `asked` room generation."
  - "Once grants resolve, `decorIsShared` chests open `decor_bin` via `openSharedChest`, while private chests open the character save container."
  - "Open shared chests refresh their `HOLD_S = 180` s lease while open; expired holds fail with `decor-lapsed` and credit gold only on settle."
traps:
  - "Treating unresolved `decorIsShared` state as private opens an empty character-save chest instead of the shared `decor_bin`."
  - "`openSharedChest` draws the peeked rows at once, and when the held list arrives before any move it keeps those row objects (matched by `uid`, or by row and template), because a fresh parse makes new objects and the first click's transfer refuses a row the list no longer holds."
  - "Once a hold refresh (`keepHeld`) answers `decor-lapsed`, `decor-busy`, or `decor-shut`, the open window moves nothing more, because its close would be refused."
  - "An open shared chest passes `dropRefusal`, so the Physical Items shift-drop (`shiftDrop`) refuses with the same line as a drop from the chest window (\"Shut the chest before you drop that.\"). Without it, a shift-drop removes the piece only from the pack shown in the window and places it in the room, while the character pack still holds it."
dfu: []
tags:
  - homes
  - decor
  - grants
  - leases
---

# Home Chest Grants Wait Gate and Shared Chest Hold Refresh

`src/homes/decorGrants.js`, `src/scenes/worldModes.js`, `src/net/accountClient.js`, and `server-account/src/decorAccess.js` gate home chest activation on room grant resolution and maintain leases on open shared chests in `decor_bin`.

## Grants Wait Gate and Room Generation

- **Blocking unresolved chests (`src/homes/decorGrants.js`, `src/scenes/worldModes.js`):** When `activateDecor` invokes `openOwnChest`, the chest refuses to open and reports `The chest stays shut.` until `POST /v1/homes/decor/use` with `op: 'grants'` completes for the current `asked` room generation counter. Late responses from stale `asked` counters are discarded.
- **Routing after resolution (`src/homes/decorGrants.js`):** Once grants settle, `decorIsShared` chests dispatch to `openSharedChest` to load `decor_bin`, whereas private chests open the local character save container. Falling back to private storage before `decorIsShared` resolves would expose an empty character-save chest instead of `decor_bin`.

## Shared Chest Leases

- **Hold refresh and settlement (`server-account/src/decorAccess.js`, `src/net/accountClient.js`):** An open shared chest refreshes its `HOLD_S = 180` s lease while the container UI remains open. If a hold expires before closure, subsequent writes fail with `decor-lapsed`, and gold credits apply only when the session settles cleanly.
