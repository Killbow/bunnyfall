---
slug: spellbook-scroll-keeping-and-dungeon-hud-digits
title: "Spellbook Scroll Preservation and Dungeon Window Digit Key Isolation"
domain: ui
kind: subcard
parent: held-power-bases-and-relay-health-share-overview
files:
  - src/ui/domRepaint.js
  - src/ui/enhancedSpellbook.js
  - src/ui/enhancedChronicle.js
  - src/ui/hud.js
  - src/ui/enhancedHud.js
  - src/ui/enhancedHotbar.js
  - src/ui/input.js
  - src/scenes/dungeonContext.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-18f.md"
related:
  - held-power-bases-and-relay-health-share-overview
  - hotbar-icons-item-slotting-and-key-gate
invariants:
  - "Enhanced spellbook and chronicle screens repaint via `repaintKeepingScroll(host, paint)` (`src/ui/domRepaint.js`), preserving scroll positions per `data-scroll-key` (`spell catalog` on the list rail, `spell ${index}` on detail panes, and section names on chronicle panes)."
  - "Dungeon `hideHudText` invokes `hideHudTextSurfaces` -> `hideEnhancedHud` so modal dialog digit choices are not intercepted by the quickbar."
  - "Hotbar key presses query `hostPaused()` (`src/ui/input.js`) live at press time before falling back to the last rendered pause flag."
traps:
  - "Key spell detail scroll state by spell index rather than list row index so filtering or sorting does not jump scroll offsets."
dfu:
  - "Assets/Scripts/Game/UserInterfaceWindows/DaggerfallSpellBookWindow.cs"
tags:
  - ui
  - spellbook
  - scroll
  - hud
  - hotbar
---

# Spellbook Scroll Preservation and Dungeon Window Digit Key Isolation

Scroll-preserving DOM repaints and modal digit key isolation coordinate across `src/ui/domRepaint.js`, `src/ui/enhancedSpellbook.js`, `src/ui/enhancedChronicle.js`, `src/ui/hud.js`, `src/ui/enhancedHud.js`, `src/ui/enhancedHotbar.js`, `src/ui/input.js`, and `src/scenes/dungeonContext.js`.

- **Scroll preservation across repaints:** Enhanced spellbook and chronicle views rebuild their DOM trees through `repaintKeepingScroll(host, paint)` in `src/ui/domRepaint.js`, which snapshots and restores scroll offsets for every element tagged with `data-scroll-key`. Inside `src/ui/enhancedSpellbook.js`, the list rail and detail pane scroll independently, using `spell catalog` on the list rail and `spell ${index}` on the detail pane. Keying the detail view by spell index rather than list row index prevents filtering or sorting from jumping the detail scroll position. In `src/ui/enhancedChronicle.js`, each chronicle pane keys its scroll state by section name.
- **Dungeon modal HUD hiding and hotbar pause gate:** In `src/scenes/dungeonContext.js` and `src/ui/hud.js`, `hideHudText` delegates through `hideHudTextSurfaces` to `hideEnhancedHud` (`src/ui/enhancedHud.js`) so active modal dialog digit choices are not intercepted by quickbar slots. In `src/ui/input.js` and `src/ui/enhancedHotbar.js`, hotbar key presses query `hostPaused()` live at press time before falling back to the last rendered pause flag.
