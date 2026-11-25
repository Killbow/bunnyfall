---
slug: "portal-stone-overview"
title: "Portal Stone: Bound Item, Open-Sky Use, and Walk-In Portals"
domain: "travel"
kind: "overview"
parent: null
files:
  - "src/travel/portalStone.js"
  - "src/travel/portalGates.js"
  - "src/travel/portalFx.js"
  - "src/travel/travelMapWorld.js"
  - "src/worldEvents/gateSpoils.js"
  - "src/net/realmTradeLaw.js"
  - "src/scenes/world.js"
  - "src/scenes/exterior.js"
  - "src/scenes/frame/peopleFrame.js"
  - "src/scenes/frame/inputFrame.js"
  - "src/items/useItem.js"
  - "src/items/quickslots.js"
  - "src/ui/enhancedInventory.js"
  - "src/ui/nativeInventory.js"
  - "src/world/streamWorld.js"
routes: []
tables: []
replacesBible:
  - "06-Systems/Portal-Stone.md"
related:
  - "portal-stone-counter-and-bulk-purchase"
  - "portal-stone-online-event-ground-and-gift"
  - "loot-arc-welkynd-salvage-reforge-and-imprint"
  - "held-map-travel-options-and-filter-key"
  - "ui-arc-enhanced-inventory-and-pack"
invariants:
  - "`PORTAL_STONE_TEMPLATE = 572` (beside `WELKYND_SHARD_TEMPLATE = 571`) is `bound: true, stackable: true`, group `UselessItems2` (not Gems), Diamond art archive 254 record 3, `baseWeight` 0.25; it is listed in `BOUND_TEMPLATES` in `src/net/realmTradeLaw.js`."
  - "`portalHold` checks in order: dead or busy (`'busy'`), `duel`, `siege`, `enemies`, `journey`; `portalDoorRefusal` asks it at the door and at the pick, and `portalGates.tick` asks it at the step (a `'busy'` step refusal is silent)."
  - "`openPortalStone` opens the travel map in teleport mode with `travelOptions: () => null` (no fee); `standPortal` spends exactly one stone (`spendPortalStone`) from the source list only after a pick and a successful `portalStonePlace`."
  - "`portalPlace` stands the portal `PORTAL_AHEAD = 2` m along camera yaw, pulled `PORTAL_WALL_GAP = 0.6` m short of a wall, refused `'room'` under `PORTAL_MIN_AHEAD = 1.2` m and `'ground'` with no ground within `PORTAL_GROUND_PROBE = 3` m below a point 1 m over the feet."
  - "A portal stands `PORTAL_OPEN_MS = 30000`; entry is only an outside-to-inside step (`portalStepIn`) within `PORTAL_REACH = 0.9` m horizontal and `PORTAL_REACH_Y = 2` m vertical; arrival is `teleportTo` (`portalArrive`)."
traps:
  - "Steps are forgotten across ticks more than `PORTAL_STEP_GAP_MS = 250` ms apart or feet jumping more than `PORTAL_STEP_JUMP = 1.5` m, so a portal opened on someone or outside a door takes nobody."
  - "A sealing portal (last `PORTAL_MS.close` ms of its life, `src/travel/portalFx.js`) refuses entry."
  - "Only the streaming world (`src/scenes/world.js`) wires `openPortal`; interiors and dungeons refuse with `PORTAL_TEXT.notHere`, and standalone `src/scenes/exterior.js` refuses with `PORTAL_TEXT.noStreet`. A made level rule `portalStone: 'refused'` also refuses."
  - "Any load (`restoresSoFar` changing) clears every standing portal in `src/scenes/frame/inputFrame.js`."
  - "A second own portal is refused at the door (`PORTAL_TEXT.standing`) while `portalGates.mine()` stands."
dfu: []
tags:
  - "portal-stone"
  - "travel"
  - "teleport"
  - "bound-item"
  - "welkynd-shard"
---

# Portal Stone: Bound Item, Open-Sky Use, and Walk-In Portals

Defined in `src/worldEvents/gateSpoils.js` beside `WELKYND_SHARD_TEMPLATE = 571`, `PORTAL_STONE_TEMPLATE = 572` (`bound: true, stackable: true`, group `UselessItems2`, Diamond archive 254 record 3, `baseWeight` 0.25) is listed in `BOUND_TEMPLATES` (`src/net/realmTradeLaw.js`). Pack and hotbar actions route `{ kind: 'openPortal', item }` via `registerItemUseHandler` (`src/travel/portalStone.js`) to the host `openPortal` door in `src/scenes/world.js`. Interiors and dungeons refuse with `PORTAL_TEXT.notHere`, standalone `src/scenes/exterior.js` refuses with `PORTAL_TEXT.noStreet`, and swimming, boats, unready maps, `portalStone: 'refused'`, or an active `portalGates.mine()` (`PORTAL_TEXT.standing`) also refuse.

`portalHold` checks `'busy'`, `duel`, `siege`, `enemies`, and `journey`; `portalDoorRefusal` checks at the door and map pick, while `portalGates.tick` checks at entry. `openPortalStone` opens the teleport travel map (`travelOptions: () => null`), and `standPortal` calls `spendPortalStone` only after a successful `portalStonePlace`. `portalPlace` places the gate in `native` world coordinates `PORTAL_AHEAD = 2` m ahead (`PORTAL_WALL_GAP = 0.6` m from walls, refused `'room'` under `PORTAL_MIN_AHEAD = 1.2` m or `'ground'` past `PORTAL_GROUND_PROBE = 3` m).

Portals last `PORTAL_OPEN_MS = 30000`, refusing entry during the closing `PORTAL_MS.close` window (`src/travel/portalFx.js`) and clearing when `restoresSoFar` changes (`src/scenes/frame/inputFrame.js`). Entry requires an outside-to-inside `portalStepIn` within `PORTAL_REACH = 0.9` m horizontally and `PORTAL_REACH_Y = 2` m vertically (`PORTAL_STEP_GAP_MS = 250` ms, `PORTAL_STEP_JUMP = 1.5` m) to trigger `teleportTo` (`portalArrive`).
