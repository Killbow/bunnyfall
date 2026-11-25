---
slug: grappling-hook-tool
title: "Grappling Hook Tool"
domain: gameplay
kind: subcard
parent: retired-item-templates-and-hydration-sweep
files:
  - src/combat/grapple/grapple.js
  - src/combat/heavyGearRig.js
  - src/combat/weaponRig.js
  - src/characters/heavyGearIds.js
  - src/items/retiredItems.js
  - src/ui/inputActions.js
  - src/ui/heavyGearOverlay.js
routes: []
tables: []
replacesBible: []
related:
  - retired-item-templates-and-hydration-sweep
  - controls-helm-saddle-pad-and-touch
invariants:
  - "The hook is a built-in tool for every character, on the `GrapplingHook` action (default `Numpad1`, a touch button too). It needs no item, skill, class, race, hand, ammo or equipped weapon, and it never touches the equipped weapon or shield."
  - "`stepHeavyGear` (`src/combat/heavyGearRig.js`) reads the key's press edge through the rig's `actionDown` and calls `grappleClick`; `weaponRig.js` allows it only while the weapon machine is `Idle`, no spell cast, climb, act tool or equip pause runs."
  - "While the throw animation plays, `weaponRig.js` draws the hook's frames (`GRAPPLE_HAND_ITEM`) in the weapon's place, sheathed or not, and starts no swing or technique."
  - "Range, speed, rest (`GRAPPLE_COOLDOWN_S` 6, `GRAPPLE_MISS_COOLDOWN_S` 1.5) and the pull live in `src/combat/grapple/grapple.js` and `heavyGearIds.js`; the pull is the player motor's own step, so the relay sees only ordinary movement and no weapon attack."
traps:
  - "Item `565` is retired (`src/items/retiredItems.js`): saves, quickslots, the wire and the account judge drop it, and no shop or pile mints it. Do not give it a template row again."
tags:
  - combat
  - tools
  - controls
---

# Grappling Hook Tool

Until 2026-11-25 the hook was item `565`, a weapon-group item held like a dagger. It is now a tool everyone carries.
Press `GrapplingHook`: the hook's seven frames play, the throw leaves on frame 3, and the player motor pulls the body
to what the hook caught (a floor, a top, or hanging against a wall) with no falling damage. Jump lets go.
Old copies of the item are removed on load, from the pack, storage and hotbar, by the retired-item sweep.
