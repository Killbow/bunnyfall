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
  - src/items/retiredItems.js
  - src/characters/equipTable.js
  - src/ui/inputActions.js
  - src/ui/heavyGearOverlay.js
routes: []
tables: []
replacesBible: []
related:
  - retired-item-templates-and-hydration-sweep
  - controls-helm-saddle-pad-and-touch
invariants:
  - "The hook is a tool open to every character: the `GrapplingHook` action (default `Numpad1`, a touch button too) throws it. It needs no skill, class, race, hand, ammo or equipped weapon, and never touches the equipped weapon or shield."
  - "It still needs the item: template `565` (Weapons group, so the law, shops, loot and wire are unchanged) carried anywhere in the pack. `getItemHands` gives it no hand, so it cannot be equipped or hotbarred as a weapon. Without one, `stepHeavyGear` says `grapple.noHook` and throws nothing."
  - "`removeRetiredItems` (`src/items/retiredItems.js`) deletes `equipSlot` from a hook, so one saved as held returns to the pack on load."
  - "`weaponRig.js` allows a throw only while the weapon machine is `Idle` with no spell cast, climb, act tool or equip pause; the throw's frames draw in the weapon's place (`GRAPPLE_HAND_ITEM`), sheathed or not, and start no swing."
  - "Range, speed, rests (`GRAPPLE_COOLDOWN_S` 6, `GRAPPLE_MISS_COOLDOWN_S` 1.5) and the pull live in `src/combat/grapple/grapple.js`; the pull is ordinary player movement, so the relay sees no weapon attack."
traps:
  - "Do not give 565 a hand again: held, it would take the weapon slot and bring back weapon rules."
tags:
  - combat
  - tools
  - controls
---

# Grappling Hook Tool

Until 2026-11-25 the hook was held like a dagger and thrown on the attack button. Now it is carried in the pack and
thrown on its own key by anyone. Press `GrapplingHook`: the seven frames play, the throw leaves on frame 3, and the
player motor pulls the body to what the hook caught, with no falling damage. Jump lets go.
