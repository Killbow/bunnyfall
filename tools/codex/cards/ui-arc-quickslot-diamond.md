---
slug: ui-arc-quickslot-diamond
title: "Quickslot Diamond, Hold-to-Cycle, and Spell Slot"
domain: ui
kind: subcard
parent: ui-arc-overview
files:
  - src/items/quickslots.js
  - src/ui/quickslotTags.js
  - src/ui/inputActions.js
  - src/ui/playerWindows.js
  - src/ui/enhancedHud.js
routes: []
tables: []
replacesBible:
  - "10-UI/UI-Arc.md"
related:
  - ui-arc-input-dispatch-and-key-edges
  - ui-arc-enhanced-inventory-and-pack
  - items-gold-counter-and-wagon
invariants:
  - "QUICK_HOLD_MS = 350: a shorter press performs or equips; a longer hold steps candidates every QUICK_STEP_MS = 300 and performs nothing on release."
  - "Blocked frames (open window or paused game) and wall-clock gaps past QUICK_GAP_MS (1000) disarm every hold so a release after closing a window never taps."
  - "Quickslots store kind keys (quickslotKey or spell index), not item references."
traps:
  - "QuickSwap has no default key: Digit4 (QuickOffHand) performs whatever the off-hand cell shows, and Digit3 is QuickSpell."
  - "In-place enchantment changes must bypass the quickslotKey cache so modified items recompute keys."
  - "Only the exterior-mode gate arms quickslots in world.js and exterior.js, so indoor contexts do not double-fire QuickOffHand."
dfu: []
tags:
  - quickslots
  - hud
  - input
  - spells
---

# Quickslot Diamond, Hold-to-Cycle, and Spell Slot

The enhanced HUD quickslot diamond binds two consumable slots, a readied spell slot, and an off-hand slot to tap-to-use and hold-to-cycle state machines.

- **Default Keybinds and Kind Keys:** `src/ui/inputActions.js` binds `Digit1` to `QuickUse1`, `Digit2` to `QuickUse2`, `Digit3` to `QuickSpell`, and `Digit4` to `QuickOffHand`, while `QuickSwap` has no default key. Slots store kind keys (`quickslotKey` or spell index) rather than live object references, and in-place enchantment mutations bypass the cached key.
- **Tap and Hold State Machine:** In `src/items/quickslots.js`, releasing a key before `QUICK_HOLD_MS = 350` activates or equips the slot, whereas holding past `350` ms steps through matching candidates every `QUICK_STEP_MS = 300` and performs no action on key release. Open modal windows, paused frames, or frame gaps exceeding `QUICK_GAP_MS = 1000` disarm active holds immediately.
- **Exports and Host Wiring:** `src/items/quickslots.js` exports `tickQuickslotHold`, `assignQuickslot`, `useQuickslot`, `swapQuickslot`, `quickslotView`, `offHandQuickslot`, and `offHandOffersSwap`. Host scenes wire `quickOffHand` and `quickSwitchHand` through `src/ui/playerWindows.js` behind the exterior-mode gate.
