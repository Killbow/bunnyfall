---
slug: "ios-tab-texture-mod-memory-budget"
title: "iOS Tab Memory Budget, Touch Fallback, and Boot Data Recovery"
domain: "rendering"
kind: "overview"
parent: null
files:
  - "src/render/textureReplacement.js"
  - "src/ui/touchDevice.js"
  - "src/main.js"
  - "src/formats/bsaFile.js"
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-20-ios-budget.md"
related:
  - "webgl2-renderer-and-textures"
  - "binary-formats-and-dfmod"
  - "studio-art-texture-tier-and-painted-doors"
  - "scene-router-and-boot-doors"
invariants:
  - "`bundleBudgetBytes(nav, win)` (`src/render/textureReplacement.js`) caps decoded texture-mod memory at `round(min(1536, 192 * gb) * 1024 * 1024)`; once exhausted, remaining mod textures fall back to classic art after a single warning."
  - "In `bundleBudgetGb(nav, win)`, a positive `navigator.deviceMemory` report always wins; when `deviceMemory` is `0`, `NaN`, or absent, `isTouchDevice` (`src/ui/touchDevice.js`) selects `IOS_TAB_GB = 2` (`384` MB) while mouse desktops use `8` (`1536` MB)."
  - "In `src/main.js`, the `clear stored data and pick again` boot recovery button renders only when the startup error matches `/re-pick|not in the stored/i`."
traps:
  - "WebKit omits `navigator.deviceMemory` and enforces a hard `2048` MB tab ceiling on iOS; never fall back to `|| 8` without checking `isTouchDevice`."
  - "Under `vite preview`, missing `./arena2/*` files return `index.html` with HTTP `200`, causing `src/formats/bsaFile.js` to throw `BSA file has an invalid DirectoryType.` without matching the recovery button regex."
dfu: []
tags:
  - "ios"
  - "memory"
  - "texture-mods"
  - "touch"
  - "boot"
---

# iOS Tab Memory Budget, Touch Fallback, and Boot Data Recovery

Texture-mod memory budgeting, touch-device fallback sizing, and boot-time archive error recovery span `src/render/textureReplacement.js`, `src/ui/touchDevice.js`, `src/main.js`, and `src/formats/bsaFile.js`.

- **Texture-mod byte ceiling:** In `src/render/textureReplacement.js`, `bundleBudgetBytes(nav, win)` caps decoded texture-mod memory at `round(min(1536, 192 * gb) * 1024 * 1024)`. Because browsers clamp `navigator.deviceMemory` at `8`, `1536` MB is the universal ceiling. Once a bundle exhausts this byte budget, remaining mod textures fall back to classic art after logging a single warning.
- **Touch fallback for iOS WebKit:** In `bundleBudgetGb(nav, win)`, any positive `navigator.deviceMemory` value takes precedence. Because WebKit omits `navigator.deviceMemory` and enforces a hard `2048` MB per-tab memory ceiling on iOS, an absent, `0`, or `NaN` value consults `isTouchDevice` (`src/ui/touchDevice.js`): touch devices use `IOS_TAB_GB = 2` (`384` MB budget), whereas mouse desktops default to `8` (`1536` MB budget). Falling back to `|| 8` without checking `isTouchDevice` exceeds the iOS tab limit.
- **Boot archive recovery:** In `src/main.js`, the `clear stored data and pick again` recovery button renders only when a startup error matches `/re-pick|not in the stored/i`. Under `vite preview`, missing `./arena2/*` files return `index.html` with HTTP `200`, causing `src/formats/bsaFile.js` to throw `BSA file has an invalid DirectoryType.` without matching that recovery pattern.
