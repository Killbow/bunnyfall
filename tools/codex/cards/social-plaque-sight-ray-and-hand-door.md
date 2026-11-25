---
slug: "social-plaque-sight-ray-and-hand-door"
title: "Social Plaque Sight Ray, Pose Hand Diffs, and Quickslot Hand Door"
domain: "multiplayer"
kind: "subcard"
parent: "shared-quest-relink-and-slope-foot-rest-overview"
files:
  - "src/net/onlineWorld.js"
  - "src/ui/socialMenu.js"
  - "src/net/peerBodies.js"
  - "src/net/wire.js"
  - "src/items/quickslots.js"
  - "src/combat/weaponRig.js"
  - "src/characters/exteriorFoes.js"
  - "src/characters/cityGuards.js"
  - "src/travel/horseCartPool.js"
  - "src/player/mwView.js"
  - "src/items/useItem.js"
  - "src/items/itemTemplates.js"
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-09-23.md"
related:
  - "shared-quest-relink-and-slope-foot-rest-overview"
  - "online-coop-peer-presence-and-crowd-fans"
  - "hotbar-icons-item-slotting-and-key-gate"
  - "ui-arc-quickslot-diamond"
  - "wagons-kinds-and-hitching-overview"
invariants:
  - "`socialPlaqueRows` starts with no row highlighted until mouse wheel or `F` selects an action, and `peerInSight` gates plaque actions with a collider raycast."
  - "Pose fields `lh` (left-hand weapon) and `wb` (beast form) participate in `src/net/wire.js` pose diffing so hand or form switches transmit immediately."
  - "Quickslot weapon swaps equip into `weaponRig.handDoor()`, matching the active first-person hand."
traps:
  - "Online kill credit (`slain` in `src/characters/exteriorFoes.js`) flows from the authority back to the attacker to drive vampire feeding and werewolf urges; never count peer-owned kills locally."
  - "`setEotbCartYields` hides the third-person Beholder cart whenever Horse Cart and Cargo trailing wagons are active."
dfu:
  - "Assets/Scripts/Game/WeaponManager.cs"
  - "Assets/Scripts/Game/FPSWeapon.cs"
tags:
  - "plaque"
  - "peers"
  - "weapons"
  - "quickslots"
  - "wagons"
  - "werewolf"
  - "vampire"
---

# Social Plaque Sight Ray, Pose Hand Diffs, and Quickslot Hand Door

In `src/net/onlineWorld.js` and `src/ui/socialMenu.js`, `socialPlaqueRows` opens with no row highlighted until the mouse wheel or `F` selects an action, and `peerInSight` gates plaque interactions with a collider raycast. In `src/net/wire.js` and `src/net/peerBodies.js`, pose fields `lh` (left-hand weapon) and `wb` (beast form) participate in pose diffing so hand or form switches transmit immediately.

In `src/items/quickslots.js` and `src/combat/weaponRig.js`, quickslot weapon swaps equip into `weaponRig.handDoor()`, matching the active first-person hand, while `spriteShown()` hides the bow sprite from release through cooldown. In `src/items/useItem.js` and `src/items/itemTemplates.js`, `usableItem` checks `registerItemUseHandler` first before built-in item rules.

In `src/characters/exteriorFoes.js` and `src/characters/cityGuards.js`, online kill credit (`slain`) flows from the authority back to the attacker to satisfy vampire feeding and werewolf urges; peer-owned kills are never counted locally. In `src/travel/horseCartPool.js` and `src/player/mwView.js`, `groundPeer` re-grounds parked peer wagons, and `setEotbCartYields` hides the third-person Beholder cart whenever Horse Cart and Cargo trailing wagons are active.
