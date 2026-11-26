---
slug: grappling-hook-tool
title: "Grappling Hook Tool"
domain: gameplay
kind: subcard
parent: items-gold-counter-and-wagon
files:
  - src/combat/grapple/grapple.js
  - src/combat/heavyGearRig.js
  - src/combat/weaponRig.js
  - src/characters/heavyGearIds.js
  - src/systems/heavyGear.js
  - src/items/retiredItems.js
  - src/items/quickslots.js
  - src/characters/equipTable.js
  - src/ui/inputActions.js
  - src/ui/touchButtons.js
  - src/ui/touch.js
  - src/ui/heavyGearOverlay.js
routes: []
tables: []
replacesBible: []
related:
  - retired-item-templates-and-hydration-sweep
  - controls-helm-saddle-pad-and-touch
invariants:
  - "The hook is a tool open to every character: the `GrapplingHook` action (default `Numpad1`, and a `hold` touch button whose key lifts two frames late, so a quick tap still reaches the rig) throws it. No gamepad button is free in either pad layout, so it has no pad default. It needs no skill, class, race, hand, ammo, or equipped weapon, and never touches the equipped weapon or shield."
  - "It still needs the item: template `565` (Weapons group, so the law, shops, loot, and wire are unchanged) carried anywhere in the pack. `getItemHands` gives it no hand and `getEquipSlot` returns `None` for it, even beside a two-handed weapon. `canSwapTo` and `hotbarKindOf` refuse it, and a load clears a swap or hotbar slot holding one (`hookItemKey`). Without one, `stepHeavyGear` says `grapple.noHook` and throws nothing."
  - "`removeRetiredItems` (`src/items/retiredItems.js`) deletes `equipSlot` from a hook, so one saved as held returns to the pack on load."
  - "`weaponRig.js` allows a throw only while the weapon machine is `Idle` with no spell cast, climb, act tool, or equip pause. Paralysis drops a throw still winding up (`stopGrappleWindup`); the rig's `dispose` and the player's death end it all (`cancelGrapple`). `bodyFree` refuses a throw while riding, swimming, levitating, climbing, on a wall or ledge, frozen, or knocked down. On the classic body the throw's frames (`GRAPPLE_HAND_ITEM`) replace the weapon sprite, a weapon pair, the running fists, and the weapon widget, sheathed or not and beside a lit torch, and start no swing. The Morrowind arms, the third-person body, and a held map sheet draw no hook frames, and `hookFramesDraw` keeps the sheathed early return in force for the first two."
  - "Range, speed, rests (`GRAPPLE_COOLDOWN_S` 6, `GRAPPLE_MISS_COOLDOWN_S` 1.5), and the pull live in `src/combat/grapple/grapple.js`; the pull is ordinary player movement, so the relay sees no weapon attack."
traps:
  - "Do not give 565 a hand again: held, it would take the weapon slot and bring back weapon rules."
tags:
  - combat
  - tools
  - controls
---

# Grappling Hook Tool

The hook stays in the pack and is thrown on its own key by any character who carries one. Press `GrapplingHook`: the
seven frames play, the throw leaves on frame 3, and the player motor pulls the body to what the hook caught, with no
falling damage. Jump lets go.
