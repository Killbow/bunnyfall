---
slug: "horse-cart-and-cargo-overview"
title: "Horse Cart and Cargo: The IL Port, Modes, Save, and Wagon Access"
domain: "travel"
kind: "overview"
parent: null
files:
  - "src/travel/horseCartLaw.js"
  - "src/travel/horseCart.js"
  - "src/travel/wagon41214.js"
  - "src/items/inventorySession.js"
  - "src/ui/inputActions.js"
  - "src/world/streamingWorld.js"
  - "src/scenes/exterior.js"
  - "src/scenes/world.js"
routes: []
tables: []
replacesBible:
  - "06-Systems/Horse-Cart-And-Cargo.md"
related:
  - "horse-cart-and-cargo-follow-and-hitch"
  - "horse-cart-and-cargo-online-peer-teams"
  - "horse-cart-and-cargo-park-persistence"
  - "wagons-kinds-and-hitching-overview"
  - "holdings-stable-and-transport-stabling"
  - "horse-coats-overview"
  - "horse-wake-remote-load-landing"
invariants:
  - "WAGON_MODE has four values (None 0, WithPlayer 1, Deployed 2, FollowingPlayer 3). HORSE_MODE has five (HitchedToWagon 0, LooseStationary 1, WithPlayer 2, None 3, FollowingPlayer 4)."
  - "The save is WAGON_SAVE_VERSION = 7 (WagonSaveData.CurrentVersion), under the vendor key HCC_VENDOR = 'horse-cart-and-cargo'."
  - "canAccessWagonStorage dispatches on STORAGE_CONTEXT: NormalInventory and Trade share the inventory check, and DungeonExitSelection requires a matching dungeon id on InteriorAccessMode Dungeon."
  - "Wagon storage opens within `WAGON_INVENTORY_DISTANCE` (`5` m); indoor access also requires a matching `InteriorAccessId` with the wagon parked on the current map pixel."
  - "Scene-to-world conversion reads SCENE_MAP_RATIO (StreamingWorld.SceneMapRatio, 1 / GLOBAL_SCALE = 40) in src/world/streamingWorld.js."
traps:
  - "The code lives under src/travel/, not src/systems/horse/. Bible paths are stale."
  - "WAGON_MODEL_ID (41214) is the HCC wagon. WAGON_MODEL in src/player/eotbWagon.js is 41239 and belongs to Eye of the Beholder."
  - "Distance constants keep exact IL-derived names (`HORSE_MENU_MOUNT_DISTANCE`, `HORSE_WAGON_HITCH_DISTANCE`, `WAGON_INVENTORY_DISTANCE`, `DEFAULT_INTERIOR_ACCESS_DISTANCE`)."
dfu: []
tags:
  - "horse-cart-and-cargo"
  - "hcc"
  - "wagon"
  - "horse"
  - "save"
  - "hotkeys"
---

# Horse Cart and Cargo: The IL Port, Modes, Save, and Wagon Access

The Horse Cart and Cargo port (`LOG_PREFIX = '[TrailingWagon]'`, vendor key `HCC_VENDOR = 'horse-cart-and-cargo'`, `WAGON_SAVE_VERSION = 7`) lives under `src/travel/horseCartLaw.js`, `src/travel/horseCart.js`, and `src/travel/wagon41214.js`. Both `src/scenes/world.js` and `src/scenes/exterior.js` instantiate `createHorseCartRuntime`, and `exterior.js` calls `hccTick(dt, now)` every frame indoors and outdoors.

- **Modes, meshes, and sprites:** `WAGON_MODE` defines `None` (`0`), `WithPlayer` (`1`), `Deployed` (`2`), and `FollowingPlayer` (`3`). `HORSE_MODE` defines `HitchedToWagon` (`0`), `LooseStationary` (`1`), `WithPlayer` (`2`), `None` (`3`), and `FollowingPlayer` (`4`). `WAGON_MODEL_ID = 41214` (distinct from Eye of the Beholder `41239`) expects `102` vertices, `48` triangles, `4` sub-meshes, and `5` parts, plus `12` `CARGO_DEFINITIONS` across `CARGO_TIERS` `[25, 50, 75, 90]` (`SMALL_CART_KG = 750`). Horse sprites (`121x94`, `HORSE_VIEWS = 5`, `HORSE_WALK_FRAMES = 8`, `IDLE_FPS = 2`, `HORSE_NAME_MAX = 31`) and hotkeys `HCC_MOUNT_ACTION` (`'HorseMount'`, Comma) and `HCC_SUMMON_ACTION` (`'HorseSummon'`, Period) in `src/ui/inputActions.js` drive controls.
- **Storage reach and coordinates:** `canAccessWagonStorage` (`src/items/inventorySession.js`) checks `STORAGE_CONTEXT` (`NormalInventory`, `Trade`, `DungeonExitSelection`) within `WAGON_INVENTORY_DISTANCE` (`5.0` m; mount and hitch reach `HORSE_MENU_MOUNT_DISTANCE = 3.5` and `HORSE_WAGON_HITCH_DISTANCE = 3.5`), or indoors via matching `InteriorAccessId` on the map pixel (`DEFAULT_INTERIOR_ACCESS_DISTANCE = 50`, `DUNGEON_DOOR_USABLE_RADIUS = 3.7`, `SCENE_MAP_RATIO = 40` in `src/world/streamingWorld.js`).
