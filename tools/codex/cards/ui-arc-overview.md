---
slug: ui-arc-overview
title: "UI Arc: Classic Native Windows and the Enhanced Skin"
domain: ui
kind: overview
parent: null
files:
  - src/ui/uiSkin.js
  - src/ui/uiPrefs.js
  - src/ui/nativePanel.js
  - src/ui/pauseDoor.js
  - src/ui/charSheetDoor.js
  - src/ui/inventoryDoor.js
  - src/ui/travelMapDoor.js
  - src/scenes/shared.js
  - src/ui/settingsMap.js
routes: []
tables: []
replacesBible:
  - "10-UI/UI-Arc.md"
related:
  - ui-overlays-and-localization
  - four-hosts-and-modal-frame
  - scene-router-and-boot-doors
  - ui-arc-notices-and-message-boxes
  - ui-arc-input-dispatch-and-key-edges
  - ui-arc-quickslot-diamond
  - ui-arc-enhanced-inventory-and-pack
  - ui-arc-front-door-intro-and-brand
invariants:
  - "Classic native windows draw on a virtual 320x200 panel (src/ui/nativePanel.js loadImg/drawImg/drawImgSub/drawRect/shadowText/pointToNative) at verbatim DFU rects; enhanced-only features never alter classic window behavior."
  - "One construction seam per window (openPauseFlow, createCharSheetWindow, buildTravelMapWindow, createChargenWindow) serves all four hosts."
  - "shared.claimFrame() returns a monotonic generation token checked at the top of every host rAF frame and claimed before endRunToTitleMenu unwinds."
traps:
  - "Wiring a window door into one host only breaks four-host parity; import the shared door module instead."
  - "A host or window without a backing subsystem must state the limitation rather than show empty or false data."
dfu:
  - Assets/Scripts/Game/UserInterfaceWindows/DaggerfallHUD.cs
  - Assets/Scripts/Game/UserInterfaceWindows/DaggerfallInventoryWindow.cs
tags:
  - ui
  - skins
  - native-panels
  - enhanced
  - four-hosts
---

# UI Arc: Classic Native Windows and the Enhanced Skin

Bunnyfall pairs classic 320x200 native canvas windows with an enhanced DOM skin while sharing a single construction door per window across all four hosts.

- **Skin Selection and Native Panel Primitives:** `isEnhanced` in `src/ui/uiSkin.js` selects the enhanced skin by default, while `?skin=classic` overrides per page load. Classic windows draw on a 320x200 virtual canvas via `loadImg`, `drawImg`, `drawImgSub`, `drawRect`, `shadowText`, and `pointToNative` in `src/ui/nativePanel.js`.
- **Shared Window Doors:** All four hosts open windows through shared seam modules: `pauseDoorReady`, `openPauseFlow`, and `openClassicPauseFlow` in `src/ui/pauseDoor.js`, `charSheetDoorReady` and `createCharSheetWindow` in `src/ui/charSheetDoor.js`, `inventoryDoorReady` in `src/ui/inventoryDoor.js`, and `travelMapDoorReady` in `src/ui/travelMapDoor.js`.
- **Settings Categories and Frame Tokens:** `CATEGORIES` in `src/ui/settingsMap.js` defines 9 tabs: Graphics, Gameplay, Combat, World, Interface, Audio, Controls, Accessibility, and Mods & files. In `src/scenes/shared.js`, `claimFrame` increments `_frameGeneration` and returns a token verified at the start of every host animation frame and claimed before `endRunToTitleMenu` unwinds.
